import fs from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const src = 'public/brand/logo-main.png';
const outPng = 'public/brand/logo-exact-transparent.png';
const outPdf = 'public/brand/logo-exact-transparent.pdf';

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = info.width;
const h = info.height;
const c = info.channels;

const sample = [];
for (let y = 0; y < 16; y += 1) {
  for (let x = 0; x < 16; x += 1) {
    sample.push([x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]);
  }
}

let sr = 0;
let sg = 0;
let sb = 0;
for (const [x, y] of sample) {
  const i = (y * w + x) * c;
  sr += data[i];
  sg += data[i + 1];
  sb += data[i + 2];
}
const n = sample.length;
const br = sr / n;
const bg = sg / n;
const bb = sb / n;

const isBgCandidate = new Uint8Array(w * h);

for (let i = 0, px = 0; i < data.length; i += c, px += 1) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  const dr = r - br;
  const dg = g - bg;
  const db = b - bb;
  const dist = Math.sqrt((dr * dr) + (dg * dg) + (db * db));

  const likelyBg = ((sat < 52 && dist < 92) || (sat < 28 && max > 70)) && a > 0;
  isBgCandidate[px] = likelyBg ? 1 : 0;
}

const visited = new Uint8Array(w * h);
const queueX = new Int32Array(w * h);
const queueY = new Int32Array(w * h);
let qh = 0;
let qt = 0;

const pushIfBg = (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const idx = y * w + x;
  if (visited[idx] || !isBgCandidate[idx]) return;
  visited[idx] = 1;
  queueX[qt] = x;
  queueY[qt] = y;
  qt += 1;
};

for (let x = 0; x < w; x += 1) {
  pushIfBg(x, 0);
  pushIfBg(x, h - 1);
}
for (let y = 0; y < h; y += 1) {
  pushIfBg(0, y);
  pushIfBg(w - 1, y);
}

while (qh < qt) {
  const x = queueX[qh];
  const y = queueY[qh];
  qh += 1;
  pushIfBg(x + 1, y);
  pushIfBg(x - 1, y);
  pushIfBg(x, y + 1);
  pushIfBg(x, y - 1);
}

for (let y = 0; y < h; y += 1) {
  for (let x = 0; x < w; x += 1) {
    const idx = y * w + x;
    if (!visited[idx]) continue;
    const i = idx * c;
    data[i + 3] = 0;
  }
}

const trimmed = await sharp(data, { raw: { width: w, height: h, channels: c } })
  .trim({ threshold: 8 })
  .png()
  .toBuffer();

const fitted = await sharp(trimmed)
  .resize({ width: 1800, height: 1800, fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
  .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
  .toBuffer();

const png = await sharp({
  create: {
    width: 2200,
    height: 2200,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: fitted, gravity: 'center' }])
  .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
  .toBuffer();

await fs.writeFile(outPng, png);

const m = await sharp(png).metadata();
const pdf = await PDFDocument.create();
const emb = await pdf.embedPng(png);
const page = pdf.addPage([m.width ?? 2200, m.height ?? 2200]);
page.drawImage(emb, { x: 0, y: 0, width: m.width ?? 2200, height: m.height ?? 2200 });
await fs.writeFile(outPdf, await pdf.save({ useObjectStreams: true }));

console.log('DONE', outPng, outPdf, m.width, m.height, Math.round(br), Math.round(bg), Math.round(bb));
