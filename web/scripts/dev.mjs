// Start the demo: the Swissquote web app plus each mocked share holder as its own process with its own storage.
//   node scripts/dev.mjs            everything
//   node scripts/dev.mjs --no-swissquote   only what survives Swissquote: the partner guardian and the rescue page
import { spawn } from 'node:child_process';

const withoutSwissquote = process.argv.includes('--no-swissquote');
const procs = [
  !withoutSwissquote && { name: 'web', color: 34, cmd: ['next', 'dev'] },
  !withoutSwissquote && { name: 'guardian', color: 35, cmd: ['tsx', 'services/guardian.ts'], env: { GUARDIAN_ROLE: 'swissquote' } },
  !withoutSwissquote && { name: 'liveness', color: 36, cmd: ['tsx', 'services/liveness.ts'] },
  { name: 'partner', color: 32, cmd: ['tsx', 'services/guardian.ts'], env: { GUARDIAN_ROLE: 'partner' } },
  { name: 'rescue', color: 33, cmd: ['tsx', 'services/rescue/server.mts'] },
].filter(Boolean);

const children = procs.map(({ name, color, cmd, env }) => {
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
  return child;
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
