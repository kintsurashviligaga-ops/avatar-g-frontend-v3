/**
 * lib/ai/lyriaMusic.ts — Google **Lyria 3** music generation on **Vertex AI** (MASTER TASK v3.1: Lyria is the
 * authorized music path, Vertex the only transport). Lyria 3 generates FULL SONGS — vocals, timed lyrics (via
 * [Verse]/[Chorus] tags) — and instrumental arrangements, so it serves both. Cost bills to the Google Cloud project.
 *
 * Vertex has no Interactions surface: the model answers `:generateContent` on the global endpoint, and ONLY with
 * `responseModalities: ["AUDIO","TEXT"]` (["AUDIO"] alone is a 400 INVALID_ARGUMENT) — both proven in the Part 0 T2
 * test, 2026-10-08 (30.8 s MP3). The audio comes back as an inlineData part, which extractAudio's deep search finds.
 * The Developer API's /v1beta/interactions route (the AI Studio key) is gone: with GEMINI_TRANSPORT unset or `vertex`
 * the call goes to Vertex, and with anything else, or Vertex unconfigured, Lyria is "not configured" and nothing is sent.
 *
 * LIVE-BY-DEFAULT when Vertex is configured; LYRIA_ENABLED=0 switches it off, which leaves studio music's Auto with NO
 * engine (app/api/ai/music: "Lyria is not configured"). EVERY path is null/failure-safe: no access, quota, timeout, or
 * a contract drift returns null, and the music route answers that with an explicit 502 and a refund. Nothing runs
 * behind Lyria (R7: the old Udio → ElevenLabs → MusicGen failover was removed), so a transient preview-model 503 is a
 * failed request.
 */
import { googleModelFetch, googleTransportBlocker } from '@/lib/ai/google/transport';
import { reportGeminiFallback } from '@/lib/ai/geminiFallbackReport';
import { isEnabledByDefault } from '@/lib/env/flag';

const GEN_TIMEOUT_MS = 150_000; // bounded under the route's 300s ceiling
/** What a Lyria miss falls back to, as the fallback report states it: nothing (R7) — the music route fails and refunds. */
export const LYRIA_FALLBACK = 'nothing (no fallback engine, R7): the request fails and is refunded';

/** Default Lyria 3 model (env-overridable via LYRIA_MODEL). `clip` is the RELIABLE default — verified live
 *  200 + audio (audio/mpeg). `pro` gives full-length arrangements but currently 500s under "high demand",
 *  which would fail those requests outright — switch to it once it's stable. */
export function lyriaModel(): string {
  return (process.env.LYRIA_MODEL || 'lyria-3-clip-preview').trim();
}

/** True iff Vertex AI can serve AND Lyria isn't explicitly killed (LYRIA_ENABLED=0/false/no/off). LIVE-BY-DEFAULT: a
 *  configured Vertex is enough to make Lyria the primary music engine; the flag exists only as an instant revert. */
export function hasLyriaProvider(): boolean {
  return isEnabledByDefault(process.env.LYRIA_ENABLED) && !googleTransportBlocker();
}

/** The Vertex request body (exported for tests): plain generateContent, audio + text modalities. */
export function buildLyriaVertexBody(input: string): Record<string, unknown> {
  return {
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
  };
}

export interface LyriaTrack {
  base64: string;
  mime: string;
}

// A big base64-ish string (the audio payload is a large base64 blob; short strings are ids/text/mime).
function looksBase64(s: unknown): s is string {
  return typeof s === 'string' && s.length > 2000 && /^[A-Za-z0-9+/_=-]+$/.test(s.slice(0, 160));
}

/**
 * Find the audio payload in a Lyria 3 response. The exact shape of the audio field is not stable across the
 * preview (a candidates/parts inlineData block today), so rather than hard-code one path we DEEP-SEARCH for the
 * LARGEST base64 blob in the whole response — for an audio response that blob IS the track — and pick up a sibling
 * mime.
 */
function extractAudio(j: unknown): LyriaTrack | null {
  if (j == null || typeof j !== 'object') return null;
  let best: string | null = null;
  let bestMime = 'audio/wav';
  const stack: unknown[] = [j];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue; }
    if (typeof cur !== 'object') continue;
    const obj = cur as Record<string, unknown>;
    const siblingMime = (obj.mimeType || obj.mime_type || obj.mime) as string | undefined;
    for (const [k, v] of Object.entries(obj)) {
      if (looksBase64(v)) {
        if (!best || (v as string).length > best.length) {
          best = v as string;
          if (typeof siblingMime === 'string' && siblingMime.startsWith('audio')) bestMime = siblingMime;
          else if (/audio|wav|mp3|mpeg|ogg/i.test(k)) bestMime = 'audio/wav';
        }
      } else if (v && typeof v === 'object') {
        stack.push(v);
      }
    }
  }
  return best ? { base64: best, mime: bestMime } : null;
}

/**
 * Ask the budget guard whether one more track fits.
 *
 * ⚠️ FAILS CLOSED (Music Studio v1, Phase 2). This used to answer `true` when the guard threw, and accepted a verdict the
 * guard reached without a readable spend ledger (`degraded`, which BillingGuard then answered "allowed"), so a broken
 * budget check silently authorized a paid Lyria call. Now a guard that throws or cannot read the spend refuses; the
 * caller's failure path refunds the reserved credits (the request is never charged for a track it did not get).
 */
