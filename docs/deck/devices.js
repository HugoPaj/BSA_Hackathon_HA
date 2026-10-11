// Device mockups for the deck: real screenshots inside a drawn iPhone or laptop, with a baked shadow.
// Phone screenshots are 390 x 844 CSS px at 2x; an iOS status bar is added above them.
// Desktop screenshots are 1440 x 900 CSS px at 2x.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SHOTS = path.join(__dirname, 'shots');
const SB = 94; // status bar height in px (47 pt at 2x)

function shotPath(file) {
  const p = path.isAbsolute(file) ? file : path.join(SHOTS, file);
  if (!fs.existsSync(p)) throw new Error('missing screenshot ' + file);
  return p;
}

// iOS status bar: time on the left, signal, Wi-Fi and battery on the right, on the screen's own top colour.
function statusBar(w, bg, ink = '#000') {
  const y = 58;
  const bars = [0, 1, 2, 3].map((i) => `<rect x="${w - 182 + i * 13}" y="${y - 8 - i * 6}" width="9" height="${12 + i * 6}" rx="2.5" fill="${ink}"/>`).join('');
  const wifi = `<g transform="translate(${w - 118} ${y - 25})" fill="none" stroke="${ink}" stroke-width="5.2" stroke-linecap="round">
    <path d="M3 13 a26 26 0 0 1 34 0"/><path d="M9.5 20 a16 16 0 0 1 21 0"/></g><circle cx="${w - 98}" cy="${y + 1}" r="4.4" fill="${ink}"/>`;
  const batt = `<rect x="${w - 76}" y="${y - 21}" width="50" height="25" rx="7.5" fill="none" stroke="${ink}" stroke-opacity="0.4" stroke-width="2.6"/>
    <rect x="${w - 72}" y="${y - 17}" width="42" height="17" rx="4.5" fill="${ink}"/><rect x="${w - 23}" y="${y - 12}" width="4" height="8" rx="2" fill="${ink}" fill-opacity="0.45"/>`;
  return `<rect width="${w}" height="${SB}" fill="${bg}"/>
    <text x="108" y="${y + 2}" text-anchor="middle" font-family="SwissquoteCT" font-weight="700" font-size="34" fill="${ink}">9:41</text>${bars}${wifi}${batt}`;
}

const cache = new Map();

// An iPhone with the screenshot on its screen.
async function phoneImage(file, { win } = {}) {
  const key = file + JSON.stringify(win || null);
  if (cache.has(key)) return cache.get(key);
  const src = shotPath(file);
  const meta = await sharp(src).metadata();
  // `win` is one [y0, y1] range or a list of ranges stacked top to bottom (e.g. content plus the tab bar).
  const segs = !win ? [[0, meta.height]] : Array.isArray(win[0]) ? win : [win];
  const sw = meta.width, sh = segs.reduce((n, [y0, y1]) => n + y1 - y0, 0);
  const parts = [];
  let at = 0;
  for (const [y0, y1] of segs) {
    parts.push({ input: await sharp(src).extract({ left: 0, top: y0, width: sw, height: y1 - y0 }).png().toBuffer(), left: 0, top: at });
    at += y1 - y0;
  }
  const shot = await sharp({ create: { width: sw, height: sh, channels: 4, background: '#fff' } }).composite(parts).png().toBuffer();
  const { data } = await sharp(shot).extract({ left: 0, top: 0, width: sw, height: 4 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = `rgb(${data[0]},${data[1]},${data[2]})`;

  const scrW = sw, scrH = sh + SB, scrR = 108;
  const bez = 22, rim = 9, btn = 6, M = 120; // black bezel, titanium rim, button bulge, shadow margin
  const bw = scrW + 2 * (bez + rim), bh = scrH + 2 * (bez + rim), bodyR = scrR + bez + rim;
  const cw = bw + 2 * M, ch = bh + 2 * M, X = M, Y = M;
  const sx = X + rim + bez, sy = Y + rim + bez;
  const islandW = 250, islandH = 74;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cw}" height="${ch}">
  <defs>
    <linearGradient id="ti" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B5D63"/><stop offset="0.45" stop-color="#2E2F33"/><stop offset="0.55" stop-color="#3A3B40"/><stop offset="1" stop-color="#1E1F22"/></linearGradient>
    <linearGradient id="btn" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A2B2F"/><stop offset="1" stop-color="#55575D"/></linearGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.0"/></linearGradient>
    <clipPath id="scr"><rect x="${sx}" y="${sy}" width="${scrW}" height="${scrH}" rx="${scrR}"/></clipPath>
  </defs>
  <rect x="${X - btn}" y="${Y + 250}" width="${btn + 4}" height="70" rx="3" fill="url(#btn)"/>
  <rect x="${X - btn}" y="${Y + 380}" width="${btn + 4}" height="130" rx="3" fill="url(#btn)"/>
  <rect x="${X - btn}" y="${Y + 540}" width="${btn + 4}" height="130" rx="3" fill="url(#btn)"/>
  <rect x="${X + bw - 4}" y="${Y + 430}" width="${btn + 4}" height="200" rx="3" fill="url(#btn)"/>
  <rect x="${X}" y="${Y}" width="${bw}" height="${bh}" rx="${bodyR}" fill="url(#ti)"/>
  <rect x="${X + 1.5}" y="${Y + 1.5}" width="${bw - 3}" height="${bh - 3}" rx="${bodyR - 1.5}" fill="none" stroke="#8A8C92" stroke-opacity="0.55" stroke-width="3"/>
  <rect x="${X + rim}" y="${Y + rim}" width="${bw - 2 * rim}" height="${bh - 2 * rim}" rx="${bodyR - rim}" fill="#050506"/>
  <g clip-path="url(#scr)">
    <rect x="${sx}" y="${sy}" width="${scrW}" height="${scrH}" fill="${bg}"/>
    <g transform="translate(${sx} ${sy})">${statusBar(scrW, bg)}</g>
    <image x="${sx}" y="${sy + SB}" width="${sw}" height="${sh}" xlink:href="data:image/png;base64,${shot.toString('base64')}"/>
    <rect x="${sx}" y="${sy}" width="${scrW}" height="${scrH}" fill="url(#glare)"/>
  </g>
  <rect x="${sx + (scrW - islandW) / 2}" y="${sy + 22}" width="${islandW}" height="${islandH}" rx="${islandH / 2}" fill="#000"/>
</svg>`;
  const device = await sharp(Buffer.from(svg)).png().toBuffer();
  const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect x="${X + 20}" y="${Y + 46}" width="${bw - 40}" height="${bh - 30}" rx="${bodyR}" fill="#0E121B" fill-opacity="0.30"/></svg>`)).blur(40).png().toBuffer();
  const buf = await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow }, { input: device }]).png().toBuffer();
  const out = { buf, cw, ch, bw, bh, M };
  cache.set(key, out);
  return out;
}

