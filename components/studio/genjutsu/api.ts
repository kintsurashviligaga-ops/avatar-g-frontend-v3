/**
 * components/studio/genjutsu/api.ts — the panel's four calls to /api/genjutsu/*, typed, with the request body built in
 * one pure function (so the wire contract is tested without rendering anything).
 *
 * No call ever throws: a network failure is `{ ok: false, status: 0 }`, and a body that is not the expected JSON is a
 * failure with the HTTP status — the panel turns either into one plain sentence (copy.ts / serviceError.ts), never into
 * a raw code or a provider's words.
 */
import { gelToCredits } from '@/lib/credits/pricing';
import type { GenjutsuAspect, GenjutsuOp, GenjutsuQuality, ReferenceRole } from '@/lib/genjutsu/types';

export interface ApiIssue { path: string; code: string }
export interface OpView { open: boolean; state: 'open' | 'soon' }
export type Capabilities = Record<GenjutsuOp, OpView>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

async function json(res: Response): Promise<Record<string, unknown>> {
  try {
    const b = (await res.json()) as unknown;
    return isObj(b) ? b : {};
  } catch {
    return {};
  }
}

const issuesOf = (b: Record<string, unknown>): ApiIssue[] | undefined =>
  Array.isArray(b.issues) ? b.issues.filter(isObj).map((i) => ({ path: String(i.path ?? ''), code: String(i.code ?? i.message ?? '') })) : undefined;

// ─── the wire body ──────────────────────────────────────────────────────────────────────────────────────────────

export interface RequestInput {
  op: GenjutsuOp;
  presetId: string | null;
  prompt: string;
  aspect: GenjutsuAspect;
  quality: GenjutsuQuality;
  keepSound: boolean;
  video: { path: string; durationSec: number; sizeBytes: number } | null;
  /** Storage paths + roles of the photos that were uploaded (the ones the engine will use). */
  references: ReadonlyArray<{ ref: string; role: ReferenceRole }>;
  /** How many photos the user has picked in all — echoed back as "Using N of M". */
  referencesTotal: number;
  expectedCredits?: number | null;
  confirmedGel?: number | null;
}

/** The body of /quote and /generate. Fields an op does not use are left out, so the contract's refusals stay about real mistakes. */
export function buildRequestBody(i: RequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    op: i.op,
    ...(i.presetId ? { preset: i.presetId } : {}),
    ...(i.prompt.trim() ? { prompt: i.prompt.trim() } : {}),
    quality: i.quality,
    references: i.references.map((r) => ({ ref: r.ref, role: r.role })),
    referencesTotal: i.referencesTotal,
  };
  if (i.op === 'scene') body.aspect = i.aspect;
  if (i.op === 'motion') body.keepSound = i.keepSound;
  if (i.op !== 'scene' && i.video) body.video = { path: i.video.path, durationSec: i.video.durationSec, sizeBytes: i.video.sizeBytes };
  if (typeof i.expectedCredits === 'number') body.expectedCredits = i.expectedCredits;
  if (typeof i.confirmedGel === 'number') body.confirmedGel = i.confirmedGel;
  return body;
}

// ─── calls ──────────────────────────────────────────────────────────────────────────────────────────────────────

export async function fetchCapabilities(signal?: AbortSignal): Promise<Capabilities | null> {
  try {
    const res = await fetch('/api/genjutsu/capabilities', { cache: 'no-store', signal: signal ?? AbortSignal.timeout(10_000) });
    const b = await json(res);
    const ops = isObj(b.ops) ? b.ops : null;
    if (!res.ok || !ops) return null;
    const view = (v: unknown): OpView => (isObj(v) && v.open === true ? { open: true, state: 'open' } : { open: false, state: 'soon' });
    return { scene: view(ops.scene), motion: view(ops.motion), swap: view(ops.swap) };
  } catch {
    return null;
  }
}

export interface QuoteView { credits: number | null; gel: number | null; source: 'local' | 'provider-quote'; refsUsed: number; refsTotal: number; cap: number }
export type QuoteResponse = { ok: true; quote: QuoteView } | { ok: false; status: number; error: string; issues?: ApiIssue[] };

