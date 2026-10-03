/**
 * Art packs — ⚠️ BILLABLE, HARD-CAPPED (docs/DESIGN.md §4).
 *
 * The shots are NOT defined here. They live in each pack's markdown spec, as fenced ```json shot blocks, and
 * this runner reads them from there — so the prompts committed before the first call are exactly the
 * prompts that run. Nothing is invented at run time.
 *
 * Money rules:
 *   - every request is priced first (free POST /estimate) and refused if it would cross the pack's STOP line,
 *     counting everything already submitted in this pack; a --dry run adds its quotes up against the same line;
 *   - one POST per attempt, never retried on its own (the provider has no idempotency key);
 *   - at most 3 attempts per shot (the first + 2 retries, the brief's limit), and a shot whose take is still
 *     waiting for review is not paid for again unless --retry says so;
 *   - every attempt — its prompt, model, input, request id and cost — is appended to the pack's manifest.json
 *     before and after it runs.
 *
 * Packs (`--pack`, default brand-v1): brand-v1 = the brand/v1 art pack ($7 cap); templates = the studio's template
 * gallery thumbnails (scripts/templates/thumbs.md, $5 cap — the owner's 2026-10-01 budget); site = site imagery v2, the
 * VFX preset tiles, the video header banners, the missing /services cards and the image style swatches
 * (scripts/site-art/shots.md, $3 cap — the owner's 2026-10-03 design pass).
 * ⚠️ A pack's manifest and raw takes live in its `work` dir, never under public/: everything in public/ is deployed,
 * and the manifest carries prompts, prices, request ids and provider URLs. Only the selected, resized finals go public.
 *
 * Providers (`--provider`, default hf; scripts/art-providers.ts): hf = Higgsfield, priced by its free /estimate;
 * replicate = FLUX schnell, imagen = Imagen 4 — both priced from the static PRICES_USD table, so their --dry needs no
 * key and makes no network call. A pack has ONE budget whichever provider spends it. Only a plain Soul text-to-image
 * shot can go to replicate/imagen; anything else is refused and stays on hf.
 *
 * Usage (from the repo root; `npm run art:templates --` is `npx jiti scripts/hf-art-pack.ts --pack templates`):
 *   npm run art:templates -- --dry                            # price every pending shot (free) against the stop line
 *   npm run art:templates -- --provider replicate --dry       # the same on FLUX schnell: offline, ≈ $0.24 for all 20
 *   npm run art:templates -- --yes-spend                      # run the pending shots
 *   npm run art:templates -- --shot video/teaser --yes-spend  # one shot (add --retry for another take)
 *   npm run art:templates -- --status                         # spend so far, takes per shot
 *   npm run art:templates -- --select video/teaser:1 --output 2
 *   node scripts/templates/build-thumbs.mjs                   # selected takes → public/templates/*.jpg (600×800)
 *   npx jiti scripts/hf-art-pack.ts --status                  # the brand-v1 pack
 */
import { loadEnvConfig } from '@next/env';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProviderEstimate } from '@/lib/providers/types';
import { resolveGeminiKey } from '../lib/orchestrator/gemini-guard';
import {
  createImagenArtClient, createReplicateArtClient, isTerminal, offlineFetch, providerFromArgv,
  type ArtClient, type ArtProviderId, type ArtRequest, type ArtResult, type InlineOutput,
} from './art-providers';

export type { ArtClient, ArtProviderId } from './art-providers';
export { PRICES_USD, providerFromArgv } from './art-providers';

const ROOT = process.cwd();

export const JOB_CAP_USD = 7.0;
export const STOP_AT_USD = 6.5;

/** Each pack: its spec, its PRIVATE work dir (manifest + raw takes; raw is gitignored), and its hard money lines. */
export const PACKS = {
  'brand-v1': { spec: 'scripts/hf-art-pack.md', work: 'design/brand/v1', job: 'brand/v1 art pack', cap: JOB_CAP_USD, stop: STOP_AT_USD },
  templates: { spec: 'scripts/templates/thumbs.md', work: 'scripts/templates', job: 'template gallery thumbnails', cap: 5.0, stop: 4.5 },
  site: { spec: 'scripts/site-art/shots.md', work: 'scripts/site-art', job: 'site imagery v2', cap: 3.0, stop: 2.7 },
} as const;
export type PackId = keyof typeof PACKS;

/** `--pack <id>` (default brand-v1). ⚠️ Only an OWN key of PACKS: `--pack constructor` must not resolve to Object's. */
export function packFromArgv(argv: readonly string[]): PackId {
  const i = argv.indexOf('--pack');
  const id = i >= 0 ? argv[i + 1] : 'brand-v1';
  if (typeof id !== 'string' || !Object.hasOwn(PACKS, id)) throw new Error(`unknown --pack ${id} (${Object.keys(PACKS).join(' | ')})`);
  return id as PackId;
}

