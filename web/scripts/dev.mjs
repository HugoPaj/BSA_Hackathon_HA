// Start the demo: the Swissquote web app plus each mocked share holder as its own process with its own storage.
//   node scripts/dev.mjs            everything
//   node scripts/dev.mjs --no-swissquote   only what survives Swissquote: the partner and passport guardians and the rescue page
import { spawn } from 'node:child_process';

const withoutSwissquote = process.argv.includes('--no-swissquote');

// The guardians' public keys, as their operators would publish them: the Swissquote guardian only trusts the issuer
// keys it is given, and the web app is built with the guardian keys its browser code checks every guardian against.
const info = async (port) => {
  for (let i = 0; i < 120; i++) {
    try { return await (await fetch(`http://127.0.0.1:${port}/info`)).json(); } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`The service on port ${port} did not start`);
};

const children = [];
function start({ name, color, cmd, env }) {
  const child = spawn('npx', ['--no-install', ...cmd], { env: { ...process.env, ...env, FORCE_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m${name.padEnd(8)}\x1b[0m│ `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) process.stdout.write(tag + l + '\n');
    });
  }
  child.on('exit', (code) => { process.stdout.write(`${tag}exited (${code})\n`); shutdown(code ?? 1); });
  children.push(child);
}

start({ name: 'passport', color: 31, cmd: ['tsx', 'services/passport.ts'] });
start({ name: 'partner', color: 32, cmd: ['tsx', 'services/guardian.ts'], env: { GUARDIAN_ROLE: 'partner' } });
start({ name: 'rescue', color: 33, cmd: ['tsx', 'services/rescue/server.mts'] });
if (!withoutSwissquote) {
  start({ name: 'liveness', color: 36, cmd: ['tsx', 'services/liveness.ts'] });
  const [liveness, passport] = await Promise.all([info(4103), info(4104)]);
  start({ name: 'guardian', color: 35, cmd: ['tsx', 'services/guardian.ts'], env: { GUARDIAN_ROLE: 'swissquote', LIVENESS_VENDOR: liveness.address, PASSPORT_ATTESTOR: passport.attestor } });
  const [sq, partner] = await Promise.all([info(4101), info(4102)]);
  start({ name: 'web', color: 34, cmd: ['next', 'dev'], env: { NEXT_PUBLIC_SQ_GUARDIAN_KEY: sq.address, NEXT_PUBLIC_PARTNER_GUARDIAN_KEY: partner.address, NEXT_PUBLIC_PASSPORT_GUARDIAN_KEY: passport.attestor } });
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
