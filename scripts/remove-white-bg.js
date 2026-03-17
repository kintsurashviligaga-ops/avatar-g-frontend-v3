/**
 * Remove white background from gemini-rocket.png and output transparent version.
 * Uses sharp to process pixel data - white/near-white pixels become transparent.
 */
const sharp = require('sharp');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'public', 'brand', 'gemini-rocket.png');
const OUTPUT = path.join(__dirname, '..', 'public', 'brand', 'gemini-rocket-clean.png');

async function removeWhiteBackground() {
  const image = sharp(INPUT);
  const metadata = await image.metadata();
  console.log(`Input: ${metadata.width}x${metadata.height}, channels: ${metadata.channels}`);

  // Get raw pixel data
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  console.log(`Processing ${width}x${height} with ${channels} channels`);

  // Process pixels: make white/near-white pixels transparent
  const THRESHOLD = 240; // pixels with R,G,B all above this are considered "white"
  const EDGE_THRESHOLD = 220; // softer edge for anti-aliasing

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Pure white / near-white → fully transparent
    if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
      data[i + 3] = 0; // set alpha to 0
    }
    // Semi-white (edge anti-aliasing zone) → partial transparency
    else if (r >= EDGE_THRESHOLD && g >= EDGE_THRESHOLD && b >= EDGE_THRESHOLD) {
      const brightness = (r + g + b) / 3;
      const factor = (brightness - EDGE_THRESHOLD) / (THRESHOLD - EDGE_THRESHOLD);
      data[i + 3] = Math.round(255 * (1 - factor * 0.9));
    }
    // Otherwise keep full opacity
  }

  // Write output
  await sharp(data, { raw: { width, height, channels } })
    .png({ quality: 100, compressionLevel: 6 })
    .toFile(OUTPUT);

  const outMeta = await sharp(OUTPUT).metadata();
  console.log(`Output: ${outMeta.width}x${outMeta.height}, has alpha: ${outMeta.hasAlpha}`);
  console.log(`Saved to: ${OUTPUT}`);
}

removeWhiteBackground().catch(console.error);
