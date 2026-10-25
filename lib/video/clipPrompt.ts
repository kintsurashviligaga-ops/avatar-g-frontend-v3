/**
 * lib/video/clipPrompt.ts — the Veo prompt of ONE direct clip (lib/video/directClip), built from the user's own words.
 * Pure; the server-only reader that fills `ClipReading` is lib/video/clipSpeech.
 *
 * ⚠️ THE SCENARIO IS THE USER'S (GG, 2026-10-25 16:10Z: the film pipeline's director rewrote it into English scene
 * scripts). Veo reads English best, so the prompt is TRANSLATED, literally, and nothing is added to it but what keeps the
 * photo and the language: a line about the first frame or the reference photos, how a Georgian line is said, and the
 * negative prompt.
 *
 * ⚠️ A GEORGIAN LINE IS SAID BY THE CHARACTER, NOT A NARRATOR (GG: „პერსონაჟს ქართულად უნდა ელაპარაკა"). Veo's own Georgian
 * is garbled (the 2026-10-16 film), so the talking avatar's proven way is used (lib/avatar/veoAvatar): Veo says the same
 * syllables in Latin letters, so its mouth makes them, and on delivery its voice is replaced by the line in a native
 * Google Cloud TTS voice, fitted onto where Veo spoke (lib/avatar/speechMatch). English and Russian lines keep Veo's own
 * voice, verbatim.
 *
 * ⚠️ OMNI FLASH (the 10 s clip) SPEAKS GEORGIAN ITSELF. The 2026-10-25 Vertex probe: clear, intelligible Georgian in the
 * character's own voice. So its lines stay in their own script, nothing is dubbed, and — Omni has no negative prompt — the
 * "no on-screen text" rule is said in the prompt. The probe's clip said its line twice, so each line is asked for once.
 */
import { georgianToLatin } from '@/lib/avatar/speechMatch';
import { isGeorgianText } from '@/lib/audio/tts-model';

/** What the reader found in the prompt. `english` marks each spoken line as `[LINE n]` (1-based, in `lines` order). */
export interface ClipReading {
  english: string;
  lines: string[];
  speaker: 'male' | 'female' | null;
  /** Nobody in the prompt speaks, sings or talks: Veo is told so, or it invents English chatter. */
  silent: boolean;
}

/** Every spoken line, at most this long in all: about what one person says in 8 s (the avatar's own cap). */
export const CLIP_SPEECH_MAX_CHARS = 200;

/** Words a character says, in the quote marks people type: „…“ “…” "…" «…». */
const QUOTED = /„([^“”"]{1,300})[“”"]|“([^”]{1,300})”|"([^"]{1,300})"|«([^»]{1,300})»/g;

/** The quoted lines of a prompt and the prompt with each replaced by its `[LINE n]` marker. */
export function quotedLines(prompt: string): { marked: string; lines: string[] } {
  const lines: string[] = [];
  const marked = prompt.replace(QUOTED, (_m, a?: string, b?: string, c?: string, d?: string) => {
    const words = (a ?? b ?? c ?? d ?? '').replace(/\s+/g, ' ').trim();
    if (!words) return _m;
    lines.push(words);
    return `[LINE ${lines.length}]`;
  });
  return { marked, lines };
}

/** The reader's JSON, checked. Null when it is not the shape asked for (the caller falls back to the quoted lines). */
export function parseClipReading(raw: string): ClipReading | null {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const english = typeof o.english === 'string' ? o.english.replace(/\s+/g, ' ').trim() : '';
  if (english.length < 3 || english.length > 3_000) return null;
  if (!Array.isArray(o.lines) || o.lines.length > 6 || !o.lines.every((l) => typeof l === 'string')) return null;
  const lines = (o.lines as string[]).map((l) => l.replace(/\s+/g, ' ').trim().replace(/^["„“«]+|["“”»]+$/g, '').trim()).filter(Boolean);
  const speaker = o.speaker === 'male' || o.speaker === 'female' ? o.speaker : null;
  return { english, lines, speaker, silent: o.silent === true && lines.length === 0 };
}

