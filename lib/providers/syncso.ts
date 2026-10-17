/**
 * lib/providers/syncso.ts — sync.so lip sync for the talking avatar (GG, 2026-10-17 12:29Z: „შევწყვიტოთ ამ მეთოდის
 * წვალება და პირდაპირ გადავიდეთ გარე lip-sync API-ს (მაგალითად, sync.so-ს) ინტეგრაციაზე").
 *
 * WHY. The dub-match path (the removed lib/avatar/speechMatch) fitted the ElevenLabs line onto the mouth Veo drew for Latin
 * syllables. GG's verdict on the 12:18Z run: the jaw flaps without the shapes of მ / პ / ო / უ, the mouth runs on after
 * the voice, and slowing the voice to fit is unacceptable — „ვიდეო უნდა ერგებოდეს აუდიოს ხანგრძლივობას და არა პირიქით".
 * sync.so redraws the mouth of the clip from the audio itself, so the line keeps its natural speed and the picture is
 * cut to the line, never the line stretched to the picture.
 *
 * API (read 2026-10-17): https://sync.so/docs/api-reference/api/generate-api/create and …/get, https://sync.so/docs/
 * developer-guides/sync-mode. POST /v2/generate { model, input: [video, audio], options } → { id, status }; GET
 * /v2/generate/{id} → status PENDING | PROCESSING | COMPLETED | FAILED | REJECTED with `outputUrl`. Auth: `x-api-key`.
 * `sync_mode: 'bounce'` makes the output the AUDIO's length either way: a longer clip is trimmed to the line, a line a
 * hair longer than the clip plays over the clip bouncing back for that hair.
 *
 * ⚠️ OUTSIDE THE GOOGLE + ELEVENLABS BOUNDARY BY THE OWNER'S WORD, for lip sync only (__tests__/provider-boundary
 * lists this one file). The key is SYNC_API_KEY, entered by the owner in Vercel; without it the Georgian avatar refuses
 * before anything is charged (app/api/avatar/veo). Nothing falls back to another engine.
 *
 * Server-only. Never logs the key or a signed URL.
 */
import 'server-only';

export const SYNC_GENERATE_URL = 'https://api.sync.so/v2/generate';

/** The models this code may ask for, best first for a close-up face; SYNC_LIPSYNC_MODEL picks one, else the first. */
export const SYNC_MODELS = ['lipsync-2-pro', 'lipsync-2', 'sync-3'] as const;
export type SyncModel = (typeof SYNC_MODELS)[number];

/**
 * USD per second of output at 25 fps on the Hobbyist and Creator plans (https://sync.so/pricing, read 2026-10-17).
 * What a delivered avatar costs us, booked with the platform's spend (lib/services/billing/BillingGuard) — not a price.
 */
export const SYNC_USD_PER_SEC: Readonly<Record<SyncModel, number>> = {
  'lipsync-2-pro': 0.08325,
  'lipsync-2': 0.05,
  'sync-3': 0.1334,
};

const REQUEST_TIMEOUT_MS = 20_000;

export function syncConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.SYNC_API_KEY?.trim();
}

export function syncModel(env: NodeJS.ProcessEnv = process.env): SyncModel {
  const m = env.SYNC_LIPSYNC_MODEL?.trim();
  return (SYNC_MODELS as readonly string[]).includes(m ?? '') ? (m as SyncModel) : SYNC_MODELS[0];
}

/** The create body: one video, one audio, the output cut to the audio's length. */
export function lipsyncRequest(o: { videoUrl: string; audioUrl: string; model: SyncModel }): Record<string, unknown> {
  return {
    model: o.model,
    input: [{ type: 'video', url: o.videoUrl }, { type: 'audio', url: o.audioUrl }],
    options: { sync_mode: 'bounce' },
  };
}

/** sync.so's Idempotency-Key alphabet: 1–128 of [A-Za-z0-9._~-]. */
const IDEMPOTENCY = /^[A-Za-z0-9._~-]{1,128}$/;

