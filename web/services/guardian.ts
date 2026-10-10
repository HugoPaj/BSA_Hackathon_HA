// Guardian service (mock HSM). A separate process with its own key and its own storage: the Swissquote web
// backend and the browser never see the key, they can only ask this process to sign.
//
// The same program runs twice, as the two owners of the Guardian A Safe (1-of-2):
//   GUARDIAN_ROLE=swissquote  Swissquote's recovery HSM. Requires a liveness verdict signed by  (port 4101)
//                             the pinned liveness vendor, for this request and this wallet's client.
//   GUARDIAN_ROLE=partner     An independent recovery partner. Requires its own identification. (port 4102)
//                             Also relays and hosts the rescue page, so recovery works when Swissquote is gone.
//
// Policy, checked against the chain for every request, never trusting the caller:
//   1. The wallet is deployed, this guardian's Safe is one of its guardians, and no recovery is pending.
//   2. The client's own recovery factor (Guardian B) signed exactly this recovery request.
//   3. The client passed this guardian's identity check. For Swissquote that is a vendor-signed liveness attestation
//      bound to this exact request, for the client named in the wallet owner's own passkey-signed ownership proof.
// Only then does it sign the EIP-712 request, wrapped as a SafeMessage for the Guardian A Safe. It has no other
// signing endpoint: it cannot sign transactions, and its signature is useless without Guardian B's.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getAddress, isAddress, isAddressEqual, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC, PAYMASTER_RPC } from '../lib/config';
import { client, readWalletState, recoveryRequest, Safe, srm } from '../lib/chain';
import { isOwnedBy, readGuardianSafe, safeMessageTypedData } from '../lib/guardian-safe';
import { createRelayer } from '../lib/relayer';
import { checkAttestation, parseOwnershipProof, type LivenessAttestation } from '../lib/liveness';

const ROLES = {
  swissquote: { port: 4101, name: 'Swissquote recovery HSM', identity: 'kyc-liveness', identityLabel: 'Live face match against the KYC file' },
  partner: { port: 4102, name: 'Independent recovery partner', identity: 'video-ident', identityLabel: 'Video identification by the partner' },
} as const;
type Role = keyof typeof ROLES;

const role = (process.env.GUARDIAN_ROLE ?? 'swissquote') as Role;
if (!ROLES[role]) throw new Error(`GUARDIAN_ROLE must be one of ${Object.keys(ROLES).join(', ')}`);
const cfg = ROLES[role];
const PORT = Number(process.env.PORT ?? cfg.port);
const DIR = process.env.GUARDIAN_DATA_DIR ?? path.join(process.cwd(), '.data', `guardian-${role}`);

// ── Own storage ──────────────────────────────────────────────────────────────────────────────────────────────
type Keys = { guardian: Hex; relayer: Hex; livenessVendor?: Hex };
type Entry = { id: string; ts: number; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };
fs.mkdirSync(DIR, { recursive: true });
const keysFile = path.join(DIR, 'keys.json');
const logFile = path.join(DIR, 'log.json');
const usedFile = path.join(DIR, 'used-attestations.json');
const keys: Keys = fs.existsSync(keysFile) ? JSON.parse(fs.readFileSync(keysFile, 'utf8')) : { guardian: generatePrivateKey(), relayer: generatePrivateKey() };
fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
const guardian = privateKeyToAccount(keys.guardian);
const relayer = createRelayer({ key: keys.relayer, nodeRpc: NODE_RPC, bundlerRpc: BUNDLER_RPC, paymasterRpc: PAYMASTER_RPC, chainId: CHAIN_ID });

const LIVENESS_URL = process.env.LIVENESS_URL ?? 'http://127.0.0.1:4103';

/** Swissquote's guardian trusts exactly one liveness vendor key: from env, or pinned on first contact and kept. */
async function livenessVendor(): Promise<string> {
  if (process.env.LIVENESS_VENDOR) return process.env.LIVENESS_VENDOR;
  if (keys.livenessVendor) return keys.livenessVendor;
  const info = await fetch(LIVENESS_URL + '/info').then((r) => r.json()).catch(() => null);
  if (!isAddress(info?.address ?? '')) throw new Refusal('The liveness vendor is unreachable, so its key cannot be pinned');
  keys.livenessVendor = getAddress(info.address);
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
  log({ action: 'Pinned liveness vendor key', detail: `${keys.livenessVendor}. Only verdicts signed by this key are accepted from now on`, outcome: 'info' });
  return keys.livenessVendor;
}