// A laptop: black display bezel with camera, aluminium base with a thumb notch.
async function laptopImage(file, { scale = 0.5 } = {}) {
  const key = 'laptop:' + file;
  if (cache.has(key)) return cache.get(key);
  const src = shotPath(file);
  const meta = await sharp(src).metadata();
  const sw = Math.round(meta.width * scale), sh = Math.round(meta.height * scale);
  const shot = await sharp(src).resize(sw, sh).png().toBuffer();
  const bez = 34, lidR = 34, baseH = 34, overhang = 120, M = 90;
  const lw = sw + 2 * bez, lh = sh + bez + 46;
  const bw = lw + 2 * overhang, bh = lh + baseH;
  const cw = bw + 2 * M, ch = bh + 2 * M, X = M + overhang, Y = M;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cw}" height="${ch}">
  <defs>
    <linearGradient id="al" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E4E6EA"/><stop offset="0.5" stop-color="#C9CCD2"/><stop offset="1" stop-color="#9DA1A9"/></linearGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="${X}" y="${Y}" width="${lw}" height="${lh + 20}" rx="${lidR}" fill="#0B0B0D"/>
  <rect x="${X + 2}" y="${Y + 2}" width="${lw - 4}" height="${lh + 16}" rx="${lidR - 2}" fill="none" stroke="#3A3B40" stroke-width="4"/>
  <image x="${X + bez}" y="${Y + bez}" width="${sw}" height="${sh}" xlink:href="data:image/png;base64,${shot.toString('base64')}"/>
  <rect x="${X + bez}" y="${Y + bez}" width="${sw}" height="${sh}" fill="url(#glare)"/>
  <circle cx="${X + lw / 2}" cy="${Y + bez / 2}" r="5" fill="#26272B"/>
  <path d="M ${M} ${Y + lh} H ${M + bw} V ${Y + lh + baseH - 14} Q ${M + bw} ${Y + bh} ${M + bw - 60} ${Y + bh} H ${M + 60} Q ${M} ${Y + bh} ${M} ${Y + lh + baseH - 14} Z" fill="url(#al)"/>
  <path d="M ${M + bw / 2 - 150} ${Y + lh} h 300 v 6 q 0 10 -14 10 h -272 q -14 0 -14 -10 z" fill="#A9ADB4"/>
</svg>`;
  const device = await sharp(Buffer.from(svg)).png().toBuffer();
  const shadow = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect x="${M + 40}" y="${Y + 40}" width="${bw - 80}" height="${bh - 20}" rx="30" fill="#0E121B" fill-opacity="0.22"/></svg>`)).blur(36).png().toBuffer();
  const buf = await sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow }, { input: device }]).png().toBuffer();
  const out = { buf, cw, ch, bw, bh, M };
  cache.set(key, out);
  return out;
}

// Rotate a device image by a few degrees around its centre; the canvas grows to fit.
async function tilt(img, deg) {
  if (!deg) return img;
  const buf = await sharp(img.buf).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { ...img, buf, cw: m.width, ch: m.height };
}

module.exports = { phoneImage, laptopImage, tilt };
