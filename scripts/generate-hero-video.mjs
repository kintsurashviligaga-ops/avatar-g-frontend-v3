#!/usr/bin/env node
/**
 * scripts/generate-hero-video.mjs
 * ================================
 * Generates the MyAvatar.ge cinematic hero video using Replicate API.
 *
 * Usage:
 *   REPLICATE_API_TOKEN=r8_xxx node scripts/generate-hero-video.mjs
 *
 * The script will:
 *   1. Submit a video generation job to Replicate
 *   2. Poll until complete
 *   3. Download the MP4 to public/media/landing/myavatar-hero-video.mp4
 */

import Replicate from 'replicate';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '..', 'public', 'media', 'landing');
const VIDEO_PATH = resolve(OUTPUT_DIR, 'myavatar-hero-video.mp4');

const PROMPT = `Create a 30-second cinematic commercial for an AI platform called "MyAvatar".

Style: photorealistic, cinematic, futuristic AI technology commercial.

Visual tone: dark modern UI, deep black background, soft blue and violet glow, futuristic digital environment, premium SaaS interface.

The video must clearly explain how the platform works and how easy it is to use.

Scene 1 (0-2s): Logo intro. The MyAvatar logo appears in a dark cinematic environment with soft glow reveal animation. Text: "MyAvatar.ge — AI Creation Platform".

Scene 2 (2-6s): The MyAvatar platform interface fades in. A user opens the AI chat. Text overlay: "Talk to Agent G".

Scene 3 (6-10s): User types a prompt: "Create a TikTok video with my avatar". Agent G analyzes the request.

Scene 4 (10-14s): Multiple AI agents appear connected in a digital network — Avatar Agent, Video Agent, Music Agent, Subtitle Agent. Text overlay: "Multi-Agent AI System".

Scene 5 (14-18s): Avatar Builder interface appears. A photorealistic avatar is generated, rotating slowly. Text overlay: "Create Your Avatar".

Scene 6 (18-22s): The avatar appears inside a video creation interface. Music and subtitles appear automatically. Text overlay: "Generate Content Instantly".

Scene 7 (22-26s): Camera zooms out showing the full platform ecosystem — Avatar, Video, Poster, Music, Store, Business Tools, AI Workflows connected. Text overlay: "All AI Tools In One Platform".

Scene 8 (26-28s): Agent G suggests next actions. The user clicks one button and automation continues. Text overlay: "Powered by Agent G".

Scene 9 (28-30s): Final montage — avatar video, poster, music, subtitles. Platform fades out. Logo appears again. Final text: "Create Anything With AI — MyAvatar.ge".

Camera style: smooth cinematic zooms, clean UI transitions. Lighting: soft futuristic blue highlights. Quality: ultra realistic, premium technology commercial.`;

async function main() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error('ERROR: Set REPLICATE_API_TOKEN environment variable');
    process.exit(1);
  }

  const replicate = new Replicate({ auth: token });

  console.log('[hero-video] Starting video generation on Replicate...');
  console.log('[hero-video] This may take several minutes.\n');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Models to try, in order — text-to-video models that don't require image input
  const models = [
    {
      id: 'luma/ray',
      input: { prompt: PROMPT },
    },
    {
      id: 'minimax/video-01',
      input: { prompt: PROMPT, prompt_optimizer: true },
    },
    {
      id: 'tencent/hunyuan-video',
      input: { prompt: PROMPT, width: 1280, height: 720 },
    },
  ];

  let output = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[hero-video] Retry ${attempt} for ${model.id} (waiting 15s)...`);
          await sleep(15000);
        }
        console.log(`[hero-video] Trying model: ${model.id}`);
        output = await replicate.run(model.id, { input: model.input });
        if (output) break;
      } catch (err) {
        const msg = err.message || String(err);
        if (msg.includes('429') || msg.includes('rate limit') || msg.includes('throttled')) {
          console.warn(`[hero-video] Rate limited on ${model.id}, will retry...`);
          continue;
        }
        console.warn(`[hero-video] Model ${model.id} failed: ${msg}`);
        break; // Non-retryable error, skip to next model
      }
    }
    if (output) break;
  }

  if (!output) {
    console.error('[hero-video] All models failed. Please check your Replicate account and API token.');
    process.exit(1);
  }

  // Replicate returns either a URL string, FileOutput object, ReadableStream, or an array
  let videoUrl;
  if (typeof output === 'string') {
    videoUrl = output;
  } else if (output instanceof URL) {
    videoUrl = output.href;
  } else if (output && typeof output.url === 'function') {
    // Replicate FileOutput — has .url() method
    videoUrl = output.url().href || output.url().toString();
  } else if (output && typeof output.url === 'string') {
    videoUrl = output.url;
  } else if (output && typeof output.toString === 'function' && output.toString().startsWith('http')) {
    videoUrl = output.toString();
  } else if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === 'string') videoUrl = first;
    else if (first instanceof URL) videoUrl = first.href;
    else if (first && typeof first.url === 'function') videoUrl = first.url().href;
    else if (first && typeof first.url === 'string') videoUrl = first.url;
    else if (first && typeof first.toString === 'function' && first.toString().startsWith('http')) videoUrl = first.toString();
  }

  if (!videoUrl) {
    // Some models return a ReadableStream — save directly
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
      console.log('[hero-video] Receiving stream output...');
      await mkdir(OUTPUT_DIR, { recursive: true });
      const chunks = [];
      for await (const chunk of output) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      await writeFile(VIDEO_PATH, buffer);
      console.log(`[hero-video] Saved: ${VIDEO_PATH}`);
      console.log(`[hero-video] Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log('[hero-video] Done!');
      process.exit(0);
    }
    console.error('[hero-video] No video URL in output:', JSON.stringify(output).slice(0, 500));
    process.exit(1);
  }

  console.log(`[hero-video] Video generated: ${videoUrl}`);
  console.log('[hero-video] Downloading...');

  const response = await fetch(videoUrl);
  if (!response.ok) {
    console.error(`[hero-video] Download failed: ${response.status}`);
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(VIDEO_PATH, buffer);

  console.log(`[hero-video] Saved: ${VIDEO_PATH}`);
  console.log(`[hero-video] Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log('[hero-video] Done!');
}

main().catch(err => {
  console.error('[hero-video] Fatal error:', err);
  process.exit(1);
});
