import { NextRequest, NextResponse } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { requireAuthForGeneration } from '@/lib/api/requireAuthForGeneration';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { getActiveConfig } from '@/lib/agent/optimizer/activeConfig';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { generateMusicCover, generateVoiceSong, generateMusic } from '@/lib/ai/replicate';
import { generateUdioTrack } from '@/lib/udio/client';
import { hasLyriaProvider, generateLyriaTrack } from '@/lib/ai/lyriaMusic';
import { hasUdioApiKey } from '@/lib/chat/mediaKeys';
import { trimAudioToDuration } from '@/lib/audio/trimAudio';
import { transcodeVoiceToMp3 } from '@/lib/audio/transcode';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { uploadAndSign, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { runWithLatencyFailover, type ProviderAttempt } from '@/lib/providers/latencyFailover';
import { isProviderTripped, recordProviderResult } from '@/lib/orchestrator/idempotency';
import { randomUUID } from 'node:crypto';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { applyApiGuards } from '@/lib/api/guard';
import { debitExistsForRef, deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { billingLocale, ledgerUnavailableBody, replayRefusedBody } from '@/lib/api/billingCopy';
import { providerErrorBody } from '@/lib/api/providerError';
import { claimIdempotencyKey, releaseIdempotencyKey, hashPayload } from '@/lib/orchestrator/idempotency';
import { creditCostFor } from '@/lib/credits/pricing';
import { settleMusicCharge } from '@/lib/credits/musicSettlement';
import { buildMusicBrief, flattenMusicBrief, type MusicBrief } from '@/lib/ai/musicBrief';
import { promptToEnglish, lastTranslateOutcome } from '@/lib/ai/promptToEnglish';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { probeTrackDurationSec } from '@/lib/audio/trackDuration';
import { sanitizeStyle } from '@/lib/studio/style';
import { resolveTemplateContext } from '@/lib/studio/templateContext';
import {
  musicControlsReport, musicStyleLine, musicgenParams, parseMusicControls, promptDirectives, udioParams,
  type MusicControls, type MusicControlsReport, type MusicEngineId,
} from '@/lib/ai/musicControls';
import { isAcceptableMusicReference } from '@/lib/ai/musicReference';
import { isMusicEngineId } from '@/lib/studio/musicEngines';

/**
 * Assistant music generation.
 *
 * POST { prompt } → { success, url }. The Smart Assistant's Music mode sends a
 * vibe/description here; a track is composed and RE-HOSTED to Supabase Storage
 * (CSP media-src allows *.supabase.co) so the <audio> element plays + the track
 * persists past the provider's short-lived CDN URL.
 *
 * Engine (composeTrackUrl) — ONE engine per request, for BOTH vocal songs and instrumentals (Lyria 3 generates
 * full songs with vocals + lyrics, so there's no vocal/instrumental switching):
 *   Auto → Google Lyria 3 (Gemini music) ONLY. No failover (PROJECT_MASTER R7): a Lyria error, timeout or open
 *   breaker is this request's explicit failure — 502, the reserved credit refunded — never another engine's track.
 * Lyria is live-by-default when a Gemini key is present (kill-switch LYRIA_ENABLED=0). The Create screen's explicit
 * engine pick runs that one engine instead, under the same rule. MUSIC_PROVIDER=elevenlabs makes Udio unpickable.
 * Singer gender is prompt-engineered (the EL Music + Udio APIs take no voice_id; cloned voice IDs apply to
 * TTS/narration, not music generation).
 *
 * Granular controls (lib/ai/musicControls): up to three `styles`, `vocalGender` (auto/female/male/duet), and the
 * Weirdness / Style influence sliders. On Lyria and ElevenLabs the sliders are sentences in the brief — approximate by
 * design; MusicGen takes them as sampling parameters, Udio only behind MUSIC_SUNO_PARAMS. The response's
 * `controls: { engine, mode, applied }` says which happened, and whether a slider reached the engine at all, so the
 * result card can be honest about it.
 *
 * Synchronous start+poll, bounded WELL under the 300s function ceiling. Fail-closed
 * with a clean reason on a real miss; fail-open on the re-host (keeps the provider URL).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Host a data: reference track to a signed https URL — Replicate MusicGen fetches the
// melody by URL, so an uploaded audio file is copied to Supabase first. Fail-open → null.
async function hostAudioReference(dataUrl: string): Promise<string | null> {
  try {
    const m = dataUrl.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'audio/mpeg').toLowerCase();
    const ext = /wav/i.test(mime) ? 'wav' : /ogg/i.test(mime) ? 'ogg' : /mp4|m4a|aac/i.test(mime) ? 'm4a' : 'mp3';
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return null;
    const path = `omni-music-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 7200)) || null;
  } catch {
    return null;
  }
}

// Suno-style album cover art for a generated track (only with AI_GOOGLE_ONLY=0 — see the call site) — themed to the brief + genre, so
// the visual matches the song. Square, text-free. Fail-open → null (no cover).
//
// COST: the cover image is generated by Pollinations.ai (FLUX) — a free, key-less
// image endpoint that renders on a plain GET — instead of the paid NanoBanana 2K
// model. It is fetched SERVER-SIDE (so no browser-CSP concern) and re-hosted to a
// CSP-allowed Supabase signed URL exactly as before, so the result card + Library
// keep a persistent https cover. Pollinations renders on demand (can take ~15-45s),
// so it runs in PARALLEL with the (slower) track and still lands before the song.
async function generateCoverArt(songPrompt: string, style: string): Promise<string | null> {
  try {
    // ⚠️ THE BRIEF USED TO GO TO FLUX IN WHATEVER ALPHABET THE USER TYPED. FLUX reads English; a Georgian
    // sentence is noise to it, so it ignored the brief and fell back to its priors — which is how
    // "inspirational Spanish hip-hop duet, good vibe beat" produced an anime portrait with letters on it.
    // The template was never the problem: the model could not read the alphabet. Latin briefs skip this
    // entirely (no call, no latency) and any failure returns the original, so the worst case is exactly
    // today's behaviour.
    const themeEn = await promptToEnglish(songPrompt, 'music');
    const coverPrompt = `Album cover art for a ${style || 'cinematic'} music track. Mood and theme: ${themeEn.slice(0, 220)}. Evocative, atmospheric, striking, professional album artwork, square composition, high detail. No text, no words, no letters, no captions, no logos.`;
    // Deterministic-ish seed for variety run-to-run; flux model for quality.
    const seed = Math.floor(Math.random() * 1_000_000);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(coverPrompt)}` +
      `?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
    // Pollinations generates the image during the request → allow a generous window.
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 60_000);
    const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    // Guard: on overload Pollinations can return an HTML/text error page — only accept images.
    if (!/^image\//i.test(ct)) return null;
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpg';
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > 18 * 1024 * 1024) return null;
    // Re-host to a CSP-allowed Supabase signed URL (7-day) so the cover renders + persists.
    const path = `omni-music-cover/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800)) || null;
  } catch {
    return null;
  }
}

// Standalone music composition: Google Lyria 3 (live by default whenever a Gemini key is set, kill-switch
// LYRIA_ENABLED=0), or the ONE engine the user explicitly picked — never a chain (see the R7 note below).
// Lyria and EL Music return audio BYTES, hosted to Supabase first; the result is always a URL.
// `controls` reaches the engines that take them natively (MusicGen always, Udio behind MUSIC_SUNO_PARAMS); for the
// others the sliders are already sentences inside `brief`. Each attempt reports which, for the response.
async function composeTrackUrl(brief: MusicBrief, style: string, instrumental: boolean, lengthSec = 30, controls?: MusicControls, preferred?: MusicEngineId | null): Promise<{ url: string; engine: string; controls: MusicControlsReport }> {
  // Engines that accept only one string get the flattened form, which trims the DESCRIPTION before the
  // user's own words. Lyria gets the structured form, where lyrics have their own field and budget.
  const prompt = flattenMusicBrief(brief);
  // Udio and ElevenLabs Music take this one line, with the style restated at its end.
  const oneLine = style ? `${prompt}. Style: ${style}.` : prompt;
  // FIX 2 — lengthSec === 0 means "full song": keep Udio's full ~2–4 min output (no
  // trim). Otherwise clamp to a 15–90s window. secs===0 is the skip-trim sentinel.
  const secs = lengthSec === 0 ? 0 : Math.max(15, Math.min(90, Math.round(lengthSec) || 30));
  // Udio ignores length (it returns a full ~2–4 min song), so secs===0 is Udio's "full song"
  // sentinel. But EL Music and MusicGen REQUIRE an explicit length — passing 0 there returns a
  // ~3s clip (audit HIGH: "full song" was broken on the primary engine). Map the sentinel to a
  // real full-song target for those engines, bounded well under the 300s function budget.
  const elMusicSec = secs === 0 ? 120 : secs; // ElevenLabs Music: ~2-min full song
  const musicgenSec = secs === 0 ? 90 : secs; // MusicGen (explicit pick only): bounded so it finishes in time

  type Track = { url: string; engine: string; controls: MusicControlsReport };
  // `sent` is the EXACT text that engine was handed: `applied` asks whether a slider made it into the request, so a
  // slider moved only within the neutral band, or whose sentence the brief had no room for, reports false.
  const report = (engine: MusicEngineId, sent: string): MusicControlsReport => musicControlsReport(engine, controls, sent);

  // Each engine's EXACT existing logic, expressed as a latency-bounded attempt. Exactly ONE of them runs per
  // request (chosen below); a miss throws, and the caller turns that into the explicit, refunded failure.
  const udioRun = async (): Promise<Track> => {
    const udio = await generateUdioTrack(
      {
        prompt: oneLine, style, makeInstrumental: instrumental,
        // Ignored by the client unless MUSIC_SUNO_PARAMS is on (unconfirmed wire fields — see lib/udio/client).
        ...(controls ? { controls: udioParams(controls, { instrumental }) } : {}),
      },
      { maxAttempts: 45, pollIntervalMs: 4000 }, // ~180s, bounded under the 300s ceiling
    );
    if (udio.status === 'succeeded' && udio.audioUrl) {
      // Udio ignores the requested length (no duration param) → full ~2–4 min song. Trim
      // to `secs` (30/60/90) so the panel selection is honoured — UNLESS secs===0 ("full
      // song"). Fail-open: if the trim misses, keep the full track.
      if (secs > 0) {
        const trimmed = await trimAudioToDuration(udio.audioUrl, secs);
        return { url: trimmed ?? udio.audioUrl, engine: 'Udio', controls: report('udio', oneLine) }; // re-hosted by caller
      }
      return { url: udio.audioUrl, engine: 'Udio', controls: report('udio', oneLine) }; // full song — no trim
    }
    throw new Error(`Udio did not complete (${udio.status})`);
  };
  const elRun = async (): Promise<Track> => {
    const { audio, contentType } = await composeElevenLabsMusic({
      prompt: oneLine,
      lengthMs: elMusicSec * 1000,
      instrumental,
    });
    const path = `omni-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const url = await uploadAndSign('uploads', path, audio.toString('base64'), contentType, 604800);
    if (url) return { url, engine: 'ElevenLabs Music', controls: report('elevenlabs-music', oneLine) };
    throw new Error('ElevenLabs Music host failed');
  };
  const musicgenRun = async (): Promise<Track> => {
    // The sliders as real sampling knobs (temperature / guidance); untouched sliders send neither.
    const text = style ? `${prompt}, ${style}` : prompt;
    const score = await generateMusic(text, musicgenSec, controls ? musicgenParams(controls) : {});
    if (score.audioUrl) return { url: score.audioUrl, engine: 'MusicGen', controls: report('musicgen', text) };
    throw new Error('MusicGen did not complete in time');
  };
  // Google LYRIA 3 — THE music engine (Auto) for BOTH instrumental tracks AND vocal songs (Lyria 3 sings
  // custom lyrics). The prompt already carries the lyrics (baked by the caller); we pass the instrumental
  // flag so Lyria steers vocals on/off. Returns base64 audio → hosted like the others. A miss is the
  // request's failure — nothing runs behind it.
  const lyriaRun = async (): Promise<Track> => {
    // ⚠️ `lyrics` PASSED SEPARATELY — this argument existed all along and no caller ever used it, so the
    // user's words were folded into the prompt string and cut by its 1500-char slice. Given its own
    // field they keep their own budget AND get the [Verse]/[Chorus] tagging the model understands.
    const t = await generateLyriaTrack({
      prompt: brief.prompt,
      ...(brief.lyrics ? { lyrics: brief.lyrics } : {}),
      instrumental,
    });
    if (!t) throw new Error('Lyria did not return audio');
    const ext = /mpeg|mp3/i.test(t.mime) ? 'mp3' : /wav/i.test(t.mime) ? 'wav' : 'mp3';
    const path = `omni-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadAndSign('uploads', path, t.base64, t.mime, 604800);
    if (url) return { url, engine: 'Lyria', controls: report('lyria', brief.prompt) };
    throw new Error('Lyria host failed');
  };

  // Per-engine latency budgets (env-tunable, no deploy needed). Each sits above its engine's normal render time
  // (Udio's just above its own ~180s internal poll cap), so the budget only trips on a true hang.
  const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  // The engines this deployment can run at all (a key / a switch) — the set an explicit pick is checked against.
  const engines: ProviderAttempt<Track>[] = [];
  if (hasLyriaProvider()) {
    engines.push({ name: 'lyria', budgetMs: num(process.env.MUSIC_LYRIA_BUDGET_MS, 160_000), run: lyriaRun });
  }
  if (hasUdioApiKey() && process.env.MUSIC_PROVIDER !== 'elevenlabs') {
    engines.push({ name: 'udio', budgetMs: num(process.env.MUSIC_UDIO_BUDGET_MS, 190_000), run: udioRun });
  }
  if (hasElevenLabsMusicKey()) {
    engines.push({ name: 'elevenlabs-music', budgetMs: num(process.env.MUSIC_EL_BUDGET_MS, 90_000), run: elRun });
  }
  engines.push({ name: 'musicgen', budgetMs: num(process.env.MUSIC_MUSICGEN_BUDGET_MS, 100_000), run: musicgenRun });

  // ⚠️ ONE ENGINE PER REQUEST — NO FAILOVER (PROJECT_MASTER R7, the owner's "no silent fallback" rule). This was a
  // chain: Lyria → Udio → ElevenLabs Music → Replicate MusicGen, each miss rerouting to the next, so a Lyria 503 quietly
  // became a track from an engine the user never chose — on Udio or Replicate, which the provider policy does not allow
  // at all — and the only trace was the badge on the result card. Auto is now Lyria and nothing else. A Lyria error,
  // a blown budget or an open breaker throws, and the caller answers with its explicit 502 and refunds the reserve.
  //
  // The model pill's explicit pick is kept as it was (for now): it runs THAT engine instead of Lyria — alone. A miss
  // there is the same explicit failure; Lyria is never run behind it. A pick the deployment cannot run (no key, or
  // MUSIC_PROVIDER dropped it) stays the no-op it always was, and MusicGen — which makes no vocals — is never picked for
  // a SONG: both leave Auto. (The picker already sends neither: lib/studio/musicEngines.effectiveEnginePref.)
  const picked = preferred && !(preferred === 'musicgen' && !instrumental)
    ? engines.find((p) => p.name === preferred)
    : undefined;
  const attempt = picked ?? engines.find((p) => p.name === 'lyria');
  if (!attempt) throw new Error('Lyria is not configured (no Gemini key, or LYRIA_ENABLED=0) — no fallback engine runs.');

  // ⚠️ A PLATFORM-KILLED LAMBDA REFUNDS NOTHING. A timeout the code chooses can refund; one the platform imposes cannot.
  // So the attempt's budget is capped by the same pool the old cascade shared (default 250s — 50s of headroom under
  // maxDuration): an env-raised MUSIC_*_BUDGET_MS can never let the render outlive the function.
  const poolMs = num(process.env.MUSIC_CASCADE_BUDGET_MS, 250_000);
  const bounded: ProviderAttempt<Track> = { ...attempt, budgetMs: Math.min(attempt.budgetMs ?? poolMs, poolMs) };

  // Pre-read the Redis circuit breaker (it's async; the failover's isTripped is sync). An engine tripped by recent
  // failures is not run at all — and with nothing behind it, that too is this request's explicit failure.
  let tripped = false;
  try { tripped = await isProviderTripped(bounded.name); } catch { /* fail-open */ }

  // runWithLatencyFailover over a list of ONE: it still brings the latency budget (abort on a hang), the breaker skip
  // and the breaker's bookkeeping — and with nothing to reroute to, no failover.
  const res = await runWithLatencyFailover<Track>([bounded], {
    isTripped: (n) => n === bounded.name && tripped,
    record: (n, ok) => { void recordProviderResult(n, ok); },
    onReroute: ({ from, reason }) => {
      // eslint-disable-next-line no-console
      console.warn(`[ai/music] ${from} ${reason} → explicit failure (no fallback, R7)`);
    },
  });
  if (res.ok && res.result) return res.result;
  throw new Error(`Music generation did not complete on ${bounded.name}.`);
}

