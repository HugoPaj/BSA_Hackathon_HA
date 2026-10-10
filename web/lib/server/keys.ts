import 'server-only';
// Swissquote-side keys. Production: the guardian key lives in an HSM with four-eyes approval.
// Demo: software keys from env, or generated once into .data/keys.json.
import fs from 'node:fs';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { DATA_DIR } from './db';

type Keys = { guardian: Hex; ops: Hex };
let cached: Keys | null = null;

function loadKeys(): Keys {
  if (cached) return cached;
  const file = path.join(DATA_DIR, 'keys.json');
  let fromFile: Partial<Keys> = {};
  try { fromFile = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const keys: Keys = {
    guardian: (process.env.SQ_GUARDIAN_KEY as Hex) ?? fromFile.guardian ?? generatePrivateKey(),
    ops: (process.env.SQ_OPS_KEY as Hex) ?? fromFile.ops ?? generatePrivateKey(),
  };
  if (!process.env.SQ_GUARDIAN_KEY || !process.env.SQ_OPS_KEY) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  }
  cached = keys;
  return keys;
}

/** Guardian A: signs EIP-712 recovery approvals only, never transactions. */
export const guardianAccount = () => privateKeyToAccount(loadKeys().guardian);
/** Owner key of Swissquote's operations Safe (relayer, treasury and fee collector). Holds no client funds. */
export const opsSigner = () => loadKeys().ops;
export const opsOwnerAddress = () => privateKeyToAccount(loadKeys().ops).address;
