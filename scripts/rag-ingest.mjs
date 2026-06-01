#!/usr/bin/env node
/**
 * RAG corpus ingestion CLI.
 *
 *   GEMINI_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node scripts/rag-ingest.mjs ./corpus [--lang ka] [--reset] [--chunk 1500] [--overlap 200]
 *
 * Reads every .txt / .md file under <dir> (recursively), splits each into
 * overlapping chunks, embeds them (Gemini gemini-embedding-001 @ 1536-d, with
 * OpenAI text-embedding-3-small fallback — mirrors lib/memory/embed.ts), and
 * inserts the rows into public.rag_documents via the service-role key.
 *
 * Apply the schema first:  node scripts/apply-rag-migration.mjs
 *
 * --reset   delete existing rows for each ingested source before re-inserting.
 *
 * Secrets come ONLY from your environment (or .env.local) — never the repo.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';
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

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!GEMINI_KEY && !OPENAI_KEY) fail('an embedding key is required (GEMINI_API_KEY or OPENAI_API_KEY).');

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

// ── Embedding (Gemini primary, OpenAI fallback; both 1536-d) ─────────────────
async function embedGemini(input) {
  if (!GEMINI_KEY) return null;
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: input }] }, outputDimensionality: 1536, taskType: 'RETRIEVAL_DOCUMENT' }),
    },
  ).catch(() => null);
  if (!r || !r.ok) return null;
  const json = await r.json().catch(() => null);
  const vec = json?.embedding?.values;
  return Array.isArray(vec) && vec.length === 1536 ? vec : null;
}
async function embedOpenAI(input) {
  if (!OPENAI_KEY) return null;
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const json = await r.json().catch(() => null);
  const vec = json?.data?.[0]?.embedding;
  return Array.isArray(vec) && vec.length === 1536 ? vec : null;
}
async function embed(input) {
  return (await embedGemini(input)) ?? (await embedOpenAI(input));
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
    rows.push({ source, chunk_index: i, content: chunks[i], lang, embedding: vec });
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
  console.log(`${C.yellow}Some chunks failed to embed (rate limit / key). Re-run to fill gaps (use --reset to rebuild a source).${C.reset}`);
}
process.exit(0);