const MAX_ATTEMPTS = 3;
const POLL_MS = 4_000;
const WAIT_MS = 12 * 60_000;

/** "A1", "A4r", "video/teaser": at most one folder, because the id becomes a file path under raw/. */
const SHOT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?$/;

/** Outcomes with nothing to review — the only takes a plain re-run pays for again. */
const DEAD_ENDS: ReadonlySet<string> = new Set(['failed', 'nsfw', 'canceled', 'refused']);

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
  /** Who was paid; absent = hf (attempts logged before the provider seam). */
  provider?: ArtProviderId;
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
  /** shot id → chosen output (provider URL — or `inline:<type>` for bytes — + local raw file), set after review. */
  selected: Record<string, { url: string; file: string; attempt: number }>;
}

/** ```json shot blocks from the markdown spec — the only place shots are defined. */
export function parseShots(md: string): Shot[] {
  const shots: Shot[] = [];
  const re = /```json shot\n([\s\S]*?)```/g;
  for (let m = re.exec(md); m; m = re.exec(md)) {
    const s = JSON.parse(m[1]!) as Shot;
    if (!s.id || !s.endpoint || !s.input) throw new Error(`shot block missing id/endpoint/input: ${m[1]!.slice(0, 80)}`);
    if (!SHOT_ID_RE.test(s.id)) throw new Error(`shot id ${JSON.stringify(s.id)} is not a safe file name`);
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
      // An Imagen take came back as bytes: there is no URL another provider could fetch it from.
      if (!/^https:\/\//i.test(pick.url)) throw new Error(`shot ${id}'s selected take has no provider URL to reference`);
      return pick.url;
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, selected));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v, selected)]));
  }
  return value;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function spent(m: Manifest): number {
  // Conservative: every SUBMITTED attempt counts at its quoted price, finished or not.
  return round4(m.attempts.filter((a) => a.requestId).reduce((s, a) => s + (a.usd ?? 0), 0));
}

/** A shot that has a take nobody has reviewed yet: completed but not selected, or submitted with its outcome open. */
export function awaitingReview(m: Manifest, shot: string): boolean {
  return !m.selected[shot] && m.attempts.some((a) => a.shot === shot && !DEAD_ENDS.has(a.status));
}

/**
 * The shots a run would submit, and the ones it holds back.
 * ⚠️ A shot awaiting review is held unless `retry`: re-running the spend command before `--select` used to pay
 * for every unselected shot again.
 */
export function pendingShots(shots: readonly Shot[], m: Manifest, o: { only?: string; retry?: boolean } = {}): { queue: Shot[]; held: Shot[] } {
  const queue: Shot[] = [];
  const held: Shot[] = [];
  for (const s of shots.filter((x) => (o.only ? x.id === o.only : !m.selected[x.id] && !x.optional))) {
    (awaitingReview(m, s.id) && !o.retry ? held : queue).push(s);
  }
  return { queue, held };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ A THROTTLE IS NOT A FAILURE. Replicate limits an account holding under $5 of credit to ~6 predictions a minute
 * with a burst of ONE, and answers the rest 429 with `retry_after` (2026-10-01: all 20 shots but one were "refused"
 * and the run ended having bought nothing). A 429 is refused BEFORE the job exists — nothing billed — so the same
 * attempt is simply resent after the wait the provider names. Bounded: THROTTLE_RETRIES tries, each wait 2–60 s.
 */
const THROTTLE_RETRIES = 6;
export function throttleWaitMs(detail: unknown): number {
  let secs = NaN;
  try { secs = Number((JSON.parse(String(detail)) as { retry_after?: unknown }).retry_after); } catch { /* not JSON */ }
  if (!Number.isFinite(secs)) secs = 10;
  return Math.min(60, Math.max(2, Math.ceil(secs) + 1)) * 1000;
}
const extOf = (type: string, url: string) =>
  type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('mp4') ? 'mp4' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : (url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? 'bin');

/**
 * Downloads a take's outputs to <work>/raw/<shot>-<attempt>-<i>.<ext>. A file is recorded only once it is on disk.
 * ⚠️ The folder is made for each FILE, not just raw/: template ids carry a slash (video/teaser → raw/video/), and
 * with only raw/ in place every template write failed inside a silent catch — paid takes, no files.
 */
export async function saveOutputs(
  urls: readonly string[], shot: string, attempt: number, work: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a), log: (line: string) => void = console.log,
): Promise<Attempt['outputs']> {
  const outputs: Attempt['outputs'] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    let file: string | null = null;
    try {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const name = `raw/${shot}-${attempt}-${i}.${extOf(res.headers.get('content-type') ?? '', url)}`;
      mkdirSync(dirname(join(work, name)), { recursive: true });
      writeFileSync(join(work, name), buf);
      file = name;
    } catch (e) {
      // The provider URL stays in the manifest, so the file can be fetched again — Higgsfield keeps it ≥ 7 days,
      // Replicate only about an hour — but say so.
      log(`${shot} #${attempt}: output ${i} not saved — ${e instanceof Error ? e.message : String(e)}`);
    }
    outputs.push({ url, file });
  }
  return outputs;
}

