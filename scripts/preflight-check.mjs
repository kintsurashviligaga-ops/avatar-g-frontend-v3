#!/usr/bin/env node
/**
 * Phase 1 — Pre-flight environment & API-key validation sweep.
 *
 * Run:  node scripts/preflight-check.mjs
 *
 * Reads process.env (Vercel injects production secrets; locally it reads
 * .env.local if you `export $(grep -v '^#' .env.local | xargs)` first or
 * run via `dotenv`). For each missing key it prints an explicit alert
 * block with the exact retrieval URL. Exit code is 0 when every REQUIRED
 * key is present, 1 otherwise — so it can gate a deploy in CI.
 */

const REQUIRED = [
  // Core platform — the app genuinely cannot run without these.
  { key: 'NEXT_PUBLIC_SUPABASE_URL',       url: 'https://supabase.com/dashboard',                              label: 'Supabase Project URL',          tier: 'required' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',  url: 'https://supabase.com/dashboard',                              label: 'Supabase Anon Key',             tier: 'required' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',      url: 'https://supabase.com/dashboard',                              label: 'Supabase Service Role',         tier: 'required' },
  { key: 'GEMINI_API_KEY',                 url: 'https://aistudio.google.com/app/apikey',                      label: 'Google Gemini (primary chat)',  tier: 'required' },
  { key: 'ANTHROPIC_API_KEY',              url: 'https://console.anthropic.com/settings/keys',                 label: 'Claude (App Builder + fallback)', tier: 'required' },
];

const MEDIA_AGENTS = [
  { key: 'ELEVENLABS_API_KEY',  url: 'https://elevenlabs.io/app/settings/api-keys',     label: 'ElevenLabs (voice / TTS)' },
  { key: 'HEYGEN_API_KEY',      url: 'https://beta.heygen.com/settings?nav=API',        label: 'HeyGen (avatar)' },
  { key: 'REPLICATE_API_TOKEN', url: 'https://replicate.com/account/api-tokens',        label: 'Replicate (image / video / music providers)' },
  { key: 'UDIO_API_KEY',        url: 'https://www.udio.com/api-tokens',                 label: 'Udio (music)' },
  { key: 'LUMA_API_KEY',        url: 'https://lumalabs.ai/dream-machine/api',           label: 'Luma Dream Machine (video)' },
  { key: 'RUNWAY_API_KEY',      url: 'https://dashboard.runwayml.com/developer',        label: 'Runway Gen-3 (video)' },
  { key: 'PIKA_API_KEY',        url: 'https://pika.art/api-management',                 label: 'Pika Labs (animation)' },
  { key: 'NANOBANANA_API_KEY',  url: 'https://nanobanana.com/developer',                label: 'Nanobanana (face enhance)' },
  { key: 'OPENAI_API_KEY',      url: 'https://platform.openai.com/api-keys',            label: 'OpenAI (fallback / embeddings)' },
];

const INFRA = [
  { key: 'REDIS_URL',                      url: 'https://upstash.com/',                                        label: 'Upstash Redis (idempotency / rate-limit)' },
  { key: 'UPSTASH_REDIS_REST_URL',         url: 'https://upstash.com/',                                        label: 'Upstash Redis REST URL' },
  { key: 'UPSTASH_REDIS_REST_TOKEN',       url: 'https://upstash.com/',                                        label: 'Upstash Redis REST Token' },
  { key: 'STRIPE_SECRET_KEY',              url: 'https://dashboard.stripe.com/apikeys',                        label: 'Stripe (billing)' },
  { key: 'SENTRY_DSN',                     url: 'https://sentry.io/settings/projects/',                        label: 'Sentry (error monitoring)' },
];

// Keys the brief lists but which require infrastructure NOT present in this
// Vercel deploy. Surfaced as informational so the operator understands they
// are out-of-scope for the current architecture, not silently ignored.
const OUT_OF_SCOPE = [
  { key: 'KAFKA_BROKERS',                 reason: 'No Kafka cluster; the repo uses a Supabase job queue (workers/) instead.' },
  { key: 'GOOGLE_APPLICATION_CREDENTIALS', reason: 'No GCS bucket; the repo uses Supabase Storage + Cloudflare R2.' },
  { key: 'AZURE_COGNITIVE_SECRET',         reason: 'No Azure Cognitive integration wired.' },
  { key: 'FIGMA_ACCESS_TOKEN',             reason: 'Figma layout agent not part of the live pipeline.' },
];

const has = (k) => Boolean(String(process.env[k] ?? '').trim());

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function line(ch = '─', n = 64) { return ch.repeat(n); }

function section(title) {
  console.log(`\n${C.bold}${title}${C.reset}`);
  console.log(C.dim + line() + C.reset);
}

function report(list, { alertOnMissing }) {
  let missing = 0;
  for (const { key, url, label } of list) {
    if (has(key)) {
      console.log(`  ${C.green}✓${C.reset} ${key.padEnd(34)} ${C.dim}${label}${C.reset}`);
    } else {
      missing++;
      if (alertOnMissing) {
        console.log(`  ${C.red}✗ ${key}${C.reset} ${C.dim}${label}${C.reset}`);
        console.log(`    ${C.yellow}↳ retrieve:${C.reset} ${C.cyan}${url}${C.reset}`);
      } else {
        console.log(`  ${C.yellow}○${C.reset} ${key.padEnd(34)} ${C.dim}${label} — optional, get at ${url}${C.reset}`);
      }
    }
  }
  return missing;
}

console.log(`\n${C.bold}MyAvatar.ge — Pre-flight Environment Sweep${C.reset}`);
console.log(C.dim + `node ${process.version} · ${new Date().toISOString()}` + C.reset);

section('REQUIRED — app will not boot without these');
const missingRequired = report(REQUIRED, { alertOnMissing: true });

section('MEDIA AGENTS — each unlocks one specialist');
const missingMedia = report(MEDIA_AGENTS, { alertOnMissing: false });

section('INFRASTRUCTURE — caching, billing, monitoring');
const missingInfra = report(INFRA, { alertOnMissing: false });

section('OUT OF SCOPE for this Vercel architecture (informational)');
for (const { key, reason } of OUT_OF_SCOPE) {
  console.log(`  ${C.dim}· ${key.padEnd(30)} ${reason}${C.reset}`);
}

section('SUMMARY');
console.log(`  Required present : ${REQUIRED.length - missingRequired}/${REQUIRED.length}`);
console.log(`  Media agents     : ${MEDIA_AGENTS.length - missingMedia}/${MEDIA_AGENTS.length} configured`);
console.log(`  Infrastructure   : ${INFRA.length - missingInfra}/${INFRA.length} configured`);

if (missingRequired > 0) {
  console.log(`\n${C.red}${C.bold}✗ PRE-FLIGHT FAILED${C.reset} — ${missingRequired} required key(s) missing. Fix the alert blocks above before deploy.\n`);
  process.exit(1);
}
console.log(`\n${C.green}${C.bold}✓ PRE-FLIGHT PASSED${C.reset} — all required keys present.${missingMedia ? ` ${missingMedia} media agent(s) will degrade gracefully.` : ''}\n`);
process.exit(0);
