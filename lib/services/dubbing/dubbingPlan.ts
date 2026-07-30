/**
 * lib/services/dubbing/dubbingPlan.ts
 * ===================================
 * Master Task §2.3.2 — the Dubbing Studio's decision core: languages, the 7-step pipeline, segment timing
 * and .srt generation.
 *
 * PURE + TOTAL (no imports, no I/O, never throws). The provider legs — ElevenLabs Scribe (STT), Gemini
 * (translate), ElevenLabs TTS with a cloned voice, ffmpeg (extract/mix) — live in the route; everything
 * that can be reasoned about without a network call lives here, so the timing maths that decides whether
 * dubbed speech actually lands on the original mouth is unit-testable.
 */

/** §2.3.2 target languages. Georgian is first because it is the market this feature exists for. */
export type DubbingLanguage = 'ka' | 'en' | 'ru' | 'de' | 'fr' | 'es' | 'it' | 'tr' | 'ar' | 'zh' | 'ja' | 'ko';

export const DUBBING_LANGUAGES: readonly DubbingLanguage[] = [
  'ka', 'en', 'ru', 'de', 'fr', 'es', 'it', 'tr', 'ar', 'zh', 'ja', 'ko',
] as const;

export function isDubbingLanguage(v: unknown): v is DubbingLanguage {
  return typeof v === 'string' && (DUBBING_LANGUAGES as readonly string[]).includes(v);
}

/** The seven steps of §2.3.2, in order. Surfaced to the UI as a progress timeline. */
export type DubbingStep =
  | 'extract_audio'
  | 'transcribe'
  | 'translate'
  | 'synthesize'
  | 'sync'
  | 'mix'
  | 'lipsync';

export const DUBBING_STEPS: readonly DubbingStep[] = [
  'extract_audio', 'transcribe', 'translate', 'synthesize', 'sync', 'mix', 'lipsync',
] as const;

/** Which steps actually run for a given request — lip-sync is opt-in and experimental. */
export function plannedSteps(opts: { lipSync?: boolean }): DubbingStep[] {
  return DUBBING_STEPS.filter((s) => s !== 'lipsync' || opts.lipSync === true);
}

/** One transcribed/translated line with its place on the timeline. */
export interface DubbingSegment {
  startSec: number;
  endSec: number;
  /** Original-language text. */
  text: string;
  /** Target-language text (absent until the translate step). */
  translated?: string;
  /** Speaker label when diarization identified more than one voice. */
  speaker?: string | null;
}

/** Clamp + order a raw segment list so downstream timing maths can trust it. Drops the unusable. */
export function normalizeSegments(raw: unknown): DubbingSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: DubbingSegment[] = [];
  for (const r of raw.slice(0, 5_000)) {
    if (!r || typeof r !== 'object') continue;
    const seg = r as Partial<DubbingSegment>;
    const startSec = Number(seg.startSec);
    const endSec = Number(seg.endSec);
    const text = typeof seg.text === 'string' ? seg.text.trim() : '';
    if (!text) continue;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    if (startSec < 0 || endSec <= startSec) continue;
    out.push({
      startSec,
      endSec,
      text,
      ...(typeof seg.translated === 'string' && seg.translated.trim() ? { translated: seg.translated.trim() } : {}),
      ...(typeof seg.speaker === 'string' && seg.speaker.trim() ? { speaker: seg.speaker.trim() } : {}),
    });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/** Distinct speakers in a segment list — drives whether multi-voice casting is needed. */
export function speakerCount(segments: readonly DubbingSegment[]): number {
  return new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s)).size;
}

// ─── Subtitles ───────────────────────────────────────────────────────────────

