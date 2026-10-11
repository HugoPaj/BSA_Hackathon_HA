// The passport guardian (Guardian B) as its own local process on port 4104.
import path from 'node:path';
import { createPassportGuardian } from './passport-core';
import { serve } from './serve';

// Its own secrets (Signicat API client). Not in .env.local: the web app never gets them. Loaded before the first
// request, which is when readid.ts reads them.
try { process.loadEnvFile('.env.passport'); } catch {}

const port = Number(process.env.PORT ?? 4104);
const dir = process.env.PASSPORT_DATA_DIR ?? path.join(process.cwd(), '.data', 'passport');
const p = createPassportGuardian({ dir });

serve('passport', p.routes, port, () => {
  console.log(`[passport] Passport guardian on http://127.0.0.1:${port} · ${process.env.SIGNICAT_CLIENT_ID ? 'ReadID Ready via Signicat' : 'simulated passports (no SIGNICAT_CLIENT_ID)'} · storage ${dir}`);
});
