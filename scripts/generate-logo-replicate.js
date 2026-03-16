/**
 * Generate a perfect transparent rocket logo using Replicate API.
 * 
 * Strategy:
 * 1. Use Replicate's background removal model on the original image
 * 2. Enhance/upscale the result for retina quality
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
if (!REPLICATE_TOKEN) {
  console.error('Error: Set REPLICATE_API_TOKEN environment variable');
  process.exit(1);
}
const INPUT_PATH = path.join(__dirname, '..', 'public', 'brand', 'gemini-rocket.png');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'brand', 'rocket-logo-final.png');

// Helper: make HTTPS request
function apiRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Helper: download file from URL
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const request = (downloadUrl) => {
      proto.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          const redirectProto = res.headers.location.startsWith('https') ? https : http;
          redirectProto.get(res.headers.location, (res2) => {
            const file = fs.createWriteStream(dest);
            res2.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
        } else {
          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }
      }).on('error', reject);
    };
    request(url);
  });
}

// Helper: poll for prediction completion
async function pollPrediction(id) {
  const maxAttempts = 120; // 2 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    const result = await apiRequest(`https://api.replicate.com/v1/predictions/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    const status = result.data.status;
    console.log(`  Poll ${i + 1}: ${status}`);
    
    if (status === 'succeeded') return result.data;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Prediction ${status}: ${JSON.stringify(result.data.error)}`);
    }
    
    await new Promise(r => setTimeout(r, 2000)); // Wait 2s between polls
  }
  throw new Error('Prediction timed out');
}

async function main() {
  console.log('=== MyAvatar.ge Rocket Logo Generation ===\n');
  
  // Step 1: Convert original image to base64 data URI for Replicate
  console.log('Step 1: Preparing image...');
  const imageBuffer = fs.readFileSync(INPUT_PATH);
  const base64 = imageBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;
  console.log(`  Original: 1024x1024, ${(imageBuffer.length / 1024).toFixed(0)}KB`);
  
  // Step 2: Remove background using cjwbw/rembg model
  console.log('\nStep 2: Removing background via Replicate (rembg)...');
  const bgRemoveResult = await apiRequest('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_TOKEN}`,
      'Content-Type': 'application/json',
    },
  }, JSON.stringify({
    version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
    input: {
      image: dataUri,
    },
  }));
  
  if (bgRemoveResult.status !== 201) {
    console.error('Failed to start bg removal:', JSON.stringify(bgRemoveResult.data));
    // Try alternative model
    console.log('\nTrying alternative model (lucataco/remove-bg)...');
    const altResult = await apiRequest('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }, JSON.stringify({
      version: '95fcc2a26d3899cd6c2691c900571aeaea6b765f76e6f40ec6b9c502ccfb59d0',
      input: {
        image: dataUri,
      },
    }));
    
    if (altResult.status !== 201) {
      console.error('Alt model also failed:', JSON.stringify(altResult.data));
      process.exit(1);
    }
    
    console.log(`  Prediction started: ${altResult.data.id}`);
    const completed = await pollPrediction(altResult.data.id);
    const outputUrl = typeof completed.output === 'string' ? completed.output : completed.output?.[0] || completed.output;
    console.log(`  Output URL: ${outputUrl}`);
    
    console.log('\nStep 3: Downloading result...');
    await downloadFile(outputUrl, OUTPUT_PATH);
  } else {
    console.log(`  Prediction started: ${bgRemoveResult.data.id}`);
    const completed = await pollPrediction(bgRemoveResult.data.id);
    const outputUrl = typeof completed.output === 'string' ? completed.output : completed.output?.[0] || completed.output;
    console.log(`  Output URL: ${outputUrl}`);
    
    console.log('\nStep 3: Downloading result...');
    await downloadFile(outputUrl, OUTPUT_PATH);
  }
  
  // Step 4: Post-process with sharp - ensure quality + proper sizing
  console.log('\nStep 4: Post-processing with sharp...');
  const sharp = require('sharp');
  
  const meta = await sharp(OUTPUT_PATH).metadata();
  console.log(`  Downloaded: ${meta.width}x${meta.height}, hasAlpha: ${meta.hasAlpha}, channels: ${meta.channels}`);
  
  // Trim transparent edges, re-center, output at 1024x1024
  const trimmedBuffer = await sharp(OUTPUT_PATH)
    .trim()  // Remove transparent edges
    .toBuffer();
  
  const trimmedMeta = await sharp(trimmedBuffer).metadata();
  console.log(`  After trim: ${trimmedMeta.width}x${trimmedMeta.height}`);
  
  // Resize to fit in 1024x1024 with padding
  const targetSize = 1024;
  const maxDim = Math.max(trimmedMeta.width, trimmedMeta.height);
  const scale = (targetSize * 0.85) / maxDim; // 85% of canvas to leave breathing room
  const newW = Math.round(trimmedMeta.width * scale);
  const newH = Math.round(trimmedMeta.height * scale);
  
  await sharp(trimmedBuffer)
    .resize(newW, newH, { fit: 'inside', withoutEnlargement: false })
    .extend({
      top: Math.round((targetSize - newH) / 2),
      bottom: targetSize - newH - Math.round((targetSize - newH) / 2),
      left: Math.round((targetSize - newW) / 2),
      right: targetSize - newW - Math.round((targetSize - newW) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ quality: 100, compressionLevel: 6 })
    .toFile(OUTPUT_PATH + '.tmp.png');
  
  // Move temp to final
  fs.renameSync(OUTPUT_PATH + '.tmp.png', OUTPUT_PATH);
  
  const finalMeta = await sharp(OUTPUT_PATH).metadata();
  const finalSize = fs.statSync(OUTPUT_PATH).size;
  console.log(`\n✅ Final logo: ${finalMeta.width}x${finalMeta.height}, hasAlpha: ${finalMeta.hasAlpha}, ${(finalSize / 1024).toFixed(0)}KB`);
  console.log(`   Saved to: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
