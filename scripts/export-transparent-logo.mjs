import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const root = process.cwd();
const inputPath = path.join(root, 'public', 'brand', 'logo-main.png');
const outputPng = path.join(root, 'public', 'brand', 'logo-transparent-hq.png');
const outputPdf = path.join(root, 'public', 'brand', 'logo-transparent-hq.pdf');

const src = sharp(inputPath, { failOn: 'none' }).ensureAlpha();
const metadata = await src.metadata();

const targetWidth = Math.max(2048, (metadata.width ?? 1024) * 2);

const pngBuffer = await src
  .trim({ threshold: 8 })
  .resize({ width: targetWidth, withoutEnlargement: false, fit: 'inside', kernel: sharp.kernel.lanczos3 })
  .sharpen({ sigma: 1.2, m1: 1.4, m2: 2.2, x1: 2, y2: 10, y3: 20 })
  .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
  .toBuffer();

await fs.writeFile(outputPng, pngBuffer);

const imgMeta = await sharp(pngBuffer).metadata();
const width = imgMeta.width ?? 1024;
const height = imgMeta.height ?? 1024;

const pdfDoc = await PDFDocument.create();
const embedded = await pdfDoc.embedPng(pngBuffer);
const page = pdfDoc.addPage([width, height]);
page.drawImage(embedded, { x: 0, y: 0, width, height });

const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
await fs.writeFile(outputPdf, pdfBytes);

console.log('DONE');
console.log(outputPng);
console.log(outputPdf);
