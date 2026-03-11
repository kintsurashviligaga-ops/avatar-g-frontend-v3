#!/usr/bin/env node
/**
 * Generate photorealistic service card visuals via Replicate (FLUX Schnell).
 *
 * Usage:
 *   REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-visuals.mjs
 *
 * Outputs 16:9 WebP images to  public/services/<slug>.webp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'services');

const TOKEN = process.env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error('❌  Set REPLICATE_API_TOKEN in env.\n   REPLICATE_API_TOKEN=r8_xxx node scripts/generate-service-visuals.mjs');
  process.exit(1);
}

/* Model — FLUX Schnell (fast, cheap, high quality) */
const MODEL_VERSION = 'black-forest-labs/flux-schnell';

const SERVICES = [
  {
    slug: 'avatar',
    prompt: 'Ultra realistic cinematic scene: a photorealistic human avatar forming from glowing holographic particles in a futuristic dark studio, blue-violet neon edge lighting, facial scan points visible, identity creation technology, professional photography, 8k, dramatic volumetric lighting, deep space blue and electric cyan color palette',
  },
  {
    slug: 'image',
    prompt: 'Ultra realistic cinematic scene: a digital artist controlling AI image creation on large floating holographic screens in a dark futuristic workspace, vibrant generated artworks displayed, neon pink and magenta accents, creative AI technology, professional photography, 8k, dramatic lighting, studio environment',
  },
  {
    slug: 'video',
    prompt: 'Ultra realistic cinematic scene: AI editing cinematic video frames on floating transparent timeline screens in a dark high-tech studio, film reels and video frames arranged holographically, blue neon lighting, professional video production, 8k, dramatic volumetric lighting, movie production feel',
  },
  {
    slug: 'music',
    prompt: 'Ultra realistic cinematic scene: a professional studio microphone surrounded by glowing AI-generated sound waveforms and digital music instruments, holographic equalizer bars, purple and violet neon lighting, music production studio, 8k, dramatic lighting, audiophile atmosphere',
  },
  {
    slug: 'text',
    prompt: 'Ultra realistic cinematic scene: an elegant AI writing interface with flowing luminous text being generated on a transparent holographic display, structured document with highlighted AI suggestions, green and emerald accents, dark workspace, 8k, dramatic lighting',
  },
  {
    slug: 'editing',
    prompt: 'Ultra realistic cinematic scene: professional video post-production suite with multiple holographic timeline screens, colour grading wheels floating in air, video frames being assembled by AI, teal and cyan lighting, dark studio, 8k, dramatic lighting',
  },
  {
    slug: 'photo',
    prompt: 'Ultra realistic cinematic scene: a high-end photography studio with AI-enhanced camera system, softbox lights creating dramatic lighting on a fashion subject, floating retouching interface, silver and platinum tones, dark environment, 8k, professional studio photography',
  },
  {
    slug: 'visual-intel',
    prompt: 'Ultra realistic cinematic scene: AI visual intelligence system analyzing images with glowing detection boxes and recognition markers floating over photographs, data extraction visualization, cyan and turquoise accents, dark analytics workspace, 8k, dramatic lighting',
  },
  {
    slug: 'prompt',
    prompt: 'Ultra realistic cinematic scene: a sophisticated prompt engineering interface with modular glowing instruction blocks arranged in a structured holographic layout, optimization metrics displayed, amber and gold accents, dark workspace, 8k, dramatic lighting',
  },
  {
    slug: 'media',
    prompt: 'Ultra realistic cinematic scene: a multi-format content production command center with multiple floating screens showing video, images, audio waveforms, and text simultaneously, indigo and blue accents, dark futuristic workspace, 8k, dramatic lighting',
  },
  {
    slug: 'workflow',
    prompt: 'Ultra realistic cinematic scene: a visual workflow automation dashboard with connected glowing nodes forming a pipeline, data flowing between steps shown as light particles, indigo and purple accents, dark futuristic interface, 8k, dramatic lighting',
  },
  {
    slug: 'agent-g',
    prompt: 'Ultra realistic cinematic scene: an AI command center with a central glowing intelligence core, radial holographic connections to surrounding system dashboards, orchestration visualization, deep violet and electric purple, futuristic control room, 8k, dramatic volumetric lighting',
  },
  {
    slug: 'business',
    prompt: 'Ultra realistic cinematic scene: AI business analytics dashboards floating around a sleek laptop, executive KPI panels with glowing charts and strategic data visualizations, indigo and blue accents, dark premium office, 8k, dramatic lighting',
  },
  {
    slug: 'shop',
    prompt: 'Ultra realistic cinematic scene: an AI-powered digital storefront with holographic product displays floating in a premium dark space, modern e-commerce interface, rose and coral accents, luxury retail technology, 8k, dramatic lighting',
  },
  {
    slug: 'software',
    prompt: 'Ultra realistic cinematic scene: an AI software development environment with holographic code editor, syntax-highlighted code floating in 3D space, architecture diagrams, emerald and green accents, dark developer workspace, 8k, dramatic lighting',
  },
  {
    slug: 'tourism',
    prompt: 'Ultra realistic cinematic scene: an AI travel planning interface with holographic globe, destination previews floating as cards, interactive maps with route visualization, teal and turquoise accents, dark futuristic interface, 8k, dramatic lighting',
  },
];

/* ── Replicate API helpers ───────────────────────────────────────────────── */

const API = 'https://api.replicate.com/v1';
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function createPrediction(prompt) {
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
  if (!res.ok) throw new Error(`Create failed ${res.status}: ${await res.text()}`);
  return res.json();
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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n🎨  Generating ${SERVICES.length} service visuals → ${OUT_DIR}\n`);

  // Process 2 at a time to stay within rate limits
  for (let i = 0; i < SERVICES.length; i += 2) {
    const batch = SERVICES.slice(i, i + 2);
    await Promise.all(
      batch.map(async (svc) => {
        const dest = path.join(OUT_DIR, `${svc.slug}.webp`);
        if (fs.existsSync(dest)) {
          console.log(`  ⏭  ${svc.slug} — already exists, skipping`);
          return;
        }
        try {
          console.log(`  ⏳ ${svc.slug} — generating...`);
          const prediction = await createPrediction(svc.prompt);
          const completed = await pollUntilDone(prediction.urls.get);
          const outputUrl = Array.isArray(completed.output) ? completed.output[0] : completed.output;
          await downloadImage(outputUrl, dest);
          console.log(`  ✅ ${svc.slug} — saved`);
        } catch (err) {
          console.error(`  ❌ ${svc.slug} — ${err.message}`);
        }
      })
    );
  }

  console.log('\n🏁  Done!\n');
}

main();
