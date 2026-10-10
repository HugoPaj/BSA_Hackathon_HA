import 'server-only';
// Tiny JSON-file store for the mocked Swissquote backend. Single process, synchronous writes.
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from '../json';
import type { DnieCard, GuardianB } from '../chain';
import type { LivenessAttestation } from '../liveness';

// Vercel's disk is read-only except /tmp, which is per instance and wiped on cold starts.
export const DATA_DIR = process.env.DATA_DIR ?? (process.env.VERCEL ? '/tmp/sq-data' : path.join(process.cwd(), '.data'));
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
};

const empty = (): DB => ({ sessions: {}, wallets: {}, recoveries: {}, alerts: [], activity: [], audit: [], stepUps: {}, dnieRequests: {} });

function load(): DB {
  try {
    return { ...empty(), ...parse<DB>(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return empty();
  }
}

export function read<T>(fn: (db: DB) => T): T {
  return fn(load());
}

export function write<T>(fn: (db: DB) => T): T {
  const db = load();
  const out = fn(db);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, stringify(db));
  fs.renameSync(tmp, FILE);
  return out;
}

export const id = () => crypto.randomUUID();

export function walletByAddress(db: DB, address: string) {
  return Object.values(db.wallets).find((w) => w.address.toLowerCase() === address.toLowerCase());
}

export function audit(entry: Omit<AuditEntry, 'id' | 'ts'>) {
  write((db) => {
    db.audit.unshift({ id: id(), ts: Date.now(), ...entry });
    db.audit = db.audit.slice(0, 500);
  });
}

export function alert(wallet: string, a: Omit<Alert, 'id' | 'ts' | 'wallet' | 'channels'> & { channels?: string[] }) {
  write((db) => {
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
  write((db) => {
    for (const a of db.activity) if (match(a)) Object.assign(a, patch);
  });
}
