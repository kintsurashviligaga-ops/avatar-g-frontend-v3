#!/usr/bin/env node
/**
 * scripts/generate-ad-video.mjs
 * ==============================
 * Generates the MyAvatar.ge promotional advertisement video
 * and saves it directly to the correct public directory.
 *
 * This script generates a high-quality 9:16 vertical video
 * suitable for social media and the landing page promo section.
 *
 * The video is also copied to replace the hero video.
 */

import Replicate from 'replicate';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMO_DIR = resolve(__dirname, '..', 'public', 'media', 'promo');
const LANDING_DIR = resolve(__dirname, '..', 'public', 'media', 'landing');
const PROMO_PATH = resolve(PROMO_DIR, 'myavatar-promo-ad.mp4');
const HERO_PATH = resolve(LANDING_DIR, 'myavatar-hero-video.mp4');

// Premium SaaS product advertisement prompt — carefully crafted for realism
const PROMPT = `Premium cinematic technology advertisement video. Dark elegant environment with deep blue-black background.

Opening: A sleek modern AI platform interface materializes on screen — clean dark dashboard with glowing cyan-blue accent highlights. The UI shows an AI chat interface with the text "Agent G" visible. Smooth camera slowly pushes forward.

Middle: The interface transitions to show an AI avatar creation panel. A professional photorealistic digital human portrait appears in a frame with subtle scanning light effect. Neon cyan interface elements glow softly. Text overlay reads "Create Your AI Avatar". Clean minimal design, no clutter.

Ending: Elegant fade to dark background. A glowing "M" logo mark appears centered with soft cyan light bloom. Text "MyAvatar.ge" fades in below with premium typography. Subtle AI particle shimmer in background. Call to action: "AI Creation Platform".

Style: Ultra premium technology commercial. Apple/Stripe/OpenAI aesthetic. Cinematic lighting with soft blue-cyan highlights on dark background. Slow elegant camera movement. Clean sharp typography. Minimal sophisticated motion. Professional SaaS product showcase. Vertical 9:16 format for mobile.

Quality: Photorealistic, 4K detail, cinematic color grading, professional lighting, sharp focus throughout.`;

const NEGATIVE = 'cartoon, anime, illustration, blurry text, distorted typography, fake looking, low quality, noisy, oversaturated neon, chaotic motion, fast camera shake, ugly UI, cluttered interface, watermark, stock footage look';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractUrl(output) {
  if (typeof output === 'string') return output;
  if (output instanceof URL) return output.href;
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    if (typeof output.url === 'function') {
      try { return output.url().href || output.url().toString(); } catch { /* skip */ }
    }
    if (typeof output.url === 'string') return output.url;
    if (typeof output.toString === 'function') {
      const s = output.toString();
      if (s.startsWith('http')) return s;
    }
  }
  if (Array.isArray(output) && output.length > 0) return extractUrl(output[0]);
  return null;
}

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error('[ad-video] ERROR: Set REPLICATE_API_TOKEN environment variable');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });
  await mkdir(PROMO_DIR, { recursive: true });
  await mkdir(LANDING_DIR, { recursive: true });

  console.log('[ad-video] ╔════════════════════════════════════════════════╗');
  console.log('[ad-video] ║  MyAvatar.ge Ad Video Generator               ║');
  console.log('[ad-video] ╚════════════════════════════════════════════════╝');
  console.log('[ad-video] Generating promotional video...');
  console.log('[ad-video] This will take several minutes.\n');

  // Models ordered by quality for text-to-video generation
  const models = [
    {
      id: 'minimax/video-01',
      input: { prompt: PROMPT, prompt_optimizer: true },
    },
    {
      id: 'tencent/hunyuan-video',
      input: { prompt: PROMPT },
    },
  ];

  let output = null;
  let usedModel = '';

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[ad-video] Retry ${attempt} for ${model.id} (waiting 15s)...`);
          await sleep(15000);
        }
        console.log(`[ad-video] Trying model: ${model.id}...`);
        output = await replicate.run(model.id, { input: model.input });
        usedModel = model.id;
        if (output) break;
      } catch (err) {
        const msg = err.message || String(err);
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('throttled')) {
          console.warn(`[ad-video] Rate limited on ${model.id}, retrying...`);
          await sleep(15000);
          continue;
        }
        console.warn(`[ad-video] ${model.id} failed: ${msg}`);
        break;
      }
    }
    if (output) break;
  }

  if (!output) {
    console.error('[ad-video] All models failed.');
    process.exit(1);
  }

  // Handle stream output
  if (output && typeof output[Symbol.asyncIterator] === 'function') {
    console.log('[ad-video] Receiving video stream...');
    const chunks = [];
    for await (const chunk of output) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    await writeFile(PROMO_PATH, buffer);
    console.log(`[ad-video] ✓ Saved promo: ${PROMO_PATH} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
    // Also save as hero video replacement
    await writeFile(HERO_PATH, buffer);
    console.log(`[ad-video] ✓ Saved hero replacement: ${HERO_PATH}`);
    console.log(`[ad-video] Model used: ${usedModel}`);
    console.log('[ad-video] Done!');
    process.exit(0);
  }

  const videoUrl = extractUrl(output);
  if (!videoUrl) {
    console.error('[ad-video] No video URL in output:', String(output).slice(0, 500));
    process.exit(1);
  }

  console.log(`[ad-video] Generated: ${videoUrl}`);
  console.log('[ad-video] Downloading...');

  const response = await fetch(videoUrl);
  if (!response.ok) {
    console.error(`[ad-video] Download failed: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  
  // Save as promo video
  await writeFile(PROMO_PATH, buffer);
  console.log(`[ad-video] ✓ Saved promo: ${PROMO_PATH} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
  
  // Also replace the hero video
  await writeFile(HERO_PATH, buffer);
  console.log(`[ad-video] ✓ Replaced hero video: ${HERO_PATH}`);
  
  console.log(`[ad-video] Model used: ${usedModel}`);
  console.log('[ad-video] Done!');
}

main().catch(err => {
  console.error('[ad-video] Fatal:', err);
  process.exit(1);
});
