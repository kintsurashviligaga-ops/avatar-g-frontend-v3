/**
 * lib/video/omniClip.ts — the video service's clip on Gemini Omni Flash (Vertex AI, the Interactions API): 10 s, or a
 * Georgian line at any length. Server-only.
 *
 * ⚠️ WHY OMNI. Veo 3.1 renders 4, 6 or 8 s; GG asked for 10 (2026-10-25 16:22Z) and approved Omni Flash at 720p ✦69 /
 * 1080p ✦102 (card 16:51Z). Veo cannot say Georgian, so a clip in which a character does is Omni's at every length (GG
 * 2026-10-26 10:44Z: one TTS voice spoke for three people; card 10:55Z, the price book's omniClip rows). The Vertex probe that day (one paid call, ~$1.02) settled the request shape below:
 *   POST https://aiplatform.googleapis.com/v1beta1/projects/<P>/locations/global/interactions   (global only)
 *   { model, input: [image?, text], response_format: { type: 'video', aspect_ratio, resolution, duration: '10s' },
 *     generation_config: { video_config: { task: 'image_to_video' | 'text_to_video' } }, background: true, store: true }
 * → { id, status: 'in_progress' } in ~2 s; GET …/interactions/<id> reads `completed` after ~50 s, the clip inline as base64
 * in the last model output. `store: false` turns background mode off on Vertex, so a stored interaction is the price of not
 * holding a request open for a minute. The first frame is the photo, given as an image part and named by `<FIRST_FRAME>`.
 *
 * SUBMIT NOW, POLL LATER — the same two short requests as the Veo clip (lib/genjutsu/veoScene), polled by the same
 * GET /api/genjutsu/status, refunded by the same ref when it fails. The submit runs inside guardedCall at Omni's list price
 * for the seconds and resolution; a definitive refusal books $0. An ambiguous submit (timeout, 5xx) is never re-sent.
 *
 * Vertex only: the credential is the Workload Identity token every Vertex call uses (lib/veo/vertexAuth), the host is
 * aiplatform.googleapis.com, and nothing here can reach the consumer Gemini API.
 *
 * AN UPLOADED VIDEO, EDITED OR EXTENDED (GG 2026-10-25 16:58Z, card 17:04Z; lib/video/omniEdit) is the same call with the
 * video as an inline part and `task: 'edit' | 'extend'`. The probe that day (~$0.67) settled two rules: an edit REFUSES an
 * aspect ratio (400, free) — both inherit the input's frame — and an extend returns the input and the continuation as one
 * file. The input is sent at 720p or less (app/api/video/omni-edit transcodes it): that is the rate the probe measured.
 */
import 'server-only';
import { BudgetExceededError, guardedCall } from '@/lib/services/billing/guardedCall';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { deliverScene, type SceneProgress } from '@/lib/genjutsu/veoScene';
import { VertexAuthError, getVertexAccessToken, vertexAiConfig } from '@/lib/veo/vertexAuth';
import { ambiguousSubmitFailure, classifySubmitHttpFailure, isSafetyWording, readGoogleError } from '@/lib/veo/vertexClient';
import type { VeoFailureReason } from '@/lib/veo/types';
import type { DirectClipAspect, DirectClipPhoto, DirectClipResolution } from './directClip';

export const OMNI_MODEL = 'gemini-omni-1.2-flash';
/**
 * v5.1 M-3 (GG D-07): 1.2 Flash is GA and 30% cheaper than the 1.1 preview. 1.1 stays for two things only: the rollback
 * (VERTEX_OMNI_MODEL=gemini-omni-1.1-flash-preview, while Google serves it) and continuing a clip it made before the move
 * (a continuation names the model that made the interaction; the job id says which, lib/genjutsu/chargeToken `m2`).
 */
export const OMNI_LEGACY_MODEL = 'gemini-omni-1.1-flash-preview';
export type OmniModel = typeof OMNI_MODEL | typeof OMNI_LEGACY_MODEL;

/** The model a new clip or edit goes to: the default, or the 1.1 rollback when the env names exactly it. */
export function omniModel(): OmniModel {
  return process.env.VERTEX_OMNI_MODEL?.trim() === OMNI_LEGACY_MODEL ? OMNI_LEGACY_MODEL : OMNI_MODEL;
}

