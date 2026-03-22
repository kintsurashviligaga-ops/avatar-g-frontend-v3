/**
 * scripts/generate-service-cards.mjs
 * ===================================
 * Generate cinematic service card images via Replicate FLUX model.
 * Run: node scripts/generate-service-cards.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'services');

// Ensure output directory
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Consistent cinematic style suffix for all images
const STYLE_SUFFIX = 'cinematic lighting, dark premium atmosphere, elegant color grading, moody blue and cyan accents, photorealistic, 8k ultra detailed, professional studio quality, dramatic contrast, no text, no watermark, no UI elements, wide composition suitable for card crop';

// Service-specific prompts — each one is unique and targeted
const SERVICE_PROMPTS = {
  'avatar': `A stunning digital avatar creation scene: a photorealistic human face transitioning into a glowing holographic digital twin, half organic half digital, particles of light dissolving around the transformation boundary, deep blue and cyan holographic grid patterns, futuristic identity scanning beams, ${STYLE_SUFFIX}`,
  
  'video': `A cinematic film production scene: a massive curved OLED screen displaying an epic movie scene with volumetric light rays, professional camera on a crane in the foreground, film reels dissolving into digital particles, golden and teal color palette, depth of field, ${STYLE_SUFFIX}`,
  
  'editing': `A premium video editing workspace: multiple floating holographic timeline panels with color-graded footage, scissors made of light cutting through a film strip, glowing waveforms and keyframes, sophisticated editing interface hovering in dark space, ${STYLE_SUFFIX}`,
  
  'music': `A futuristic AI music production studio: glowing audio waveforms and equalizer bars floating in 3D space, a grand piano dissolving into digital particles and musical notes, holographic mixing console, sound waves rippling through dark ambient space, warm amber and cool cyan tones, ${STYLE_SUFFIX}`,
  
  'photo': `A premium AI photo studio scene: a professional camera lens with light refracting through it creating prismatic bokeh, a perfect portrait emerging from light particles, studio lighting softboxes glowing in the background, shallow depth of field, ${STYLE_SUFFIX}`,
  
  'image': `A breathtaking AI art generation scene: a massive digital canvas floating in space with a stunning landscape painting materializing from glowing brushstrokes of light, paint splashes transforming into photorealistic imagery, creative energy particles, ${STYLE_SUFFIX}`,
  
  'media': `A multimedia production command center: multiple floating holographic screens showing video, photos, music waveforms, and text content being orchestrated together, interconnected glowing data streams, central control node radiating energy, ${STYLE_SUFFIX}`,
  
  'text': `An elegant AI writing and strategy scene: floating holographic pages with beautiful typography dissolving into particles of light, a luminous fountain pen writing in mid-air, words transforming into golden light streams, sophisticated and intellectual atmosphere, ${STYLE_SUFFIX}`,
  
  'prompt': `A premium prompt engineering visualization: a glowing neural network of interconnected prompt nodes floating in space, crystalline command structures refracting light, perfectly organized luminous text blocks connecting to AI outputs, geometric precision, ${STYLE_SUFFIX}`,
  
  'visual-intel': `An AI visual analysis scene: a large photographic image being scanned by advanced holographic analysis beams, data overlays showing composition grids and quality metrics, a magnifying lens made of light examining pixels, analytical geometry patterns, ${STYLE_SUFFIX}`,
  
  'workflow': `A stunning automation pipeline visualization: interconnected glowing nodes in a flowing network, holographic pipeline stages connected by luminous energy streams, gears and circuits made of light, an elegant orchestration system in dark space, ${STYLE_SUFFIX}`,
  
  'shop': `A premium digital commerce scene: a sleek holographic storefront display with floating product cards and price tags made of light, shopping cart icon glowing with cyan energy, luxury merchandise showcased in glass displays, elegant retail atmosphere, ${STYLE_SUFFIX}`,
  
  'agent-g': `A powerful AI command center: a central glowing AI core radiating authority, holographic control panels surrounding it in a semicircle, data streams flowing to and from the core, commanding presence, futuristic mission control atmosphere, electric blue and white energy, ${STYLE_SUFFIX}`,
  
  'software': `A premium software development scene: elegant holographic code blocks floating in 3D space with syntax highlighting in cyan and gold, a glowing terminal window, circuit board patterns underneath, matrix-like code rain dissolving into functional architecture, ${STYLE_SUFFIX}`,
  
  'business': `A sophisticated business intelligence scene: holographic charts, financial graphs and strategic dashboards floating around a central boardroom table made of light, upward trending arrows, executive command atmosphere, gold and deep blue tones, ${STYLE_SUFFIX}`,
  
  'tourism': `A breathtaking AI travel planning scene: a holographic globe with luminous travel routes connecting iconic landmarks, floating destination cards with beautiful scenery, compass rose made of light, adventure and discovery atmosphere, warm golden and cool blue tones, ${STYLE_SUFFIX}`,
  
  'game': `An immersive game creation scene: a holographic game world being built in real-time with floating terrain blocks, game characters materializing from particles, a glowing game controller transforming into a 3D world, vibrant neon and deep space atmosphere, ${STYLE_SUFFIX}`,
  
  'interior': `A premium AI interior design transformation: a luxurious modern living room being redesigned in real-time with holographic furniture and wall material options floating around, before-and-after split view effect, architectural blueprint lines of light, elegant warm and cool tones, ${STYLE_SUFFIX}`,
  
  'next': `A mysterious futuristic expansion portal: a glowing hexagonal gateway made of light opening to reveal infinite possibilities beyond, particle streams flowing through, a sense of next-generation technology and potential, ethereal and powerful, ${STYLE_SUFFIX}`,
};

async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function generateImage(slug, prompt) {
  console.log(`\n🎬 Generating: ${slug}`);
  console.log(`   Prompt: ${prompt.substring(0, 80)}...`);
  
  try {
    // Use raw API to avoid FileOutput issues
    const token = process.env.REPLICATE_API_TOKEN;
    
    // Create prediction
    const createRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: prompt,
          width: 1024,
          height: 576,
          prompt_upsampling: true,
          safety_tolerance: 5,
          output_format: 'webp',
          output_quality: 90,
        },
      }),
    });
    
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`API ${createRes.status}: ${errText}`);
    }
    
    let prediction = await createRes.json();
    
    // Poll if not yet completed (Prefer: wait should handle most cases)
    let pollCount = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && pollCount < 60) {
      await sleep(3000);
      pollCount++;
      const pollRes = await fetch(prediction.urls.get, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      prediction = await pollRes.json();
      process.stdout.write('.');
    }
    if (pollCount > 0) console.log('');
    
    if (prediction.status === 'failed') {
      throw new Error(`Prediction failed: ${prediction.error}`);
    }
    
    // Extract URL from output
    let imageUrl = prediction.output;
    if (Array.isArray(imageUrl)) imageUrl = imageUrl[0];
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      console.error(`   ❌ No valid URL for ${slug}. Output:`, prediction.output);
      return false;
    }

    console.log(`   📥 Downloading: ${imageUrl.substring(0, 80)}...`);
    
    const destPath = path.join(OUT_DIR, `${slug}.webp`);
    
    // Remove old image first
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
      console.log(`   🗑️  Removed old image`);
    }
    
    await downloadImage(imageUrl, destPath);
    
    const stats = fs.statSync(destPath);
    console.log(`   ✅ Saved: ${destPath} (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;
  } catch (err) {
    console.error(`   ❌ Failed for ${slug}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MyAvatar.ge — Cinematic Service Card Image Generator');
  console.log('  Model: FLUX 1.1 Pro (black-forest-labs)');
  console.log(`  Services: ${Object.keys(SERVICE_PROMPTS).length}`);
  console.log('═══════════════════════════════════════════════════════════');
  
  const slugs = Object.keys(SERVICE_PROMPTS);
  const results = { success: [], failed: [] };
  
  // Generate with delays to respect rate limits (6 req/min = 10s between)
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    if (i > 0) {
      console.log(`   ⏳ Waiting 12s for rate limit...`);
      await sleep(12000);
    }
    const ok = await generateImage(slug, SERVICE_PROMPTS[slug]);
    if (ok) results.success.push(slug);
    else results.failed.push(slug);
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ✅ Success: ${results.success.length}/${slugs.length}`);
  if (results.failed.length > 0) {
    console.log(`  ❌ Failed: ${results.failed.join(', ')}`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  
  // If any failed, retry them once
  if (results.failed.length > 0) {
    console.log('\n🔄 Retrying failed services...');
    const retryFailed = [...results.failed];
    results.failed = [];
    
    for (let i = 0; i < retryFailed.length; i++) {
      const slug = retryFailed[i];
      if (i > 0) await sleep(12000);
      const ok = await generateImage(slug, SERVICE_PROMPTS[slug]);
      if (ok) results.success.push(slug);
      else results.failed.push(slug);
    }
    
    console.log(`\n  Final: ✅ ${results.success.length}/${slugs.length}`);
    if (results.failed.length > 0) {
      console.log(`  Still failed: ${results.failed.join(', ')}`);
    }
  }
}

main().catch(console.error);
