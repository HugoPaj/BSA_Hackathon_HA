import 'server-only';
// DNIe (Spanish national ID card) as Guardian B.
// The wallet creates a request; the Swissquote ID app on an Android phone reads the card over NFC (CAN + PIN) and has
// it sign the request hash with its qualified signature key (RSA-2048, SHA256withRSA). The app posts the signature
// and the card's certificates here. On-chain, the wallet's RsaGuardian contract checks the same signature.
import crypto from 'node:crypto';
import { keccak256, toBytes, toHex, type Hex } from 'viem';
import { NODE_RPC } from '../config';
import { isValid1271, type DnieCard } from '../chain';
import { audit, id, read, write, type DnieRequest } from './db';
import { approveGuardianB, isOnChainGuardian } from './recovery';

const TTL = 15 * 60_000;

export async function createDnieRequest(r: Pick<DnieRequest, 'clientId' | 'purpose' | 'ref' | 'hash' | 'title' | 'lines'>) {
  const req: DnieRequest = { ...r, id: id(), token: crypto.randomBytes(16).toString('hex'), createdAt: Date.now(), expires: Date.now() + TTL, status: 'open' };
  await write((db) => {
    for (const [k, v] of Object.entries(db.dnieRequests)) if (v.expires < Date.now() - TTL) delete db.dnieRequests[k];
    db.dnieRequests[req.id] = req;
  });
  return req;
}

/**
 * What the phone app and the polling browser see. The token is the only credential. `lastError` is the last failed
 * attempt (the request stays open for a retry); it isn't called `error` because clients read that as a failed call.
 */
export function publicDnieRequest(r: DnieRequest) {
  return { id: r.id, purpose: r.purpose, title: r.title, lines: r.lines, hash: r.hash, done: r.status === 'done', lastError: r.error ?? null, card: r.card ?? null, expires: r.expires };
}

export async function dnieRequestByToken(rid: string, token: string) {
  const r = await read((db) => db.dnieRequests[rid]);
  const same = !!r && typeof token === 'string' && token.length === r.token.length && crypto.timingSafeEqual(Buffer.from(r.token), Buffer.from(token));
  if (!r || !same) throw new Error('Unknown or expired ID card request');
  if (r.expires < Date.now()) throw new Error('This ID card request expired. Start again from the wallet.');
  return r;
}

export type DnieResult = { signature: Hex; certificate?: string; intermediate?: string; spki?: string; simulated?: boolean };

const b64url = (s: string) => toHex(Buffer.from(s, 'base64url'));
const field = (dn: string, key: string) => dn.split('\n').find((l) => l.startsWith(key + '='))?.slice(key.length + 1);