async function post(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; ok: boolean; b: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, ok: res.ok, b: await json(res) };
  } catch {
    return { status: 0, ok: false, b: {} };
  }
}

export async function requestQuote(body: unknown): Promise<QuoteResponse> {
  const r = await post('/api/genjutsu/quote', body, 25_000);
  if (!r.ok || r.b.success !== true) {
    return { ok: false, status: r.status, error: typeof r.b.error === 'string' ? r.b.error : 'quote_failed', issues: issuesOf(r.b) };
  }
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ok: true,
    quote: {
      credits: num(r.b.credits), gel: num(r.b.gel),
      source: r.b.source === 'provider-quote' ? 'provider-quote' : 'local',
      refsUsed: num(r.b.refsUsed) ?? 0, refsTotal: num(r.b.refsTotal) ?? 0, cap: num(r.b.cap) ?? 0,
    },
  };
}

export interface StartedJob { jobId: string; credits: number; gel: number | null; refsUsed: number; refsTotal: number; engine: string; seconds: number | null }
export type StartResponse =
  | { ok: true; job: StartedJob }
  | { ok: false; status: number; error: string; issues?: ApiIssue[]; credits?: number; price?: { credits: number; gel: number }; refunded?: boolean; authRequired?: boolean };

export async function startGeneration(body: unknown): Promise<StartResponse> {
  const r = await post('/api/genjutsu/generate', body, 55_000);
  const b = r.b;
  if (r.ok && b.success === true && typeof b.jobId === 'string') {
    return {
      ok: true,
      job: {
        jobId: b.jobId, credits: typeof b.credits === 'number' ? b.credits : 0, gel: typeof b.gel === 'number' ? b.gel : null,
        refsUsed: typeof b.refsUsed === 'number' ? b.refsUsed : 0, refsTotal: typeof b.refsTotal === 'number' ? b.refsTotal : 0,
        engine: typeof b.engine === 'string' ? b.engine : '', seconds: typeof b.seconds === 'number' ? b.seconds : null,
      },
    };
  }
  const price = isObj(b.price) && typeof b.price.credits === 'number' && typeof b.price.gel === 'number' ? { credits: b.price.credits, gel: b.price.gel } : undefined;
  return {
    ok: false, status: r.status, error: typeof b.error === 'string' ? b.error : 'failed', issues: issuesOf(b),
    ...(typeof b.credits === 'number' ? { credits: b.credits } : {}), ...(price ? { price } : {}),
    ...(b.refunded === true ? { refunded: true } : {}), ...(b.authRequired === true ? { authRequired: true } : {}),
  };
}

export type StatusResponse =
  | { ok: true; done: false; state: string }
  | { ok: true; done: true; state: 'ready'; videoUrl: string }
  | { ok: true; done: true; state: 'failed'; error: string | null; refunded: boolean }
  | { ok: false; status: number };

export async function fetchStatus(jobId: string): Promise<StatusResponse> {
  try {
    const res = await fetch(`/api/genjutsu/status?id=${encodeURIComponent(jobId)}`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(110_000) });
    const b = await json(res);
    if (!res.ok || b.success !== true) return { ok: false, status: res.status };
    if (b.done !== true) return { ok: true, done: false, state: typeof b.state === 'string' ? b.state : 'processing' };
    if (b.state === 'ready' && typeof b.videoUrl === 'string') return { ok: true, done: true, state: 'ready', videoUrl: b.videoUrl };
    return { ok: true, done: true, state: 'failed', error: typeof b.error === 'string' ? b.error : null, refunded: b.refunded === true };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The signed-in user's balance in credits, or null (a guest, or an outage — the panel then simply does not gate on it). */
export async function fetchBalanceCredits(): Promise<number | null> {
  try {
    const res = await fetch('/api/credits/balance', { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const b = await json(res);
    return typeof b.balance === 'number' && Number.isFinite(b.balance) ? gelToCredits(b.balance) : null;
  } catch {
    return null;
  }
}
