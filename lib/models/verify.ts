/**
 * lib/models/verify.ts — runtime verification of the ModelCatalog (PROJECT_MASTER.md Section D2, Part 2 objective D2).
 *
 * Asks the selected Google transport (GEMINI_TRANSPORT) which catalog ids exist for this project, for free:
 *   · `gemini_api` — `GET /v1beta/models` (the key's model list, paged).
 *   · `vertex`     — `countTokens` per text / image / music entry (nothing generated or billed). Veo, Imagen and the
 *                    embedding model have no free per-model probe there and are reported `unchecked`.
 * Then, per D2:
 *   · in the catalog, not on the runtime → `missing`: switched off (enabled: false) and logged — a selector never offers it;
 *   · on the runtime, not in the catalog → `reviewQueue`: reported for a person to review, NEVER added automatically.
 *
 * ⚠️ PRESENT IS NOT VERIFIED. A listed or countable id can still refuse to generate (the new project's key listed the
 * Gemini 2.5 text models while generateContent answered 404), so a check only ever REMOVES; `verifiedAt` stays the dated
 * evidence in lib/models/catalog.ts. A check that fails (network, auth) changes nothing and says so (`ok: false`).
 * Results are cached per transport for CACHE_TTL_MS.
 */
import 'server-only';
import type { GeminiTransportKind } from '@/lib/contracts/geminiTransport';
import type { ModelCatalog, ModelCatalogEntry } from '@/lib/contracts/modelCatalog';
import { googleModelFetch, googleTransportKind, googleTransportProblems } from '@/lib/ai/google/transport';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { redactSecrets } from '@/lib/veo/vertexAuth';
import { MODEL_CATALOG } from './catalog';

export const CACHE_TTL_MS = 10 * 60_000;
const LIST_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_PAGES = 5;
const MAX_REVIEW = 200;
const PROBE_TIMEOUT_MS = 8_000;
const PING = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] });

export interface CatalogCheck {
  /** The check itself ran (false: nothing was concluded and nothing is switched off). */
  ok: boolean;
  transport: GeminiTransportKind | 'invalid';
  method: 'models.list' | 'countTokens' | 'none';
  checkedAt: string;
  /** Catalog ids the runtime has. */
  present: string[];
  /** Enabled catalog ids the runtime does not have — switched off by applyCatalogCheck. */
  missing: string[];
  /** Catalog ids this check cannot speak for on this transport. */
  unchecked: string[];
  /** Runtime ids that are not in the catalog — for a person to review, never auto-added. */
  reviewQueue: string[];
  errors: Array<{ id?: string; status?: number; detail: string }>;
}

const redact = (text: string): string => redactSecrets(text.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-key]'), 200);

/** Entries a transport serves (D8): `either` on both, the others on their own only. */
function servedBy(e: ModelCatalogEntry, kind: GeminiTransportKind): boolean {
  return e.transport === 'either' || e.transport === kind;
}

/** On Vertex only generateContent families have a free probe (countTokens); Live models do not serve REST calls here. */
function vertexProbeable(e: ModelCatalogEntry): boolean {
  return ['gemini', 'nano_banana', 'lyria'].includes(e.family) && !e.capabilities.includes('live');
}

