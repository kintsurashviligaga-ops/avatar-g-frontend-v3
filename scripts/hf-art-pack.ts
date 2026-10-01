/**
 * brand/v1 art pack — ⚠️ BILLABLE, HARD-CAPPED (docs/DESIGN.md §4).
 *
 * The shots are NOT defined here. They live in scripts/hf-art-pack.md, as fenced ```json shot blocks, and
 * this runner reads them from there — so the prompts committed before the first call are exactly the
 * prompts that run. Nothing is invented at run time.
 *
 * Money rules:
 *   - every request is priced first (free POST /estimate) and refused if it would cross the STOP line
 *     ($6.50 of the $7.00 job cap), counting everything already submitted in this pack;
 *   - one POST per attempt, never retried on its own (the provider has no idempotency key);
 *   - at most 3 attempts per shot (the first + 2 retries, the brief's limit);
 *   - every attempt — its prompt, model, input, request id and cost — is appended to
 *     public/brand/v1/manifest.json before and after it runs.
 *
 * Packs (`--pack`, default brand-v1): brand-v1 = the brand/v1 art pack ($7 cap); templates = the studio's template
 * gallery thumbnails (scripts/templates/thumbs.md → public/templates, $5 cap — the owner's 2026-10-01 budget).
 *
 * Usage (from the repo root):
 *   npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/hf-art-pack.ts --dry            # price all pending shots
 *   … scripts/hf-art-pack.ts --pack templates --dry                                           # the template thumbnails
 *   npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/hf-art-pack.ts --shot A1 --yes-spend
 *   npx tsx --tsconfig scripts/tsconfig.scripts.json scripts/hf-art-pack.ts --status         # spend so far
 */
import { loadEnvConfig } from '@next/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

export const JOB_CAP_USD = 7.0;
export const STOP_AT_USD = 6.5;

/** Each pack: its spec, where its manifest + raw takes live (raw is gitignored), and its hard money lines. */
export const PACKS = {
  'brand-v1': { spec: 'scripts/hf-art-pack.md', out: 'public/brand/v1', job: 'brand/v1 art pack', cap: JOB_CAP_USD, stop: STOP_AT_USD },
  templates: { spec: 'scripts/templates/thumbs.md', out: 'public/templates', job: 'template gallery thumbnails', cap: 5.0, stop: 4.5 },
} as const;
export type PackId = keyof typeof PACKS;

export function packFromArgv(argv: readonly string[]): PackId {
  const i = argv.indexOf('--pack');
  const id = i >= 0 ? argv[i + 1] : 'brand-v1';
  if (id !== 'brand-v1' && id !== 'templates') throw new Error(`unknown --pack ${id} (brand-v1 | templates)`);
  return id;
}

const pack = PACKS[packFromArgv(process.argv.slice(2))];
const SPEC = join(ROOT, pack.spec);
const OUT = join(ROOT, pack.out);
const RAW = join(OUT, 'raw');
const MANIFEST = join(OUT, 'manifest.json');
const PACK_CAP_USD = pack.cap;
const PACK_STOP_USD = pack.stop;
const MAX_ATTEMPTS = 3;
const POLL_MS = 4_000;
const WAIT_MS = 12 * 60_000;

export interface Shot {
  id: string;
  title: string;
  endpoint: string;
  /** Provider input. Strings may reference an earlier shot's chosen output: "{{A1}}". */
  input: Record<string, unknown>;
  /** Shots whose selected output must exist first (their URL is substituted into `input`). */
  needs?: string[];
  optional?: boolean;
}

export interface Attempt {
  shot: string;
  attempt: number;
  endpoint: string;
  input: Record<string, unknown>;
  requestId: string | null;
  usd: number | null;
  listUsd: number | null;
  status: string;
  outputs: Array<{ url: string; file: string | null }>;
  at: string;
  note?: string;
}

export interface Manifest {
  job: string;
  capUsd: number;
  stopAtUsd: number;
  spentUsd: number;
  attempts: Attempt[];
  /** shot id → chosen output (provider URL + local raw file), set after review. */
  selected: Record<string, { url: string; file: string; attempt: number }>;
}