/** The model that made an interaction, from its job id's `m2` marker (ids from before M-3 carry none: 1.1). */
export const omniModelOfJob = (omni12: boolean): OmniModel => (omni12 ? OMNI_MODEL : OMNI_LEGACY_MODEL);

/** Video output $ per 1M tokens (Vertex pricing page, read 2026-11-12): 1.2 Flash $12.00, 1.1 Flash $17.50. */
const OMNI_VIDEO_OUT_USD_PER_MTOK: Readonly<Record<OmniModel, number>> = { [OMNI_MODEL]: 12, [OMNI_LEGACY_MODEL]: 17.5 };
/** Video output tokens a second (same page, both versions): 5,792 at 720p, 8,688 at 1080p. */
const OMNI_OUT_TOKENS_PER_SEC: Readonly<Record<DirectClipResolution, number>> = { '720p': 5_792, '1080p': 8_688 };

/** One rendered second's list price for a model and resolution. */
export function omniUsdPerSec(resolution: DirectClipResolution, model: OmniModel = OMNI_MODEL): number {
  return (OMNI_OUT_TOKENS_PER_SEC[resolution] * OMNI_VIDEO_OUT_USD_PER_MTOK[model]) / 1e6;
}

/** The default model's rates (1.2 Flash). */
export const OMNI_USD_PER_SEC: Readonly<Record<DirectClipResolution, number>> = {
  '720p': omniUsdPerSec('720p'),
  '1080p': omniUsdPerSec('1080p'),
};

/** An input video's tokens a second at 720p (measured on the 2026-10-25 edit probe: 17,478 for 3 s) × $1.50 per 1M (1.1 and 1.2). */
export const OMNI_INPUT_VIDEO_USD_PER_SEC = (5_826 * 1.5) / 1e6;

const SUBMIT_TIMEOUT_MS = 30_000;
/** A finished interaction carries the clip inline (4 MB of base64 at 720p, more at 1080p). */
const POLL_TIMEOUT_MS = 45_000;
const WEEK_SEC = 604_800;
/** An interaction id as Vertex returns it ("ChBj…"): it becomes a URL path segment, so nothing else is accepted. */
const INTERACTION_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;

export const isOmniInteractionId = (id: string): boolean => INTERACTION_ID_RE.test(id);

function interactionsUrl(projectId: string, id?: string): string {
  const base = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/global/interactions`;
  return id ? `${base}/${id}` : base;
}

export interface OmniSubmitInput {
  /** The composed prompt (lib/video/clipPrompt, engine 'omni'). `<FIRST_FRAME>` is added here when a photo leads. */
  prompt: string;
  aspect: DirectClipAspect;
  resolution: DirectClipResolution;
  seconds: number;
  /** One photo: the clip's first frame. */
  firstFrame?: DirectClipPhoto;
  userId: string;
}

/** The request body Vertex takes (pure, so the shape is tested without a network). */
export function omniRequestBody(input: Omit<OmniSubmitInput, 'userId'>, model: OmniModel = OMNI_MODEL): Record<string, unknown> {
  const seconds = Math.min(10, Math.max(3, Math.round(input.seconds)));
  return {
    model,
    input: [
      ...(input.firstFrame ? [{ type: 'image', data: input.firstFrame.base64, mime_type: input.firstFrame.mimeType }] : []),
      { type: 'text', text: input.firstFrame ? `<FIRST_FRAME> ${input.prompt}` : input.prompt },
    ],
    response_format: { type: 'video', aspect_ratio: input.aspect, resolution: input.resolution, duration: `${seconds}s` },
    generation_config: { video_config: { task: input.firstFrame ? 'image_to_video' : 'text_to_video' } },
    background: true,
    store: true,
  };
}

export type OmniSubmit =
  | { ok: true; id: string; model: OmniModel }
  | { ok: false; reason: VeoFailureReason | 'budget'; retryable: boolean };

/** A definitive refusal created nothing and bills nothing → $0; an ambiguous one may have → the estimate stays. */
function submitActualCost(result: unknown): number | undefined {
  const r = result as OmniSubmit | null;
  return r && !r.ok && r.reason !== 'ambiguous' ? 0 : undefined;
}

async function postInteraction(body: Record<string, unknown>, model: OmniModel): Promise<OmniSubmit> {
  const config = vertexAiConfig();
  if (!config) return { ok: false, reason: 'not_configured', retryable: false };
  let res: Response;
  try {
    res = await fetch(interactionsUrl(config.projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getVertexAccessToken(false)}` },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    });
  } catch (err) {
    // A token that could not be minted sent nothing; a POST that left without an answer may have created the clip.
    if (err instanceof VertexAuthError) return { ok: false, reason: err.code === 'not_configured' ? 'not_configured' : 'auth', retryable: false };
    const f = ambiguousSubmitFailure(err, SUBMIT_TIMEOUT_MS);
    return { ok: false, reason: f.reason, retryable: f.retryable };
  }
  if (!res.ok) {
    const f = classifySubmitHttpFailure(res.status, await readGoogleError(res));
    // eslint-disable-next-line no-console
    console.warn('[video.omni] submit refused:', f.detail);
    return { ok: false, reason: f.reason, retryable: f.retryable };
  }
  const created = (await res.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof created?.id === 'string' ? created.id : '';
  // A 2xx without an id we can poll may still be a clip being made: never re-sent, refunded by the caller.
  return isOmniInteractionId(id) ? { ok: true, id, model } : { ok: false, reason: 'ambiguous', retryable: false };
}

