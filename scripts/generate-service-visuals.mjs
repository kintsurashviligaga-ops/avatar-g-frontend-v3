#!/usr/bin/env node
/**
 * Generate photorealistic service card visuals via Replicate (FLUX Schnell).
 *
 * Usage:
 *   node scripts/generate-service-visuals.mjs           # reads .env.local
 *   REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-visuals.mjs
 *
 * Outputs 16:9 WebP images to  public/services/<slug>.webp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'services');

/* ── Load .env.local if no REPLICATE_API_TOKEN in env ─────────────────── */
if (!process.env.REPLICATE_API_TOKEN) {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/);
      if (m) process.env[m[1]] = m[2];
    }
  }
}

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error('❌  REPLICATE_API_TOKEN not found in env or .env.local.\n   Set it in .env.local or pass it: REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-visuals.mjs');
  process.exit(1);
}

/* Model — FLUX Schnell (fast, 4-step, high quality) */
const MODEL_VERSION = 'black-forest-labs/flux-schnell';

/**
 * Premium style suffix applied to every prompt for visual cohesion.
 * Ensures all service visuals share a consistent cinematic dark-mode aesthetic.
 */
const STYLE_SUFFIX = ', photorealistic, ultra-detailed 8K, cinematic volumetric lighting, dark premium environment, shallow depth of field, professional commercial photography, moody atmospheric lighting, premium technology aesthetic';

const SERVICES = [
  {
    slug: 'avatar',
    prompt: 'A photorealistic AI human identity studio: a glowing holographic human face forming from digital particles in a dark high-tech lab, facial recognition scan grid overlay, blue-violet neon edge lighting on the face, identity verification points highlighted, premium biometric workspace' + STYLE_SUFFIX,
  },
  {
    slug: 'image',
    prompt: 'A premium AI image creation workspace: a designer at a floating holographic canvas generating vivid artwork, multiple finished AI art pieces displayed on transparent screens around them, magenta and pink neon accents, creative studio with brush-stroke particle effects' + STYLE_SUFFIX,
  },
  {
    slug: 'video',
    prompt: 'A cinematic AI video production studio: floating transparent timeline with video frames being assembled, film camera rig in foreground, cinematic color grading preview on a large monitor, clapperboard visible, blue neon highlights, Hollywood-grade production environment' + STYLE_SUFFIX,
  },
  {
    slug: 'music',
    prompt: 'A premium AI music production studio: professional mixing console with illuminated faders, studio monitors on stands, audio waveforms glowing on a large display, headphones resting on the console, purple and violet ambient lighting, warm acoustic panels on walls' + STYLE_SUFFIX,
  },
  {
    slug: 'text',
    prompt: 'A sophisticated AI writing workspace: an elegant dark text editor on a large curved monitor showing structured document with highlighted AI suggestions, fountain pen beside a leather notebook, emerald green accent lighting, clean minimalist desk setup' + STYLE_SUFFIX,
  },
  {
    slug: 'editing',
    prompt: 'A professional video post-production suite: dual ultrawide monitors showing colour grading wheels and timeline tracks, video preview of cinematic footage, Blackmagic control surface on desk, teal and cyan accent lighting, dark editing bay' + STYLE_SUFFIX,
  },
  {
    slug: 'photo',
    prompt: 'A high-end photography studio: professional DSLR on a tripod with a large softbox and beauty dish creating dramatic lighting, fashion subject silhouette, tethered shooting setup with retouching preview on monitor, silver and platinum tones, editorial shoot atmosphere' + STYLE_SUFFIX,
  },
  {
    slug: 'visual-intel',
    prompt: 'An AI visual intelligence analysis dashboard: photorealistic images displayed on screens with AI detection bounding boxes, object recognition labels, quality assessment heat maps, data classification metrics, cyan and turquoise accent lighting, clean analytical workspace' + STYLE_SUFFIX,
  },
  {
    slug: 'prompt',
    prompt: 'A premium AI prompt engineering interface: modular instruction blocks arranged as glowing cards on a structured layout board, optimization scores displayed, A/B test results visible, amber and gold accent lighting, command-line terminal in background, systematic workspace' + STYLE_SUFFIX,
  },
  {
    slug: 'media',
    prompt: 'A multi-format content production command center: three monitors showing video editing, image gallery, and audio waveform simultaneously, social media preview cards floating, content calendar visible, indigo and royal blue accents, modern production desk' + STYLE_SUFFIX,
  },
  {
    slug: 'workflow',
    prompt: 'A visual automation pipeline dashboard: connected glowing workflow nodes forming a directed graph, data particles flowing along edges between process steps, input-output indicators, pipeline status monitors, indigo and purple neon accents, orchestration control panel' + STYLE_SUFFIX,
  },
  {
    slug: 'agent-g',
    prompt: 'A futuristic AI orchestration control center: a central glowing neural intelligence core with radial holographic connections branching to surrounding system dashboards, real-time task routing visualization, deep violet and electric purple lighting, brain-of-the-platform feel, premium sci-fi command room' + STYLE_SUFFIX,
  },
  {
    slug: 'business',
    prompt: 'A premium executive analytics dashboard: sleek glass desk with multiple screens showing KPI charts, revenue graphs, strategic heatmaps, and competitive analysis panels, dark premium office with city skyline through floor-to-ceiling windows, indigo accent lighting' + STYLE_SUFFIX,
  },
  {
    slug: 'shop',
    prompt: 'A premium AI-powered digital storefront: holographic product displays arranged in a luxury retail space, floating product cards with prices, modern e-commerce checkout interface on a large screen, rose and coral accent lighting, upscale shopping technology' + STYLE_SUFFIX,
  },
  {
    slug: 'software',
    prompt: 'A premium AI software development environment: elegant code editor with syntax-highlighted code on an ultrawide monitor, software architecture diagram on a secondary screen, terminal running build process, emerald green accent lighting, modern developer desk setup' + STYLE_SUFFIX,
  },
  {
    slug: 'tourism',
    prompt: 'A smart AI travel planning interface: interactive holographic globe with flight paths, destination preview cards floating around it showing luxury hotels and landmarks, itinerary timeline visible, teal and turquoise accent lighting, premium travel concierge desk' + STYLE_SUFFIX,
  },
  {
    slug: 'next',
    prompt: 'A sleek modular expansion concept: abstract premium geometric blocks arranged to suggest extensibility and growth potential, puzzle-piece architecture with glowing connection points, futuristic platform module dock, neutral gray and silver accents' + STYLE_SUFFIX,
  },
];

