import { generateImagenImages } from '@/lib/ai/geminiImagen';
import { DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthForGeneration } from '@/lib/api/requireAuthForGeneration';
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { getActiveConfig } from '@/lib/agent/optimizer/activeConfig';
import { hasLyriaProvider, generateLyriaTrack } from '@/lib/ai/lyriaMusic';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
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
import { buildMusicBrief, type MusicBrief } from '@/lib/ai/musicBrief';
import { promptToEnglish, lastTranslateOutcome } from '@/lib/ai/promptToEnglish';
import { probeTrackDurationSec } from '@/lib/audio/trackDuration';
import { sanitizeStyle } from '@/lib/studio/style';
import { resolveTemplateContext } from '@/lib/studio/templateContext';
import {
  musicControlsReport, musicStyleLine, parseMusicControls, promptDirectives,
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
 * Provider chain (composeTrackUrl) — ONE uniform chain for BOTH vocal songs and instrumentals (Lyria 3
 * generates full songs with vocals + lyrics, so there's no vocal/instrumental switching):
 *   Google Lyria 3 (Gemini music, PRIMARY) → Udio → ElevenLabs Music → Replicate MusicGen.
 * Lyria is live-by-default when a Gemini key is present (kill-switch LYRIA_ENABLED=0); the rest are pure
 * safety fallbacks for the rare Lyria miss (503/quota/timeout). Set MUSIC_PROVIDER=elevenlabs to drop Udio.
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
    const image = (await generateImagenImages({ prompt: coverPrompt, aspectRatio: '1:1', numberOfImages: 1 }))?.[0];
    if (!image) return null;
    const ct = image.mimeType;
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpg';
    const buf = image.buffer;
    // Re-host to a CSP-allowed Supabase signed URL (7-day) so the cover renders + persists.
    const path = `omni-music-cover/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800)) || null;
  } catch {
    return null;
  }
}

// Standalone music composition: Google Lyria 3 (PRIMARY — live by default whenever a Gemini key is set,
// kill-switch LYRIA_ENABLED=0) → Udio → ElevenLabs Music → Replicate MusicGen, as latency-failover
// fallbacks. Lyria and EL Music return audio BYTES, hosted to Supabase first; the result is always a URL.
// `controls` reaches the engines that take them natively (MusicGen always, Udio behind MUSIC_SUNO_PARAMS); for the
// others the sliders are already sentences inside `brief`. Each attempt reports which, for the response.
async function composeTrackUrl(brief: MusicBrief, _style: string, instrumental: boolean, _lengthSec = 30, controls?: MusicControls, _preferred?: MusicEngineId | null): Promise<{ url: string; engine: string; controls: MusicControlsReport }> {
  if (!hasLyriaProvider()) throw new Error('Lyria is not configured');
  if (await isProviderTripped('lyria').catch(() => false)) throw new Error('Lyria is temporarily unavailable');
  const track = await generateLyriaTrack({ prompt: brief.prompt, lyrics: brief.lyrics, instrumental });
  try { await recordProviderResult('lyria', Boolean(track)); } catch { /* telemetry only */ }
  if (!track) throw new Error('Lyria did not return audio');
  const ext = /wav/i.test(track.mime) ? 'wav' : 'mp3';
  const path = `omni-music/${Date.now()}-${randomUUID()}.${ext}`;
  const url = await uploadAndSign('uploads', path, track.base64, track.mime, 604800);
  if (!url) throw new Error('Lyria audio could not be stored');
  return { url, engine: 'Lyria', controls: musicControlsReport('lyria', controls, brief.prompt) };
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

  if (audioReference || voiceReference || useMyVoice) {
    return NextResponse.json({ success: false, error: 'reference_music_unavailable', message: 'Reference audio and cloned singing are unavailable with the current music provider.' }, { status: 422 });
  }

  // Canonical billed seconds (full-song 0→90; cover always renders ~30s→30) — the post-success
  // deduct uses this so the charge matches the pre-render gate AND the client toast.
  const billSeconds = audioReference ? 30 : (durationSec === 0 ? 90 : durationSec);

  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
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
    const coverArtPromise = generateCoverArt(capped, style);

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

    // COVER vs compose: with an uploaded reference track, REPLICATE MusicGen-melody
    // re-imagines it in the requested style (conditioned on the track's melody);
    // otherwise Udio composes a fresh track from the brief.
    let briefTruncated: { prompt: boolean; lyrics: boolean } = { prompt: false, lyrics: false };
    let providerAudioUrl = '';
    // The engine that actually produced the track → returned to the client for an
    // honest "Generated with …" badge (the chain is runtime-dependent, so we can't
    // hardcode it). Defaults updated per branch below.
    let engine = 'AI';
    const brief = buildMusicBrief({ prompt: cappedEn, style, templateDescriptor: template?.descriptor, vocalDescriptor, lyrics, instrumental: makeInstrumental, directives });
    briefTruncated = brief.truncated;
    const composed = await composeTrackUrl(brief, style, makeInstrumental, durationSec, controls, preferredEngine);
    providerAudioUrl = composed.url;
    engine = composed.engine;
    controlsReport = composed.controls;

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
