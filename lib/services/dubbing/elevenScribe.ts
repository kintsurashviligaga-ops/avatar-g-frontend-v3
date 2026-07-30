/**
 * lib/services/dubbing/elevenScribe.ts — ElevenLabs **Scribe** speech-to-text (Master Task §2.3.2 leg 2).
 *
 * The one provider in the dubbing pipeline with no existing client in this repo. Everything else is reused:
 * TTS + alignment from lib/elevenlabs/ttsTimestamps, vocal/background separation from
 * lib/elevenlabs/audioIsolation, ffmpeg from lib/audio/*.
 *
 * NEVER THROWS: returns null on any miss (no key, quota, timeout, contract drift) so the pipeline can fail
 * the job with a real reason instead of a stack trace.
 *
 * WIRE CONTRACT: POST /v1/speech-to-text, multipart form with `file` + `model_id=scribe_v1`.
 * `diarize=true` labels speakers, which is what lets a two-hander be dubbed with two voices instead of one.
 */
import { withElevenLabsSlot } from '@/lib/elevenlabs/concurrency';
import type { DubbingSegment } from './dubbingPlan';

const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const TIMEOUT_MS = 180_000;

export interface ScribeResult {
  /** Whole-transcript text, for the translation prompt's context. */
  text: string;
  /** Per-utterance segments with timings (and speaker when diarization identified more than one). */
  segments: DubbingSegment[];
  /** ISO-639-1 code Scribe detected, when the caller asked for auto-detect. */
  detectedLanguage: string | null;
}

/** Scribe returns word-level items; utterances are rebuilt from them by speaker + gap. */
interface ScribeWord {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  speaker_id?: unknown;
  type?: unknown;
}

/** A pause longer than this starts a new subtitle/dub segment even for the same speaker. */
const SEGMENT_GAP_SEC = 0.9;
/** Never emit a segment longer than this — a 30s block cannot be time-fitted onto the original mouth. */
const MAX_SEGMENT_SEC = 12;

/**
 * Group Scribe's word list into utterances. Pure + exported so the grouping rules — which decide how the
 * dub is chopped, and therefore how well it lands — are unit-testable without a network call.
 */
export function groupWordsIntoSegments(words: readonly ScribeWord[]): DubbingSegment[] {
  const out: DubbingSegment[] = [];
  for (const w of words) {
    // Scribe emits `type: 'spacing'` entries between words; they carry no text worth dubbing.
    if (w?.type === 'spacing') continue;
    const text = typeof w?.text === 'string' ? w.text : '';
    const start = Number(w?.start);
    const end = Number(w?.end);
    if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const speaker = typeof w?.speaker_id === 'string' && w.speaker_id ? w.speaker_id : null;

    const last = out[out.length - 1];
    const sameSpeaker = last && (last.speaker ?? null) === speaker;
    const smallGap = last && start - last.endSec <= SEGMENT_GAP_SEC;
    const stillShort = last && end - last.startSec <= MAX_SEGMENT_SEC;

    if (last && sameSpeaker && smallGap && stillShort) {
      last.text = `${last.text}${text.startsWith(' ') ? '' : ' '}${text}`.replace(/\s+/g, ' ').trim();
      last.endSec = end;
    } else {
      out.push({ startSec: start, endSec: end, text: text.trim(), ...(speaker ? { speaker } : {}) });
    }
  }
  return out;
}

/**
 * Transcribe an audio file. `audio` is the extracted track (see the pipeline's leg 1), not the video —
 * sending a whole mp4 wastes upload time and Scribe only reads the audio anyway.
 */
export async function transcribeWithScribe(
  audio: Buffer,
  opts: { languageCode?: string | null; diarize?: boolean } = {},
): Promise<ScribeResult | null> {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key || !audio?.byteLength) return null;

  try {
    return await withElevenLabsSlot(async () => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
      form.append('model_id', 'scribe_v1');
      form.append('timestamps_granularity', 'word');
      // Diarization is what makes multi-voice dubbing possible; without it every speaker gets one voice.
      form.append('diarize', String(opts.diarize !== false));
      // Omitted entirely for auto-detect — sending an empty string is a 422.
      if (opts.languageCode && opts.languageCode !== 'auto') form.append('language_code', opts.languageCode);

      const res = await fetch(STT_URL, {
        method: 'POST',
        headers: { 'xi-api-key': key },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.warn(`[scribe] http_${res.status}: ${body.slice(0, 240)}`);
        return null;
      }
      const j = (await res.json().catch(() => null)) as
        | { text?: unknown; words?: unknown; language_code?: unknown }
        | null;
      if (!j) return null;

      const words = Array.isArray(j.words) ? (j.words as ScribeWord[]) : [];
      const segments = groupWordsIntoSegments(words);
      const text = typeof j.text === 'string' ? j.text : segments.map((s) => s.text).join(' ');
      // No usable transcript is a failure, not an empty success — dubbing silence produces a silent video.
      if (!segments.length && !text.trim()) return null;

      return {
        text,
        segments,
        detectedLanguage: typeof j.language_code === 'string' ? j.language_code : null,
      };
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[scribe] threw:', err instanceof Error ? err.message : err);
    return null;
  }
}