/** Submit one clip inside the platform's Google budget. Never throws. */
export async function submitOmniClip(input: OmniSubmitInput): Promise<OmniSubmit> {
  const model = omniModel();
  try {
    return await guardedCall(
      {
        service: 'video',
        model,
        units: input.seconds,
        unitCostUsd: omniUsdPerSec(input.resolution, model),
        userId: input.userId,
        promptSummary: input.prompt.slice(0, 200),
        actualCost: submitActualCost,
      },
      () => postInteraction(omniRequestBody(input, model), model),
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) return { ok: false, reason: 'budget', retryable: false };
    // eslint-disable-next-line no-console
    console.warn('[video.omni] submit threw before a clip existed:', err instanceof Error ? err.message : String(err));
    return { ok: false, reason: 'unavailable', retryable: true };
  }
}

export interface OmniEditSubmitInput {
  op: 'edit' | 'extend';
  /** The user's words, as typed. */
  prompt: string;
  /** The uploaded video, transcoded to an H.264 / AAC mp4 at 720p or less… */
  video?: { base64: string; mimeType: 'video/mp4' };
  /** …or a clip Omni made, continued by its own interaction (lib/video/omniEdit omniSourceOfJob): its id, its frame and the
   * model that made it (a continuation stays on that model). */
  previous?: { id: string; aspect: DirectClipAspect; model: OmniModel };
  /** Its measured length, for the list-price estimate (its tokens are billed too). */
  inputSec: number;
  /** The `duration` asked for (lib/video/omniEdit omniEditRequestSeconds): an edit's own length, an extend's new seconds. */
  seconds: number;
  resolution: DirectClipResolution;
  userId: string;
}

/**
 * The edit / extend body (pure). No aspect ratio for an upload: Vertex refuses one for an edit, and both keep the video's
 * frame. A clip Omni made is continued as Google's own Omni script does it: `previous_interaction_id`, the words, the frame
 * and length asked for, and no `task` (the script sends none with a previous interaction; the words say edit or extend).
 */
export function omniEditRequestBody(input: Omit<OmniEditSubmitInput, 'userId' | 'inputSec'>, model: OmniModel = OMNI_MODEL): Record<string, unknown> {
  const seconds = Math.min(10, Math.max(3, Math.round(input.seconds)));
  if (input.previous) {
    return {
      model: input.previous.model,
      previous_interaction_id: input.previous.id,
      input: [{ type: 'text', text: input.prompt }],
      response_format: { type: 'video', aspect_ratio: input.previous.aspect, resolution: input.resolution, duration: `${seconds}s` },
      background: true,
      store: true,
    };
  }
  if (!input.video) throw new Error('omni edit: no video and no previous interaction');
  return {
    model,
    input: [
      { type: 'video', data: input.video.base64, mime_type: input.video.mimeType },
      { type: 'text', text: input.prompt },
    ],
    response_format: { type: 'video', resolution: input.resolution, duration: `${seconds}s` },
    generation_config: { video_config: { task: input.op } },
    background: true,
    store: true,
  };
}