export async function POST(req: NextRequest) {
  // applyApiGuards = EXPENSIVE rate-limit + per-user daily AI budget cap (the sibling image route
  // enforces the same). Music is the priciest provider (Udio/EL/MusicGen, ~4min renders), so it must
  // not be exempt from the daily cap.
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'ai.music' });
  if (gate.response) return gate.response;

  let prompt = '';
  let style = 'cinematic';
  let makeInstrumental = true;
  let lyrics = '';
  let audioReference = '';
  let voiceReference = '';
  let useMyVoice = false;
  let durationSec = 30;
  let tempo = '';
  let voiceType: 'female' | 'male' | 'duet' | '' = '';
  // The granular controls (lib/ai/musicControls): styles · vocalGender · Weirdness · Style influence. Neutral until parsed.
  let controls: MusicControls = parseMusicControls(undefined);
  // DURABLE PROGRESS — the composer's tray jobId. When present the completed row is UPSERTED
  // under this id (converging with the client's placeholder) so a track produces ONE
  // generation_jobs row, not a client + server duplicate.
  let clientJobId = '';
  // Captured where `body` is in scope; used far below to bind the billing ref to the actual request.
  let bodyFp = '';
  // The template card's id, as sent (an ID, never text) — resolved against the request's own values below.
  let rawTemplateId: unknown;
  // The engine the user asked to try first (lib/studio/musicEngines) — null = Auto, the chain as it stands.
  let preferredEngine: MusicEngineId | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; style?: unknown; styles?: unknown; instrumental?: unknown; lyrics?: unknown; audioReference?: unknown; voiceReference?: unknown; useMyVoice?: unknown; durationSec?: unknown; tempo?: unknown; voiceType?: unknown; vocalGender?: unknown; weirdness?: unknown; styleInfluence?: unknown; jobId?: unknown; templateId?: unknown; engine?: unknown };
    rawTemplateId = body.templateId;
    if (isMusicEngineId(body.engine)) preferredEngine = body.engine;
    if (typeof body.jobId === 'string') clientJobId = body.jobId.slice(0, 120);
    bodyFp = bodyFingerprint(body);
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    controls = parseMusicControls(body);
    // ⚠️ CLIENT TEXT INTO THE ENGINE BRIEF AND THE COVER-ART PROMPT — bounded and cleaned (lib/studio/style.ts).
    // Up to three `styles` become ONE line ("georgian folk, jazz") that every engine, the cover art, the mutex and the
    // template match read — so a card's genre selects it only while it is the sole style. A body without `styles` (a
    // re-roll persisted by an earlier build) keeps its single `style`.
    const cleanStyle = controls.styles.length ? sanitizeStyle(musicStyleLine(controls.styles)) : sanitizeStyle(body.style);
    if (cleanStyle) style = cleanStyle;
    if (typeof body.instrumental === 'boolean') makeInstrumental = body.instrumental;
    // P6 — duration (15/30/60/90) + tempo (slow/medium/fast). Duration drives the track
    // length; tempo is folded into the prompt as a BPM/feel hint the model honours.
    // FIX 2 — durationSec === 0 → "full song" (keep Udio's full output, no trim);
    // any positive value clamps to the 15–90s window.
    if (typeof body.durationSec === 'number') durationSec = body.durationSec === 0 ? 0 : Math.max(15, Math.min(90, Math.round(body.durationSec)));
    if (typeof body.tempo === 'string') tempo = body.tempo.trim().toLowerCase();
    // NOTE: billing moved to a RESERVE-BEFORE-RENDER saga below (the old fail-open READ gate here let
    // N concurrent tracks pass a stale balance and render free — the same TOCTOU the image route fixed).
    // Custom lyrics (vocal tracks) — Udio sings these verbatim; empty → auto lyrics.
    if (typeof body.lyrics === 'string' && body.lyrics.trim()) lyrics = body.lyrics.trim().slice(0, 2000);
    // Cover: an uploaded reference track (data: URL) → Udio reimagines it in the
    // requested style/prompt.
    // data: (small fallback) | https URL | storage path (browser-uploaded) — the
    // cover branch resolves each to a fetchable melody URL.
    if (typeof body.audioReference === 'string' && body.audioReference.trim()) audioReference = body.audioReference.trim();
    // Voice clone: an uploaded sample of the USER'S voice (>15s, data:/https/path) →
    // MiniMax sings the lyrics in that voice. Highest-priority branch below.
    if (typeof body.voiceReference === 'string' && body.voiceReference.trim()) voiceReference = body.voiceReference.trim();
    // Use the user's TRAINED RVC voice (faithful) instead of a one-shot reference.
    if (body.useMyVoice === true) useMyVoice = true;
    // Sung-vocal gender for a SONG → appended to the prompt as vocal descriptors
    // (the music engine is prompt-steered for the singer; see vocalDescriptor below). `vocalGender` (or an older
    // body's `voiceType`); Auto adds no descriptor, so the brief's own words decide the singer.
    if (controls.vocalGender !== 'auto') voiceType = controls.vocalGender;
  } catch {
    /* malformed body → guard below */
  }

  // Canonical billed seconds (full-song 0→90; cover always renders ~30s→30) — the post-success
  // deduct uses this so the charge matches the pre-render gate AND the client toast.
  const billSeconds = audioReference ? 30 : (durationSec === 0 ? 90 : durationSec);

  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  // MEDIA_GOOGLE_ONLY (lib/providers/mediaPolicy): Lyria (Google) and ElevenLabs Music compose; everything else here is an
  // outside engine — an explicit Udio / MusicGen pick, a cover (MusicGen-melody), a sampled voice (MiniMax) or a trained
  // voice (RVC) — so the switch refuses those requests here, before the reserve. Off (the default) → no-op.
  if (audioReference || voiceReference || useMyVoice || preferredEngine === 'udio' || preferredEngine === 'musicgen') {
    const outside = refuseOutsideEngine(req);
    if (outside) return outside;
  }

  // Fold the tempo selection into the brief as a feel/BPM hint (empty for 'medium').
  const tempoHint = tempo === 'slow' ? 'Slow tempo, around 70 BPM. ' : tempo === 'fast' ? 'Fast, upbeat tempo, around 140 BPM. ' : '';
  let capped = (tempoHint + prompt).slice(0, 1000);
  // SELF-IMPROVING (STEP 5): if an admin has APPROVED an active 'audio' config, apply its learned
  // prompt directive as a suffix so the loop's improvement reaches generation. Fail-soft.
  const activeAudioCfg = await getActiveConfig('audio').catch(() => null);
  if (activeAudioCfg?.prompt) capped = `${capped} ${activeAudioCfg.prompt}`;

  // Sung-vocal gender → prompt engineering. The music engine (ElevenLabs Music /
  // MusicGen) is steered by the text prompt, so the singer's gender rides in the
  // brief. Only meaningful for a SONG (non-instrumental).
  const vocalDescriptor =
    !makeInstrumental && voiceType
      ? voiceType === 'female'
        ? 'female vocals, female singer'
        : voiceType === 'male'
          ? 'male vocals, male singer'
          : 'male and female duet, two voices'
      : '';

  // ⚠️ THE TEMPLATE'S DESCRIPTOR IS RESOLVED HERE, FROM ITS ID — never accepted as text (lib/studio/templateContext).
  // Only when the values THIS request carries (genre, tempo, length, instrumental, vocal) still select the card, so a
  // stale or borrowed id adds nothing. It rides in the brief's reserved suffix (buildMusicBrief), never in place of
  // the user's words, and only on the composed paths (a cover or a cloned voice keeps its own source).
  const template = resolveTemplateContext('music', rawTemplateId, { genre: style, tempo, duration: durationSec, instrumental: makeInstrumental, voiceType });

  // ── RESERVE-BEFORE-RENDER + IN-FLIGHT MUTEX (V1 + V4) ────────────────────────
  // Replaces the old fail-open READ gate. (1) A short-TTL Redis mutex keyed on the request
  // SIGNATURE instantly blocks a double-click from spawning a SECOND paid Udio/EL render. (2) The
  // credit is DEBITED atomically UP FRONT (per-transaction ref) so concurrent tracks can't all pass
  // a stale balance and render free; refunded on any downstream miss. Both fail-open without Redis.
  let reservedUid: string | null = null;
  let reserveRef = '';
  let reserved = false;
  // Credits already handed back by the success-path settlement (`${reserveRef}:settle`), so a later failure refund
  // returns only what is still held — never more than was taken.
  let settledBack = 0;
  let idemOwner = '';
  let idemKey = '';
  /**
   * Give the reserved credit back (at most once) and release the mutex. Resolves TRUE only when the refund actually
   * landed — that, and nothing else, is what a failure response may report as `refunded: true`.
   */
  const refundReserve = async (): Promise<boolean> => {
    let refunded = false;
    if (reserved && reservedUid) {
      reserved = false; // idempotent
      const amount = creditCostFor('music', { seconds: billSeconds }) - settledBack;
      if (amount > 0) {
        const r = await refundCredits(reservedUid, amount, `${reserveRef}:refund`).catch(() => null);
        refunded = !!r?.ok;
      }
    }
    if (idemOwner && idemKey) { const k = idemKey; idemKey = ''; await releaseIdempotencyKey(idemOwner, k).catch(() => {}); }
    return refunded;
  };
  /**
   * Drop the in-flight mutex once the render has SETTLED, without touching credits.
   *
   * ⚠️ THIS DID NOT EXIST, and the comment below claimed it did. The key was claimed for 300 seconds and
   * released only inside `refundReserve` — which runs on insufficient credits, on a file failure, and in
   * the catch, but NEVER after a success. So finishing a track and pressing Generate again with the same
   * brief (the normal way to roll a second variation of a song) was rejected 409 for the next five
   * minutes. Worse, the client reads only `error`/`code` and not `message`, so `duplicate_request` fell
   * through to the generic "⚠️ music failed" bubble and the tray job was marked failed: an unexplained
   * failure on a service that had just worked.
   *
   * Releasing on success is safe. The window exists to stop a byte-identical resubmit landing a SECOND
   * deductCredits while the first render is still in flight; once the render is done that race is over,
   * and a resubmit reusing the same tray jobId hits the same reserveRef, which deductCredits dedupes.
   */
  const releaseMutex = async (): Promise<void> => {
    if (idemOwner && idemKey) { const k = idemKey; idemKey = ''; await releaseIdempotencyKey(idemOwner, k).catch(() => {}); }
  };
  // ⚠️ THE SESSION LOOKUP FAILS CLOSED — IT USED TO SIT INSIDE THE FAIL-OPEN `try` BELOW. That block swallows
  // every throw so a ledger or Redis blip never blocks a paid render, which is right for bookkeeping and wrong for
  // identity: if authedClientFromRequest threw (Supabase auth unreachable, a malformed cookie), the catch skipped
  // requireAuthForGeneration along with everything else and the track rendered for nobody, uncharged. A session we
  // cannot verify is not a session, so that case now refuses (503 — retryable; it is our outage, not the caller's
  // fault, so it does not pretend they are signed out) before any provider is touched.
  let rUser: Awaited<ReturnType<typeof authedClientFromRequest>>['user'];
  try {
    ({ user: rUser } = await authedClientFromRequest(req));
  } catch (err) {
    console.error('[ai/music] session lookup threw — refusing:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { success: false, error: 'auth_unavailable', message: 'ანგარიშის შემოწმება ვერ მოხერხდა — სცადე ხელახლა. / Could not verify your session — please try again.' },
      { status: 503 },
    );
  }
  // ⚠️ ANONYMOUS CALLERS PROCEEDED WITH AN `anon:` IDEMPOTENCY OWNER AND GENERATED FOR FREE. Music is
  // one of the most expensive calls on the platform (Lyria / Udio / ElevenLabs Music), and there was
  // no account to charge or attribute it to — the `anon:` prefix was invented precisely so the mutex
  // key would not crash, which quietly made guest generation a supported path.
  const musicGate = requireAuthForGeneration(rUser?.id ?? null);
  if (musicGate.response) return musicGate.response;

  // ⚠️ A REFERENCE IS CLIENT INPUT THE SERVER SIGNS OR FETCHES, AND NOTHING CHECKED IT. A bare path was signed with the
  // service role for ANY object in the bucket (another account's audio included), and a voice sample's URL was fetched by
  // our own ffmpeg step from whatever host the body named. lib/ai/musicReference states the rule; it runs before the
  // mutex or the ledger is touched, so a refusal has nothing to unwind.
  if (
    !isAcceptableMusicReference(audioReference, rUser?.id ?? '', 'audio') ||
    !isAcceptableMusicReference(voiceReference, rUser?.id ?? '', 'voice')
  ) {
    return NextResponse.json({ success: false, error: 'invalid_reference' }, { status: 400 });
  }

  // The in-flight MUTEX stays fail-open: a Redis blip only loses the double-click guard, never money. (Neither helper
  // throws today; the guard is for a future one that does.)
  try {
    idemOwner = rUser?.id ?? `anon:${clientJobId || 'session'}`;
    // `st` is the joined style line, so it covers the picked styles; `w` / `si` the sliders — a changed control is a
    // new request, not a duplicate of the one in flight.
    idemKey = `music:${await hashPayload({ u: idemOwner, p: capped, st: style, i: makeInstrumental, d: durationSec, vt: voiceType, ly: lyrics.slice(0, 200), ar: audioReference ? 1 : 0, vr: voiceReference ? 1 : 0, t: template?.id ?? null, w: controls.weirdness, si: controls.styleInfluence, pe: preferredEngine })}`;
    // Window MUST cover the render ceiling (maxDuration=300s; Udio budget alone is ~190s), or the mutex
    // lapses mid-render and a byte-identical resubmit past the window mints a FRESH reserveRef → a second
    // deductCredits → DOUBLE-CHARGE. The key hashes the full brief, so only an identical duplicate submit
    // inside the window is blocked (a changed brief is a new key); success releases it through
    // `releaseMutex`, so an intentional re-roll is not stuck for the full window.
    if (!(await claimIdempotencyKey(idemOwner, idemKey, 300))) {
      idemKey = ''; // the winning request holds it
      return NextResponse.json({ success: false, error: 'duplicate_request', message: 'This track is already being generated.' }, { status: 409 });
    }
  } catch { idemKey = ''; /* mutex unavailable — proceed without the double-click guard */ }

  // ── THE CHARGE FAILS CLOSED. ─────────────────────────────────────────────────────────────────────────────────
  // ⚠️ THIS USED TO SIT IN THE SAME FAIL-OPEN `try` AS THE MUTEX ("a ledger/Redis blip never blocks a paid render"),
  // and only `insufficient` stopped the render — so a deduct that came back `error` (the ledger unreachable or
  // refusing the write) let the track render UNBILLED, for everyone, for as long as the ledger stayed down. A ledger
  // that definitively failed now refuses with a friendly retry (503 billing_unavailable — nothing charged, nothing
  // rendered). Only `skipped` (the RPC not provisioned at all — a deployment without the ledger) still proceeds
  // uncharged, exactly as reserveProduce documents for every other paid route.
  if (rUser?.id) {
    reservedUid = rUser.id;
    // ⚠️ CLIENT-KEYED BILLING REF — see produceBilling.idemRef. A fixed clientJobId with a changed
    // brief was charged once and free forever after; the server-derived fingerprint closes that.
    reserveRef = `music:${clientJobId || randomUUID()}:${bodyFp}:${rUser.id}`;
    // ⚠️ …AND THE SAME jobId WITH THE SAME BODY IS A REPLAY, NOT A RETRY. deduct_credits answers a replayed ref with
    // SUCCESS and no new debit, so a byte-identical resubmit (the mutex is released on success) rendered a fresh track
    // for nothing — every time — and a failed replay's `${ref}:refund` paid back the first track's legitimate charge.
    // The studio mints a new jobId for every job and every re-roll, so only a replayed request ever lands here.
    if ((await debitExistsForRef(rUser.id, reserveRef)) === true) {
      await releaseMutex();
      return NextResponse.json({ ...replayRefusedBody(), message: 'This track was already generated.' }, { status: 409 });
    }
    const debit = await deductCredits(rUser.id, creditCostFor('music', { seconds: billSeconds }), reserveRef);
    if (!debit.ok && debit.reason === 'insufficient') {
      await refundReserve(); // releases the mutex (nothing reserved) so a top-up retry works
      return NextResponse.json({ success: false, error: 'არასაკმარისი კრედიტი — შეავსე ბალანსი. / Not enough credits — please top up.', code: 'insufficient_credits' }, { status: 402 });
    }
    if (!debit.ok && debit.reason === 'error') {
      await releaseMutex(); // nothing was reserved — let the retry through
      return NextResponse.json(ledgerUnavailableBody(billingLocale(req)), { status: 503 });
    }
    reserved = debit.ok;
  }

  try {
    // Suno-style cover art — generated in PARALLEL with the track (it's the faster of
    // the two, so it adds no latency) and themed to the song's brief + genre.
    // ⚠️ NOT UNDER GOOGLE-ONLY (the default). The cover comes from Pollinations.ai, a key-less third party outside
    // R7 (Google + ElevenLabs only), and it was handed every paid brief. Until 2026-10-09 it ran on every track; now
    // the track ships without a cover (the response just omits coverUrl, as on any cover failure) and only the
    // AI_GOOGLE_ONLY=0 kill switch brings Pollinations back. A Google cover is the owner's image-engine call.
    const coverArtPromise = isAiGoogleOnly() ? Promise.resolve(null) : generateCoverArt(capped, style);

    // ⚠️ AND THE SAME PROBLEM REACHED THE MUSIC ENGINE ITSELF, where it is invisible rather than absurd.
    // Udio, ElevenLabs Music and MusicGen all read English; a Georgian brief was arriving as noise, so
    // the engine composed from its priors and returned a competent track with no relationship to the
    // request. That is the whole of "I wrote a prompt and none of it matched".
    //
    // ⚠️ THE DESCRIPTION IS TRANSLATED, THE LYRICS ARE NOT. `lyrics` is what the singer must SING and is
    // passed through untouched — and a brief that asks for a song "ესპანურად" keeps that instruction in
    // English ("in Spanish"), so the engine is told which language to sing in rather than being handed a
    // translated substitute for the words. Latin briefs skip the call entirely; any failure falls back
    // to `capped`, which is exactly today's behaviour.
    const cappedEn = await promptToEnglish(capped, 'music');
    // The sliders' sentences — fixed English text, so they join AFTER the translation rather than through it, and as
    // the brief's lowest priority (buildMusicBrief drops them whole before it would cut the user's words). [] while
    // both sliders sit in the neutral band: an untouched panel composes exactly the brief it always did.
    const directives = promptDirectives(controls);
    // How the controls reached the engine that composed the track — set on the composed paths only (a cover or a
    // cloned voice keeps its own source and takes no controls).
    let controlsReport: MusicControlsReport | null = null;
    // False only when the user's trained voice was asked for and its conversion missed (the AI vocal shipped instead).
    let voiceApplied = true;

    // COVER vs compose: with an uploaded reference track, REPLICATE MusicGen-melody
    // re-imagines it in the requested style (conditioned on the track's melody);
    // otherwise Udio composes a fresh track from the brief.
    let briefTruncated: { prompt: boolean; lyrics: boolean } = { prompt: false, lyrics: false };
    let providerAudioUrl = '';
    // The engine that actually produced the track → returned to the client for an
    // honest "Generated with …" badge (the chain is runtime-dependent, so we can't
    // hardcode it). Defaults updated per branch below.
    let engine = 'AI';
    const trainedModel = useMyVoice ? await (async () => { try { const { user } = await authedClientFromRequest(req); return await getUserVoiceModel(user?.id ?? DEMO_VOICE_USER_ID); } catch { return null; } })() : null;
    if (trainedModel) {
      // FAITHFUL "sing in my voice": ElevenLabs Music composes a song WITH vocals, then
      // realistic-voice-cloning (RVC) swaps those vocals for the user's TRAINED model.
      // Fail-open: if the convert misses, return the composed song so the user still gets a track — and SAY so
      // (`voiceApplied: false`): it used to arrive as if it were sung in their voice.
      const composed = await composeTrackUrl(
        buildMusicBrief({ prompt: cappedEn, style, templateDescriptor: template?.descriptor, lyrics, instrumental: false, directives }),
        style, false, durationSec, controls, preferredEngine,
      );
      controlsReport = composed.controls;
      try {
        providerAudioUrl = await convertSongWithRvc(composed.url, trainedModel.modelUrl);
        engine = 'Your Voice (RVC)';
      } catch {
        providerAudioUrl = composed.url;
        engine = composed.engine;
        voiceApplied = false;
      }
    } else if (voiceReference) {
      // "Create a song in MY voice" — resolve the user's uploaded voice sample to an
      // https URL (data: → host · https → use · path → sign the browser upload) and
      // have MiniMax sing the lyrics in that voice (zero-shot, ## adds accompaniment).
      const voiceUrl = voiceReference.startsWith('data:')
        ? await hostAudioReference(voiceReference)
        : /^https?:\/\//i.test(voiceReference)
          ? voiceReference
          : await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', voiceReference, 3600);
      if (!voiceUrl) {
        const refunded = await refundReserve();
        return NextResponse.json({ success: false, error: 'Could not process the voice file.', refunded }, { status: 502 });
      }
      // Normalize the clip to MP3 first — the browser records webm/mp4 and users upload
      // m4a/ogg, none of which MiniMax reliably accepts ("doesn't generate"). Fail-open:
      // if transcoding hiccups we still try the original (works when it was already wav/mp3).
      const mp3Voice = await transcodeVoiceToMp3(voiceUrl);
      // Lyrics are what MiniMax sings; fall back to the brief if the user only gave a vibe.
      const song = await generateVoiceSong(lyrics || capped, { voiceUrl: mp3Voice || voiceUrl });
      providerAudioUrl = song.audioUrl;
      engine = 'MiniMax (your voice)';
    } else if (audioReference) {
      // Resolve the melody to an https URL Replicate can fetch:
      //  • data:  → host it (small fallback)
      //  • https  → use directly
      //  • path   → a storage object uploaded by the browser via /api/upload/sign
      //             (bypasses the function-body limit); sign a readable URL now that
      //             the object exists.
      const melodyUrl = audioReference.startsWith('data:')
        ? await hostAudioReference(audioReference)
        : /^https?:\/\//i.test(audioReference)
          ? audioReference
          : await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', audioReference, 3600);
      if (!melodyUrl) {
        const refunded = await refundReserve();
        return NextResponse.json({ success: false, error: 'Could not process the reference audio.', refunded }, { status: 502 });
      }
      const styledPrompt = style ? `${capped}, ${style} style` : capped;
      const cover = await generateMusicCover(styledPrompt, melodyUrl, 30);
      providerAudioUrl = cover.audioUrl;
      engine = 'MusicGen (cover)';
    } else {
      // Compose a fresh track from the brief — Lyria (sung when not instrumental), or the
      // one engine the user picked; no fallback. Lyrics, if given, steer the prompt; the
      // vocal descriptor (female/male/duet) is appended for a sung track.
      // Structured, not concatenated: the brief, the style, the vocal descriptor and the LYRICS each
      // stay their own field, so the boilerplate can never push the user's words out of the budget.
      const brief = buildMusicBrief({ prompt: cappedEn, style, templateDescriptor: template?.descriptor, vocalDescriptor, lyrics, instrumental: makeInstrumental, directives });
      // If anything STILL had to be cut, the user is told. Silently shortening the words someone chose
      // deliberately and then handing back a track that does not match them is the whole failure mode
      // this rewrite exists to end.
      briefTruncated = brief.truncated;
      const composed = await composeTrackUrl(brief, style, makeInstrumental, durationSec, controls, preferredEngine);
      providerAudioUrl = composed.url;
      engine = composed.engine;
      controlsReport = composed.controls;
      // (The "MusicGen — vocals unavailable" badge that stood here labelled a SONG that fell through the old chain
      // to the instrumental-only MusicGen. Nothing falls through any more, and composeTrackUrl never runs MusicGen
      // for a song, so there is no such track left to label.)
    }

    // RE-HOST to Supabase so the audio plays in-app (CSP-allowed) + persists.
    let hostedUrl = providerAudioUrl;
    // Measured off the same bytes we re-host, for the billing settlement below. 0 = could not measure.
    let deliveredSec = 0;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(providerAudioUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const ct = r.headers.get('content-type') || 'audio/mpeg';
        const ext = /wav/i.test(ct) ? 'wav' : 'mp3';
        const buf = Buffer.from(await r.arrayBuffer());
        deliveredSec = await probeTrackDurationSec(buf, ext).catch(() => 0);
        const path = `omni-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const signed = await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800); // 7-day signed URL
        if (signed) hostedUrl = signed;
      }
    } catch {
      /* fail-open — keep the provider URL */
    }

    // ── SETTLE THE CHARGE AGAINST WHAT ACTUALLY LANDED ───────────────────────────────────────────────
    // The duration tier was reserved from what the user PICKED, but the primary engine (Lyria) takes no
    // length at all — it is prompt-steered, its API has no duration field, and its output is uploaded
    // untrimmed. So "Full song" charged 12 credits and could return the same short clip the 30s setting
    // produces. The length cannot be forced on the engine, so the price is corrected instead: anything
    // paid above the delivered track's real tier goes back. An UNMEASURED track (deliveredSec 0) keeps
    // its original charge — refunding on a failed probe would give credits away for a full-length song.
    // Reported in the response so the client can surface it — see buildMusicBrief.
    let settledSec = billSeconds;
    if (reserved && reservedUid) {
      const settlement = settleMusicCharge(billSeconds, deliveredSec);
      settledSec = settlement.settledSec;
      if (settlement.overcharged) {
        const back = creditCostFor('music', { seconds: billSeconds }) - creditCostFor('music', { seconds: settlement.settledSec });
        if (back > 0) {
          // Its own ref, distinct from `${reserveRef}:refund`, so the failure refund can still fire later — for
          // what is still held only (settledBack), so a late throw can never refund more than was charged.
          const settled = await refundCredits(reservedUid, back, `${reserveRef}:settle`).catch(() => null);
          if (settled?.ok) settledBack = back;
          // eslint-disable-next-line no-console
          console.warn(`[ai/music] ${engine} delivered ${deliveredSec.toFixed(1)}s against a ${billSeconds}s charge — refunded ${back} credits`);
        }
      }
    }

    // File the track into the Library — under the signed-in user, or the shared demo
    // identity when testing without sign-in (so anonymous generations still show up).
    // File the track into the Library. The credit was already RESERVED up front (see the reserve
    // above), so there is NO charge here — only the durable completion row. Reuse the composer's tray
    // jobId so this UPSERTS the client's placeholder (one row, no duplicate); other callers get a UUID.
    try {
      // ⚠️ THE THIRD NETWORK VALIDATION OF THE SAME JWT IN ONE REQUEST — and this one sits between a
      // finished track and the response the browser is waiting on, so its round trip is pure added
      // latency with nothing to overlap it. The reserve block above already resolved this user into
      // `reservedUid`; only the path where that block failed open still needs a lookup, and it lands on
      // the same demo identity it always did.
      const userId = reservedUid ?? (await authedClientFromRequest(req)).user?.id ?? DEMO_VOICE_USER_ID;
      await recordCompletedAsset({ id: clientJobId || randomUUID(), userId, serviceType: 'music', url: hostedUrl, prompt: capped });
    } catch {
      /* fail-open */
    }

    // The render has SETTLED — drop the in-flight mutex so an intentional re-roll of the same brief is
    // not rejected as a duplicate for the rest of the 5-minute window. (See releaseMutex: this is the
    // "sibling on the happy path" the old comment claimed existed and did not.)
    await releaseMutex();

    // The cover finished while the track generated — attach it for the result card.
    const coverUrl = await coverArtPromise;
    return NextResponse.json({
      success: true,
      url: hostedUrl,
      engine,
      ...(voiceApplied ? {} : { voiceApplied: false }),
      // Stated so the result card can show the REAL length rather than the requested one, and say when
      // the difference was refunded instead of leaving the user to notice the short track themselves.
      ...(deliveredSec > 0 ? { durationSec: Math.round(deliveredSec) } : {}),
      ...(settledSec !== billSeconds ? { billedSec: settledSec, requestedSec: billSeconds, refunded: true } : {}),
      ...((briefTruncated.prompt || briefTruncated.lyrics) ? { truncated: briefTruncated } : {}),
      // Whether the sliders were real engine parameters ('native') or sentences in the brief ('prompt' — Lyria,
      // ElevenLabs, Udio without MUSIC_SUNO_PARAMS), so the result card can call them approximate when they were, and
      // whether any slider reached the engine at all (`applied`), so it claims nothing when none did.
      ...(controlsReport ? { controls: controlsReport } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      // ⚠️ REPORTED SO "THE MUSIC IGNORED MY PROMPT" IS DIAGNOSABLE FROM THE OUTSIDE. The engines read
      // English; a Georgian brief is translated first and that step FAILS OPEN, so a missing or rejected
      // key on the deployment produced a competent track unrelated to the request with nothing in the
      // response to say so. It was reported three times and the code read correctly every time, because
      // the code was correct and the environment was not. Anything other than 'ok'/'skipped_latin' means
      // the raw prompt went to the provider verbatim.
      translation: lastTranslateOutcome('music') ?? 'unknown',
    });
  } catch (err) {
    const charged = reserved; // captured before refundReserve clears it
    const refunded = await refundReserve(); // mid-render throw → give the reserved credit back + release the mutex
    const message = err instanceof Error ? err.message : 'Music generation failed';
    // eslint-disable-next-line no-console
    console.error('[ai/music]', message);
    // ⚠️ THE PROVIDER'S OWN WORDS NEVER REACH THE USER (lib/api/providerError). This answered `error: err.message`
    // — "Voice song failed: Replicate API 402: {…billing…}" in a Georgian chat bubble. The raw text stays in the log
    // line above. And the sanitiser's sentences all say "you were not charged", so they are used only when that is
    // TRUE: nothing was charged, or the refund landed. A charge whose refund did not land gets a neutral code (the
    // studio shows its generic failure copy) — and refundCredits has already reported the miss for reconciliation.
    const safe = providerErrorBody(err, billingLocale(req));
    const body = charged && !refunded
      ? { success: false, error: 'music_failed', refunded: false }
      : { success: false, error: safe.error, message: safe.message, refunded };
    return NextResponse.json(body, { status: 502 });
  }
}