/** All the lines, in order, as one read: the text Cloud TTS speaks for a Georgian clip. */
export function spokenText(lines: readonly string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Whether the clip's lines are Georgian, so its voice is Cloud TTS's over Veo's mouth (lib/avatar/voicedClip). */
export function clipVoicedByTts(lines: readonly string[]): boolean {
  return lines.some((l) => isGeorgianText(l));
}

/** The user asked for words on screen themselves — then the negative prompt does not forbid them. */
export function asksForSubtitles(prompt: string): boolean {
  return /subtit|caption|სუბტიტრ|ტიტრ|субтитр|титр/i.test(prompt);
}

const NEGATIVE_BASE = 'blurry, low quality, watermark, distorted face, deformed hands, extra limbs';
const NEGATIVE_TEXT = 'subtitles, captions, on-screen text';

/** Veo's negative prompt (nouns only — Veo's rule): no subtitles unless the user asked for them. */
export function clipNegativePrompt(userPrompt: string): string {
  return asksForSubtitles(userPrompt) ? NEGATIVE_BASE : `${NEGATIVE_BASE}, ${NEGATIVE_TEXT}`;
}

export interface ComposeClipPrompt {
  reading: ClipReading;
  clipSec: number;
  /** 'frame' = one photo is the first frame; 'refs' = two or three photos are reference images; 'none' = text only. */
  photos: 'none' | 'frame' | 'refs';
  /** A Georgian line's Cloud TTS length: Veo is told to take about as long, so the dub fits its mouth. */
  voicedSec?: number;
  /** The engine: Veo (default) or Gemini Omni Flash, which speaks every language itself and takes no negative prompt. */
  engine?: 'veo' | 'omni';
  /** Omni only: the user asked for words on screen (asksForSubtitles), so the prompt does not forbid them. */
  subtitles?: boolean;
}

/** The prompt Veo renders. */
export function composeClipPrompt({ reading, clipSec, photos, voicedSec, engine = 'veo', subtitles = false }: ComposeClipPrompt): string {
  const omni = engine === 'omni';
  const voiced = !omni && voicedSec !== undefined && clipVoicedByTts(reading.lines);
  const said = (line: string): string => `"${(voiced ? georgianToLatin(line) : line).replace(/"/g, '')}"`;

  let body = reading.english;
  const placed = new Set<number>();
  body = body.replace(/\[LINE (\d+)\]/g, (m, n: string) => {
    const i = Number(n) - 1;
    const line = reading.lines[i];
    if (!line) return '';
    placed.add(i);
    return said(line);
  }).replace(/\s+([.,!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const missing = reading.lines.filter((_, i) => !placed.has(i));
  if (missing.length > 0) body = `${body.replace(/[.!?…]?$/, '.')} They say aloud: ${missing.map(said).join(' ')}`;

  const parts: string[] = [];
  if (photos === 'frame') parts.push('Start exactly from the first frame: keep its people, faces, clothes and setting as they are.');
  if (photos === 'refs') parts.push('Keep the people and things from the reference images exactly as they look.');
  parts.push(body);
  if (voiced) {
    const talk = Math.max(1, Math.min(clipSec, Math.round((voicedSec as number) * 2) / 2));
    parts.push(`The spoken words are Georgian, pronounced exactly as written, every vowel clear, lips moving in sync with them${talk >= clipSec - 0.5 ? ', at a calm natural pace that fills the clip' : `, at a calm natural pace taking about ${talk} seconds`}.`);
  } else if (omni && reading.lines.length > 0) {
    parts.push(`Each line is said once, exactly as written${clipVoicedByTts(reading.lines) ? ', in natural Georgian' : ''}, lips in sync, no narrator.`);
  } else if (reading.silent) {
    parts.push('No dialogue, no voices.');
  }
  if (omni && !subtitles) parts.push('No subtitles, captions or on-screen text.');
  return parts.join(' ');
}
