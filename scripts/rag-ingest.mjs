#!/usr/bin/env node
/**
 * RAG corpus ingestion CLI.
 *
 *   gcloud auth login   # once; your identity needs aiplatform.endpoints.predict on the project
 *   GCP_PROJECT_ID=… [GCP_LOCATION=us-central1] SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/rag-ingest.mjs ./corpus [--lang ka] [--reset] [--chunk 1500] [--overlap 200]
 *
 * Reads every .txt / .md file under <dir> (recursively), splits each into
 * overlapping chunks, embeds them with gemini-embedding-001 @ 1536-d on Vertex AI
 * (mirrors lib/memory/embed.ts; Google only, v5.1 M-14), and inserts the rows into
 * public.rag_documents via the service-role key, marked embedding_model = gemini-embedding-001@1536.
 *
 * Apply the schema first:  node scripts/apply-rag-migration.mjs, then
 * supabase/migrations/20261113a_embedding_model.sql (the embedding_model column).
 * Paid: one Vertex embed call per chunk (a fraction of a cent per thousand).
 *
 * --reset   delete existing rows for each ingested source before re-inserting.
 *
 * Secrets come ONLY from your environment (or .env.local) — never the repo.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m' };

function fail(msg) {
  console.error(`\n${C.red}${C.bold}✗ ${msg}${C.reset}\n`);
  process.exit(1);
}

// ── Minimal .env.local loader (so the CLI is convenient locally) ─────────────
function loadDotEnv() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const getFlag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
};
const reset = args.includes('--reset');
const lang = getFlag('lang', 'ka');
const chunkSize = Math.max(200, parseInt(getFlag('chunk', '1500'), 10) || 1500);
const overlap = Math.min(Math.floor(chunkSize / 2), Math.max(0, parseInt(getFlag('overlap', '200'), 10) || 0));

if (!dir) fail('usage: node scripts/rag-ingest.mjs <dir> [--lang ka] [--reset] [--chunk 1500] [--overlap 200]');
if (!existsSync(dir)) fail(`directory not found: ${dir}`);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 1536;
const EMBEDDING_MODEL_TAG = `${EMBED_MODEL}@${EMBED_DIM}`;
const GCP_PROJECT = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
const GCP_LOCATION = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(GCP_PROJECT)) fail('GCP_PROJECT_ID (your Google Cloud project id) is required.');
if (!/^[a-z0-9-]+$/.test(GCP_LOCATION)) fail('GCP_LOCATION must be a Vertex region such as us-central1 (or global).');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Chunker (mirrors lib/rag/chunk.ts) ───────────────────────────────────────
function chunkText(text) {
  const clean = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const units = clean.split(/\n{2,}/).map((u) => u.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const flush = () => { const c = current.trim(); if (c) chunks.push(c); current = ''; };
  for (const unit of units) {
    if (unit.length > chunkSize) {
      flush();
      const step = Math.max(1, chunkSize - overlap);
      for (let i = 0; i < unit.length; i += step) {
        const slice = unit.slice(i, i + chunkSize).trim();
        if (slice) chunks.push(slice);
        if (i + chunkSize >= unit.length) break;
      }
      continue;
    }
    if (current && current.length + 2 + unit.length > chunkSize) flush();
    current = current ? `${current}\n\n${unit}` : unit;
  }
  flush();
  return chunks;
}

// ── Embedding: gemini-embedding-001 @ 1536 on Vertex AI only (mirrors lib/memory/embed.ts) ──────────────────
// The bearer comes from `gcloud auth print-access-token` (your own signed-in identity), sent in a header, never a URL,
// never printed. No Developer API key and no OpenAI: rows must share the embedding space the chat queries with.
function gcloudToken() {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!/^[A-Za-z0-9._-]{20,}$/.test(token)) fail('gcloud gave no access token (run `gcloud auth login` first).');
  return token;
}
let token = null;
let tokenAt = 0;
function bearer() {
  // Access tokens last about an hour; a long corpus run refreshes every 45 minutes.
  if (!token || Date.now() - tokenAt > 45 * 60_000) { token = gcloudToken(); tokenAt = Date.now(); }
  return token;
}
function vertexEmbedUrl(project, location) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${EMBED_MODEL}:predict`;
}
async function embed(input) {
  const r = await fetch(vertexEmbedUrl(GCP_PROJECT, GCP_LOCATION), {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer()}`, 'x-goog-user-project': GCP_PROJECT, 'Content-Type': 'application/json' },
    // Same task type as the query side (lib/memory/embed buildVertexEmbedBody), so documents and queries match.
    body: JSON.stringify({ instances: [{ content: input, task_type: 'SEMANTIC_SIMILARITY' }], parameters: { outputDimensionality: EMBED_DIM } }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const json = await r.json().catch(() => null);
  const vec = json?.predictions?.[0]?.embeddings?.values;
  return Array.isArray(vec) && vec.length === EMBED_DIM ? vec : null;
}

// ── Walk the corpus dir ───────────────────────────────────────────────────────
function walk(d, acc = []) {
  for (const name of readdirSync(d)) {
    const full = join(d, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, acc);
    else if (['.txt', '.md'].includes(extname(name).toLowerCase())) acc.push(full);
  }
  return acc;
}

const files = walk(dir);
if (files.length === 0) fail(`no .txt/.md files found under ${dir}`);
console.log(`${C.bold}RAG ingest${C.reset} ${C.dim}→ ${files.length} file(s), lang=${lang}, chunk=${chunkSize}/${overlap}${C.reset}`);

let totalChunks = 0;
let totalEmbedded = 0;
for (const file of files) {
  const source = relative(dir, file) || file;
  const text = readFileSync(file, 'utf8');
  const chunks = chunkText(text);
  if (chunks.length === 0) { console.log(`${C.yellow}· skip (empty): ${source}${C.reset}`); continue; }

  if (reset) {
    await supabase.from('rag_documents').delete().eq('source', source);
  }

  const rows = [];
  for (let i = 0; i < chunks.length; i++) {
    const vec = await embed(chunks[i]);
    totalChunks++;
    if (!vec) { console.log(`${C.yellow}· embed failed (chunk ${i} of ${source}) — skipped${C.reset}`); continue; }
    rows.push({ source, chunk_index: i, content: chunks[i], lang, embedding: vec, embedding_model: EMBEDDING_MODEL_TAG });
    totalEmbedded++;
  }

  if (rows.length) {
    // Insert in batches of 50 to stay well under payload limits.
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from('rag_documents').insert(batch);
      if (error) fail(`insert failed for ${source}: ${error.message}`);
    }
  }
  console.log(`${C.green}✓${C.reset} ${source} ${C.dim}(${rows.length}/${chunks.length} chunks embedded)${C.reset}`);
}

console.log(`\n${C.green}${C.bold}✓ Done${C.reset} — ${totalEmbedded}/${totalChunks} chunks embedded and stored.`);
if (totalEmbedded < totalChunks) {
  console.log(`${C.yellow}Some chunks failed to embed (rate limit / Vertex access). Re-run to fill gaps (use --reset to rebuild a source).${C.reset}`);
}
process.exit(0);
