#!/usr/bin/env node
/**
 * scripts/generate-promo-video.mjs
 * =================================
 * Generates a professional MyAvatar.ge promotional advertisement video
 * using Replicate's image-to-video models.
 *
 * The script uses a real website screenshot as the visual base to ensure
 * brand accuracy — no hallucinated UI, no fake elements.
 *
 * Usage:
 *   REPLICATE_API_TOKEN=r8_xxx node scripts/generate-promo-video.mjs
 *
 * Options:
 *   --screenshot <path>   Local screenshot file to use (default: auto-captures)
 *   --url <url>           URL of existing screenshot image
 *   --phase <phase>       Generate specific phase only: intro|avatar|brand (default: all)
 *   --output <dir>        Output directory (default: public/media/promo)
 *
 * Output:
 *   public/media/promo/myavatar-promo-intro.mp4
 *   public/media/promo/myavatar-promo-avatar.mp4
 *   public/media/promo/myavatar-promo-brand.mp4
 *   public/media/promo/myavatar-promo-final.mp4  (if all phases generated)
 */

import Replicate from 'replicate';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(__dirname, '..', 'public', 'media', 'promo');

// ── Parse CLI args ──────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
}

const SCREENSHOT_PATH = getArg('screenshot');
const SCREENSHOT_URL = getArg('url');
const PHASE_FILTER = getArg('phase');
const OUTPUT_DIR = getArg('output') || DEFAULT_OUTPUT_DIR;

// ── Phase Prompts ───────────────────────────────────────────────
// These prompts are carefully engineered for image-to-video models.
// They describe ONLY motion and lighting — the screenshot provides the visual.

const PHASES = {
  intro: {
    file: 'myavatar-promo-intro.mp4',
    prompt: `Cinematic slow camera push forward toward a modern AI technology website. Very subtle premium light sweep glides across the interface from left to right. The main action button glows softly with a gentle cyan pulse. Minimal elegant parallax depth between UI layers. Everything remains perfectly sharp and readable. Dark tech aesthetic, smooth motion. Premium SaaS commercial style. Aspect ratio 9:16 vertical.`,
    negativePrompt: 'fake interface, unreadable text, distorted logo, mutated typography, hallucinated UI, warped layout, blurry text, oversaturated neon, chaotic motion, fast movement, camera shake',
  },
  avatar: {
    file: 'myavatar-promo-avatar.mp4',
    prompt: `Elegant cinematic focus on a modern AI avatar creation platform interface. Gentle neon blue-cyan light highlights gradually appear around the main content area. Subtle floating micro-animation on card elements. A smooth vertical scanning light effect passes over the interface. UI remains perfectly stable, sharp, and readable throughout. Dark futuristic background with very subtle floating particle shimmer. Clean minimal premium technology aesthetic. Slow sophisticated motion. Aspect ratio 9:16 vertical.`,
    negativePrompt: 'fake interface, unreadable text, distorted logo, mutated typography, hallucinated UI, warped layout, unrealistic avatar face, blurry text, oversaturated neon, chaotic motion',
  },
  brand: {
    file: 'myavatar-promo-brand.mp4',
    prompt: `Elegant premium brand reveal sequence. Dark sophisticated background. A modern technology logo emerges with a soft cyan-blue glow bloom animation. A smooth light sweep passes horizontally across the logo. Very subtle futuristic AI particles shimmer gently in the background. The text "Create Your AI Avatar" fades in below elegantly. Minimal, cinematic, premium technology brand presentation. Slow refined motion only. Aspect ratio 9:16 vertical.`,
    negativePrompt: 'fake interface, distorted text, mutated typography, blurry, oversaturated neon, chaotic motion, fast movement',
  },
};

// ── Models (in priority order) ─────────────────────────────────
// Image-to-video models that accept first_frame_image
const MODELS = [
  {
    id: 'minimax/video-01-live',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      first_frame_image: imageUrl,
      prompt_optimizer: true,
    }),
  },
  {
    id: 'luma/ray',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      start_image_url: imageUrl,
    }),
  },
  {
    id: 'tencent/hunyuan-video',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image: imageUrl,
      width: 720,
      height: 1280,
    }),
  },
];