/**
 * Writes outputs that came back as bytes (Imagen) straight to <work>/raw/<shot>-<attempt>-<i>.<ext> — nothing is
 * fetched. The manifest records `inline:<type>` in place of a URL: the bytes themselves never go into it.
 */
export function saveInline(
  images: readonly InlineOutput[], shot: string, attempt: number, work: string,
  log: (line: string) => void = console.log, first = 0,
): Attempt['outputs'] {
  return images.map((img, k) => {
    const i = first + k;
    let file: string | null = null;
    try {
      const name = `raw/${shot}-${attempt}-${i}.${extOf(img.mimeType, '')}`;
      mkdirSync(dirname(join(work, name)), { recursive: true });
      writeFileSync(join(work, name), img.bytes);
      file = name;
    } catch (e) {
      // Bytes have no second source: a failed write loses a paid take.
      log(`${shot} #${attempt}: output ${i} not saved (inline — no copy to fetch again) — ${e instanceof Error ? e.message : String(e)}`);
    }
    return { url: `inline:${img.mimeType}`, file };
  });
}

export interface RunOptions { dry: boolean; only?: string; retry?: boolean; stopUsd: number }

export interface RunDeps {
  /** The provider (scripts/art-providers.ts) — Higgsfield unless --provider says otherwise. */
  client: ArtClient;
  /** The pack's work dir (absolute); raw takes land in <work>/raw/. */
  work: string;
  save: (m: Manifest) => void;
  log?: (line: string) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  waitMs?: number;
}