function log(e: Omit<Entry, 'id' | 'ts'>) {
  const all: Entry[] = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
  all.unshift({ id: crypto.randomUUID(), ts: Date.now(), ...e });
  fs.writeFileSync(logFile, JSON.stringify(all.slice(0, 500), null, 2));
  console.log(`[${role}] ${e.outcome.padEnd(8)} ${e.action}: ${e.detail}`);
}

// ── Policy ───────────────────────────────────────────────────────────────────────────────────────────────────
class Refusal extends Error {}

type ApproveReq = {
  wallet: string;
  guardian: string; // the Guardian A Safe this service co-owns
  newOwner: string; // signer address that becomes the only owner
  newOwnerKey?: { x: string; y: string }; // passkey public key, so the relay can deploy its signer contract
  guardianBSignature: Hex;
  identity: Identity;
  relay?: boolean;
};
type Identity =
  | { method: 'kyc-liveness'; attestation: LivenessAttestation; ownershipProof: { message: string; signature: Hex } }
  | { method: 'video-ident'; result: 'match' | 'mismatch' };

const usedSessions = (): string[] => (fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile, 'utf8')) : []);

/** Why the identity evidence is not enough for this request, or null if it is. */
async function identityProblem(id: Identity | undefined, wallet: string, request: Hex, owners: string[]) {
  if (!id || id.method !== cfg.identity) return `Identity check must be ${cfg.identity}`;
  if (id.method === 'video-ident') return id.result === 'match' ? null : `${cfg.identityLabel} failed`;
  // Which KYC file belongs to this wallet? The owner's passkey said so in its ownership proof, checked on-chain now.
  const proof = id.ownershipProof && parseOwnershipProof(id.ownershipProof.message);
  if (!proof || !isAddressEqual(proof.wallet as Hex, wallet as Hex)) return 'No ownership proof for this wallet';
  const c = client(NODE_RPC);
  const byOwner = await Promise.all(owners.map((o) => c.verifyHash({ address: o as Hex, hash: proof.hash, signature: id.ownershipProof.signature }).catch(() => false)));
  if (!byOwner.some(Boolean)) return 'The ownership proof is not signed by the wallet owner';
  const bad = await checkAttestation(id.attestation, { vendor: await livenessVendor(), wallet, request, subject: proof.client });
  if (bad) return bad;
  if (usedSessions().includes(id.attestation.session)) return 'This liveness attestation was already used';
  if (!id.attestation.match) return `${cfg.identityLabel} failed`;
  fs.writeFileSync(usedFile, JSON.stringify([id.attestation.session, ...usedSessions()].slice(0, 5000)));
  return null;
}

