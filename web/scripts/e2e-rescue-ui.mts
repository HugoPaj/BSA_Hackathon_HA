// Drives the rescue page in headless Chromium with a virtual WebAuthn authenticator: recovery card + partner
// recovery (including a refused identification), finish after the delay, then a fresh page finds the new passkey
// on its own and moves funds out. Setup goes through the Swissquote app; the browser only ever opens the rescue page.
// Usage: npx tsx scripts/e2e-rescue-ui.mts [baseUrl] [rescueUrl]   (npm run dev must be running)
import puppeteer from 'puppeteer-core';
import { fromSafeWebauthn, type UserOperationV7 } from 'abstractionkit';
import { BUNDLER_RPC, CHAIN_ID, NODE_RPC } from '../lib/config';
import { Safe, setupTransactions } from '../lib/chain';
import { createRecoveryCard } from '../lib/card';
import { parse, stringify } from '../lib/json';
import { createSoftPasskey } from './webauthn-sim.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const RESCUE = process.argv[3] ?? 'http://localhost:4200';
const SHOTS = process.env.SHOTS ?? '/tmp/shots';
const PIN = '246810';
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);

// ── Setup through the Swissquote app: wallet with a recovery card as Guardian B ──────────────────────────────
const jar: Record<string, string> = {};
async function sq<T>(path: string, data?: unknown): Promise<T> {
  const res = await fetch(BASE + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: data === undefined ? undefined : stringify(data) });
  for (const sc of res.headers.getSetCookie()) { const [k, v] = sc.split(';')[0].split('='); if (v) jar[k] = v; else delete jar[k]; }
  const out = parse<T & { error?: string }>(await res.text());
  if (!res.ok) throw new Error(out.error);
  return out;
}
await sq('/api/session', { clientId: '2162953', password: 'demo' });
await sq('/api/demo/reset', {});
const cfg = await sq<{ swissquoteGuardian: string }>('/api/config');
const owner = createSoftPasskey('localhost', BASE); // the passkey that gets "lost"
const card = await createRecoveryCard(PIN);
const { wallet } = await sq<{ wallet: { address: string } }>('/api/wallet', { owner: { ...owner.publicKey, credentialId: 'owner' }, guardianB: { type: 'card', address: card.address, label: 'Recovery card' }, bankAssisted: true });
const acc = Safe.initializeNewAccount([owner.publicKey]);
let op = await acc.createUserOperation(setupTransactions(wallet.address, cfg.swissquoteGuardian, { type: 'card', address: card.address }), NODE_RPC, BUNDLER_RPC, { expectedSigners: [owner.publicKey] });
op = (await sq<{ userOp: UserOperationV7 }>('/api/sponsor', { userOp: op })).userOp;
op.signature = await acc.signUserOperationWithSigners(op, [fromSafeWebauthn({ publicKey: owner.publicKey, isInit: true, getAssertion: owner.getAssertion, accountClass: Safe })], CHAIN_ID);
const { userOpHash } = await sq<{ userOpHash: string }>('/api/tx', { userOp: op, meta: { type: 'deploy', title: 'Wallet created', sponsored: true } });
for (;;) { const s = await sq<{ status: string }>('/api/tx?hash=' + userOpHash); if (s.status !== 'pending') break; await new Promise((r) => setTimeout(r, 2000)); }
const funded = await sq('/api/fund', { amount: 50_000n }).then(() => true, (e) => { log('  (no USDC funding:', e.message.slice(0, 60), ')'); return false; });
log('setup: wallet', wallet.address, funded ? 'funded with 0.05 USDC' : '');

// ── The rescue page only ─────────────────────────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--window-size=1100,1000'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1000 });
const hosts = new Set<string>();
page.on('request', (r) => hosts.add(new URL(r.url()).host));
page.on('pageerror', (e) => log('PAGE ERROR', (e as Error).message));
page.on('console', (m) => m.type() === 'error' && log('console.error', m.text().slice(0, 200)));
const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

let n = 0;
const shot = (name: string) => page.screenshot({ path: `${SHOTS}/rescue-${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true });
const waitText = (text: string, timeout = 120_000) => {
  const t = JSON.stringify(text);
  return page.waitForSelector(`::-p-xpath(//*[contains(normalize-space(.), ${t}) and not(*[contains(normalize-space(.), ${t})])])`, { timeout, visible: true });
};
const click = async (sel: string) => { await page.waitForSelector(`${sel}:not([disabled])`, { timeout: 300_000 }); await page.click(sel); };

try {
  await page.goto(`${RESCUE}/?wallet=${wallet.address}`, { waitUntil: 'networkidle2' });
  await waitText('your recovery factor');
  await shot('wallet');
  await click('[data-tab=recover]');
  await click('#newKey');
  await waitText('New passkey ready');
  await page.type('#cardCode', card.code);
  await page.type('#cardPin', PIN);
  await click('#factorCard');
  await waitText('Your recovery card signed');
  await shot('factor');
  await click('#identBad');
  await waitText('Video identification by the partner failed');
  log('✓ partner refused a failed identification');
  await click('#identOk');
  await waitText('Partner approved as Guardian A');
  await waitText('Recovery pending');
  await shot('pending');
  log('recovery submitted by the partner; waiting for the delay');
  await click('#finish');
  await waitText('Recovery finished', 120_000);
  await shot('finished');
  log('✓ recovery finished from the rescue page');

  // A fresh page knows nothing: it must find the owning passkey from a signature alone.
  await page.goto(`${RESCUE}/?wallet=${wallet.address}`, { waitUntil: 'networkidle2' });
  await waitText('your recovery factor');
  await page.type('#dest', '0x3C36F1ac17b9818b4e45bD4909b04bd3adEcfB3b');
  if (funded) {
    await click('#send');
    await waitText('Passkey identified');
    await waitText('Done:', 120_000);
    await shot('sent');
    log('✓ new passkey identified from its signature and moved the funds out');
  } else log('(skipped the transfer: no USDC to send)');
  const offenders = [...hosts].filter((h) => h.startsWith('localhost:3000') || h.includes(':4101'));
  if (offenders.length) throw new Error('rescue page contacted Swissquote: ' + offenders.join(', '));
  log('✓ hosts contacted:', [...hosts].join(', '));
} catch (e) {
  await shot('error');
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
