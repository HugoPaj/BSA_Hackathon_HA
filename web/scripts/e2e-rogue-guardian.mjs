// A compromised Swissquote backend tries to register guardians of its own. The browser must refuse both before the
// passkey signs anything: a Guardian A Safe that is not the one of the published keys, and a passport enrolment key
// the passport guardian did not certify. Resets the demo wallet: run it against a local copy, never production.
// Usage: node scripts/e2e-rogue-guardian.mjs [baseUrl]
import puppeteer from 'puppeteer-core';
const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const ROGUE = '0x000000000000000000000000000000000000dEaD';
const t0 = Date.now(); const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });

/** One onboarding in a fresh browser context, with the server's answers rewritten as a compromised backend would. */
async function attempt(attack) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.evaluateOnNewDocument((attack, rogue) => {
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const res = await real(input, init);
      const url = typeof input === 'string' ? input : input.url;
      const swap = async (fn) => new Response(JSON.stringify(fn(await res.clone().json())), { status: res.status, headers: res.headers });
      if (attack === 'guardian-a' && url.includes('/api/config')) return swap((j) => ({ ...j, swissquoteGuardian: rogue }));
      if (attack === 'passport' && url.includes('/passport-guardian/scan')) return swap((j) => (j.enrollment ? { ...j, enrollment: { ...j.enrollment, address: rogue } } : j));
      return res;
    };
  }, attack, ROGUE);
  const clickText = async (text) => (await page.waitForSelector(`::-p-xpath(//*[self::button or self::a][contains(normalize-space(.), ${JSON.stringify(text)}) and not(@disabled)])`, { timeout: 60000 })).click();
  const waitText = (text) => page.waitForSelector(`::-p-xpath(//*[contains(normalize-space(.), ${JSON.stringify(text)})])`, { timeout: 60000 });

  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await (await page.waitForSelector('form button[type=submit]:not([disabled])')).click();
    await waitText('Buying power');
    await page.evaluate(() => fetch('/api/demo/reset', { method: 'POST', body: '{}' }));
    await page.goto(BASE + '/wallet/new', { waitUntil: 'networkidle2' });
    await clickText('Get started');
    await clickText('Create passkey');
    await waitText('Passkey created');
    await clickText('Continue');
    if (attack === 'passport') {
      await clickText('Passport or ID card');
      await clickText('Scan my passport');
      await clickText('Scan simulated passport');
      await waitText('not certified by the published passport guardian key');
    } else {
      await clickText('Passkey on another device');
      await clickText('Add recovery passkey');
      await waitText('added');
      await clickText('Continue');
      await clickText('Continue');
      await waitText('Wallet creation stopped');
      if (await page.$('::-p-xpath(//button[contains(., "Create wallet")])')) throw new Error('Create wallet is still offered');
    }
  } finally {
    await ctx.close();
  }
}

try {
  await attempt('guardian-a');
  log('rogue Guardian A refused before signing');
  await attempt('passport');
  log('uncertified passport enrolment key refused');
  log('ROGUE GUARDIAN E2E OK');
} catch (e) {
  log('FAILED', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
