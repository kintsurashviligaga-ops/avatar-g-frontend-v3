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

  // Use minimax/video-01-live — high-quality video generation model
  // Falls back to other models if unavailable
  const models = [
    { id: 'minimax/video-01-live', input: { prompt: PROMPT, prompt_optimizer: true } },
    { id: 'luma/ray', input: { prompt: PROMPT } },
  ];

  let output = null;
  for (const model of models) {
    try {
      console.log(`[hero-video] Trying model: ${model.id}`);
      output = await replicate.run(model.id, { input: model.input });
      if (output) break;
    } catch (err) {
      console.warn(`[hero-video] Model ${model.id} failed: ${err.message}`);
    }
  }

  if (!output) {
    console.error('[hero-video] All models failed. Please check your Replicate account and API token.');
    process.exit(1);
  }

  // Replicate returns either a URL string or an object with .url
  const videoUrl = typeof output === 'string' ? output : (output.url || output[0]);
  if (!videoUrl) {
    console.error('[hero-video] No video URL in output:', output);
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
