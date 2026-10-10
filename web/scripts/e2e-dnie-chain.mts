// On-chain test of the DNIe guardian, independent of the web app's database (safe to run next to a live demo).
// A software RSA-2048 key stands in for the DNIe: it signs exactly like the card (SHA256withRSA, PKCS#1 v1.5).
//   1. Deploy a fresh wallet whose first UserOperation also deploys its RsaGuardian (sponsored by Candide).
//   2. The guardian contract accepts the card's signature over the recovery hash and rejects a wrong one.
//   3. multiConfirmRecovery with Guardian A (EOA) + Guardian B (RsaGuardian, EIP-1271) starts the recovery.
// Usage: npx tsx scripts/e2e-dnie-chain.mts
import crypto from 'node:crypto';
import { CandidePaymaster, fromSafeWebauthn } from 'abstractionkit';
import { toHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC, PAYMASTER_RPC } from '../lib/config';
import { client, passkeySignerAddress, readWalletState, recoveryRequest, Safe, setupTransactions, srm } from '../lib/chain';
import { rsaGuardianAddress } from '../lib/rsa-guardian';
import { createRelayer } from '../lib/relayer';
import { createSoftPasskey } from './webauthn-sim.mjs';

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);
const c = client(NODE_RPC);

// The "DNIe"
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string };
const card = { modulus: toHex(Buffer.from(jwk.n, 'base64url')), exponent: toHex(Buffer.from(jwk.e, 'base64url')) };
const cardSign = (hash: Hex) => toHex(crypto.sign('sha256', Buffer.from(hash.slice(2), 'hex'), privateKey));

const owner = createSoftPasskey('localhost', 'http://localhost:3000');
const guardianA = privateKeyToAccount(generatePrivateKey());
const account = Safe.initializeNewAccount([owner.publicKey]);
const wallet = account.accountAddress;
const gB = rsaGuardianAddress(wallet, card);
log('wallet', wallet, '| RsaGuardian', gB, '| Guardian A (EOA)', guardianA.address);

// 1. Deploy with recovery on
const txs = setupTransactions(wallet, guardianA.address, { type: 'dnie', address: gB, enrollId: 'test', ...card, holder: 'Test', documentId: 'test', issuer: 'test', notAfter: 0, simulated: true });
const es = { expectedSigners: [owner.publicKey] };
let op = await account.createUserOperation(txs, NODE_RPC, BUNDLER_RPC, es);
op = (await new CandidePaymaster(PAYMASTER_RPC).createSponsorPaymasterUserOperation(account, op, BUNDLER_RPC)).userOperation;
log('deploy op: callGasLimit', op.callGasLimit, 'verificationGasLimit', op.verificationGasLimit);
op.signature = await account.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: owner.publicKey, isInit: true, getAssertion: owner.getAssertion, accountClass: Safe })], CHAIN_ID);
const sent = await account.sendUserOperation(op, BUNDLER_RPC);
const receipt = await sent.included();
if (!receipt?.success) throw new Error('deploy failed ' + receipt?.receipt?.transactionHash);
log('1 deployed', receipt.receipt.transactionHash, 'gasUsed', receipt.actualGasUsed);
const state = await readWalletState(NODE_RPC, wallet);
log('  guardians', state.guardians, 'threshold', state.threshold);
if (!state.guardians.some((g) => g.toLowerCase() === gB.toLowerCase())) throw new Error('RsaGuardian is not a guardian');
const code = await c.getCode({ address: gB });
log('  RsaGuardian code', code ? `${(code.length - 2) / 2} bytes` : 'MISSING');

// 2. The contract checks the card's signature (what the guardian service and the module do)
const newOwner = createSoftPasskey('localhost', 'http://localhost:3000');
const newSigner = passkeySignerAddress(newOwner.publicKey);
const { hash } = await recoveryRequest(NODE_RPC, wallet, newSigner);
const sigB = cardSign(hash);
const okB = await c.verifyHash({ address: gB, hash, signature: sigB });
const badB = await c.verifyHash({ address: gB, hash: ('0x' + '11'.repeat(32)) as Hex, signature: sigB });
log('2 verifyHash(card sig) =', okB, '| on another hash =', badB);
if (!okB || badB) throw new Error('RsaGuardian verification is wrong');

// 3. Both guardians approve; anyone may submit (here a throwaway sponsored relayer)
const sigA = await guardianA.sign({ hash });
const relayer = createRelayer({ key: generatePrivateKey(), nodeRpc: NODE_RPC, bundlerRpc: BUNDLER_RPC, paymasterRpc: PAYMASTER_RPC, chainId: CHAIN_ID });
const { txHash } = await relayer.relay([
  Safe.createDeployWebAuthnVerifierMetaTransaction(newOwner.publicKey.x, newOwner.publicKey.y),
  srm.createMultiConfirmRecoveryMetaTransaction(wallet, [newSigner], 1, [{ signer: guardianA.address, signature: sigA }, { signer: gB, signature: sigB }], true),
]);
const req = await srm.getRecoveryRequest(NODE_RPC, wallet);
log('3 recovery started', txHash, '| approvals', req.guardiansApprovalCount, '| executeAfter', new Date(Number(req.executeAfter) * 1000).toISOString(), '| newOwners', req.newOwners);
if (Number(req.guardiansApprovalCount) !== 2) throw new Error('expected 2 approvals');
log('PASS');