/** The list price of one edit / extend: the seconds Omni renders, and the input video's own tokens. */
export function omniEditListUsd(input: { seconds: number; inputSec: number; resolution: DirectClipResolution }, model: OmniModel = OMNI_MODEL): number {
  const seconds = Math.min(10, Math.max(3, Math.round(input.seconds)));
  return seconds * omniUsdPerSec(input.resolution, model) + Math.min(10.25, Math.max(0, input.inputSec)) * OMNI_INPUT_VIDEO_USD_PER_SEC;
}

/** Submit one edit or extend inside the platform's Google budget. Never throws. */
export async function submitOmniEdit(input: OmniEditSubmitInput): Promise<OmniSubmit> {
  // A continuation stays on the model that made the clip; an upload goes to the current model.
  const model = input.previous?.model ?? omniModel();
  try {
    return await guardedCall(
      {
        service: 'video',
        model,
        // Video seconds, as every video line books them; the rate carries the input video's tokens too.
        units: Math.min(10, Math.max(3, Math.round(input.seconds))),
        unitCostUsd: omniEditListUsd(input, model) / Math.min(10, Math.max(3, Math.round(input.seconds))),
        userId: input.userId,
        promptSummary: `${input.op}: ${input.prompt}`.slice(0, 200),
        actualCost: submitActualCost,
      },
      () => postInteraction(omniEditRequestBody(input, model), model),
    );
  } catch (err) {
    if (err instanceof BudgetExceededError) return { ok: false, reason: 'budget', retryable: false };
    // eslint-disable-next-line no-console
    console.warn('[video.omni] edit submit threw before a clip existed:', err instanceof Error ? err.message : String(err));
    return { ok: false, reason: 'unavailable', retryable: true };
  }
}

// ─── Poll + deliver ──────────────────────────────────────────────────────────────────────────────────────────────

export type OmniVideo = { kind: 'bytes'; base64: string; mimeType: string } | { kind: 'gcs'; gcsUri: string; mimeType: string };

