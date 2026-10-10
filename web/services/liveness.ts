// The liveness vendor as its own local process on port 4103.
import path from 'node:path';
import { createLiveness } from './liveness-core';
import { serve } from './serve';

const port = Number(process.env.PORT ?? 4103);
const dir = process.env.LIVENESS_DATA_DIR ?? path.join(process.cwd(), '.data', 'liveness');
const l = createLiveness({ dir });

serve('liveness', l.routes, port, async () => {
  console.log(`[liveness] Liveness vendor on http://127.0.0.1:${port} · signing key ${(await l.vendor()).address} · storage ${dir}`);
});