/** Prices — and unless `dry`, submits, polls and downloads — every pending shot, in spec order, under the stop line. */
export async function runQueue(shots: readonly Shot[], m: Manifest, o: RunOptions, d: RunDeps): Promise<{ projectedUsd: number; stopped: boolean }> {
  const log = d.log ?? console.log;
  const { client } = d;
  const provider = client.provider ?? 'hf';
  const { queue, held } = pendingShots(shots, m, o);
  for (const s of held) log(`${s.id}: a take is waiting for review — --select it, or pass --retry to pay for another`);
  if (!queue.length) { log('nothing to run'); return { projectedUsd: spent(m), stopped: false }; }

  // A dry run submits nothing, so `spent` never moves: its quotes are added up here, against the same stop line.
  let projected = spent(m);
  let stopped = false;
  for (const s of queue) {
    // ⚠️ Only attempts that could have COST something count toward the cap. A `refused` submit was turned away before a
    // job existed (no credit, throttled past its retries, bad request) — three of those used to exhaust a shot forever, so
    // the run after the owner funds the provider would have skipped it (2026-10-01: every shot was refused on 402).
    const tries = m.attempts.filter((a) => a.shot === s.id && a.status !== 'refused').length;
    const numbered = m.attempts.filter((a) => a.shot === s.id).length; // file names stay unique per attempt
    if (tries >= MAX_ATTEMPTS) { log(`${s.id}: ${MAX_ATTEMPTS} attempts used — skipped (brief: ≤ 2 retries per shot)`); continue; }
    const unmet = (s.needs ?? []).filter((need) => !m.selected[need]);
    if (unmet.length) { log(`${s.id}: waits for ${unmet.join(', ')} to be selected — skipped for now`); continue; }

    const spec = substitute(s.input, m.selected) as Record<string, unknown>;
    let req: ArtRequest;
    try {
      req = client.prepare ? client.prepare(s.endpoint, spec) : { endpoint: s.endpoint, input: spec };
    } catch (e) {
      log(`${s.id}: not run on ${provider} — ${(e as { detail?: string }).detail || (e as Error).message}`);
      continue;
    }
    const { endpoint, input } = req;
    let est: ProviderEstimate;
    try {
      est = await client.estimate(endpoint, input);
    } catch (e) {
      // The provider's own words (ProviderError keeps them off the enumerable fields) — local tool, so print them.
      const detail = (e as { detail?: unknown }).detail;
      log(`${s.id}: estimate refused — ${(e as { code?: string }).code ?? (e as Error).message}${detail ? ` · ${String(detail).slice(0, 400)}` : ''}`);
      continue;
    }
    const usd = est.usd;
    const before = o.dry ? projected : spent(m);
    log(`${s.id} ${s.title}: quote ${usd === null ? `(described) ${est.pricingDescription?.slice(0, 80)}` : `$${usd.toFixed(4)}`}${est.listUsd && usd !== null && est.listUsd > usd ? ` (list $${est.listUsd.toFixed(4)})` : ''} · ${o.dry ? 'projected' : 'spent so far'} $${before.toFixed(4)}`);
    if (usd === null) { log(`${s.id}: no numeric price — not run (priced models only)`); continue; }
    if (before + usd > o.stopUsd) { log(`STOP: $${before.toFixed(4)} + $${usd.toFixed(4)} would pass the $${o.stopUsd} stop line`); stopped = true; break; }
    if (o.dry) { projected = round4(before + usd); continue; }

    // The manifest gets what is SENT (the provider's endpoint and body), not the Soul draft it was made from.
    const attempt: Attempt = {
      shot: s.id, attempt: numbered + 1, provider, endpoint, input, requestId: null, usd, listUsd: est.listUsd,
      status: 'submitting', outputs: [], at: new Date().toISOString(),
    };
    m.attempts.push(attempt);
    d.save(m);

    let answered: ArtResult | undefined;
    try {
      let sub: Awaited<ReturnType<ArtClient['submit']>>;
      for (let tries429 = 0; ; tries429++) {
        try { sub = await client.submit(endpoint, input); break; } catch (e) {
          if ((e as { code?: string }).code !== 'concurrency' || tries429 >= THROTTLE_RETRIES) throw e;
          const wait = throttleWaitMs((e as { detail?: unknown }).detail);
          log(`${s.id}: throttled by the provider — waiting ${wait / 1000} s and sending the same request again`);
          await (d.sleep ?? sleep)(wait);
        }
      }
      attempt.requestId = sub.requestId;
      attempt.status = sub.status;
      answered = sub.result && isTerminal(sub.result.status) ? sub.result : undefined;
      d.save(m);
      log(`${s.id} #${attempt.attempt}: request ${sub.requestId}`);
    } catch (e) {
      const ambiguous = (e as { ambiguous?: boolean }).ambiguous === true;
      attempt.status = ambiguous ? 'submit_unknown' : 'refused';
      attempt.note = String((e as Error).message).slice(0, 200);
      // An ambiguous submit may have been charged: count it (requestId stays null → mark it explicitly).
      if (ambiguous) attempt.requestId = 'unknown';
      d.save(m);
      const detail = (e as { detail?: unknown }).detail;
      log(`${s.id} #${attempt.attempt}: ${attempt.status} — ${attempt.note}${detail ? ` · ${String(detail).slice(0, 400)}` : ''}`);
      continue;
    }

    // A provider that answered the submit with the finished take (Imagen; Replicate under Prefer: wait) is not polled:
    // its files are written or fetched right now — Replicate's are gone within the hour.
    let result: ArtResult;
    if (answered) {
      result = answered;
    } else {
      const deadline = Date.now() + (d.waitMs ?? WAIT_MS);
      result = await client.status(attempt.requestId!);
      while (!isTerminal(result.status) && Date.now() < deadline) {
        await (d.sleep ?? sleep)(d.pollMs ?? POLL_MS);
        result = await client.status(attempt.requestId!).catch(() => result);
      }
    }
    attempt.status = result.status;
    attempt.outputs.push(...await saveOutputs(result.outputUrls, s.id, attempt.attempt, d.work, d.fetchImpl, log));
    if (result.inline?.length) attempt.outputs.push(...saveInline(result.inline, s.id, attempt.attempt, d.work, log, attempt.outputs.length));
    d.save(m);
    log(`${s.id} #${attempt.attempt}: ${result.status} · ${attempt.outputs.map((x) => x.file ?? x.url).join(', ') || 'no output'} · spent $${spent(m).toFixed(4)}`);
  }
  return { projectedUsd: o.dry ? projected : spent(m), stopped };
}

type HfClientModule = typeof import('@/lib/providers/higgsfield/client');

/**
 * ⚠️ The provider client is loaded through jiti with the repo's two aliases, not `import('@/…')`: tsx is not a
 * dependency and jiti ignores tsconfig `paths`, so every --dry / --yes-spend died "Cannot find module '@/…'".
 * ('server-only' → the scripts shim, exactly as scripts/tsconfig.scripts.json maps it.)
 */