// ── Utilities ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractUrl(output) {
  if (typeof output === 'string') return output;
  if (output instanceof URL) return output.href;
  if (output && typeof output === 'object' && !(output instanceof Array)) {
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

async function downloadToFile(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(filepath, buffer);
  return buffer.length;
}

// ── Upload local screenshot to a temporary server ──────────────
async function resolveScreenshotUrl(replicate) {
  // If URL provided directly, use it
  if (SCREENSHOT_URL) {
    console.log(`[promo] Using provided screenshot URL: ${SCREENSHOT_URL}`);
    return SCREENSHOT_URL;
  }

  // If local file provided, upload to Replicate's file hosting
  if (SCREENSHOT_PATH) {
    if (!existsSync(SCREENSHOT_PATH)) {
      console.error(`[promo] Screenshot file not found: ${SCREENSHOT_PATH}`);
      process.exit(1);
    }
    console.log(`[promo] Uploading local screenshot: ${SCREENSHOT_PATH}`);
    const fileData = await readFile(SCREENSHOT_PATH);
    const blob = new Blob([fileData], { type: 'image/png' });
    // Use Replicate's file upload API
    const formData = new FormData();
    formData.append('content', blob, 'screenshot.png');
    formData.append('content_type', 'image/png');

    const uploadResp = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${replicate.auth}` },
      body: formData,
    });
    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error(`[promo] File upload failed: ${uploadResp.status} — ${errText}`);
      process.exit(1);
    }
    const uploadJson = await uploadResp.json();
    const url = uploadJson.urls?.get || uploadJson.url;
    console.log(`[promo] Uploaded screenshot → ${url}`);
    return url;
  }

  // Default: use the live production site screenshot from a public screenshot service
  // For production, place a high-quality screenshot at public/media/promo/screenshot.png
  const localScreenshot = resolve(__dirname, '..', 'public', 'media', 'promo', 'screenshot.png');
  if (existsSync(localScreenshot)) {
    console.log(`[promo] Found local screenshot at ${localScreenshot}`);
    const fileData = await readFile(localScreenshot);
    const blob = new Blob([fileData], { type: 'image/png' });
    const formData = new FormData();
    formData.append('content', blob, 'screenshot.png');
    formData.append('content_type', 'image/png');

    const uploadResp = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${replicate.auth}` },
      body: formData,
    });
    if (!uploadResp.ok) {
      console.error(`[promo] File upload failed: ${uploadResp.status}`);
      process.exit(1);
    }
    const uploadJson = await uploadResp.json();
    return uploadJson.urls?.get || uploadJson.url;
  }

  console.error(`[promo] No screenshot source provided.`);
  console.error(`[promo] Please provide one of:`);
  console.error(`  --url <image-url>              Direct URL to a screenshot`);
  console.error(`  --screenshot <path>            Local PNG/JPG file`);
  console.error(`  public/media/promo/screenshot.png   Auto-detected local file`);
  process.exit(1);
}

// ── Generate one phase ─────────────────────────────────────────
async function generatePhase(replicate, phaseName, phaseConfig, screenshotUrl) {
  const outputPath = resolve(OUTPUT_DIR, phaseConfig.file);
  console.log(`\n[promo] ═══ Phase: ${phaseName.toUpperCase()} ═══`);
  console.log(`[promo] Prompt: ${phaseConfig.prompt.slice(0, 100)}...`);

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[promo] Retry ${attempt} for ${model.id}...`);
          await sleep(10000);
        }
        console.log(`[promo] Model: ${model.id}`);
        const input = model.buildInput(phaseConfig.prompt, screenshotUrl);
        const output = await replicate.run(model.id, { input });

        // Check for async iterator (stream)
        if (output && typeof output[Symbol.asyncIterator] === 'function') {
          console.log(`[promo] Receiving stream...`);
          const chunks = [];
          for await (const chunk of output) chunks.push(chunk);
          const buffer = Buffer.concat(chunks);
          await writeFile(outputPath, buffer);
          console.log(`[promo] ✓ Saved ${phaseName}: ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
          return outputPath;
        }

        const videoUrl = extractUrl(output);
        if (!videoUrl) {
          console.warn(`[promo] No URL from ${model.id} output:`, String(output).slice(0, 200));
          break;
        }

        console.log(`[promo] Generated URL: ${videoUrl}`);
        const size = await downloadToFile(videoUrl, outputPath);
        console.log(`[promo] ✓ Saved ${phaseName}: ${outputPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        return outputPath;
      } catch (err) {
        const msg = err.message || String(err);
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('throttled')) {
          console.warn(`[promo] Rate limited on ${model.id}, retrying...`);
          await sleep(15000);
          continue;
        }
        console.warn(`[promo] ${model.id} failed for ${phaseName}: ${msg}`);
        break;
      }
    }
  }

  console.error(`[promo] ✗ All models failed for phase: ${phaseName}`);
  return null;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error('[promo] ERROR: Set REPLICATE_API_TOKEN environment variable');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log('[promo] ╔══════════════════════════════════════════════╗');
  console.log('[promo] ║  MyAvatar.ge Promotional Video Generator    ║');
  console.log('[promo] ╚══════════════════════════════════════════════╝');

  const screenshotUrl = await resolveScreenshotUrl(replicate);
  console.log(`[promo] Screenshot source: ${screenshotUrl}`);

  // Determine which phases to generate
  const phasesToRun = PHASE_FILTER
    ? { [PHASE_FILTER]: PHASES[PHASE_FILTER] }
    : PHASES;

  if (PHASE_FILTER && !PHASES[PHASE_FILTER]) {
    console.error(`[promo] Unknown phase: ${PHASE_FILTER}. Choose: intro, avatar, brand`);
    process.exit(1);
  }

  const results = {};
  for (const [name, config] of Object.entries(phasesToRun)) {
    results[name] = await generatePhase(replicate, name, config, screenshotUrl);
  }

  // Summary
  console.log('\n[promo] ═══════════════════════════════════════════');
  console.log('[promo] RESULTS:');
  for (const [name, path] of Object.entries(results)) {
    console.log(`[promo]   ${name}: ${path ? '✓ ' + path : '✗ Failed'}`);
  }

  const successCount = Object.values(results).filter(Boolean).length;
  if (successCount === 0) {
    console.error('[promo] No phases generated successfully.');
    process.exit(1);
  }

  // If we have at least the intro phase, copy it as the main promo video
  const mainPromo = results.intro || Object.values(results).find(Boolean);
  if (mainPromo) {
    const finalPath = resolve(OUTPUT_DIR, 'myavatar-promo-ad.mp4');
    const data = await readFile(mainPromo);
    await writeFile(finalPath, data);
    console.log(`\n[promo] Main promo video: ${finalPath}`);
  }

  console.log(`[promo] Done! ${successCount}/${Object.keys(phasesToRun).length} phases generated.`);
}

main().catch((err) => {
  console.error('[promo] Fatal error:', err);
  process.exit(1);
});