export type SyncStart =
  | { ok: true; id: string }
  /** `refused`: a retry cannot change it (bad key, no credits, an input it will not take) — fail and refund. */
  | { ok: false; reason: 'not_configured' | 'refused'; code: string }
  /** `busy` (the plan's concurrency) or `unavailable` (an outage, a timeout): ask again on the next poll. */
  | { ok: false; reason: 'busy' | 'unavailable'; code: string };

export type SyncPoll =
  | { state: 'pending' }
  | { state: 'done'; url: string; seconds: number | null }
  | { state: 'failed'; code: string };

type Fetch = typeof fetch;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function body(res: Response): Promise<Record<string, unknown>> {
  const j = (await res.json().catch(() => null)) as unknown;
  return j && typeof j === 'object' ? (j as Record<string, unknown>) : {};
}

/** Start one lip sync. Never throws. `idempotencyKey` makes a repeated start of the same job the same generation. */
export async function startLipsync(o: {
  videoUrl: string;
  audioUrl: string;
  idempotencyKey: string;
  model?: SyncModel;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: Fetch;
}): Promise<SyncStart> {
  const env = o.env ?? process.env;
  const key = env.SYNC_API_KEY?.trim();
  if (!key) return { ok: false, reason: 'not_configured', code: 'no_key' };
  if (!IDEMPOTENCY.test(o.idempotencyKey)) return { ok: false, reason: 'refused', code: 'bad_idempotency_key' };
  const f = o.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(SYNC_GENERATE_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', 'Idempotency-Key': o.idempotencyKey },
      body: JSON.stringify(lipsyncRequest({ videoUrl: o.videoUrl, audioUrl: o.audioUrl, model: o.model ?? syncModel(env) })),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: 'unavailable', code: 'network' };
  }
  const j = await body(res);
  const code = text(j.errorCode) ?? `http_${res.status}`;
  if (res.ok) {
    const id = text(j.id);
    return id ? { ok: true, id } : { ok: false, reason: 'unavailable', code: 'no_id' };
  }
  // The same key with another payload (a start whose id was never kept): the generation it already made is this job's.
  if (res.status === 409 && text(j.generationId)) return { ok: true, id: text(j.generationId)! };
  if (res.status === 429) return { ok: false, reason: 'busy', code };
  if (res.status >= 500 || res.status === 408) return { ok: false, reason: 'unavailable', code };
  return { ok: false, reason: 'refused', code };
}

/** A generation's state as GET /v2/generate/{id} reports it. Pure. */
export function readGeneration(j: Record<string, unknown>): SyncPoll {
  const status = text(j.status)?.toUpperCase();
  if (status === 'COMPLETED') {
    const url = text(j.outputUrl);
    if (!url || !/^https:\/\//i.test(url)) return { state: 'failed', code: 'no_output' };
    const sec = Number(j.outputDuration);
    return { state: 'done', url, seconds: Number.isFinite(sec) && sec > 0 ? sec : null };
  }
  if (status === 'FAILED' || status === 'REJECTED') return { state: 'failed', code: text(j.errorCode) ?? status.toLowerCase() };
  return { state: 'pending' };
}

/** Ask once how a generation is doing. Never throws: a transient miss reads as still working. */
export async function pollLipsync(id: string, o: { env?: NodeJS.ProcessEnv; fetchImpl?: Fetch } = {}): Promise<SyncPoll> {
  const env = o.env ?? process.env;
  const key = env.SYNC_API_KEY?.trim();
  if (!key) return { state: 'failed', code: 'no_key' };
  const f = o.fetchImpl ?? fetch;
  try {
    const res = await f(`${SYNC_GENERATE_URL}/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return readGeneration(await body(res));
    if (res.status === 404 || res.status === 410) return { state: 'failed', code: 'not_found' };
    if (res.status === 401 || res.status === 403) return { state: 'failed', code: 'unauthorized' };
    return { state: 'pending' };
  } catch {
    return { state: 'pending' };
  }
}