/** ```json shot blocks from the markdown spec — the only place shots are defined. */
export function parseShots(md: string): Shot[] {
  const shots: Shot[] = [];
  const re = /```json shot\n([\s\S]*?)```/g;
  for (let m = re.exec(md); m; m = re.exec(md)) {
    const s = JSON.parse(m[1]!) as Shot;
    if (!s.id || !s.endpoint || !s.input) throw new Error(`shot block missing id/endpoint/input: ${m[1]!.slice(0, 80)}`);
    shots.push(s);
  }
  const ids = shots.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate shot ids: ${ids.join(',')}`);
  return shots;
}

/** Replace "{{A1}}" with the selected output URL of shot A1 (deep, strings only). */
export function substitute(value: unknown, selected: Manifest['selected']): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z][0-9]+)\}\}/g, (_, id: string) => {
      const pick = selected[id];
      if (!pick) throw new Error(`shot ${id} has no selected output yet`);
      return pick.url;
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, selected));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v, selected)]));
  }
  return value;
}

export function spent(m: Manifest): number {
  // Conservative: every SUBMITTED attempt counts at its quoted price, finished or not.
  return Math.round(m.attempts.filter((a) => a.requestId).reduce((s, a) => s + (a.usd ?? 0), 0) * 10_000) / 10_000;
}

function loadManifest(): Manifest {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  return { job: pack.job, capUsd: PACK_CAP_USD, stopAtUsd: PACK_STOP_USD, spentUsd: 0, attempts: [], selected: {} };
}

function saveManifest(m: Manifest) {
  m.spentUsd = spent(m);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const extOf = (type: string, url: string) =>
  type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('mp4') ? 'mp4' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : (url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? 'bin');

async function main() {
  loadEnvConfig(ROOT); // here, not at import: a test importing the helpers must not load real credentials
  const argv = process.argv.slice(2);
  const flag = (k: string) => argv.includes(k);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

  const shots = parseShots(readFileSync(SPEC, 'utf8'));
  const m = loadManifest();

  if (flag('--status')) {
    console.log(`spent $${spent(m).toFixed(4)} of $${PACK_STOP_USD.toFixed(2)} (cap $${PACK_CAP_USD.toFixed(2)})`);
    for (const s of shots) {
      const tries = m.attempts.filter((a) => a.shot === s.id);
      console.log(`  ${s.id.padEnd(3)} ${s.title.padEnd(34)} attempts ${tries.length}/${MAX_ATTEMPTS}${m.selected[s.id] ? `  ✓ selected #${m.selected[s.id]!.attempt}` : ''}`);
    }
    return;
  }

  const select = arg('--select'); // --select A1:2   (shot:attempt) → mark that attempt's first output as chosen
  if (select) {
    const [id, n] = select.split(':');
    const a = m.attempts.find((x) => x.shot === id && x.attempt === Number(n) && x.status === 'completed');
    const out = a?.outputs[Number(arg('--output') ?? 0)];
    if (!a || !out?.file) throw new Error(`no completed attempt ${select} with a downloaded output`);
    m.selected[id!] = { url: out.url, file: out.file, attempt: a.attempt };
    saveManifest(m);
    console.log(`selected ${id} ← attempt ${n} (${out.file})`);
    return;
  }

  const dry = flag('--dry');
  if (!dry && !flag('--yes-spend')) throw new Error('refusing to spend without --yes-spend (use --dry to price only)');

  const { createHfClient, hfAuthHeaderFromEnv } = await import('@/lib/providers/higgsfield/client');
  const auth = hfAuthHeaderFromEnv();
  if (!auth) throw new Error('HF credentials are not configured');
  const hf = createHfClient({ authHeader: auth });

  const only = arg('--shot');
  const queue = shots.filter((s) => (only ? s.id === only : !m.selected[s.id] && !s.optional));
  if (!queue.length) { console.log('nothing to run'); return; }

  for (const s of queue) {
    const tries = m.attempts.filter((a) => a.shot === s.id).length;
    if (tries >= MAX_ATTEMPTS) { console.log(`${s.id}: ${MAX_ATTEMPTS} attempts used — skipped (brief: ≤ 2 retries per shot)`); continue; }
    const unmet = (s.needs ?? []).filter((need) => !m.selected[need]);
    if (unmet.length) { console.log(`${s.id}: waits for ${unmet.join(', ')} to be selected — skipped for now`); continue; }

    const input = substitute(s.input, m.selected) as Record<string, unknown>;
    let est: Awaited<ReturnType<typeof hf.estimate>>;
    try {
      est = await hf.estimate(s.endpoint, input);
    } catch (e) {
      // The provider's own words (ProviderError keeps them off the enumerable fields) — local tool, so print them.
      const detail = (e as { detail?: unknown }).detail;
      console.log(`${s.id}: estimate refused — ${(e as { code?: string }).code ?? (e as Error).message}${detail ? ` · ${String(detail).slice(0, 400)}` : ''}`);
      continue;
    }
    const usd = est.usd;
    const before = spent(m);
    console.log(`${s.id} ${s.title}: quote ${usd === null ? `(described) ${est.pricingDescription?.slice(0, 80)}` : `$${usd.toFixed(4)}`}${est.listUsd && usd !== null && est.listUsd > usd ? ` (list $${est.listUsd.toFixed(4)})` : ''} · spent so far $${before.toFixed(4)}`);
    if (usd === null) { console.log(`${s.id}: no numeric price — not run (priced models only)`); continue; }
    if (before + usd > PACK_STOP_USD) { console.log(`STOP: $${before.toFixed(4)} + $${usd.toFixed(4)} would pass the $${PACK_STOP_USD} stop line`); break; }
    if (dry) continue;

    const attempt: Attempt = {
      shot: s.id, attempt: tries + 1, endpoint: s.endpoint, input, requestId: null, usd, listUsd: est.listUsd,
      status: 'submitting', outputs: [], at: new Date().toISOString(),
    };
    m.attempts.push(attempt);
    saveManifest(m);

    try {
      const sub = await hf.submit(s.endpoint, input);
      attempt.requestId = sub.requestId;
      attempt.status = sub.status;
      saveManifest(m);
      console.log(`${s.id} #${attempt.attempt}: request ${sub.requestId}`);
    } catch (e) {
      const ambiguous = (e as { ambiguous?: boolean }).ambiguous === true;
      attempt.status = ambiguous ? 'submit_unknown' : 'refused';
      attempt.note = String((e as Error).message).slice(0, 200);
      // An ambiguous submit may have been charged: count it (requestId stays null → mark it explicitly).
      if (ambiguous) attempt.requestId = 'unknown';
      saveManifest(m);
      console.log(`${s.id} #${attempt.attempt}: ${attempt.status} — ${attempt.note}`);
      continue;
    }

    const deadline = Date.now() + WAIT_MS;
    let result = await hf.status(attempt.requestId!);
    while (!['completed', 'failed', 'nsfw', 'canceled'].includes(result.status) && Date.now() < deadline) {
      await sleep(POLL_MS);
      result = await hf.status(attempt.requestId!).catch(() => result);
    }
    attempt.status = result.status;
    mkdirSync(RAW, { recursive: true });
    for (let i = 0; i < result.outputUrls.length; i++) {
      const url = result.outputUrls[i]!;
      let file: string | null = null;
      try {
        const res = await fetch(url);
        const buf = Buffer.from(await res.arrayBuffer());
        file = `raw/${s.id}-${attempt.attempt}-${i}.${extOf(res.headers.get('content-type') ?? '', url)}`;
        writeFileSync(join(OUT, file), buf);
      } catch { /* the provider URL stays in the manifest; the file can be fetched again */ }
      attempt.outputs.push({ url, file });
    }
    saveManifest(m);
    console.log(`${s.id} #${attempt.attempt}: ${result.status} · ${attempt.outputs.map((o) => o.file ?? o.url).join(', ') || 'no output'} · spent $${spent(m).toFixed(4)}`);
  }
  console.log(`total spent $${spent(m).toFixed(4)} of $${PACK_STOP_USD.toFixed(2)} stop line`);
}

if (require.main === module || process.argv[1]?.endsWith('hf-art-pack.ts')) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