/** What a GET of an interaction says, read from its JSON (pure). */
export type OmniReading =
  | { state: 'processing' }
  | { state: 'completed'; video: OmniVideo | null; usage: Record<string, number> | null }
  | { state: 'failed'; filtered: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The first video part in `node` (depth-first): `{ type: 'video', data | uri, mime_type }`. */
function findVideo(node: unknown, depth = 0): OmniVideo | null {
  if (depth > 6 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const v = findVideo(item, depth + 1);
      if (v) return v;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  if (o.type === 'video') {
    const mimeType = typeof o.mime_type === 'string' && o.mime_type.startsWith('video/') ? o.mime_type : 'video/mp4';
    if (typeof o.data === 'string' && o.data.length > 0) return { kind: 'bytes', base64: o.data, mimeType };
    if (typeof o.uri === 'string' && o.uri.startsWith('gs://')) return { kind: 'gcs', gcsUri: o.uri, mimeType };
  }
  for (const v of Object.values(o)) {
    const found = findVideo(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The token counts Vertex reports (numbers only, one level deep), for the job's own record — never the user's screen. */
function usageOf(raw: unknown): Record<string, number> | null {
  if (!isObj(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    // `input_tokens_by_modality: [{ modality: 'video', tokens: 17478 }, …]` — in no fixed order: read by its modality.
    else if (Array.isArray(v)) {
      for (const e of v) if (isObj(e) && typeof e.modality === 'string' && typeof e.tokens === 'number' && Number.isFinite(e.tokens)) out[`${k}.${e.modality.toLowerCase()}`] = e.tokens;
    } else if (isObj(v)) for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number' && Number.isFinite(v2)) out[`${k}.${k2}`] = v2;
  }
  return Object.keys(out).length ? out : null;
}

export function readInteraction(body: unknown): OmniReading {
  if (!isObj(body)) return { state: 'processing' };
  const status = typeof body.status === 'string' ? body.status.toLowerCase() : '';
  if (status === 'completed') {
    // The model's own output, never the photo or video the request sent: Vertex echoes every input part back as a
    // `user_input` step (an edit's source video among them), so the `model_output` step is read first, then any other.
    const steps = Array.isArray(body.steps) ? body.steps : [];
    const model = steps.filter((s) => isObj(s) && s.type === 'model_output');
    const outputs = steps.filter((s) => !(isObj(s) && (s.type === 'user_input' || 'user_input' in s)));
    const video = findVideo(model.length ? model.reverse() : outputs.length ? outputs.reverse() : body.outputs ?? null);
    return { state: 'completed', video, usage: usageOf(body.usage) };
  }
  if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'expired' || status === 'incomplete') {
    const err = isObj(body.error) ? body.error : null;
    const message = typeof err?.message === 'string' ? err.message : '';
    return { state: 'failed', filtered: isSafetyWording(message) };
  }
  return { state: 'processing' };
}

/** What a finished interaction without a clip says (pure, for the log): its status, Google's message, its steps, its usage. */
export function omniMissDetail(body: unknown): { status: string; error: string; steps: string[]; usage: Record<string, number> | null } {
  const o = isObj(body) ? body : {};
  const err = isObj(o.error) ? o.error : null;
  const steps = Array.isArray(o.steps) ? o.steps : [];
  return {
    status: typeof o.status === 'string' ? o.status.slice(0, 40) : '',
    error: typeof err?.message === 'string' ? err.message.slice(0, 300) : '',
    // The kinds of each step and of its parts — never their data (an inline video is megabytes).
    steps: steps.slice(0, 8).map((st) => {
      if (!isObj(st)) return '?';
      const parts = Array.isArray(st.content) ? st.content.slice(0, 6).map((c) => (isObj(c) && typeof c.type === 'string' ? c.type.slice(0, 20) : '?')) : [];
      return `${typeof st.type === 'string' ? st.type.slice(0, 30) : '?'}[${parts.join(',')}]`;
    }),
    usage: usageOf(o.usage),
  };
}

export type OmniProgress = SceneProgress & { usage?: Record<string, number> | null };

/**
 * Poll once and, when done, host the clip at `path` in our storage (a fixed path: a re-poll re-signs the hosted object
 * without fetching the interaction again). Never throws — a transient miss reads as "still working".
 */
export async function pollOmniClip(id: string, path: string): Promise<OmniProgress> {
  const hosted = await createSignedAssetUrl('renders', path, WEEK_SEC).catch(() => null);
  if (hosted) return { state: 'ready', url: hosted };
  if (!isOmniInteractionId(id)) return { state: 'failed', reason: 'generation_failed' };
  const config = vertexAiConfig();
  if (!config) return { state: 'processing' };
  let body: unknown;
  try {
    const res = await fetch(interactionsUrl(config.projectId, id), {
      headers: { Authorization: `Bearer ${await getVertexAccessToken(false)}` },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (res.status === 404) return { state: 'failed', reason: 'generation_failed' };
    if (!res.ok) return { state: 'processing' };
    body = await res.json();
  } catch {
    return { state: 'processing' };
  }
  const r = readInteraction(body);
  if (r.state === 'processing') return { state: 'processing' };
  // ⚠️ Two extends came back with nothing and no trace (GG 2026-10-26 15:12Z, 15:39Z): what Google said is logged now.
  // eslint-disable-next-line no-console
  if (r.state === 'failed' || !r.video) console.warn('[video.omni] no clip:', JSON.stringify(omniMissDetail(body)));
  if (r.state === 'failed') return { state: 'failed', reason: r.filtered ? 'filtered' : 'generation_failed' };
  if (!r.video) return { state: 'failed', reason: 'generation_failed' };
  const url = await deliverScene(r.video, path);
  return url ? { state: 'ready', url, usage: r.usage } : { state: 'delivering' };
}