async function listGeminiApiModels(): Promise<{ ids: Set<string> } | { error: CatalogCheck['errors'][number] }> {
  const key = resolveGeminiKey();
  const ids = new Set<string>();
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${LIST_URL}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    let res: Response;
    try {
      // The key rides in the header, never the URL; no redirect may carry it elsewhere.
      res = await fetch(url, {
        headers: { 'x-goog-api-key': key },
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
    } catch (e) {
      return { error: { detail: `models.list network error: ${e instanceof Error ? e.name : 'unknown'}` } };
    }
    if (!res.ok) return { error: { status: res.status, detail: redact(await res.text().catch(() => '')) } };
    const j = (await res.json().catch(() => null)) as { models?: Array<{ name?: unknown }>; nextPageToken?: unknown } | null;
    for (const m of j?.models ?? []) {
      if (typeof m.name === 'string') ids.add(m.name.replace(/^models\//, ''));
    }
    pageToken = typeof j?.nextPageToken === 'string' ? j.nextPageToken : '';
    if (!pageToken) break;
  }
  return { ids };
}

async function probeVertex(id: string): Promise<{ status: number; detail?: string }> {
  try {
    const r = await googleModelFetch(id, 'countTokens', {
      method: 'POST',
      body: PING,
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return r.ok ? { status: r.status } : { status: r.status, detail: redact(await r.text().catch(() => '')) };
  } catch (e) {
    return { status: 0, detail: e instanceof Error ? e.name : 'unknown' };
  }
}

/** Run one check of `catalog` on the selected transport. Never throws. */
export async function checkModelCatalog(catalog: ModelCatalog = MODEL_CATALOG): Promise<CatalogCheck> {
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, present: [], missing: [], unchecked: catalog.entries.map((e) => e.id), reviewQueue: [] };
  let kind: GeminiTransportKind;
  try {
    kind = googleTransportKind();
  } catch {
    return { ...base, ok: false, transport: 'invalid', method: 'none', errors: [{ detail: 'GEMINI_TRANSPORT is not gemini_api or vertex' }] };
  }
  const notConfigured = googleTransportProblems(kind);
  if (notConfigured.length) {
    return { ...base, ok: false, transport: kind, method: 'none', errors: [{ detail: `missing ${notConfigured.join(', ')}` }] };
  }

  const present: string[] = [];
  const missing: string[] = [];
  const unchecked: string[] = [];
  const errors: CatalogCheck['errors'] = [];

  if (kind === 'gemini_api') {
    const listed = await listGeminiApiModels();
    if ('error' in listed) return { ...base, ok: false, transport: kind, method: 'models.list', errors: [listed.error] };
    for (const e of catalog.entries) {
      // Agents (Deep Research) are not models and are never listed.
      if (!servedBy(e, kind) || e.family === 'specialty') unchecked.push(e.id);
      else if (listed.ids.has(e.id)) present.push(e.id);
      else if (e.enabled) missing.push(e.id);
      else unchecked.push(e.id);
    }
    const known = new Set(catalog.entries.map((e) => e.id));
    const reviewQueue = [...listed.ids].filter((id) => !known.has(id)).sort().slice(0, MAX_REVIEW);
    return { ok: true, transport: kind, method: 'models.list', checkedAt, present, missing, unchecked, reviewQueue, errors };
  }

  const probed = catalog.entries.filter((e) => servedBy(e, kind) && vertexProbeable(e));
  const results = await Promise.all(probed.map(async (e) => ({ e, r: await probeVertex(e.id) })));
  const probedIds = new Set(probed.map((e) => e.id));
  for (const e of catalog.entries) if (!probedIds.has(e.id)) unchecked.push(e.id);
  for (const { e, r } of results) {
    if (r.status >= 200 && r.status < 300) present.push(e.id);
    else if (r.status === 404 && e.enabled) missing.push(e.id);
    else {
      // 403 / 429 / 5xx / a network error says nothing about the model itself: report it, switch nothing off.
      unchecked.push(e.id);
      if (r.status !== 404) errors.push({ id: e.id, status: r.status, detail: r.detail ?? '' });
    }
  }
  return { ok: true, transport: kind, method: 'countTokens', checkedAt, present, missing, unchecked, reviewQueue: [], errors };
}

/** The catalog with every `missing` id switched off (a new object; the input is untouched). */
export function applyCatalogCheck(catalog: ModelCatalog, check: CatalogCheck): ModelCatalog {
  if (!check.ok || check.missing.length === 0) return catalog;
  const missing = new Set(check.missing);
  return {
    ...catalog,
    entries: catalog.entries.map((e) =>
      missing.has(e.id)
        ? { ...e, enabled: false, notes: `${e.notes ? `${e.notes} ` : ''}Not found on ${check.transport} at ${check.checkedAt}.` }
        : e,
    ),
  };
}

let cache: { transport: string; at: number; check: CatalogCheck } | null = null;

/** The catalog as the runtime allows it today, with the check behind it. Cached per transport for CACHE_TTL_MS. */
export async function verifiedModelCatalog(opts: { force?: boolean } = {}): Promise<{ catalog: ModelCatalog; check: CatalogCheck }> {
  let transport: string;
  try {
    transport = googleTransportKind();
  } catch {
    transport = 'invalid';
  }
  const now = Date.now();
  if (!opts.force && cache && cache.transport === transport && now - cache.at < CACHE_TTL_MS) {
    return { catalog: applyCatalogCheck(MODEL_CATALOG, cache.check), check: cache.check };
  }
  const check = await checkModelCatalog(MODEL_CATALOG);
  if (!check.ok || check.missing.length) {
    console.warn(
      `[model-catalog] transport=${check.transport} ok=${check.ok} missing=${check.missing.join(',') || '-'} review=${check.reviewQueue.length}`,
    );
  }
  // A failed check is not cached: the next caller tries again.
  cache = check.ok ? { transport, at: now, check } : null;
  return { catalog: applyCatalogCheck(MODEL_CATALOG, check), check };
}

/** Tests only. */
export function __resetModelCatalogCache(): void {
  cache = null;
}
