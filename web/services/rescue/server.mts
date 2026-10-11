// Rescue page host. Run by the independent partner, not by Swissquote, so it keeps working if Swissquote is gone.
// The page is static (could be pinned on IPFS). It talks to the public Base Sepolia RPC and a public ERC-4337
// bundler directly; only the recovery approvals go to the partner's guardian and the passport guardian, proxied here under /partner/* and /passport/*.
//
// Passkeys are bound to a hostname (the WebAuthn RP ID), not to a port. Served from the same hostname as the
// wallet, this page can use the client's existing passkeys. In production the RP ID domain sits in escrow with
// the partner for exactly this reason.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { context } from 'esbuild';

const PORT = Number(process.env.PORT ?? 4200);
const PARTNER = process.env.PARTNER_GUARDIAN_URL ?? 'http://127.0.0.1:4102';
const PASSPORT = process.env.PASSPORT_URL ?? 'http://127.0.0.1:4104';
const dir = path.join(process.cwd(), 'services', 'rescue');

const bundler = await context({
  entryPoints: [path.join(dir, 'main.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  minify: true,
  logLevel: 'warning',
  define: { 'process.env': '{}' }, // lib/config.ts falls back to the public endpoints
});

async function build() {
  const out = await bundler.rebuild(); // incremental: fast after the first build, always current
  return out.outputFiles![0].contents;
}
await build();


http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(path.join(dir, 'index.html')));
    if (url.pathname === '/app.js') return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(await build());
    const proxy = url.pathname.startsWith('/partner/') ? { prefix: '/partner', to: PARTNER, name: 'The recovery partner' } : url.pathname.startsWith('/passport/') ? { prefix: '/passport', to: PASSPORT, name: 'The passport guardian' } : null;
    if (proxy) {
      let body = '';
      for await (const chunk of req) body += chunk;
      const up = await fetch(proxy.to + url.pathname.slice(proxy.prefix.length), { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? body : undefined }).catch(() => null);
      if (!up) return res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `${proxy.name} is offline` }));
      return res.writeHead(up.status, { 'content-type': 'application/json' }).end(await up.text());
    }
    res.writeHead(404).end('Not found');
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String((e as Error).message));
  }
}).listen(PORT, () => console.log(`[rescue] Rescue page on http://localhost:${PORT} (no Swissquote servers involved)`));
