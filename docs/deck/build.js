// Builds the judges' pitch deck: docs/deck/swissquote-wallet-pitch.pptx
// Image-led: few words per slide, the detail lives in the speaker notes.
// Theme follows docs/design.md (Swissquote tokens on AlignUI surfaces).
// Run: NODE_PATH=~/.cache/deckbuild/node_modules node docs/deck/build.js
const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const React = require('react');
const RDS = require('react-dom/server');
const ri = require('react-icons/ri');
const sharp = require('sharp');
const { phoneImage, laptopImage, tilt } = require('./devices');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const OUT = path.join(__dirname, 'swissquote-wallet-pitch.pptx');
const SKILL_THEME = process.env.APPLY_THEME; // optional path to apply_theme.js

// ── Tokens (docs/design.md) ────────────────────────────────────────────────
const OR = 'FA5B35', OR7 = 'B24126', OR50 = 'FFEBEB';
const INK = '323232', INK2 = '475467', INK3 = '98A2B3';
const APP = 'F0F4FA', WEAK = 'F5F7FA', HAIR = 'E1E4EA';
const GREEN = '00875A', GREEN50 = 'E6F4EF', RED = 'E10F00', RED50 = 'FFEEEE', YELD = '9E6F23', YEL50 = 'FFFAF0', YEL200 = 'FDE39B';
const FONT = 'SwissquoteCT', MED = 'SwissquoteCT Medium';
const W = 13.333, MX = 0.6, CW = W - 2 * MX;
const Y0 = 2.35; // content top on content slides
const STAGE = 6.6; // left edge of the stage on split slides

const THEME = {
  name: 'Swissquote Wallet',
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: { dk1: INK, lt1: 'FFFFFF', dk2: INK2, lt2: APP, accent1: OR, accent2: GREEN, accent3: RED, accent4: 'E0A938', accent5: '3B82F6', accent6: OR7, hlink: OR7, folHlink: 'E45330' },
};

// ── Assets ────────────────────────────────────────────────────────────────
const brand = fs.readFileSync(path.join(ROOT, 'web/components/brand.tsx'), 'utf8');
const ICON_PATH = brand.match(/const ICON_PATH = '([^']+)'/)[1];
const WORDMARK_PATH = brand.match(/const WORDMARK_PATH = '([^']+)'/)[1];

const b64 = (buf) => 'image/png;base64,' + buf.toString('base64');
const svgPng = (svg, width) => sharp(Buffer.from(svg), { density: 300 }).resize({ width }).png().toBuffer();
const roundMask = (w, h, r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);