/** `HH:MM:SS,mmm` — the SRT timestamp format. Comma before the milliseconds, not a period. */
export function srtTimestamp(totalSec: number): string {
  const t = Number.isFinite(totalSec) && totalSec > 0 ? totalSec : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/**
 * Render segments as a .srt file (§2.3.2 `subtitlesUrl`). Uses the TRANSLATED text when present — the
 * subtitle track belongs to the dubbed audience, not the source one — and falls back to the original so a
 * partially-translated run still produces a usable file.
 */
export function toSrt(segments: readonly DubbingSegment[]): string {
  return segments
    .map((seg, i) => {
      const body = (seg.translated ?? seg.text).replace(/\r?\n/g, ' ').trim();
      return `${i + 1}\n${srtTimestamp(seg.startSec)} --> ${srtTimestamp(seg.endSec)}\n${body}\n`;
    })
    .join('\n');
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/**
 * Translated speech is rarely the same length as the original — Georgian runs materially longer than
 * English, German longer than both. If synthesized audio is simply dropped at the original timestamp it
 * drifts over the source mouth and, by the end of a long video, lands on the wrong shot entirely.
 *
 * Returns the speed factor to apply to a synthesized segment so it fits its slot. Clamped to [0.75, 1.25]:
 * beyond that the voice audibly chipmunks, and it is better to let a segment overrun slightly than to
 * make it unlistenable. A caller that gets a clamped value should widen the slot instead.
 */
export function fitSpeed(synthesizedSec: number, slotSec: number): number {
  const a = Number(synthesizedSec);
  const b = Number(slotSec);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return 1;
  return Math.min(1.25, Math.max(0.75, a / b));
}

/** True when a segment cannot be made to fit even at the speed limit — the caller must widen the slot. */
export function overflowsSlot(synthesizedSec: number, slotSec: number): boolean {
  const a = Number(synthesizedSec);
  const b = Number(slotSec);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return a / b > 1.25;
}

// ─── Cost ────────────────────────────────────────────────────────────────────

/** Master Task §1.8 prices dubbing per MINUTE of source. Rounded UP — a partial minute still bills. */
export function dubbingMinutes(durationSec: number): number {
  const d = Number(durationSec);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.ceil(d / 60);
}

export interface DubbingRequest {
  sourceVideoUrl: string;
  sourceLanguage: DubbingLanguage | 'auto';
  targetLanguage: DubbingLanguage;
  voiceClone: boolean;
  preserveBackgroundAudio: boolean;
  lipSync: boolean;
  subtitles: boolean;
  speakerCount?: number;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  request?: DubbingRequest;
}

/**
 * Validate + normalize an inbound dubbing request. Total: never throws, always returns a verdict, so the
 * route can answer 400 with a real reason instead of a stack trace.
 */
export function validateDubbingRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const b = body as Record<string, unknown>;

  const sourceVideoUrl = typeof b.sourceVideoUrl === 'string' ? b.sourceVideoUrl.trim() : '';
  if (!/^https?:\/\//i.test(sourceVideoUrl)) return { ok: false, error: 'sourceVideoUrl must be an http(s) URL' };

  const targetLanguage = b.targetLanguage;
  if (!isDubbingLanguage(targetLanguage)) {
    return { ok: false, error: `targetLanguage must be one of: ${DUBBING_LANGUAGES.join(', ')}` };
  }

  const sourceRaw = b.sourceLanguage;
  const sourceLanguage: DubbingLanguage | 'auto' = isDubbingLanguage(sourceRaw) ? sourceRaw : 'auto';
  if (sourceLanguage === targetLanguage) {
    return { ok: false, error: 'sourceLanguage and targetLanguage are the same — nothing to dub' };
  }

  const count = Number(b.speakerCount);
  return {
    ok: true,
    request: {
      sourceVideoUrl,
      sourceLanguage,
      targetLanguage,
      // §3.2.8 defaults: voice clone ON, background preserved, subtitles ON, lip-sync OFF (experimental).
      voiceClone: b.voiceClone !== false,
      preserveBackgroundAudio: b.preserveBackgroundAudio !== false,
      subtitles: b.subtitles !== false,
      lipSync: b.lipSync === true,
      ...(Number.isFinite(count) && count >= 1 ? { speakerCount: Math.min(16, Math.round(count)) } : {}),
    },
  };
}