/* ── Replicate API helpers ───────────────────────────────────────────────── */

const API = 'https://api.replicate.com/v1';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function createPrediction(prompt, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${API}/models/${MODEL_VERSION}/predictions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: '16:9',
          output_format: 'webp',
          output_quality: 90,
          num_inference_steps: 4,
        },
      }),
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < retries) {
      const body = await res.json().catch(() => ({}));
      const wait = Math.max((body.retry_after || 12) * 1000, 12000);
      console.log(`      ⏱  Rate limited, waiting ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})...`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Create failed ${res.status}: ${await res.text()}`);
  }
}

async function pollUntilDone(url, maxWait = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled')
      throw new Error(`Prediction ${data.status}: ${data.error || 'unknown'}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timed out waiting for prediction');
}

async function downloadImage(imageUrl, dest) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

/* ── Main ────────────────────────────────────────────────────────────── */

async function main() {
  const force = process.argv.includes('--force');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n🎨  Generating ${SERVICES.length} service visuals → ${OUT_DIR}`);
  if (force) console.log('   --force flag set, regenerating all images');
  console.log();

  let success = 0;
  let failed = 0;

  // Process one at a time to respect low-credit rate limits (burst = 1)
  for (const svc of SERVICES) {
    const dest = path.join(OUT_DIR, `${svc.slug}.webp`);
    if (!force && fs.existsSync(dest)) {
      console.log(`  ⏭  ${svc.slug} — already exists, skipping`);
      success++;
      continue;
    }
    try {
      console.log(`  ⏳ ${svc.slug} — generating...`);
      const prediction = await createPrediction(svc.prompt);
      const completed = await pollUntilDone(prediction.urls.get);
      const outputUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output;
      await downloadImage(outputUrl, dest);
      const sizeKB = Math.round(fs.statSync(dest).size / 1024);
      console.log(`  ✅ ${svc.slug} — saved (${sizeKB} KB)`);
      success++;
      // Wait 12s between requests to avoid rate limiting
      await sleep(12000);
    } catch (err) {
      console.error(`  ❌ ${svc.slug} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🏁  Done! ${success} succeeded, ${failed} failed.\n`);
}

main();
