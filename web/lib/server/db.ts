import 'server-only';
// Tiny JSON document store for the mocked Swissquote backend.
import fs from 'node:fs';
import path from 'node:path';
import { Client, neon } from '@neondatabase/serverless';
import { parse, stringify } from '../json';
import type { DnieCard, GuardianB } from '../chain';
import type { LivenessAttestation } from '../liveness';

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '.data');
const FILE = path.join(DATA_DIR, 'db.json');

export type Owner = { x: bigint; y: bigint; credentialId: string; signer: string };
export type WalletRecord = {
  clientId: string;
  address: string;
  createdAt: number;
  deployedAt?: number;
  owner: Owner;
  previousOwners: (Owner & { revokedAt: number })[];
  guardianA: { type: 'swissquote' | 'contact'; address: string; label: string };
  guardianB: GuardianB & { label: string };
  bankAssisted: boolean;
  proof?: { verifiedAt: number; signer: string; message: string; method: string; signature?: string };
};
export type RecoverySession = {
  id: string;
  clientId: string;
  wallet: string;
  newOwner: Owner;
  hash: string;
  nonce: string;
  createdAt: number;
  guardianB?: { signature: string; verifiedAt: number };
  liveness?: { result: 'match' | 'mismatch'; at: number; attestation?: LivenessAttestation };
  swissquote?: { signature: string; signedAt: number };
  submittedTx?: string;
  executeAfter?: number;
  finalizedTx?: string;
  status: 'collecting' | 'refused' | 'pending' | 'finalized' | 'cancelled';
};

/** What clients and the ops view may see: guardian signatures stay server-side. */
export type PublicRecoverySession = Omit<RecoverySession, 'guardianB' | 'swissquote'> & { guardianB?: { verifiedAt: number }; swissquote?: { signedAt: number } };
export function publicSession(s: RecoverySession): PublicRecoverySession;
export function publicSession(s: RecoverySession | null | undefined): PublicRecoverySession | null;
export function publicSession(s: RecoverySession | null | undefined): PublicRecoverySession | null {
  if (!s) return null;
  const { guardianB, swissquote, ...rest } = s;
  return { ...rest, ...(guardianB && { guardianB: { verifiedAt: guardianB.verifiedAt } }), ...(swissquote && { swissquote: { signedAt: swissquote.signedAt } }) };
}
export type Alert = { id: string; wallet: string; ts: number; severity: 'info' | 'warning' | 'error' | 'success'; title: string; body: string; channels: string[]; read?: boolean };
export type Activity = {
  id: string;
  wallet: string;
  ts: number;
  type: 'deploy' | 'send' | 'receive' | 'approve' | 'security' | 'recovery';
  title: string;
  amount?: bigint;
  counterparty?: string;
  userOpHash?: string;
  txHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  sponsored: boolean;
  fee?: bigint;
};
export type AuditEntry = { id: string; ts: number; actor: string; action: string; wallet?: string; detail: string; outcome: 'approved' | 'declined' | 'info' };
/** A pending DNIe signature: created by the wallet, fulfilled by the Swissquote ID app (or the demo simulator). */
export type DnieRequest = {
  id: string;
  token: string; // unguessable; the phone app holds it instead of a session cookie
  clientId: string;
  purpose: 'enroll' | 'recovery' | 'stepup';
  ref?: string; // recovery session id or step-up id
  hash: string; // the 32 bytes the card signs
  title: string;
  lines: string[];
  createdAt: number;
  expires: number;
  status: 'open' | 'done';
  error?: string; // last failed attempt, the request stays open for a retry
  card?: DnieCard; // set once a valid signature arrived
};
export type StepUp = { id: string; wallet: string; challenge: string; callDataHash: string; expires: number; verified?: boolean };

type DB = {
  sessions: Record<string, { clientId: string; createdAt: number; scope?: 'recovery'; recoveryId?: string }>;
  wallets: Record<string, WalletRecord>; // by clientId
  recoveries: Record<string, RecoverySession>;
  alerts: Alert[];
  activity: Activity[];
  audit: AuditEntry[];
  stepUps: Record<string, StepUp>;
  dnieRequests: Record<string, DnieRequest>;
  keys?: { ops: `0x${string}` }; // database store only, the file store keeps .data/keys.json
};

const empty = (): DB => ({ sessions: {}, wallets: {}, recoveries: {}, alerts: [], activity: [], audit: [], stepUps: {}, dnieRequests: {} });

// Two backends: Postgres (Neon) when DATABASE_URL is set, which every Vercel instance shares, and a local JSON
// file otherwise. Either way the whole store is one document, and a write locks it for its read-modify-write.
const DATABASE_URL = process.env.DATABASE_URL;
const fromText = (text: string | null | undefined): DB => (text ? { ...empty(), ...parse<DB>(text) } : empty());

let table: Promise<unknown> | undefined;
const ensureTable = () => (table ??= neon(DATABASE_URL!).query('create table if not exists sq_store (key text primary key, doc text not null)').catch((e) => { table = undefined; throw e; }));

function fileStore() {
  if (process.env.VERCEL && !DATABASE_URL) throw new Error('DATABASE_URL is not set: Vercel has no writable disk for the file store');
  return !DATABASE_URL;
}

async function load(): Promise<DB> {
  if (fileStore()) {
    try { return fromText(fs.readFileSync(FILE, 'utf8')); } catch { return empty(); }
  }
  await ensureTable();
  const rows = await neon(DATABASE_URL!).query('select doc from sq_store where key = $1', ['db']);
  return fromText(rows[0]?.doc);
}

export async function read<T>(fn: (db: DB) => T): Promise<T> {
  return fn(await load());
}

export async function write<T>(fn: (db: DB) => T): Promise<T> {
  if (fileStore()) {
    const db = await load();
    const out = fn(db);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, stringify(db));
    fs.renameSync(tmp, FILE);
    return out;
  }
  await ensureTable();
  // A websocket client per write, closed before returning: serverless instances can't keep one between requests.
  const client = new Client(DATABASE_URL!);
  await client.connect();
  try {
    await client.query('begin');
    await client.query("insert into sq_store (key, doc) values ('db', '{}') on conflict do nothing");
    const { rows } = await client.query('select doc from sq_store where key = $1 for update', ['db']);
    const db = fromText(rows[0]?.doc);
    const out = fn(db);
    await client.query('update sq_store set doc = $2 where key = $1', ['db', stringify(db)]);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

export const id = () => crypto.randomUUID();

export function walletByAddress(db: DB, address: string) {
  return Object.values(db.wallets).find((w) => w.address.toLowerCase() === address.toLowerCase());
}

export function audit(entry: Omit<AuditEntry, 'id' | 'ts'>) {
  return write((db) => {
    db.audit.unshift({ id: id(), ts: Date.now(), ...entry });
    db.audit = db.audit.slice(0, 500);
  });
}

export function alert(wallet: string, a: Omit<Alert, 'id' | 'ts' | 'wallet' | 'channels'> & { channels?: string[] }) {
  return write((db) => {
    db.alerts.unshift({ id: id(), ts: Date.now(), wallet, channels: a.channels ?? ['Push', 'E-mail', 'E-banking inbox'], ...a });
  });
}

export function addActivity(a: Omit<Activity, 'id' | 'ts'>) {
  return write((db) => {
    const entry = { id: id(), ts: Date.now(), ...a };
    db.activity.unshift(entry);
    return entry;
  });
}

export function updateActivity(match: (a: Activity) => boolean, patch: Partial<Activity>) {
  return write((db) => {
    for (const a of db.activity) if (match(a)) Object.assign(a, patch);
  });
}
