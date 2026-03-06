import fs from 'node:fs/promises';
import sharp from 'sharp';

const inputPath = 'C:/Users/admin/OneDrive/Desktop/D41F94AD-249E-453F-B1F8-F2DCF43DAFFE.png';
const outputPath = 'public/brand/logo-primary-transparent.png';

const { data, info } = await sharp(inputPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const width = info.width;
const height = info.height;
const channels = info.channels;
const pixelCount = width * height;

const candidate = new Uint8Array(pixelCount);

for (let i = 0, p = 0; i < data.length; i += channels, p += 1) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  const blueDominant = b > r + 10 || b > g + 10;
  const cyanDominant = (g > r + 8 && b > r + 8);

  candidate[p] = (sat > 18 || blueDominant || cyanDominant) ? 1 : 0;
}

const visited = new Uint8Array(pixelCount);
const qx = new Int32Array(pixelCount);
const qy = new Int32Array(pixelCount);

let bestSize = 0;
let bestIndices = [];

const neighbors = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const start = y * width + x;
    if (!candidate[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    qx[tail] = x;
    qy[tail] = y;
    tail += 1;
    visited[start] = 1;

    const component = [];

    while (head < tail) {
      const cx = qx[head];
      const cy = qy[head];
      head += 1;
      const idx = cy * width + cx;
      component.push(idx);

      for (const [dx, dy] of neighbors) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nidx = ny * width + nx;
        if (!candidate[nidx] || visited[nidx]) continue;
        visited[nidx] = 1;
        qx[tail] = nx;
        qy[tail] = ny;
        tail += 1;
      }
    }

    if (component.length > bestSize) {
      bestSize = component.length;
      bestIndices = component;
    }
  }
}

const alphaMask = new Uint8Array(pixelCount);
for (const idx of bestIndices) {
  alphaMask[idx] = 255;
}

for (let p = 0; p < pixelCount; p += 1) {
  const i = p * channels;
  if (!alphaMask[p]) {
    data[i + 3] = 0;
  }
}

const foregroundBuffer = await sharp(data, {
  raw: { width, height, channels },
})
  .trim({ threshold: 6 })
  .png()
  .toBuffer();

const fitted = await sharp(foregroundBuffer)
  .resize({ width: 1700, height: 1700, fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: false })
  .sharpen({ sigma: 1.1, m1: 1.4, m2: 2.2, x1: 2, y2: 12, y3: 24 })
  .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
  .toBuffer();

const finalPng = await sharp({
  create: {
    width: 2048,
    height: 2048,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: fitted, gravity: 'center' }])
  .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
  .toBuffer();

await fs.writeFile(outputPath, finalPng);

const meta = await sharp(finalPng).metadata();
console.log('DONE', outputPath, meta.width, meta.height);