async function approve(r: ApproveReq) {
  for (const k of ['wallet', 'guardian', 'newOwner'] as const) if (!isAddress(r[k] ?? '')) throw new Refusal(`Invalid ${k} address`);
  const wallet = getAddress(r.wallet);
  const refuse = (detail: string): never => {
    log({ action: 'Refused to sign', wallet, detail, outcome: 'declined' });
    throw new Refusal(detail);
  };

  const [state, gSafe] = await Promise.all([readWalletState(NODE_RPC, wallet), readGuardianSafe(NODE_RPC, r.guardian)]);
  if (!state.deployed) refuse('Wallet is not deployed');
  if (!gSafe || !isOwnedBy(gSafe, guardian.address) || gSafe.threshold !== 1n) refuse(`${r.guardian} is not a 1-of-n Safe this guardian owns`);
  if (!state.guardians.some((g) => isAddressEqual(g as Hex, r.guardian as Hex))) refuse('This guardian is not registered on the wallet');
  if (state.recovery) refuse('A recovery is already pending on-chain');
  if (state.owners.some((o) => isAddressEqual(o as Hex, r.newOwner as Hex))) refuse('The new signer already owns the wallet');

  // Guardian B: every other guardian on the wallet is the client's own factor. Its signature must cover this request.
  const others = state.guardians.filter((g) => !isAddressEqual(g as Hex, r.guardian as Hex));
  if (others.length !== 1 || state.threshold !== 2n) refuse(`Unexpected guardian set (${state.guardians.length} guardians, threshold ${state.threshold})`);
  const { hash, nonce } = await recoveryRequest(NODE_RPC, wallet, r.newOwner);
  const bOk = await client(NODE_RPC).verifyHash({ address: others[0] as Hex, hash, signature: r.guardianBSignature }).catch(() => false);
  if (!bOk) refuse(`Guardian B (${others[0]}) did not sign this recovery request`);

  const problem = await identityProblem(r.identity, wallet, hash, state.owners);
  if (problem) refuse(problem);

  const signature = await guardian.signTypedData(safeMessageTypedData(r.guardian, hash));
  log({ action: 'Signed recovery approval', wallet, detail: `Guardian B verified on-chain, ${cfg.identityLabel.toLowerCase()} passed. Request: owner → ${r.newOwner}, threshold 1, nonce ${nonce}`, outcome: 'approved' });
  const out: { signer: string; signature: Hex; hash: Hex; txHash?: string; executeAfter?: number } = { signer: getAddress(r.guardian), signature, hash };

  if (r.relay) {
    const txs = [];
    if (r.newOwnerKey) {
      const x = BigInt(r.newOwnerKey.x), y = BigInt(r.newOwnerKey.y);
      if (!isAddressEqual(Safe.createWebAuthnSignerVerifierAddress(x, y) as Hex, r.newOwner as Hex)) refuse('New owner key does not match the new signer');
      txs.push(Safe.createDeployWebAuthnVerifierMetaTransaction(x, y));
    }
    txs.push(srm.createMultiConfirmRecoveryMetaTransaction(wallet, [r.newOwner], 1, [
      { signer: out.signer, signature },
      { signer: others[0], signature: r.guardianBSignature },
    ], true));
    const { txHash } = await relayer.relay(txs);
    const req = await srm.getRecoveryRequest(NODE_RPC, wallet);
    Object.assign(out, { txHash, executeAfter: Number(req.executeAfter) });
    log({ action: 'Relayed recovery', wallet, detail: `multiConfirmRecovery submitted (${txHash}). Executes after ${new Date(out.executeAfter! * 1000).toISOString()}; the owner can cancel until then`, outcome: 'info' });
  }
  return out;
}

/** finalizeRecovery is permissionless once the delay has passed. Relaying it just pays the gas. */
async function finalize(r: { wallet: string }) {
  if (!isAddress(r.wallet ?? '')) throw new Refusal('Invalid wallet address');
  const wallet = getAddress(r.wallet);
  const state = await readWalletState(NODE_RPC, wallet);
  if (!state.recovery) throw new Refusal('No recovery is pending on-chain');
  if (Number(state.recovery.executeAfter) * 1000 > Date.now()) throw new Refusal('The delay has not ended yet');
  const { txHash } = await relayer.relay([srm.createFinalizeRecoveryMetaTransaction(wallet)]);
  log({ action: 'Relayed finalize', wallet, detail: `Owner swapped to ${state.recovery.newOwners.join(', ')} (${txHash})`, outcome: 'info' });
  return { txHash };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────────────────
const routes: Record<string, (body: never) => Promise<unknown>> = {
  'GET /info': async () => ({ role, name: cfg.name, address: guardian.address, relayer: relayer.address, identity: cfg.identity, identityLabel: cfg.identityLabel }),
  'GET /audit': async () => (fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : []),
  'POST /approve': approve,
  'POST /finalize': finalize,
};

http.createServer(async (req, res) => {
  const route = routes[`${req.method} ${new URL(req.url ?? '/', 'http://x').pathname}`];
  const send = (status: number, data: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  if (!route) return send(404, { error: 'Not found' });
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    send(200, await route((raw ? JSON.parse(raw) : {}) as never));
  } catch (e) {
    const refusal = e instanceof Refusal;
    if (!refusal) console.error(`[${role}]`, e);
    send(refusal ? 403 : 500, { error: (e as Error).message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[${role}] ${cfg.name} on http://127.0.0.1:${PORT} · guardian key ${guardian.address} · storage ${DIR}`);
  if (role === 'swissquote') livenessVendor().catch(() => console.log(`[${role}] liveness vendor not reachable yet; will pin its key on first use`));
});