function loadHfClient(): HfClientModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jiti 1.x is CommonJS (installed with tailwindcss)
  const createJiti = require('jiti') as (from: string, o: { alias: Record<string, string> }) => (id: string) => unknown;
  const load = createJiti(__filename, { alias: { '@/': `${ROOT}/`, 'server-only': join(ROOT, 'scripts/shims/server-only.ts') } });
  return load('@/lib/providers/higgsfield/client') as HfClientModule;
}

/**
 * The client for `--provider`.
 * ⚠️ A --dry run on a statically priced provider (replicate, imagen) gets NO credential and a fetch that throws: it
 * cannot call out, let alone spend. Higgsfield prices through its own (free) /estimate, so its dry run needs the key.
 */
export function artClientFor(provider: ArtProviderId, o: { dry: boolean }, loadHf: () => HfClientModule = loadHfClient): ArtClient {
  if (provider === 'replicate') {
    if (o.dry) return createReplicateArtClient({ token: '', fetchImpl: offlineFetch });
    const token = (process.env.REPLICATE_API_TOKEN ?? '').trim();
    if (!token) throw new Error('REPLICATE_API_TOKEN is not configured');
    return createReplicateArtClient({ token });
  }
  if (provider === 'imagen') {
    if (o.dry) return createImagenArtClient({ apiKey: '', fetchImpl: offlineFetch });
    const apiKey = resolveGeminiKey(); // the key the app's own Imagen leg uses (lib/ai/geminiImagen.ts)
    if (!apiKey) throw new Error('no Gemini API key is configured (GEMINI_API_KEY)');
    return createImagenArtClient({ apiKey });
  }
  const { createHfClient, hfAuthHeaderFromEnv } = loadHf();
  const auth = hfAuthHeaderFromEnv();
  if (!auth) throw new Error('HF credentials are not configured');
  return { provider: 'hf', ...createHfClient({ authHeader: auth }) };
}

async function main() {
  loadEnvConfig(ROOT); // here, not at import: a test importing the helpers must not load real credentials
  const argv = process.argv.slice(2);
  const flag = (k: string) => argv.includes(k);
  const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

  const pack = PACKS[packFromArgv(argv)];
  const work = join(ROOT, pack.work);
  const manifestPath = join(work, 'manifest.json');
  const shots = parseShots(readFileSync(join(ROOT, pack.spec), 'utf8'));
  const m: Manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    : { job: pack.job, capUsd: pack.cap, stopAtUsd: pack.stop, spentUsd: 0, attempts: [], selected: {} };
  const save = (x: Manifest) => {
    x.spentUsd = spent(x);
    mkdirSync(work, { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(x, null, 2)}\n`);
  };

  if (flag('--status')) {
    const w = Math.max(3, ...shots.map((s) => s.id.length));
    console.log(`spent $${spent(m).toFixed(4)} of $${pack.stop.toFixed(2)} (cap $${pack.cap.toFixed(2)})`);
    for (const s of shots) {
      const tries = m.attempts.filter((a) => a.shot === s.id);
      const mark = m.selected[s.id] ? `  ✓ selected #${m.selected[s.id]!.attempt}` : awaitingReview(m, s.id) ? '  … awaiting review' : '';
      const via = [...new Set(tries.map((a) => a.provider ?? 'hf'))].join('+');
      console.log(`  ${s.id.padEnd(w)} ${s.title.padEnd(34)} attempts ${tries.length}/${MAX_ATTEMPTS}${via ? ` (${via})` : ''}${mark}`);
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
    save(m);
    console.log(`selected ${id} ← attempt ${n} (${out.file})`);
    return;
  }

  const dry = flag('--dry');
  if (!dry && !flag('--yes-spend')) throw new Error('refusing to spend without --yes-spend (use --dry to price only)');

  const provider = providerFromArgv(argv);
  const client = artClientFor(provider, { dry });

  const r = await runQueue(shots, m, { dry, only: arg('--shot'), retry: flag('--retry'), stopUsd: pack.stop }, { client, work, save });
  console.log(dry
    ? `projected total $${r.projectedUsd.toFixed(4)} of the $${pack.stop.toFixed(2)} stop line on ${provider}${r.stopped ? ' — a real run would STOP at the shot above' : ''} (dry run: nothing submitted)`
    : `total spent $${r.projectedUsd.toFixed(4)} of the $${pack.stop.toFixed(2)} stop line`);
}

if (require.main === module || process.argv[1]?.endsWith('hf-art-pack.ts')) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