/** Public key and identity of the card that signed. Real cards must chain to the DNIe intermediate CA they carry. */
function readCard(res: DnieResult, clientId: string, clientName: string): { key: crypto.KeyObject; card: DnieCard } {
  if (res.certificate) {
    const cert = new crypto.X509Certificate(Buffer.from(res.certificate, 'base64'));
    const key = cert.publicKey;
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('This card does not have an RSA-2048 signature key');
    if (Date.parse(cert.validTo) < Date.now()) throw new Error('The signature certificate on this ID card has expired. Renew it with the authority that issued the card.');
    const issuer = field(cert.issuer, 'CN') ?? cert.issuer;
    if (!/AC DNIE/i.test(issuer)) throw new Error(`Not a supported ID card signature certificate (issuer ${issuer})`);
    if (res.intermediate) {
      const ca = new crypto.X509Certificate(Buffer.from(res.intermediate, 'base64'));
      if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) throw new Error('The certificate is not signed by the ID card authority it claims');
    }
    const serial = field(cert.subject, 'serialNumber') ?? '';
    const holder = [field(cert.subject, 'GN'), field(cert.subject, 'SN')].filter(Boolean).join(' ') || (field(cert.subject, 'CN') ?? '').replace(/\s*\((FIRMA|AUTENTICACI[OÓ]N)\)\s*$/i, '');
    const jwk = key.export({ format: 'jwk' }) as { n: string; e: string };
    return {
      key,
      card: {
        modulus: b64url(jwk.n), exponent: b64url(jwk.e), holder, issuer, notAfter: Date.parse(cert.validTo), simulated: false,
        documentId: serial ? '•••••' + serial.replace(/^IDCES-/, '').slice(-4) : 'ID card',
      },
    };
  }
  if (res.spki && res.simulated) {
    const key = crypto.createPublicKey({ key: Buffer.from(res.spki, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('Simulated card key must be RSA-2048');
    const jwk = key.export({ format: 'jwk' }) as { n: string; e: string };
    const docId = keccak256(toBytes(`sim-dnie|${clientId}|${jwk.n}`)).slice(-4).toUpperCase();
    return { key, card: { modulus: b64url(jwk.n), exponent: b64url(jwk.e), holder: clientName, issuer: 'Simulated ID card (demo)', documentId: '•••••' + docId, notAfter: Date.now() + 5 * 365 * 86_400_000, simulated: true } };
  }
  throw new Error('No certificate in the response');
}

/** Called by the phone app (or the simulator) with the card's signature. Verifies it, then acts on the purpose. */
export async function submitDnieResult(r: DnieRequest, res: DnieResult, clientName: string) {
  if (r.status === 'done') return r;
  const fail = async (msg: string): Promise<never> => {
    await write((db) => { if (db.dnieRequests[r.id]) db.dnieRequests[r.id].error = msg; });
    throw new Error(msg);
  };
  let key: crypto.KeyObject, card: DnieCard;
  try {
    ({ key, card } = readCard(res, r.clientId, clientName));
  } catch (e) {
    return fail((e as Error).message);
  }
  const sig = Buffer.from((res.signature ?? '').replace(/^0x/, ''), 'hex');
  const ok = crypto.verify('sha256', Buffer.from(r.hash.slice(2), 'hex'), { key, padding: crypto.constants.RSA_PKCS1_PADDING }, sig);
  if (!ok) await fail('The card signature does not match the request');

  const wallet = await read((db) => db.wallets[r.clientId]);
  const registered = wallet?.guardianB.type === 'dnie' ? wallet.guardianB : null;
  if (r.purpose !== 'enroll') {
    if (!wallet || !registered) await fail('This wallet does not use an ID card as recovery factor');
    if (registered!.modulus.toLowerCase() !== card.modulus.toLowerCase()) await fail('This is not the ID card registered on this wallet');
  }

  if (r.purpose === 'recovery') {
    const session = await read((db) => db.recoveries[r.ref!]);
    if (!session || session.clientId !== r.clientId) await fail('Unknown recovery request');
    try {
      await approveGuardianB(session, wallet!, res.signature);
    } catch (e) {
      await fail((e as Error).message);
    }
  } else if (r.purpose === 'stepup') {
    const s = await read((db) => db.stepUps[r.ref!]);
    if (!s || s.expires < Date.now() || s.wallet.toLowerCase() !== wallet!.address.toLowerCase()) await fail('This confirmation expired');
    const onChain = (await isOnChainGuardian(wallet!.address, registered!.address)) && (await isValid1271(NODE_RPC, registered!.address, s.challenge as Hex, res.signature));
    if (!onChain) await fail('The wallet\'s ID card guardian contract rejected this signature');
    await write((db) => { db.stepUps[s.id].verified = true; });
    await audit({ actor: 'Paymaster policy', action: 'High-value step-up confirmed', wallet: wallet!.address, detail: `${registered!.holder}'s ID card co-signed the transaction (verified by the RsaGuardian contract)`, outcome: 'approved' });
  } else {
    await audit({ actor: 'Wallet service', action: card.simulated ? 'Simulated ID card enrolled' : 'ID card enrolled', detail: `${card.holder}, ${card.documentId}, issued by ${card.issuer}. PIN signature verified.`, outcome: 'info' });
  }
  await write((db) => { Object.assign(db.dnieRequests[r.id], { status: 'done', card, error: undefined }); });
  return await read((db) => db.dnieRequests[r.id]);
}

/** A completed enrolment of this client, used when the wallet is registered. */
export async function enrolledCard(clientId: string, enrollId: string) {
  const r = await read((db) => db.dnieRequests[enrollId]);
  if (!r || r.clientId !== clientId || r.purpose !== 'enroll' || r.status !== 'done' || !r.card) throw new Error('Read your ID card first');
  return r.card;
}
