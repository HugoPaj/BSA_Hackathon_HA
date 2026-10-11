// On-chain test of the passport guardian, independent of the web app's database (safe to run next to a live demo).
// The guardian runs in this process in simulated mode (no Signicat credentials): a random secret plays the passport.
//   1. Enrol a passport for a fresh wallet, and deploy the wallet with the enrolment's address as Guardian B.
//   2. Another passport is refused. The enrolled one gets a signature over exactly the on-chain recovery request.
//   3. multiConfirmRecovery with Guardian A (EOA) + Guardian B (passport guardian) starts the recovery.
// Usage: npx tsx scripts/e2e-passport-chain.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CandidePaymaster, fromSafeWebauthn } from 'abstractionkit';
import { keccak256, toHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC, PAYMASTER_RPC } from '../lib/config';
import { client, passkeySignerAddress, readWalletState, recoveryRequest, Safe, setupTransactions, srm } from '../lib/chain';
import { createRelayer } from '../lib/relayer';
import { checkAttestation } from '../lib/liveness';
import { createPassportGuardian, type ScanStatus } from '../services/passport-core';
import { createSoftPasskey } from './webauthn-sim.mjs';

delete process.env.SIGNICAT_CLIENT_ID;
delete process.env.SERVICES_DATABASE_URL;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);
const c = client(NODE_RPC);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passport-'));
const { routes } = createPassportGuardian({ dir });
const call = <T,>(route: string, body: unknown) => (routes[route] as (b: unknown) => Promise<T>)(body);
const passport = toHex(crypto.getRandomValues(new Uint8Array(32)));
const otherPassport = keccak256(passport);

const owner = createSoftPasskey('localhost', 'http://localhost:3000');
const guardianA = privateKeyToAccount(generatePrivateKey());
const account = Safe.initializeNewAccount([owner.publicKey]);
const wallet = account.accountAddress;

// 1. Enrol, then deploy with recovery on
const e = await call<{ scan: string; simulated: boolean }>('POST /enroll', { wallet });
const enrolled = await call<ScanStatus>('POST /scan/simulate', { scan: e.scan, secret: passport });
if (enrolled.status !== 'done' || !enrolled.enrollment) throw new Error('enrolment failed: ' + JSON.stringify(enrolled));
const gB = enrolled.enrollment.address;
log('wallet', wallet, '| passport guardian', gB, `(${enrolled.enrollment.label})`, '| Guardian A (EOA)', guardianA.address);

const txs = setupTransactions(wallet, guardianA.address, { type: 'passport', address: gB, enrollId: enrolled.enrollment.id, simulated: true });
const es = { expectedSigners: [owner.publicKey] };
let op = await account.createUserOperation(txs, NODE_RPC, BUNDLER_RPC, es);
op = (await new CandidePaymaster(PAYMASTER_RPC).createSponsorPaymasterUserOperation(account, op, BUNDLER_RPC)).userOperation;
op.signature = await account.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: owner.publicKey, isInit: true, getAssertion: owner.getAssertion, accountClass: Safe })], CHAIN_ID);
const receipt = await (await account.sendUserOperation(op, BUNDLER_RPC)).included();
if (!receipt?.success) throw new Error('deploy failed ' + receipt?.receipt?.transactionHash);
log('1 deployed', receipt.receipt.transactionHash);
// The public RPC can lag the bundler by a block.
let state = await readWalletState(NODE_RPC, wallet);
for (let i = 0; i < 10 && !state.guardians.some((g) => g.toLowerCase() === gB.toLowerCase()); i++) { await new Promise((r) => setTimeout(r, 2000)); state = await readWalletState(NODE_RPC, wallet); }
log('  guardians', state.guardians, 'threshold', state.threshold);
if (!state.guardians.some((g) => g.toLowerCase() === gB.toLowerCase())) throw new Error('passport guardian is not a guardian');

// 2. Another passport is refused; the enrolled one signs the request the guardian computed from the chain
const newOwner = createSoftPasskey('localhost', 'http://localhost:3000');
const newSigner = passkeySignerAddress(newOwner.publicKey);
const { hash } = await recoveryRequest(NODE_RPC, wallet, newSigner);
const r1 = await call<{ scan: string; hash: Hex }>('POST /recover', { wallet, newOwner: newSigner });
const wrong = await call<ScanStatus>('POST /scan/simulate', { scan: r1.scan, secret: otherPassport });
log('2 another passport →', wrong.status, wrong.status === 'refused' ? wrong.reason : '');
if (wrong.status !== 'refused') throw new Error('another passport was accepted');
const again = await call<ScanStatus>('POST /scan/simulate', { scan: r1.scan, secret: passport });
if (again.status !== 'refused') throw new Error('a settled scan changed its outcome');
const r2 = await call<{ scan: string; hash: Hex }>('POST /recover', { wallet, newOwner: newSigner });
if (r2.hash !== hash) throw new Error('guardian computed another request hash');
const right = await call<ScanStatus>('POST /scan/simulate', { scan: r2.scan, secret: passport });
if (right.status !== 'done' || !right.signature) throw new Error('enrolled passport refused: ' + JSON.stringify(right));
const okB = await c.verifyHash({ address: gB as Hex, hash, signature: right.signature });
log('  enrolled passport → signed;', 'verifyHash =', okB);
if (!okB) throw new Error('signature does not verify for Guardian B');
// The same scan's liveness attestation, as Swissquote's guardian checks it (attestor key from /info)
const attestor = (await call<{ attestor: string }>('GET /info', {})).attestor;
const bad = await checkAttestation(right.attestation, { issuers: [{ address: attestor, name: 'passport guardian' }], wallet, request: hash });
const wrongReq = await checkAttestation(right.attestation, { issuers: [{ address: attestor, name: 'passport guardian' }], wallet, request: '0x' + '11'.repeat(32) });
log('  liveness attestation:', bad ?? 'valid', '| for another request:', wrongReq);
if (bad || !wrongReq) throw new Error('liveness attestation check is wrong');

// 3. Both guardians approve; anyone may submit (here a throwaway sponsored relayer)
const sigA = await guardianA.sign({ hash });
const relayer = createRelayer({ key: generatePrivateKey(), nodeRpc: NODE_RPC, bundlerRpc: BUNDLER_RPC, paymasterRpc: PAYMASTER_RPC, chainId: CHAIN_ID });
const { txHash } = await relayer.relay([
  Safe.createDeployWebAuthnVerifierMetaTransaction(newOwner.publicKey.x, newOwner.publicKey.y),
  srm.createMultiConfirmRecoveryMetaTransaction(wallet, [newSigner], 1, [{ signer: guardianA.address, signature: sigA }, { signer: gB, signature: right.signature }], true),
]);
const req = await srm.getRecoveryRequest(NODE_RPC, wallet);
log('3 recovery started', txHash, '| approvals', req.guardiansApprovalCount, '| newOwners', req.newOwners);
if (Number(req.guardiansApprovalCount) !== 2) throw new Error('expected 2 approvals');
fs.rmSync(dir, { recursive: true });
log('PASS');