// Mark + wordmark, aligned as in web/components/brand.tsx.
async function logo(markFill, wordFill) {
  const s = 0.875, gap = 8.75, w = 35 + gap + 177 * s;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 35" width="${w * 10}" height="350">
    <path fill="#${markFill}" d="${ICON_PATH}"/>
    <g transform="translate(${35 + gap} 5.45) scale(${s})"><path fill="#${wordFill}" d="${WORDMARK_PATH}"/></g></svg>`;
  return { data: b64(await svgPng(svg, 1400)), ratio: w / 35 };
}
const iconCache = new Map();
async function icon(name, color = OR) {
  const key = name + color;
  if (!iconCache.has(key)) {
    const svg = RDS.renderToStaticMarkup(React.createElement(ri[name], { color: '#' + color, size: 256 }));
    iconCache.set(key, b64(await svgPng(svg, 256)));
  }
  return iconCache.get(key);
}

// ── Drawing helpers ───────────────────────────────────────────────────────
let pres;
function text(slide, t, o) {
  slide.addText(t, { isTextBox: true, margin: 0, fontFace: FONT, color: INK, fontSize: 18, valign: 'top', ...o });
}
function box(slide, x, y, w, h, o = {}) {
  const { fill = WEAK, line, r = 0.16, name } = o;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: r, fill: { color: fill },
    line: line ? { color: line, width: 0.75 } : { type: 'none' }, ...(name ? { objectName: name } : {}),
  });
}
async function chip(slide, x, y, iconName, o = {}) {
  const { s = 0.6, fill = OR50, color = OR, round = false } = o;
  if (round) slide.addShape(pres.shapes.OVAL, { x, y, w: s, h: s, fill: { color: fill }, line: { type: 'none' } });
  else box(slide, x, y, s, s, { fill, r: s * 0.22 });
  slide.addImage({ data: await icon(iconName, color), x: x + s * 0.22, y: y + s * 0.22, w: s * 0.56, h: s * 0.56 });
}
function num(slide, x, y, n, o = {}) {
  const { s = 0.42, fill = INK, color = 'FFFFFF' } = o;
  slide.addShape(pres.shapes.OVAL, { x, y, w: s, h: s, fill: { color: fill }, line: { type: 'none' } });
  text(slide, String(n), { x, y, w: s, h: s, align: 'center', valign: 'middle', fontFace: MED, fontSize: s * 30, color });
}
function pill(slide, x, y, label, o = {}) {
  const { fill = OR50, color = OR7, fontSize = 11, h = 0.32, w, cs = 1 } = o;
  const width = w ?? 0.36 + label.length * fontSize * 0.0082;
  box(slide, x, y, width, h, { fill, r: h / 2 });
  text(slide, label, { x, y, w: width, h, align: 'center', valign: 'middle', fontFace: MED, fontSize, color, charSpacing: cs });
  return width;
}
function arrow(slide, x1, y1, x2, y2, color = OR, width = 2) {
  slide.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1, line: { color, width, endArrowType: 'triangle' } });
}
// ── Device mockups (devices.js): full, uncropped screenshots inside a drawn iPhone or laptop ─
// A phone is placed by the centre and height of its body; `deg` tilts it, `win` picks a window of a tall capture.
async function phone(slide, file, { cx, cy, h, deg = 0, win }) {
  const img = await tilt(await phoneImage(file, { win }), deg);
  const k = h / img.bh;
  const w = img.cw * k, hh = img.ch * k;
  slide.addImage({ data: b64(img.buf), x: cx - w / 2, y: cy - hh / 2, w, h: hh, objectName: 'Phone: ' + file });
  return { w: img.bw * k, h };
}
const phoneW = (h) => h * 842 / 1844; // body width for a body height
async function laptop(slide, file, { cx, cy, w, deg = 0 }) {
  const img = await tilt(await laptopImage(file), deg);
  const k = w / img.bw;
  slide.addImage({ data: b64(img.buf), x: cx - img.cw * k / 2, y: cy - img.ch * k / 2, w: img.cw * k, h: img.ch * k, objectName: 'Laptop: ' + file });
  return { w, h: img.bh * k };
}
// A row of phones for the demo backups: equal size, each with a numbered label above it.
async function phoneRow(slide, items, { h = 4.3, top = Y0 } = {}) {
  const col = CW / items.length;
  for (const [i, it] of items.entries()) {
    const cx = MX + col * (i + 0.5), pw = phoneW(h);
    label(slide, cx - pw / 2, top, i + 1, it.cap, it.hi);
    await phone(slide, it.file, { cx, cy: top + 0.6 + h / 2, h, win: it.win });
  }
}
// Small label above a phone: number chip and a few words.
function label(slide, x, y, n, t, hi = false) {
  num(slide, x, y, n, { s: 0.36, fill: hi ? OR : INK });
  text(slide, t, { x: x + 0.48, y: y - 0.03, w: 3.2, h: 0.42, valign: 'middle', fontSize: 15, fontFace: MED, color: hi ? OR7 : INK });
}
// Icon rows for split slides: icon chip, a short line, an optional quieter second line.
async function points(slide, items, { x = MX, y, w = 5.3, gap = 0.32, icon = 0.7 }) {
  for (const it of items) {
    const [ic, h, b, kind] = it;
    if (kind) await status(slide, x, y, kind, icon);
    else await chip(slide, x, y, ic, { s: icon, round: true, fill: OR50 });
    const runs = [{ text: h, options: { fontFace: MED, fontSize: 20, breakLine: !!b } }];
    if (b) runs.push({ text: b, options: { fontSize: 16, color: INK2 } });
    text(slide, runs, { x: x + icon + 0.25, y: y + (b ? -0.02 : 0.12), w: w - icon - 0.25, h: 0.9 });
    y += (b ? 0.95 : 0.7) + gap;
  }
  return y;
}

// Status circle: check, cross or clock.
async function status(slide, x, y, kind, s = 0.5) {
  const map = { yes: ['RiCheckLine', GREEN, GREEN50], no: ['RiCloseLine', RED, RED50], wait: ['RiTimerLine', YELD, YEL50] };
  const [ic, c, f] = map[kind];
  await chip(slide, x, y, ic, { s, fill: f, color: c, round: true });
}

const ORDER = [];
function content(id, kicker, title, o = {}) {
  const s = pres.addSlide({ masterName: o.split ? 'SPLIT' : o.gallery ? 'GALLERY' : o.app ? 'APP' : 'CONTENT', sectionTitle: o.section });
  if (o.hidden) s.hidden = true;
  s.addText(kicker.toUpperCase(), { placeholder: 'kicker' });
  s.addText(title.toUpperCase(), { placeholder: 'title' });
  ORDER.push(id);
  return s;
}

// ── Deck ──────────────────────────────────────────────────────────────────
async function build() {
  pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'Swissquote Self-Custody Wallet · Hackathon pitch';
  pres.author = 'Swissquote Wallet Challenge team';
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

  const logoInk = await logo(OR, INK);
  const logoWhite = await logo('FFFFFF', 'FFFFFF');
  const LOGO_W = 1.55;
  const masterObjects = (titleW = 10.9, titleSize = 38, titleH = 1.3) => [
    { image: { x: W - MX - LOGO_W, y: 0.46, w: LOGO_W, h: LOGO_W / logoInk.ratio, data: logoInk.data } },
    { placeholder: { options: { name: 'kicker', type: 'body', x: MX, y: 0.5, w: Math.min(9.5, titleW), h: 0.28, fontSize: 12, color: OR7, fontFace: MED, charSpacing: 2, margin: 0, valign: 'top', align: 'left' }, text: '' } },
    { placeholder: { options: { name: 'title', type: 'title', x: MX, y: 0.86, w: titleW, h: titleH, fontSize: titleSize, bold: true, color: INK, fontFace: FONT, margin: 0, valign: 'top', align: 'left', lineSpacingMultiple: 0.9 }, text: '' } },
  ];
  const slideNumber = { x: W - MX - 0.6, y: 7.05, w: 0.6, h: 0.25, fontSize: 9, color: INK3, fontFace: FONT, align: 'right' };
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: 'FFFFFF' }, objects: masterObjects(), slideNumber });
  pres.defineSlideMaster({ title: 'APP', background: { color: APP }, objects: masterObjects(), slideNumber });
  // Split: words on the left, the app's own surface on the right as a stage for the devices.
  pres.defineSlideMaster({ title: 'SPLIT', background: { color: 'FFFFFF' }, objects: [
    { rect: { x: STAGE, y: 0, w: W - STAGE, h: 7.5, fill: { color: APP } } },
    ...masterObjects(STAGE - MX - 0.5, 34, 2.3),
  ], slideNumber });
  // Gallery: hidden demo backups, a row of phones that runs to the slide's foot, so no slide number.
  pres.defineSlideMaster({ title: 'GALLERY', background: { color: APP }, objects: masterObjects() });
  pres.defineSlideMaster({ title: 'HERO', background: { color: 'FFFFFF' }, objects: [] });

  // ═══ MAIN PITCH ═══════════════════════════════════════════════════════
  pres.addSection({ title: 'Pitch' });

  // 1 ── Title ──
  {
    const s = pres.addSlide({ masterName: 'HERO', sectionTitle: 'Pitch' });
    ORDER.push('title');
    s.addImage({ x: MX, y: 0.45, w: LOGO_W, h: LOGO_W / logoInk.ratio, data: logoInk.data });
    box(s, MX, 1.15, 9.0, 5.75, { fill: OR, r: 0.28, name: 'Hero block' });
    text(s, 'YOUR KEYS.\nYOUR CONTROL.', { x: 1.15, y: 1.85, w: 6.6, h: 2.1, fontSize: 52, bold: true, color: 'FFFFFF', lineSpacingMultiple: 0.86 });
    text(s, 'The wallet Swissquote can recover,\nbut never spend.', { x: 1.15, y: 4.25, w: 7.4, h: 0.9, fontSize: 24, fontFace: MED, color: 'FFFFFF', lineSpacingMultiple: 1.1 });
    box(s, 1.15, 5.65, 3.55, 0.6, { fill: 'FFFFFF', r: 0.09 });
    text(s, 'swissquote-two.vercel.app', { x: 1.15, y: 5.65, w: 3.55, h: 0.6, align: 'center', valign: 'middle', fontFace: MED, fontSize: 16, color: OR });
    // Two phones over the hero block's edge: the wallet in front, a sponsored transfer behind it.
    await phone(s, '05d-send-review-v2.png', { cx: 9.3, cy: 4.05, h: 5.7, deg: -8 });
    await phone(s, '04-wallet-home.png', { cx: 11.3, cy: 3.85, h: 6.6 });
    text(s, 'Swissquote Wallet Challenge · EPFL Hackathon, October 2026', { x: MX, y: 7.05, w: 7, h: 0.25, fontSize: 9, color: INK3 });
    s.addNotes('One-liner first, and repeat it at the end: a wallet Swissquote can recover, but never spend.\n\nToday a Swissquote client who wants self-custody withdraws to MetaMask or a Ledger and leaves. We built the third option: the client holds the only key that can spend, it sits one tap from their Swissquote account, and Swissquote can help recover it without ever being able to move the money. Everything you will see runs on Base Sepolia.');
  }

  // 2 ── Problem ──
  {
    const s = content('problem', 'The problem', 'Self-custody today means leaving Swissquote', { section: 'Pitch' });
    const cols = [
      { icon: 'RiBankLine', h: 'Custodial', b: 'Not your keys' },
      { icon: 'RiFileList3Line', h: 'External wallet', b: '24 words on paper.\nLose them, lose it all' },
      { icon: 'RiShieldCheckLine', h: 'Our wallet', b: 'Your keys, one tap\nfrom Swissquote', hi: true },
    ];
    const cw = CW / 3, d = 2.0;
    for (const [i, c] of cols.entries()) {
      const cx = MX + i * cw + (cw - d) / 2;
      await chip(s, cx, Y0 + 0.2, c.icon, { s: d, round: true, fill: c.hi ? OR : APP, color: c.hi ? 'FFFFFF' : INK2 });
      text(s, c.h, { x: MX + i * cw, y: Y0 + 2.5, w: cw, h: 0.5, align: 'center', fontSize: 26, fontFace: MED, color: c.hi ? OR : INK });
      text(s, c.b, { x: MX + i * cw, y: Y0 + 3.05, w: cw, h: 1.0, align: 'center', fontSize: 18, color: INK2 });
    }
    s.addNotes('Two bad options today. Custodial: Swissquote holds the keys, so it is not really a wallet and there is no on-chain use. External wallet: a seed phrase the typical client will lose, manual Travel Rule ownership checks for every withdrawal, and the assets and the relationship leave Swissquote. Our wallet is the third option: the client\'s keys, one tap from their Swissquote account.');
  }

  // 3 ── Live demo ──
  {
    const s = pres.addSlide({ masterName: 'HERO', sectionTitle: 'Pitch' });
    ORDER.push('demo');
    s.background = { color: OR };
    s.addImage({ x: MX, y: 0.45, w: LOGO_W, h: LOGO_W / logoWhite.ratio, data: logoWhite.data });
    text(s, 'LIVE DEMO', { x: MX, y: 1.5, w: CW, h: 1.5, fontSize: 96, bold: true, color: 'FFFFFF' });
    const steps = [['RiFingerprintLine', 'Create'], ['RiSendPlaneLine', 'Sign'], ['RiSmartphoneLine', 'Lose'], ['RiLifebuoyLine', 'Recover']];
    const sw = CW / 4, d = 1.05;
    for (const [i, [ic, l]] of steps.entries()) {
      const x = MX + i * sw;
      await chip(s, x, 3.75, ic, { s: d, round: true, fill: 'FFFFFF', color: OR });
      text(s, l, { x: x + d + 0.22, y: 3.75, w: sw - d - 0.25, h: d, valign: 'middle', fontSize: 28, fontFace: MED, color: 'FFFFFF' });
    }
    text(s, 'Real transactions on Base Sepolia. Backup screens follow if the network misbehaves.', { x: MX, y: 6.4, w: CW, h: 0.4, fontSize: 16, fontFace: MED, color: 'FFFFFF' });
    s.addNotes('Demo order (about 2 minutes); say the security points as they happen:\n1. Create: log in, the device creates the passkey, pick the backup method for Guardian B (ID card, recovery passphrase, or a passkey on another device or held by someone you trust; we show the ID card), one sponsored transaction deploys the wallet with recovery on.\n2. Sign: pay Bob, approved with the passkey, show "Sponsored by Swissquote" and the BaseScan link. Then the OFAC address: Swissquote declines to sponsor but offers "Send anyway".\n3. Attack: second browser, a thief with phone and e-mail starts a recovery, has no backup method, fails the face check. The owner gets the alert.\n4. Lose and recover: new device, new passkey, the backup method approves (here the ID card), face check passes, 3-minute delay (3 days in production), old passkey rejected on-chain.\nIf anything breaks, unhide and click through the backup slides that follow.');
  }

  // Hidden backup slides: one per demo step, shown only if the live demo fails.
  {
    const s = content('b-create', 'Demo backup · create', 'One tap. Recovery built in', { section: 'Pitch', hidden: true, gallery: true });
    await phoneRow(s, [
      { file: '02-onboarding.png', cap: 'Open from e-banking' },
      { file: '03d-backup-method-v2.png', cap: 'Choose a backup method' },
      { file: '14b-ownership-proof-v2.png', cap: 'Ownership proven', hi: true },
    ]);
    s.addNotes('Opened inside the e-banking session, so it is linked to the KYC file. The passkey is created in the device\'s secure enclave. One sponsored transaction deploys the Safe, makes the passkey owner, enables recovery and registers both guardians: no money can arrive before recovery exists. The passkey then signs an ownership proof that Swissquote checks on-chain (EIP-1271) and archives.');
  }
  {
    const s = content('b-sign', 'Demo backup · sign', 'Your passkey approves. Swissquote pays the gas', { section: 'Pitch', hidden: true, gallery: true });
    await phoneRow(s, [
      { file: '05e-send-review-checks-v2.png', cap: 'Checked, gas sponsored' },
      { file: '05c-send-done.png', cap: 'Approved with your passkey' },
      { file: '07e-declined-v2.png', cap: 'Sanctioned: declined', hi: true },
    ]);
    s.addNotes('Every payment is approved by the passkey alone, and the Safe verifies the passkey signature on-chain (including WebAuthn user verification). The backup method is never used for payments. Before the passkey signs, Swissquote runs its sponsorship checks (allowlist, sanctions screen, simulation, fee) and pays the gas; the 0.05 USDC fee rides in the same transaction. To a sanctioned address it declines to sponsor, with the reason, and the client can still send and pay gas in ETH.');
  }
  {
    const s = content('b-attack', 'Demo backup · attack', 'The thief gets nothing', { section: 'Pitch', hidden: true, gallery: true });
    await phoneRow(s, [
      { file: '08-attacker-blocked.png', cap: 'No backup method' },
      { file: '08e-recovery-refused.png', cap: 'Face check fails' },
      { file: '08b-alert-inbox.png', cap: 'Owner alerted', hi: true },
    ]);
    s.addNotes('A thief with the phone and the e-mail: cannot sign (the passkey needs user verification, checked on-chain), has no Guardian B (the ID card, passphrase or other passkey is not on the phone), and fails the live face match against the KYC photo, so Swissquote\'s guardian never signs. Even a hacked Swissquote backend cannot fake the face match: the verdict is signed by a separate vendor, bound to this exact request, fresh and single-use. The owner is alerted by push, e-mail and inbox.');
  }
  {
    const s = content('b-recover', 'Demo backup · recover', 'Recover on a new phone', { section: 'Pitch', hidden: true, gallery: true });
    await phoneRow(s, [
      { file: '09b-recover-4-guardian-b.png', cap: 'Backup approves' },
      { file: '09b-recover-5-face-check.png', cap: 'Face check' },
      { file: '09b-recover-6-pending.png', cap: '3-day wait' },
      { file: '09b-recover-7-done.png', cap: 'Recovered', hi: true },
    ]);
    s.addNotes('On a new device: create a new passkey, approve with the backup method (Guardian B; here the ID card, or the passphrase, or the other passkey), pass the face check so Swissquote\'s guardian signs (Guardian A). Then the delay: 3 minutes in the demo, 3 days in production, with alerts on every channel. After it, the new passkey owns the same wallet, same address, same balance.');
  }
  {
    const s = content('b-cancel', 'Demo backup · safety net', 'You can stop it. The old key is dead', { section: 'Pitch', hidden: true, gallery: true });
    await phoneRow(s, [
      { file: '09-recovery-pending.png', cap: 'Cancel with one tap' },
      { file: '10-old-passkey-rejected.png', cap: 'Old passkey rejected', hi: true },
    ]);
    s.addNotes('While a recovery is pending, any device that still holds the passkey shows "This wasn\'t me, cancel recovery". After recovery the old passkey is no longer an owner: the chain rejects it with AA24.');
  }

  // 4 ── How it works ──
  {
    const s = content('how', 'How it works', 'Only your passkey can spend', { section: 'Pitch' });
    const cy = Y0 + 0.35;
    await chip(s, MX + 0.3, cy + 0.35, 'RiFingerprintLine', { s: 1.7, round: true, fill: OR, color: 'FFFFFF' });
    text(s, 'Your passkey', { x: MX - 0.2, y: cy + 2.2, w: 2.7, h: 0.4, align: 'center', fontSize: 18, fontFace: MED });
    text(s, 'Approves every payment', { x: MX - 0.2, y: cy + 2.6, w: 2.7, h: 0.35, align: 'center', fontSize: 15, color: INK2 });
    const wx = 4.55, ww = 3.7;
    box(s, wx, cy + 0.1, ww, 2.2, { fill: 'FFFFFF', line: HAIR, r: 0.2, name: 'Wallet' });
    await chip(s, wx + (ww - 0.8) / 2, cy + 0.35, 'RiSafe2Line', { s: 0.8 });
    text(s, 'Your wallet', { x: wx, y: cy + 1.25, w: ww, h: 0.45, align: 'center', fontSize: 22, fontFace: MED });
    text(s, 'Safe smart account · USDC', { x: wx, y: cy + 1.7, w: ww, h: 0.35, align: 'center', fontSize: 14, color: INK2 });
    arrow(s, MX + 2.15, cy + 1.2, wx - 0.08, cy + 1.2, GREEN, 3);
    text(s, 'spends', { x: MX + 2.1, y: cy + 0.75, w: 1.8, h: 0.35, align: 'center', fontSize: 16, fontFace: MED, color: GREEN });
    const gx = 10.35;
    const gs = [['RiBankLine', 'Swissquote or partner', cy - 0.15], ['RiShieldKeyholeLine', 'Your backup method', cy + 1.75]];
    for (const [ic, l, y] of gs) {
      await chip(s, gx, y, ic, { s: 1.1, round: true, fill: APP, color: INK });
      text(s, l, { x: gx + 1.25, y, w: W - MX - gx - 1.25, h: 1.1, valign: 'middle', fontSize: 16, fontFace: MED });
      arrow(s, gx - 0.08, y + 0.55, wx + ww + 0.08, cy + 1.2, OR, 2.25);
    }
    text(s, 'recover together,\nafter 3 days', { x: wx + ww + 0.12, y: cy - 0.1, w: 2.0, h: 0.6, align: 'left', fontSize: 15, fontFace: MED, color: OR7 });
    const py = 6.15;
    await status(s, MX, py - 0.04, 'yes', 0.48);
    text(s, 'Swissquote can help you recover', { x: MX + 0.62, y: py, w: 4.6, h: 0.42, valign: 'middle', fontSize: 18, fontFace: MED });
    await status(s, 6.6, py - 0.04, 'no', 0.48);
    text(s, 'Swissquote can never spend', { x: 7.22, y: py, w: 4.6, h: 0.42, valign: 'middle', fontSize: 18, fontFace: MED });
    s.addNotes('A WebAuthn passkey owns a Safe smart account (ERC-4337). The Safe checks the P-256 signature on-chain for every transaction. Recovery uses Candide\'s audited Social Recovery Module: it needs both guardians, Guardian A (Swissquote, or an independent partner, as one 1-of-2 Safe) and Guardian B (the client\'s own backup method, their choice of three: ID card, recovery passphrase, or a passkey on another device or held by someone they trust), then a 3-day delay the owner can cancel. Guardians can only replace the owner key; they can never spend. No homemade crypto: Safe, Candide, WebAuthn, viem.');
  }

  // 5 ── Custody matrix ──
  {
    const s = content('who', 'Custody model', 'Nobody else can move the funds', { section: 'Pitch' });
    const rows = [
      ['RiFingerprintLine', 'You', 'yes', 'yes'],
      ['RiBankLine', 'Swissquote', 'no', 'no'],
      ['RiTeamLine', 'Swissquote + partner', 'no', 'no'],
      ['RiShieldKeyholeLine', 'Swissquote + your backup method', 'no', 'wait'],
      ['RiServerLine', 'Swissquote hacked', 'no', 'no'],
      ['RiSpyLine', 'Thief with phone + e-mail', 'no', 'no'],
    ];
    const x0 = 2.2, labelW = 5.4, colW = 1.9, rh = 0.66, top = Y0 + 0.45, cx = x0 + labelW + 0.85;
    text(s, 'SPEND', { x: cx, y: Y0 - 0.05, w: colW, h: 0.35, align: 'center', fontSize: 13, fontFace: MED, color: INK2, charSpacing: 2 });
    text(s, 'TAKE OVER', { x: cx + colW, y: Y0 - 0.05, w: colW, h: 0.35, align: 'center', fontSize: 13, fontFace: MED, color: INK2, charSpacing: 2 });
    for (const [i, [ic, l, a, b]] of rows.entries()) {
      const y = top + i * rh;
      if (i === 0) box(s, x0 - 0.2, y - 0.08, labelW + 0.85 + 2 * colW + 0.4, rh - 0.04, { fill: GREEN50, r: 0.14 });
      await chip(s, x0, y, ic, { s: 0.5, fill: i === 0 ? 'FFFFFF' : OR50 });
      text(s, l, { x: x0 + 0.7, y, w: labelW, h: 0.5, valign: 'middle', fontSize: 20, fontFace: MED });
      await status(s, cx + (colW - 0.5) / 2, y, a);
      await status(s, cx + colW + (colW - 0.5) / 2, y, b);
    }
    text(s, 'Clock: only after a 3-day delay that you can cancel', { x: x0, y: top + 6 * rh + 0.1, w: 9, h: 0.35, fontSize: 14, color: INK2 });
    s.addNotes('The brief asks: could Swissquote, alone or with a partner, move the funds without the client? No. Only the passkey can spend. Replacing the owner always needs the client\'s own factor plus a delay the owner can cancel. Swissquote and the partner are the two owners of one 1-of-2 Safe that fills the Guardian A slot, so together they are still one vote of the two required. A hacked Swissquote backend holds no guardian key at all: the guardians run as separate processes with their own storage (a separate Vercel project and database in production).\n\nResidual risks, said openly: a thief who knows the phone PIN is the owner (production answer: an opt-in on-chain delay for large transfers that the guardians can cancel), and a client who loses both passkey and backup method is locked out, which is the price of Swissquote never being able to recover alone.');
  }

  // 5b ── Design decisions ──
  {
    const s = content('decisions', 'Design decisions', 'Why we built it this way', { section: 'Pitch' });
    const tiles = [
      ['RiSafe2Line', 'Passkey wallet', 'not MPC with a bank share', 'A bank key share would make it custody'],
      ['RiShieldUserLine', 'Swissquote as guardian', 'not as co-signer', 'It can help recover, never spend'],
      ['RiTimerLine', 'Two approvals, then a delay', 'not instant recovery', 'No one party alone; insiders get caught'],
      ['RiProhibitedLine', 'Decline gas, never block', 'not a transaction filter', 'Blocking would be power of disposal'],
      ['RiShieldKeyholeLine', 'Your choice of backup', 'not a seed phrase', 'ID card, passphrase or another passkey'],
      ['RiTeamLine', 'Partner beside Swissquote', 'not Swissquote alone', 'Recovery survives Swissquote disappearing'],
    ];
    const cols = 3, gap = 0.3, tw = (CW - (cols - 1) * gap) / cols, th = 2.3;
    for (const [i, [ic, h, alt, why]] of tiles.entries()) {
      const x = MX + (i % cols) * (tw + gap), y = Y0 - 0.1 + Math.floor(i / cols) * (th + 0.25);
      box(s, x, y, tw, th, { name: h });
      await chip(s, x + 0.3, y + 0.3, ic, { s: 0.62 });
      text(s, h, { x: x + 0.3, y: y + 1.05, w: tw - 0.6, h: 0.4, fontSize: 19, fontFace: MED });
      text(s, alt, { x: x + 0.3, y: y + 1.42, w: tw - 0.6, h: 0.3, fontSize: 13, color: INK3 });
      text(s, why, { x: x + 0.3, y: y + 1.68, w: tw - 0.6, h: 0.55, fontSize: 15, color: INK2 });
    }
    s.addNotes('The brief asks for the design decisions and why. Six calls, each against the obvious alternative.\n1. A passkey-owned Safe instead of MPC with a Swissquote key share: a bank share in every signature is power of disposal, so it would be custody.\n2. Swissquote is a recovery guardian, never a co-signer: guardians can only replace the owner key, never move funds.\n3. Recovery needs two approvals, Swissquote (after a live face check) and the client\'s own backup method, then a delay (3 days in production) that any device with the passkey can cancel: no single party can take over, and an insider attack is visible and stoppable.\n4. Swissquote declines to pay gas for risky transactions but never blocks them: the client can send and pay gas in ETH. Blocking would give Swissquote power of disposal.\n5. The client picks the backup method: ID card, recovery passphrase, or a passkey on another device or held by someone they trust. No seed phrase that loses everything if found or lost.\n6. Guardian A is a 1-of-2 Safe of Swissquote and an independent partner: if Swissquote disappears, the partner can still approve a recovery; together they are still one vote.\nThe appendix has the technical calls (Base, Candide, signed face checks, web app).');
  }

  // 6 ── Swissquote gone ──
  {
    const s = content('gone', 'Exit path', 'If Swissquote disappears, the money doesn\'t', { section: 'Pitch', split: true });
    await points(s, [['RiKey2Line', 'Still have your passkey?', 'Send it out yourself'], ['RiLifebuoyLine', 'Lost it too?', 'Your backup method + the partner'], ['RiServerLine', 'No Swissquote server', 'Public RPC and bundler']], { y: 2.75 });
    // The partner's rescue page: desktop behind, the same page on a phone in front.
    await laptop(s, '12-rescue-desktop.png', { cx: 9.65, cy: 3.35, w: 6.1 });
    await phone(s, '12e-rescue-mobile-send.png', { cx: 11.55, cy: 4.75, h: 4.4 });
    s.addNotes('The brief asks how the client gets funds back if Swissquote is permanently gone. With the passkey: the rescue page is a static page the partner hosts (anyone can), it uses a public RPC and a public bundler, the client pays gas in ETH, no Swissquote approval or fee. Without it: new passkey + the client\'s backup method (other passkey or passphrase) + the partner\'s video identification; the partner signs as Guardian A, the delay runs, then finish. Our rescue tests check that the page never contacts a Swissquote server. Gap: the rescue page does not yet support the ID card as Guardian B.');
  }

  // 7 ── Gasless + compliance (bonus) ──
  {
    const s = content('bonus', 'Bonus · gasless and compliant dApps', 'Swissquote pays gas. It declines, never blocks', { section: 'Pitch', split: true });
    text(s, '0 ETH', { x: MX, y: 2.6, w: 5, h: 1.0, fontSize: 64, bold: true, color: OR });
    text(s, 'needed. Swissquote pays the gas,\n0.05 USDC fee in the same transaction.', { x: MX, y: 3.6, w: 5.4, h: 0.8, fontSize: 17, color: INK2 });
    await points(s, [['', 'Sanctioned or drainer?', 'Swissquote declines to pay', 'no'], ['RiSendPlaneLine', 'Never blocked', 'Send anyway, pay your own gas']], { y: 4.75, gap: 0.25 });
    await phone(s, '05e-send-review-checks-v2.png', { cx: 8.75, cy: 4.05, h: 5.5, deg: -6 });
    await phone(s, '07e-declined-v2.png', { cx: 11.15, cy: 4.0, h: 6.1 });
    s.addNotes('Gasless: Candide\'s paymaster pays the ETH gas on Swissquote\'s behalf; Swissquote recovers it through a 0.05 USDC fee batched into the same transaction, visible on BaseScan. Security actions are free.\n\nAbuse prevention: Swissquote only sponsors operations that pass its policy (allowlisted contracts, sanctions screen on every counterparty, simulation from the wallet\'s own address, fee included); the client checks the returned call data is unchanged before the passkey signs; paymaster calls are blocked at our bundler proxy, and production uses a private paymaster key, sponsorship policy and rate limits.\n\nCompliance: a real OFAC-listed address (Lazarus) and a drainer dApp asking for unlimited approval are both declined, with a plain-language reason. Why decline instead of block? If Swissquote could stop a transaction it would have power of disposal, and the wallet would become custody.');
  }

  // 8 ── Legal ──
  {
    const s = content('legal', 'Legal feasibility', 'Software, not custody', { section: 'Pitch', split: true });
    await points(s, [['', 'Swissquote can\'t sign', '', 'no'], ['', 'Can\'t recover alone', 'Not even with the partner', 'no'], ['', 'Can\'t block a payment', '', 'no'], ['RiFileShieldLine', 'Travel Rule', 'Ownership proven automatically']], { y: 2.6, gap: 0.22, icon: 0.62 });
    text(s, 'Simplified reasoning, not legal advice.', { x: MX, y: 6.85, w: 5, h: 0.3, fontSize: 10, color: INK3 });
    await phone(s, '14b-ownership-proof-v2.png', { cx: 8.75, cy: 4.05, h: 5.5, deg: -6 });
    // Wallet home scrolled to its Protection card, with the tab bar kept at the foot.
    await phone(s, '04b-wallet-home-tall.png', { cx: 11.15, cy: 4.0, h: 6.1, win: [[1530, 3090], [3272, 3400]] });
    s.addNotes('Custody: FINMA\'s test is power of disposal. Swissquote cannot sign, cannot replace the owner alone, cannot recover without the client\'s factor, and cannot block a transaction (it only declines to pay gas). Swissquote + partner is shared control only if together they could act; here they are one guardian vote, the client\'s factor is always the other. So the assets never enter Swissquote\'s possession: no custody capital, and the custodian segregation rules (Art. 242a DEBA) are not triggered. Client terms must not give Swissquote a right to start or arbitrarily refuse a recovery; clients can switch bank-assisted recovery off.\n\nTravel Rule (FINMA Guidance 02/2019): the wallet is created inside the KYC session and its passkey signs an ownership proof, verified on-chain with EIP-1271 and archived, re-attested after each recovery. Transfers between the Swissquote account and the wallet need no screenshots or test transfers. Is Swissquote the sending institution when the client pays a third party? No: the client signs and the Safe sends; Swissquote neither holds nor transmits the asset, paying gas is a technical service. Needs confirmation by Swiss counsel and FINMA.');
  }

  // 9 ── Business ──
  {
    const s = content('business', 'Business case', 'Keep the assets. Earn on activity', { section: 'Pitch', app: true });
    const items = [['RiArrowGoBackLine', 'Retention', 'Withdrawals stay next to trading'], ['RiCoinsLine', 'Fees', '0.05 USDC per transfer'], ['RiLineChartLine', 'Trading', 'One tap back to SQX'], ['RiScales3Line', 'Lower cost', 'No manual wallet checks']];
    for (const [i, [ic, h, b]] of items.entries()) {
      const y = Y0 + i * 1.05;
      await chip(s, MX, y, ic, { s: 0.8, round: true, fill: 'FFFFFF' });
      text(s, [{ text: h, options: { fontFace: MED, fontSize: 20, breakLine: true } }, { text: b, options: { fontSize: 15, color: INK2 } }], { x: MX + 1.0, y: y + 0.02, w: 3.6, h: 0.85 });
    }
    // E-banking on the laptop, the wallet next to the trading account; the same wallet on the phone.
    await laptop(s, '13b-home-desktop.png', { cx: 8.55, cy: 4.35, w: 7.0 });
    await phone(s, '04-wallet-home.png', { cx: 11.85, cy: 5.0, h: 4.2 });
    s.addNotes('The biggest lever is retention: every external crypto withdrawal today is assets under management lost. Here "withdraw" becomes "move to my wallet", shown next to the trading account, one tap from trading and one tap back. Revenue: the sponsored-transfer fee (Base gas is a fraction of it), swaps and trades routed back through Swissquote, and bank-assisted recovery in premium packages. Lower cost: automatic ownership proofs replace manual wallet verification, no custody capital or safekeeping for self-custodied assets, fewer withdrawal tickets. New clients: crypto users who want DeFi but fear losing a seed phrase. Pilot metrics: share of withdrawals redirected into the wallet, value flowing back to trading, sponsored transfers per wallet times (fee minus gas), verification cases avoided.');
  }

  // 10 ── Close ──
  {
    const s = pres.addSlide({ masterName: 'HERO', sectionTitle: 'Pitch' });
    ORDER.push('close');
    s.background = { color: OR };
    s.addImage({ x: MX, y: 0.45, w: LOGO_W, h: LOGO_W / logoWhite.ratio, data: logoWhite.data });
    text(s, 'THE WALLET\nSWISSQUOTE\nCAN RECOVER,\nBUT NEVER SPEND.', { x: MX + 0.05, y: 1.35, w: 7.6, h: 3.9, fontSize: 54, bold: true, color: 'FFFFFF', lineSpacingMultiple: 0.86 });
    box(s, MX + 0.05, 5.75, 3.55, 0.6, { fill: 'FFFFFF', r: 0.09 });
    text(s, 'swissquote-two.vercel.app', { x: MX + 0.05, y: 5.75, w: 3.55, h: 0.6, align: 'center', valign: 'middle', fontFace: MED, fontSize: 16, color: OR });
    text(s, 'Questions welcome', { x: MX + 3.85, y: 5.75, w: 3, h: 0.6, valign: 'middle', fontFace: MED, fontSize: 16, color: 'FFFFFF' });
    const hero = await sharp(path.join(ROOT, 'web/public/landing/hero.webp')).resize(900, 1200, { fit: 'cover', position: 'top' }).png().toBuffer();
    const framed = await sharp(hero).ensureAlpha().composite([{ input: roundMask(900, 1200, 60), blend: 'dest-in' }]).png().toBuffer();
    s.addImage({ data: b64(framed), x: 8.35, y: 0.75, w: 4.4, h: 5.87 });
    s.addNotes('Repeat the one-liner. Then invite questions; the appendix after this slide has the architecture, threat model, model comparison, recovery rules, Guardian B options, Travel Rule, design decisions, real vs mocked, AI tools and limits.');
  }

  // ═══ APPENDIX (Q&A) ═══════════════════════════════════════════════════
  pres.addSection({ title: 'Appendix' });
  const A = 'Appendix';

  // A1 ── Architecture ──
  {
    const s = content('a-arch', 'Appendix · architecture', 'What talks to what', { section: A });
    const cols = [
      { x: MX, w: 2.35, h: 'Your devices', tag: 'REAL', items: [['RiFingerprintLine', 'Passkey'], ['RiComputerLine', 'Wallet web app'], ['RiIdCardLine', 'ID card app']] },
      { x: 3.2, w: 2.35, h: 'Swissquote app', tag: 'MOCK', items: [['RiBankLine', 'E-banking login'], ['RiFilter3Line', 'Gas policy'], ['RiFileShield2Line', 'Proofs, alerts']] },
      { x: 5.8, w: 2.35, h: 'Own servers', tag: 'MOCK', items: [['RiShieldUserLine', 'Swissquote guardian'], ['RiUserStarLine', 'Partner guardian'], ['RiEyeLine', 'Face check vendor']] },
      { x: 8.4, w: 1.85, h: 'Infra', tag: 'REAL', items: [['RiStackLine', 'Bundler'], ['RiGasStationLine', 'Paymaster']] },
      { x: 10.5, w: W - MX - 10.5, h: 'Base Sepolia', tag: 'REAL', items: [['RiSafe2Line', 'Your Safe'], ['RiLifebuoyLine', 'Recovery module'], ['RiTeamLine', 'Guardian Safe'], ['RiCoinsLine', 'USDC']] },
    ];
    const top = Y0 - 0.1, zh = 4.4;
    for (const c of cols) {
      const mock = c.tag === 'MOCK';
      box(s, c.x, top, c.w, zh, { fill: mock ? YEL50 : APP, r: 0.18, name: c.h });
      text(s, c.h, { x: c.x + 0.18, y: top + 0.18, w: c.w - 0.3, h: 0.35, fontSize: 15, fontFace: MED });
      pill(s, c.x + 0.18, top + 0.58, c.tag, { fill: mock ? YEL200 : GREEN50, color: mock ? YELD : GREEN, fontSize: 9, h: 0.26, w: 0.66 });
      const n = c.items.length, iy = top + 1.05, gap = 0.12, ih = (zh - 1.05 - 0.18 - gap * (n - 1)) / n;
      for (const [j, [ic, l]] of c.items.entries()) {
        const y = iy + j * (ih + gap);
        box(s, c.x + 0.14, y, c.w - 0.28, ih, { fill: 'FFFFFF', line: HAIR, r: 0.12 });
        await chip(s, c.x + 0.26, y + (ih - 0.42) / 2, ic, { s: 0.42 });
        text(s, l, { x: c.x + 0.8, y, w: c.w - 0.95, h: ih, valign: 'middle', fontSize: 12.5, fontFace: MED });
      }
    }
    for (const [a, b] of [[2.95, 3.2], [5.55, 5.8], [8.15, 8.4], [10.25, 10.5]]) arrow(s, a + 0.02, top + 2.4, b - 0.02, top + 2.4, OR, 1.75);
    text(s, 'Guardians and the face-check vendor run as separate processes with their own storage. The web app holds no guardian key.', { x: MX, y: 6.6, w: CW, h: 0.35, fontSize: 13, color: INK2 });
    s.addNotes('Green zones are real; yellow zones are mocked and labelled MOCK in the UI. The passkey signs a UserOperation; Swissquote\'s policy decides only whether to pay gas; the bundler lands it; the Safe verifies the passkey on-chain. For recovery the backend only relays evidence: each guardian process re-checks the chain and the vendor-signed face-match verdict itself before signing. In production the guardians and the vendor run as a separate Vercel project with their own Neon database; the web app never receives that database URL. Real: WebAuthn P-256, Safe v1.4.1, Safe4337Module v0.3.0, EntryPoint v0.7, Candide Social Recovery Module, Guardian A as a 1-of-2 Safe via EIP-1271, RsaGuardian, Candide bundler and paymaster, USDC. Mocked: e-banking login, face analysis, HSMs (software keys in separate processes), sanctions list (one real OFAC address), partner video ID, fiat funding (treasury Safe with test USDC), push and e-mail delivery.');
  }

  // A2 ── Threat model ──
  {
    const s = content('a-threats', 'Appendix · threat model', 'Who could steal, who could lock you out', { section: A });
    const tiles = [
      ['RiSmartphoneLine', 'Stolen phone', 'no', 'Passkey needs unlock'],
      ['RiMailLine', 'Phone + e-mail', 'no', 'Face check + factor'],
      ['RiServerLine', 'Swissquote hacked', 'no', 'Holds no spending key'],
      ['RiTeamLine', 'Swissquote + partner', 'no', 'Only one guardian vote'],
      ['RiIdCardLine', 'Insider + stolen ID', 'wait', 'Stopped if you cancel'],
      ['RiCloudOffLine', 'Swissquote gone', 'yes', 'Rescue page + partner'],
      ['RiLockPasswordLine', 'Phone + its PIN', 'wait', 'Residual: owner-level access'],
      ['RiQuestionLine', 'You lose everything', 'wait', 'Locked out, by design'],
    ];
    const cols = 4, gap = 0.3, tw = (CW - (cols - 1) * gap) / cols, th = 2.0;
    for (const [i, [ic, h, st, b]] of tiles.entries()) {
      const x = MX + (i % cols) * (tw + gap), y = Y0 + Math.floor(i / cols) * (th + 0.3);
      box(s, x, y, tw, th, { name: h });
      await chip(s, x + 0.25, y + 0.25, ic, { s: 0.55 });
      await status(s, x + tw - 0.75, y + 0.27, st, 0.5);
      text(s, h, { x: x + 0.25, y: y + 0.95, w: tw - 0.5, h: 0.4, fontSize: 17, fontFace: MED });
      text(s, b, { x: x + 0.25, y: y + 1.35, w: tw - 0.5, h: 0.5, fontSize: 14, color: INK2 });
    }
    s.addNotes('Stolen locked phone: blocked, every payment needs the passkey, which needs the device unlock; user verification is checked on-chain. Phone + e-mail (SIM swap): blocked, Swissquote approves only after a live face match against the KYC photo, and Guardian B is not on the phone. Swissquote insider or hacked backend: blocked, no spending key, no guardian key in the backend, vendor-signed face verdicts. Swissquote + partner colluding: blocked, one guardian slot. Insider + stolen backup method: only if the client ignores the 3-day alerts. Swissquote gone: client unaffected. Phone + device PIN: residual, the attacker is the owner; the answer is an opt-in on-chain delay for large transfers in production. Client loses passkey and factor: locked out, the price of Swissquote never recovering alone. Also residual: synced passkeys put the Apple or Google account in the trust base.');
  }

  // A3 ── Why this model ──
  {
    const s = content('a-models', 'Appendix · custody model', 'Why not seed phrase, MPC or Shamir', { section: A });
    const tiles = [
      ['RiFileList3Line', 'Seed phrase', 'no', 'Lose the paper, lose the funds'],
      ['RiKey2Line', 'MPC, bank share', 'no', 'Bank co-signs everything: custody'],
      ['RiPuzzleLine', 'Shamir split', 'no', 'Key rebuilt in one place'],
      ['RiSafe2Line', 'Passkey Safe', 'yes', 'Key replaced, never rebuilt'],
    ];
    const tw = (CW - 3 * 0.3) / 4, th = 2.5;
    for (const [i, [ic, h, st, b]] of tiles.entries()) {
      const x = MX + i * (tw + 0.3), hi = i === 3;
      box(s, x, Y0, tw, th, { fill: hi ? OR50 : WEAK, name: h });
      await chip(s, x + 0.3, Y0 + 0.3, ic, { s: 0.7, fill: hi ? 'FFFFFF' : OR50 });
      await status(s, x + tw - 0.85, Y0 + 0.35, st, 0.55);
      text(s, h, { x: x + 0.3, y: Y0 + 1.2, w: tw - 0.6, h: 0.45, fontSize: 18, fontFace: MED });
      text(s, b, { x: x + 0.3, y: Y0 + 1.68, w: tw - 0.6, h: 0.7, fontSize: 15, color: INK2 });
    }
    box(s, MX, Y0 + 2.85, CW, 1.4, { fill: APP, name: 'Bitcoin' });
    await chip(s, MX + 0.3, Y0 + 3.2, 'RiBitCoinLine', { s: 0.7, fill: 'FFFFFF' });
    text(s, [{ text: 'EVM-only? What about Bitcoin?  ', options: { fontFace: MED } }, { text: 'Wrapped BTC sits in the same Safe today. Native BTC next: a Taproot vault, your key spends, guardians only after a timelock.', options: { color: INK2 } }], { x: MX + 1.25, y: Y0 + 2.85, w: CW - 1.55, h: 1.4, valign: 'middle', fontSize: 16 });
    s.addNotes('Seed phrase: a typical Swissquote client will not keep 24 words safe. MPC with a Swissquote share: signs for any chain, Bitcoin included, but a bank share inside every signature looks like power of disposal to FINMA. Shamir/SLIP-39: the seed is reassembled in one place at recovery time, and Swissquote + partner could rebuild it without the client. Our model separates spending (client only) from recovery (guardians, with the client\'s factor, after a delay) and replaces the key instead of rebuilding it. The trade: EVM chains only. For Bitcoin the same policy fits in a Taproot script with a timelocked recovery path; the client device holds a secp256k1 key because Bitcoin cannot verify a passkey. Not built.');
  }

  // A4 ── Recovery rules ──
  {
    const s = content('a-recovery', 'Appendix · recovery', 'Two keys replace the owner. You always hold one', { section: A });
    const gy = Y0 + 0.2;
    const slot = async (x, title, ic, l1, l2) => {
      box(s, x, gy, 3.3, 3.2, { name: title });
      text(s, title, { x: x + 0.3, y: gy + 0.25, w: 2.8, h: 0.3, fontSize: 12, fontFace: MED, color: OR7, charSpacing: 2 });
      await chip(s, x + 0.3, gy + 0.75, ic, { s: 1.0, round: true, fill: 'FFFFFF' });
      text(s, [{ text: l1, options: { fontFace: MED, fontSize: 19, breakLine: true } }, { text: l2, options: { fontSize: 15, color: INK2 } }], { x: x + 0.3, y: gy + 1.95, w: 2.8, h: 1.1 });
    };
    await slot(MX, 'GUARDIAN A', 'RiBankLine', 'Swissquote or partner', 'After a live face check');
    text(s, '+', { x: MX + 3.3, y: gy, w: 0.7, h: 3.2, align: 'center', valign: 'middle', fontSize: 44, bold: true, color: OR });
    await slot(MX + 4.0, 'GUARDIAN B', 'RiShieldKeyholeLine', 'Your backup method', 'ID card, passphrase or another passkey');
    arrow(s, MX + 7.4, gy + 1.6, MX + 7.95, gy + 1.6, OR, 2.5);
    const rx = MX + 8.05, rw = W - MX - rx;
    box(s, rx, gy, rw, 1.5, { fill: YEL50, line: YEL200, name: 'Delay' });
    await chip(s, rx + 0.3, gy + 0.4, 'RiTimerLine', { s: 0.7, round: true, fill: 'FFFFFF', color: YELD });
    text(s, [{ text: '3-day delay', options: { fontFace: MED, fontSize: 19, breakLine: true } }, { text: 'Alerts. One tap to cancel', options: { fontSize: 15, color: INK2 } }], { x: rx + 1.2, y: gy + 0.25, w: rw - 1.35, h: 1.0, valign: 'middle' });
    box(s, rx, gy + 1.7, rw, 1.5, { fill: GREEN50, name: 'Result' });
    await chip(s, rx + 0.3, gy + 2.1, 'RiCheckLine', { s: 0.7, round: true, fill: 'FFFFFF', color: GREEN });
    text(s, [{ text: 'New passkey owns it', options: { fontFace: MED, fontSize: 19, breakLine: true } }, { text: 'Same address. Old key dead', options: { fontSize: 15, color: INK2 } }], { x: rx + 1.2, y: gy + 1.95, w: rw - 1.35, h: 1.0, valign: 'middle' });
    text(s, 'About 5 minutes of client effort, then the delay. Never one party alone.', { x: MX, y: gy + 3.6, w: CW, h: 0.4, fontSize: 16, color: INK2 });
    s.addNotes('Recovery never rebuilds the old key; it asks the Safe to swap the owner to a new passkey. Candide\'s Social Recovery Module, threshold 2 of 2: Guardian A is a 1-of-2 Safe owned by Swissquote\'s guardian (signs after e-banking login and a live face match against the KYC photo, verdict signed by a separate vendor) and the independent partner (video identification; works if Swissquote is gone). Guardian B is the client\'s choice of three: ID card, a recovery passphrase (printable, locked with a PIN), or a passkey on another device or held by someone they trust. Then 3 days (3 minutes in the demo) with alerts; any device with the passkey can cancel. After it, the old passkey is rejected on-chain (AA24).');
  }

  // A5 ── Guardian B options ──
  {
    const s = content('a-guardian-b', 'Appendix · design decision', 'Guardian B: your choice of three', { section: A, app: true });
    await points(s, [
      ['RiIdCardLine', 'ID card', 'Tap it on an Android phone, PIN-protected'],
      ['RiKey2Line', 'Recovery passphrase', 'Printable, locked with a PIN, offline'],
      ['RiUserSharedLine', 'Another passkey', 'Laptop, 2nd phone or a trusted person'],
    ], { y: Y0 + 0.1, w: 5.8, gap: 0.45, icon: 0.8 });
    text(s, 'Only for recovery. Payments need your passkey alone.', { x: MX, y: Y0 + 4.2, w: 5.8, h: 0.4, fontSize: 16, color: INK2 });
    await phone(s, '09b-recover-4-guardian-b.png', { cx: 8.6, cy: 4.5, h: 4.9, deg: -6 });
    await phone(s, '03d-backup-method-v2.png', { cx: 10.95, cy: 4.4, h: 5.4 });
    s.addNotes('Guardian B is always the client\'s own factor, and the client picks it at sign-up: an NFC ID card, a recovery passphrase (a printable code locked with a 6-digit PIN, kept offline), or a passkey on another device, which can be their own laptop, a second phone, a security key, or a person they trust. It is used only to approve a recovery, never a payment: payments are approved by the wallet\'s passkey alone.\n\nWhy offer the ID card: nearly everyone carries an NFC ID card with a PIN-protected signing key (Spanish DNIe: RSA-2048), so it needs no extra device and no paper. The card signs the recovery hash over NFC in a small Android app ("Swissquote ID"), because no browser can speak ISO-DEP NFC. A per-wallet RsaGuardian contract, deployed in the wallet\'s first transaction, verifies it as an EIP-1271 guardian using the EVM\'s modexp and SHA-256 precompiles. It is our only custom contract, about 50 lines, holds no funds and only answers "is this signature valid?". Honest status: the demo uses a simulated card, NFC is untested with a physical card, no iOS app, and the rescue page does not support the ID card yet (it supports the other passkey and the passphrase).');
  }

  // A6 ── Travel Rule ──
  {
    const s = content('a-travel', 'Appendix · Travel Rule', 'Is Swissquote the sending institution? No', { section: A });
    const flows = [
      ['RiBankLine', 'Account', 'RiWallet3Line', 'Your wallet', 'yes', 'Ownership already proven'],
      ['RiWallet3Line', 'Your wallet', 'RiBankLine', 'Account', 'yes', 'Same proof'],
      ['RiWallet3Line', 'Your wallet', 'RiUserLine', 'Anyone', 'wait', 'You send. Swissquote is not a party'],
    ];
    for (const [i, [i1, l1, i2, l2, st, b]] of flows.entries()) {
      const y = Y0 + 0.1 + i * 1.3;
      await chip(s, MX, y, i1, { s: 0.8, round: true, fill: APP, color: INK });
      text(s, l1, { x: MX + 0.95, y, w: 1.6, h: 0.8, valign: 'middle', fontSize: 17, fontFace: MED });
      arrow(s, MX + 2.55, y + 0.4, MX + 3.45, y + 0.4, OR, 2.25);
      await chip(s, MX + 3.6, y, i2, { s: 0.8, round: true, fill: APP, color: INK });
      text(s, l2, { x: MX + 4.55, y, w: 1.6, h: 0.8, valign: 'middle', fontSize: 17, fontFace: MED });
      await status(s, MX + 6.35, y + 0.12, st, 0.56);
      text(s, b, { x: MX + 7.1, y, w: W - MX - (MX + 7.1), h: 0.8, valign: 'middle', fontSize: 17, color: INK2 });
    }
    text(s, 'The wallet signs its own ownership proof, checked on-chain and archived (FINMA Guidance 02/2019).', { x: MX, y: Y0 + 4.05, w: CW, h: 0.4, fontSize: 15, color: INK2 });
    s.addNotes('FINMA requires a Swiss bank to verify that an external wallet belongs to its client before sending to it or receiving from it. Our wallet is created inside the KYC session and signs an ownership proof naming the client, verified on-chain with EIP-1271 (works for smart accounts), archived and re-attested after every recovery. So Swissquote, as ordering or beneficiary institution for transfers between the account and the wallet, already has the proof. When the client pays a third party, the client signs and the Safe sends; Swissquote neither holds nor transmits the asset, so it is not the sending institution. Paying gas is a technical service. Swissquote still screens what it sponsors.');
  }

  // A7 ── Technical decisions ──
  {
    const s = content('a-decisions', 'Appendix · technical decisions', 'The technical calls', { section: A });
    const tiles = [
      ['RiShieldCheckLine', 'Recovery in the first transaction', 'No funded wallet without recovery'],
      ['RiEyeLine', 'Vendor-signed face check', 'A hacked backend can\'t fake it'],
      ['RiServerLine', 'Guardians as separate services', 'Own project, own database'],
      ['RiFlashlightLine', 'Base Sepolia', 'P-256 precompile: cheap passkey checks'],
      ['RiStackLine', 'Safe + Candide modules', 'Audited, no homemade crypto'],
      ['RiComputerLine', 'Web app, not native', 'Passkeys follow you across devices'],
    ];
    const cols = 3, gap = 0.3, tw = (CW - (cols - 1) * gap) / cols, th = 2.0;
    for (const [i, [ic, h, b]] of tiles.entries()) {
      const x = MX + (i % cols) * (tw + gap), y = Y0 + Math.floor(i / cols) * (th + 0.3);
      box(s, x, y, tw, th, { name: h });
      await chip(s, x + 0.25, y + 0.25, ic, { s: 0.6 });
      text(s, h, { x: x + 0.25, y: y + 1.0, w: tw - 0.45, h: 0.4, fontSize: 17, fontFace: MED });
      text(s, b, { x: x + 0.25, y: y + 1.42, w: tw - 0.45, h: 0.45, fontSize: 14, color: INK2 });
    }
    s.addNotes('Recovery is enabled in the wallet\'s first transaction, so no money can arrive before recovery exists (caught by our adversarial review). The face-check vendor signs its verdict, bound to the request, fresh and single-use, so a compromised Swissquote backend cannot fake a face match. The guardians and the vendor run as separate services with their own storage (a separate Vercel project and Neon database), per the brief\'s hard rule. Base for the RIP-7212 P-256 precompile, which makes on-chain passkey checks cheap. Safe v1.4.1 with the Safe4337Module and Candide\'s Social Recovery Module, via Candide abstractionkit because permissionless.js does not support passkey Safes. A responsive web app instead of native: passkeys sync across devices on one origin.');
  }

  // A8 ── Real vs mocked, tests ──
  {
    const s = content('a-real', 'Appendix · technical implementation', 'Honest mocks. Tested end to end', { section: A, app: true });
    await laptop(s, '11b-backoffice-audit-desktop.png', { cx: MX + 3.45, cy: 4.6, w: 6.9 });
    const x = 7.95, w = W - MX - x;
    const groups = [['REAL', GREEN50, GREEN, ['Passkeys, verified on-chain', 'Safe, ERC-4337, recovery module', 'Gas sponsorship, USDC']], ['MOCK', YEL200, YELD, ['Login, face analysis, HSMs', 'Sanctions list, fiat funding']], ['TESTED', OR50, OR7, ['Create, sign, recover in a real browser', 'Forged face verdicts, attackers']]];
    let y = Y0 - 0.1;
    for (const [tag, f, c, items] of groups) {
      pill(s, x, y, tag, { fill: f, color: c, fontSize: 10, h: 0.3, w: 0.95 });
      y += 0.45;
      for (const it of items) { text(s, it, { x, y, w, h: 0.36, fontSize: 16 }); y += 0.38; }
      y += 0.25;
    }
    s.addNotes('No homemade crypto: Safe, Candide, WebAuthn, viem; the ID card does its own RSA signing. Mocks follow the brief: each mocked share holder runs as its own process with its own key and storage, and the web backend never holds a guardian share. Tests: API + chain with software passkeys; the real UI in headless Chromium with a virtual WebAuthn authenticator, including the full recovery, the cancel banner and the old-passkey rejection; Swissquote-gone through the rescue page, checking it never contacts Swissquote; negative tests for forged, edited and replayed liveness verdicts and an ownership proof rewritten to another client.');
  }

  // A9 ── AI tools ──
  {
    const s = content('a-ai', 'Appendix · AI tools', 'Which AI tools we used, and for what', { section: A });
    const cards = [
      ['RiCodeSSlashLine', 'Claude Code', 'Pair-programmed the app, contracts, ID app and tests'],
      ['RiSpyLine', 'Codex and Claude', 'Two adversarial reviews of our plan'],
      ['RiUserLine', 'Us', 'Custody decisions, on-chain checks, legal framing'],
    ];
    const cw = (CW - 2 * 0.35) / 3;
    for (const [i, [ic, h, b]] of cards.entries()) {
      const x = MX + i * (cw + 0.35);
      box(s, x, Y0, cw, 3.4, { fill: i === 2 ? OR50 : WEAK, name: h });
      await chip(s, x + 0.35, Y0 + 0.35, ic, { s: 0.9, round: true, fill: i === 2 ? 'FFFFFF' : OR50 });
      text(s, h, { x: x + 0.35, y: Y0 + 1.5, w: cw - 0.7, h: 0.5, fontSize: 24, fontFace: MED });
      text(s, b, { x: x + 0.35, y: Y0 + 2.05, w: cw - 0.7, h: 1.2, fontSize: 17, color: INK2 });
    }
    s.addNotes('Claude Code (Claude Opus) pair-programmed the web app, API, guardian services, the RsaGuardian contract, the Android ID app and the end-to-end and attack tests, set up Vercel and Neon, and extracted Swissquote\'s design tokens into design.md. OpenAI Codex and Claude wrote two independent adversarial reviews of our plan (docs/review-*.md); they found the shared-signer problem, the funded-before-deploy loss case and the phone + PIN gap, and flagged overstated legal claims, which changed the design. We made the custody decisions, proved SDK behaviour in a spike before any UI, checked every on-chain result on BaseScan, and marked legal points as not legal advice.');
  }

  // A10 ── Limits ──
  {
    const s = content('a-limits', 'Appendix · honest limits', 'What we would do next', { section: A });
    const rows = [
      ['RiLockPasswordLine', 'Thief with phone and PIN', 'On-chain delay for large transfers'],
      ['RiCloudLine', 'Synced passkeys trust Apple, Google', 'Security keys for big balances'],
      ['RiIdCardLine', 'ID card: simulated, Android only', 'Real-card test, iOS, rescue page'],
      ['RiServerLine', 'Software keys, public paymaster', 'HSMs, private paymaster, rate limits'],
      ['RiScales3Line', 'Legal reasoning, not an opinion', 'Counsel and a FINMA conversation'],
    ];
    text(s, 'LIMIT', { x: MX + 0.8, y: Y0 - 0.1, w: 5, h: 0.3, fontSize: 12, fontFace: MED, color: INK2, charSpacing: 2 });
    text(s, 'NEXT', { x: 7.2, y: Y0 - 0.1, w: 5, h: 0.3, fontSize: 12, fontFace: MED, color: INK2, charSpacing: 2 });
    for (const [i, [ic, a, b]] of rows.entries()) {
      const y = Y0 + 0.35 + i * 0.85;
      await chip(s, MX, y, ic, { s: 0.6 });
      text(s, a, { x: MX + 0.8, y, w: 5.6, h: 0.6, valign: 'middle', fontSize: 18, fontFace: MED });
      arrow(s, 6.45, y + 0.3, 6.95, y + 0.3, OR, 1.75);
      text(s, b, { x: 7.2, y, w: W - MX - 7.2, h: 0.6, valign: 'middle', fontSize: 18, color: INK2 });
    }
    s.addNotes('We list residual risks openly. A thief with the unlocked phone and PIN is indistinguishable from the owner; the answer is an opt-in Safe Guard delaying large transfers that guardians can cancel. Synced passkeys put Apple or Google accounts in the trust base; a high-balance tier would require device-bound security keys. The delay protects only a client who reads alerts. Guardian addresses are public on-chain and could link a client to Swissquote. The ID card path is untested with a physical card, Android only, and not yet on the rescue page. Demo gas comes from a public unrestricted paymaster endpoint; production uses a private key and policy.');
  }

  await pres.writeFile({ fileName: OUT });
  if (SKILL_THEME) await require(SKILL_THEME).applyTheme(OUT, THEME);
  console.log('wrote', OUT, ORDER.length, 'slides');
}

build().catch((e) => { console.error(e); process.exit(1); });
