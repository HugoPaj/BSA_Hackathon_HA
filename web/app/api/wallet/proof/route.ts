import { isAddressEqual, keccak256, toBytes, type Hex } from 'viem';
import { NODE_RPC } from '@/lib/config';
import { isValid1271, readWalletState } from '@/lib/chain';
import { alert, audit, id, read, write } from '@/lib/server/db';
import { body, currentClient, fail, json } from '@/lib/server/session';

// Wallet ownership proof (FINMA Guidance 02/2019): the client's passkey signs a Swissquote challenge,
// verified on-chain through the owner's EIP-1271 signer contract. No screenshots, no test transfers.
export async function POST(req: Request) {
  const client = await currentClient();
  if (!client) return fail('Not logged in', 401);
  const wallet = read((db) => db.wallets[client.clientId]);
  if (!wallet) return fail('No wallet');
  const b = await body<{ stage: 'challenge' } | { stage: 'verify'; challengeId: string; signature: Hex }>(req);

  if (b.stage === 'challenge') {
    const message = [
      'Swissquote wallet ownership proof',
      `Client: ${client.clientId}`,
      `Wallet: ${wallet.address}`,
      'Network: Base Sepolia (84532)',
      `Issued: ${new Date().toISOString()}`,
      `Nonce: ${crypto.randomUUID()}`,
    ].join('\n');
    const hash = keccak256(toBytes(message));
    const challengeId = id();
    write((db) => { db.stepUps[challengeId] = { id: challengeId, wallet: wallet.address, challenge: hash, callDataHash: 'proof:' + message, expires: Date.now() + 5 * 60_000 }; });
    return json({ challengeId, message, hash });
  }

  const ch = read((db) => db.stepUps[b.challengeId]);
  if (!ch || !ch.callDataHash.startsWith('proof:') || ch.expires < Date.now()) return fail('Challenge expired');
  const state = await readWalletState(NODE_RPC, wallet.address);
  const isOwner = state.owners.some((o) => isAddressEqual(o as Hex, wallet.owner.signer as Hex));
  const valid = isOwner && (await isValid1271(NODE_RPC, wallet.owner.signer, ch.challenge as Hex, b.signature));
  if (!valid) {
    audit({ actor: 'Compliance', action: 'Ownership proof rejected', wallet: wallet.address, detail: 'Signature did not verify against the current owner', outcome: 'declined' });
    return fail('The signature did not verify against the wallet owner');
  }
  const proof = { verifiedAt: Date.now(), signer: wallet.owner.signer, message: ch.callDataHash.slice(6), method: 'EIP-1271 isValidSignature on the owner signer contract' };
  write((db) => { db.wallets[client.clientId].proof = proof; delete db.stepUps[b.challengeId]; });
  audit({ actor: 'Compliance', action: 'Ownership proof archived', wallet: wallet.address, detail: `Verified on-chain via EIP-1271 (signer ${wallet.owner.signer})`, outcome: 'approved' });
  alert(wallet.address, { severity: 'success', title: 'Wallet ownership verified', body: 'Swissquote verified automatically that you control this wallet. Transfers from your Swissquote account need no manual checks.', channels: ['In-app'] });
  return json({ proof });
}