export async function musicWithinBudget(model: string = lyriaModel()): Promise<boolean> {
  try {
    const { canProceed } = await import('@/lib/services/billing/BillingGuard');
    const { estimateCost } = await import('@/lib/services/billing/costModel');
    const decision = await canProceed(estimateCost({ service: 'music', model, units: 1 }));
    return decision.allowed && !decision.degraded;
  } catch {
    return false;
  }
}

/** Book one generated track against the platform budget. Best-effort: the audio is already in hand. */
export async function recordMusicUsage(model: string = lyriaModel()): Promise<void> {
  try {
    const { recordUsage } = await import('@/lib/services/billing/BillingGuard');
    const { estimateCost } = await import('@/lib/services/billing/costModel');
    await recordUsage(estimateCost({ service: 'music', model, units: 1 }));
  } catch (err) {
    // Never surfaces to the caller (the track is already in hand). recordUsage itself never throws and keeps a row the
    // ledger refused, so this is the guard module or the estimate failing: the track's cost is unknown. Said loudly.
    // eslint-disable-next-line no-console
    console.error('[lyria] booking failed, the track is unbooked:', err instanceof Error ? err.message : err);
  }
}

/**
 * Generate a Lyria 3 track (instrumental OR vocal song). Returns { base64, mime } or null on ANY miss; the
 * caller turns null into its own explicit failure (no other engine runs behind Lyria, R7). Never throws.
 * `model` (default lyriaModel()) is the clip or Pro: both go to Vertex `:generateContent`.
 */
export async function generateLyriaTrack(args: { prompt: string; lyrics?: string; instrumental?: boolean; model?: string }): Promise<LyriaTrack | null> {
  const model = args.model?.trim() || lyriaModel();
  if (googleTransportBlocker() || !args.prompt?.trim()) return null;

  // BUDGET GATE (Master Task §2.1.1). Music is a real per-track provider charge, so it passes the same
  // guard as image/video. A refusal returns null — the SAME shape every other miss returns here — so the
  // caller's existing failure path (502 + refund) handles it without a new error path. `guardedCall` books the cost
  // only on success, and refuses if the guard itself is broken.
  if (!(await musicWithinBudget(model))) {
    // eslint-disable-next-line no-console
    console.warn('[lyria] refused by the platform budget guard → the request fails (no fallback, R7)');
    return null;
  }

  // Lyria 3 is steered entirely via the prompt string: append instrumental intent, or the custom lyrics with
  // the [Verse]/[Chorus] section tags the model understands, so a vocal song is sung with those words.
  let input = args.prompt.trim().slice(0, 1500);
  if (args.instrumental) input += '. Instrumental, no vocals.';
  else if (args.lyrics?.trim()) input += `\n\nLyrics:\n${args.lyrics.trim().slice(0, 1500)}`;

  try {
    const res = await googleModelFetch(model, 'generateContent', {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify(buildLyriaVertexBody(input)),
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, status: res.status, detail: body, model });
      return null;
    }
    const j = await res.json().catch(() => null);
    const audio = extractAudio(j);
    if (!audio) {
      reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, detail: 'response carried no audio', model });
      return null;
    }
    // Book the spend AFTER a real track came back — a failed/empty generation costs us nothing, and
    // charging the envelope for it would slowly starve the budget on a misbehaving provider.
    void recordMusicUsage(model);
    return audio;
  } catch (e) {
    reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, detail: e instanceof Error ? e.message : String(e), model });
    return null;
  }
}

/** Every text part of a response (Lyria returns a caption / lyric sheet beside the audio). */
function extractText(j: unknown): string | null {
  const out: string[] = [];
  const stack: unknown[] = [j];
  while (stack.length && out.length < 20) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue; }
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (k === 'text' && typeof v === 'string' && v.trim() && v.length < 8000) out.push(v.trim());
      else if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out.length ? out.reverse().join('\n').slice(0, 8000) : null;
}

export type LyriaResult =
  | { ok: true; track: LyriaTrack; caption: string | null }
  | { ok: false; reason: 'not_configured' | 'http' | 'no_audio' | 'timeout' | 'network'; status?: number };

/**
 * ONE Lyria request with an exact input and model, for Music Studio v1 (lib/music/studio). No budget gate and no
 * bookkeeping here: the studio checks the budget before it charges and books the spend itself. The caller's signal
 * aborts it. Never throws; the provider's body is reported, never returned.
 */
export async function lyriaRequest(input: string, model: string, signal: AbortSignal): Promise<LyriaResult> {
  if (googleTransportBlocker() || !input.trim()) return { ok: false, reason: 'not_configured' };
  const timeout = AbortSignal.timeout(GEN_TIMEOUT_MS);
  const both = typeof (AbortSignal as unknown as { any?: unknown }).any === 'function'
    ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([signal, timeout])
    : signal;
  try {
    const res = await googleModelFetch(model, 'generateContent', { method: 'POST', cache: 'no-store', body: JSON.stringify(buildLyriaVertexBody(input)), signal: both });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, status: res.status, detail: body, model });
      return { ok: false, reason: 'http', status: res.status };
    }
    const j = await res.json().catch(() => null);
    const track = extractAudio(j);
    if (!track) {
      reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, detail: 'response carried no audio', model });
      return { ok: false, reason: 'no_audio' };
    }
    return { ok: true, track, caption: extractText(j) };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    reportGeminiFallback({ leg: 'lyria', fallbackTo: LYRIA_FALLBACK, detail: e instanceof Error ? e.message : String(e), model });
    return { ok: false, reason: name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
