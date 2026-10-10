import 'server-only';
// Swissquote backend keys. Only the operations Safe's owner lives here. The recovery guardian key does not:
// it belongs to the guardian service (services/guardian.ts), a separate process with its own storage.
// Demo: software key from env, or generated once into .data/keys.json.
import fs from 'node:fs';
import path from 'node:path';
import { generatePrivateKey } from 'viem/accounts';
import type { Hex } from 'viem';
import { DATA_DIR } from './db';

type Keys = { ops: Hex };
let cached: Keys | null = null;

function loadKeys(): Keys {
  if (cached) return cached;
  const file = path.join(DATA_DIR, 'keys.json');
  let fromFile: Partial<Keys> & { guardian?: Hex } = {};
  try { fromFile = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const keys: Keys = { ops: (process.env.SQ_OPS_KEY as Hex) ?? fromFile.ops ?? generatePrivateKey() };
  // Older demo data kept the guardian key here too. Drop it: the backend must never hold a guardian key.
  if (!process.env.SQ_OPS_KEY || fromFile.guardian) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
  }
  cached = keys;
  return keys;
}

/** Owner key of Swissquote's operations Safe (relayer, treasury and fee collector). Holds no client funds. */
export const opsSigner = () => loadKeys().ops;
