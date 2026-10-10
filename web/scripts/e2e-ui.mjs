// Drives the real UI in headless Chromium with a virtual WebAuthn authenticator (CDP).
// Usage: node scripts/e2e-ui.mjs [baseUrl] [--recover]
import puppeteer from 'puppeteer-core';
const BASE = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3000';
const RECOVER = process.argv.includes('--recover');
const SHOTS = process.env.SHOTS ?? '/tmp/shots';
const t0 = Date.now(); const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`, ...a);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--window-size=1280,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on('pageerror', (e) => log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && log('console.error', m.text().slice(0, 200)));
const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable');
const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true }); };
const clickText = async (text, timeout = 60000) => {
  const el = await page.waitForSelector(`::-p-xpath(//*[self::button or self::a][contains(normalize-space(.), ${JSON.stringify(text)}) and not(@disabled)])`, { timeout });
  await el.click();
};
const waitText = (text, timeout = 120000) => {
  const t = JSON.stringify(text);
  return page.waitForSelector(`::-p-xpath(//*[contains(normalize-space(.), ${t}) and not(*[contains(normalize-space(.), ${t})])])`, { timeout });
};

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  await shot('landing');
  await (await page.waitForSelector('form button[type=submit]:not([disabled])')).click();
  await waitText('Buying power');
  // fresh demo state
  await page.evaluate(() => fetch('/api/demo/reset', { method: 'POST', body: '{}' }));
  await page.goto(BASE + '/wallet/new', { waitUntil: 'networkidle2' });
  await shot('onboarding-intro');
  await clickText('Get started');
  await clickText('Create passkey');
  await waitText('Passkey created');
  await shot('onboarding-passkey');
  await clickText('Continue');
  await clickText('Passkey on another device'); // the DNI is the default factor now
  await waitText('Use another device');
  await shot('onboarding-recovery');
  await clickText('Add recovery passkey');
  await waitText('added');
  await clickText('Continue');
  await waitText('Bank-assisted recovery');
  await shot('onboarding-settings');
  await clickText('Continue');
  await page.waitForSelector('::-p-xpath(//button[contains(., "Create wallet") and not(@disabled)])', { timeout: 60000 });
  await shot('onboarding-create');
  log('creating wallet');
  await clickText('Create wallet');
  await waitText('Wallet deployed', 120000);
  log('deployed');
  await clickText('Continue');
  await clickText('Sign ownership proof');
  await waitText('Ownership verified and archived');
  await shot('onboarding-proof');
  await clickText('Open my wallet');
  await waitText('Self-custody wallet');
  await new Promise((r) => setTimeout(r, 1500));
  await shot('wallet-home');

  // Sanctioned recipient → declined
  await page.goto(BASE + '/wallet/send', { waitUntil: 'networkidle2' });
  await clickText('Unknown recipient');
  await page.type('#amt', '1');
  await clickText('Review');
  await waitText("won't sponsor", 60000).catch(() => waitText('won’t sponsor', 5000));
  await new Promise((r) => setTimeout(r, 500));
  await shot('send-sanctioned');
  log('sanctioned transfer declined');
  await page.keyboard.press('Escape');

  // dApp drainer → declined
  await page.goto(BASE + '/wallet/dapps', { waitUntil: 'networkidle2' });
  await clickText('Claim 500 tokens');
  await waitText("won't sponsor", 60000).catch(() => waitText('won’t sponsor', 5000));
  await new Promise((r) => setTimeout(r, 500));
  await shot('dapp-drainer');
  log('drainer declined');
  await page.keyboard.press('Escape');

  await page.goto(BASE + '/wallet/security', { waitUntil: 'networkidle2' });
  await waitText('Recovery guardians');
  await new Promise((r) => setTimeout(r, 1500));
  await shot('security');

  if (RECOVER) {
    await page.goto(BASE + '/recover', { waitUntil: 'networkidle2' });
    await clickText('Create new passkey');
    await clickText('Start recovery request');
    await waitText('Approve with your');
    await shot('recover-collect');
    await clickText('Approve with recovery device');
    await waitText('approved', 60000);
    await clickText('Start camera');
    await clickText('Face matches my ID', 30000);
    log('liveness ok, waiting for on-chain submission');
    await waitText('takes over in', 120000);
    await shot('recover-pending');
    // owner view during the delay
    await page.goto(BASE + '/wallet', { waitUntil: 'networkidle2' });
    await waitText('A recovery was requested');
    await shot('wallet-recovery-banner');
    await page.goto(BASE + '/recover', { waitUntil: 'networkidle2' });
    log('waiting for the 3-minute delay');
    await page.waitForSelector('::-p-xpath(//button[contains(., "Finish recovery") and not(@disabled)])', { timeout: 260000 });
    await clickText('Finish recovery');
    await waitText('Wallet recovered', 120000);
    await shot('recover-done');
    log('recovered');
    await page.goto(BASE + '/wallet/security', { waitUntil: 'networkidle2' });
    await clickText('Sign with old passkey');
    await page.waitForSelector('::-p-xpath(//button[contains(., "Sign with old passkey") and ancestor::*[@role="dialog"] and not(@disabled)])', { timeout: 60000 });
    await (await page.$('::-p-xpath(//button[contains(., "Sign with old passkey") and ancestor::*[@role="dialog"]])')).click();
    await waitText('Rejected on-chain', 60000);
    await shot('old-passkey-rejected');
    log('old passkey rejected on-chain');
  }
  log('UI E2E OK');
} catch (e) {
  log('FAILED', e.message);
  await shot('failure');
  process.exitCode = 1;
} finally {
  void authenticatorId;
  await browser.close();
}
