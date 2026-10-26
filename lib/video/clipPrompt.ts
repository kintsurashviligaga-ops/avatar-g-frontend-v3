/**
 * lib/video/clipPrompt.ts — the prompt of ONE direct clip (lib/video/directClip), built from the user's own words. Pure and
 * client-safe (the chat's card reads the speech checks below); the server-only reader that fills `ClipReading` is
 * lib/video/clipSpeech.
 *
 * ⚠️ THE SCENARIO IS THE USER'S (GG, 2026-10-25 16:10Z: the film pipeline's director rewrote it into English scene
 * scripts). The engines read English best, so the prompt is TRANSLATED, literally, and nothing is added to it but what
 * keeps the photo and the speech: a line about the first frame or the reference photos, who says which line, and the
 * negative prompt.
 *
 * ⚠️ A GEORGIAN LINE IS SAID BY THE CHARACTER, IN THEIR OWN VOICE — ON GEMINI OMNI FLASH, AT EVERY LENGTH (GG 2026-10-26
 * 10:44Z: „ნარაცია თვითონ დაადო", „პერსონაჟებს ერთი ხმა ახმოვანებდა"). Veo's own Georgian is garbled (the 2026-10-16
 * film), so a Georgian line on Veo used to be replaced by ONE Google Cloud TTS voice laid over Veo's mouth: in GG's
 * three-person podcast every character spoke in the same narrator's voice, stretched −20…+36 % and laid by order, not by
 * who spoke. Omni speaks Georgian itself (the 2026-10-25 probe and GG's 08:44Z clip: clear Georgian in the character's
 * own voice, lips in sync), so a clip with a Georgian line goes to Omni (directClipEngine) and nothing is dubbed. Veo
 * keeps the clips with no Georgian line; an English or Russian line is said in Veo's own voice, verbatim.
 *
 * WHO SAYS WHAT. The reader names the character of each line and their voice (`speakers`), and the prompt says the order
 * and that no two people share a voice — WITHOUT writing the words a second time (Omni's probe said a line twice). GG's
 * clip 2026-10-26 13:53Z (two voices, no narrator) still had a false start, the woman's line over a man's face and a
 * track under the lines: the camera is put on whoever speaks, false starts are ruled out, and music unless asked for.
 *
 * THE WORDS MUST FIT THE CLIP, checked before any charge (clipSpeechFits): a line longer than the clip is rushed or cut,
 * never refused by the engine (lib/video/speechTiming).
 */
import { isGeorgianText } from '@/lib/audio/tts-model';
import { OVERFLOW_TOLERANCE, sceneSpeechCapacity, speechSeconds } from './speechTiming';

/** Who says a line: the character as the prompt names them, in English („the man", „the host"), and their voice. */
export interface ClipSpeaker {
  who: string;
  voice: 'male' | 'female' | null;
}

/** What the reader found in the prompt. `english` marks each spoken line as `[LINE n]` (1-based, in `lines` order). */
export interface ClipReading {
  english: string;
  lines: string[];
  /** Who says each line, in `lines` order (the same length; `who` is empty when the prompt does not say). */
  speakers: ClipSpeaker[];
  /** The voice of the one who speaks, when one does (the first line's). */
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
  const said = Array.isArray(o.speakers) ? o.speakers : [];
  const speakers = lines.map((_, i): ClipSpeaker => {
    const v = (said[i] && typeof said[i] === 'object' ? said[i] : {}) as Record<string, unknown>;
    const who = typeof v.who === 'string' ? v.who.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    const voice = v.voice === 'male' || v.voice === 'female' ? v.voice : lines.length === 1 ? speaker : null;
    return { who, voice };
  });
  return { english, lines, speakers, speaker: speaker ?? speakers[0]?.voice ?? null, silent: o.silent === true && lines.length === 0 };
}

/** All the lines, in order, as one read (what CLIP_SPEECH_MAX_CHARS counts). */
export function spokenText(lines: readonly string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/** Whether a character says a Georgian line: then the clip is Gemini Omni Flash's, which says it in their own voice. */
export function speaksGeorgian(lines: readonly string[]): boolean {
  return lines.some((l) => isGeorgianText(l));
}

/** A Georgian verb of speaking („ამბობს", „ეუბნება", „ეკითხება", „ლაპარაკობს", „მღერის" …). */
const KA_SPEECH_VERB = /(?:ამბობ|ეუბნ|ეკითხ|ლაპარაკ|საუბრ|ყვირ|ჩურჩულ|მღერ|პასუხობ|უპასუხ|მიმართავ|იძახ|თქვა|ეტყვ|აცხად)/;

/**
 * The card's own reading, before the server's reader runs (it needs Vertex): a Georgian line in quote marks, or a Georgian
 * prompt with a verb of speaking. The route reads the prompt again and, when its reader finds a Georgian line the card
 * missed, refuses free with the Omni price (409 price_changed + speech: 'ka') — the card shows it and asks again.
 */
export function promptSpeaksGeorgian(prompt: string): boolean {
  if (speaksGeorgian(quotedLines(prompt).lines)) return true;
  return isGeorgianText(prompt) && KA_SPEECH_VERB.test(prompt);
}

/** A beat between two people's lines (a cut, a reaction): the words do not run into each other. */
export const SPEAKER_TURN_SEC = 0.3;

/** Seconds the lines take at a natural pace (lib/video/speechTiming), with a beat at every change of speaker. */
export function clipSpeechSeconds(lines: readonly string[], speakers: readonly ClipSpeaker[] = []): number {
  const said = lines.map((l) => l.trim()).filter(Boolean);
  if (said.length === 0) return 0;
  let turns = 0;
  for (let i = 1; i < said.length; i += 1) {
    const a = speakers[i - 1]?.who.toLowerCase() ?? '', b = speakers[i]?.who.toLowerCase() ?? '';
    // Unnamed speakers count as a change: two lines are two people unless the reader said otherwise.
    if (!a || !b || a !== b) turns += 1;
  }
  return said.reduce((s, l) => s + speechSeconds(l), 0) + turns * SPEAKER_TURN_SEC;
}

/** The most speech a clip of `clipSec` holds: its room for words (a beat in, a beat out) and the estimate's tolerance. */
export function clipSpeechRoom(clipSec: number): number {
  return Math.round(sceneSpeechCapacity(clipSec) * OVERFLOW_TOLERANCE * 10) / 10;
}

/**
 * The card's floor for the words in quote marks, before the reader runs: their seconds with no beat between speakers (the
 * reader may find the same person speaking twice). The card stops only what cannot fit; the route measures the rest.
 */
export function quotedSpeechSeconds(prompt: string): number {
  return Math.round(quotedLines(prompt).lines.reduce((s, l) => s + speechSeconds(l), 0) * 10) / 10;
}

/** Whether the lines fit the clip; `seconds` is the estimate, rounded for the user (the route and the card say the same). */
export function clipSpeechFits(lines: readonly string[], clipSec: number, speakers?: readonly ClipSpeaker[]): { fits: boolean; seconds: number } {
  const seconds = Math.round(clipSpeechSeconds(lines, speakers) * 10) / 10;
  return { fits: seconds <= clipSpeechRoom(clipSec), seconds };
}

/** The user asked for words on screen themselves — then the negative prompt does not forbid them. */
export function asksForSubtitles(prompt: string): boolean {
  return /subtit|caption|სუბტიტრ|ტიტრ|субтитр|титр/i.test(prompt);
}

/** The user asked for music themselves — then Omni is not told to leave it out under the lines. */
export function asksForMusic(prompt: string): boolean {
  return /music|song|soundtrack|მუსიკ|სიმღერ|მელოდი|музык|песн|мелоди|саундтрек/i.test(prompt);
}

const NEGATIVE_BASE = 'blurry, low quality, watermark, distorted face, deformed hands, extra limbs';
const NEGATIVE_TEXT = 'subtitles, captions, on-screen text';

/** Veo's negative prompt (nouns only — Veo's rule): no subtitles unless the user asked for them. */
export function clipNegativePrompt(userPrompt: string): string {
  return asksForSubtitles(userPrompt) ? NEGATIVE_BASE : `${NEGATIVE_BASE}, ${NEGATIVE_TEXT}`;
}

export interface ComposeClipPrompt {
  reading: ClipReading;
  /** 'frame' = one photo is the first frame; 'refs' = two or three photos are reference images; 'none' = text only. */
  photos: 'none' | 'frame' | 'refs';
  /** The engine: Veo (default) or Gemini Omni Flash, which speaks every language itself and takes no negative prompt. */
  engine?: 'veo' | 'omni';
  /** Omni only: the user asked for words on screen (asksForSubtitles), so the prompt does not forbid them. */
  subtitles?: boolean;
  /** Omni only: the user asked for music (asksForMusic), so spoken lines are not kept clear of it. */
  music?: boolean;
}

/** „the man (male voice)" — a speaker as the prompt says them; null when the reader could not name them. */
function speakerPhrase(s: ClipSpeaker | undefined): string | null {
  if (!s?.who) return null;
  return s.voice ? `${s.who} (${s.voice} voice)` : s.who;
}

/**
 * Who says the lines, said once and without the words themselves (they are in the scene already): the order of the
 * speakers, each in their own voice, and no narrator. Null when nobody speaks.
 */
function speechRule(reading: ClipReading): string | null {
  if (reading.lines.length === 0) return null;
  const georgian = speaksGeorgian(reading.lines) ? ', in natural Georgian' : '';
  // The speakers in the order they speak, a run of lines by one person named once.
  const order: string[] = [];
  reading.lines.forEach((_, i) => {
    const p = speakerPhrase(reading.speakers[i]);
    if (p && order[order.length - 1] !== p) order.push(p);
  });
  const people = new Set(reading.speakers.map((s) => s.who.toLowerCase()).filter(Boolean)).size;
  if (people >= 2) {
    return `The lines are spoken in this order: ${order.join(', then ')}. Each person says only their own words, once, exactly as written${georgian}, in their own voice, with their own lips in sync; no two people share a voice. The camera is on each person while they speak. No false starts, no narrator, no voice-over.`;
  }
  if (order.length === 1) {
    return `${order[0]![0]!.toUpperCase()}${order[0]!.slice(1)} says the words on screen, once, exactly as written${georgian}, lips in sync. No false starts, no narrator, no voice-over.`;
  }
  return `Each line is said once, exactly as written${georgian}, by the person on screen, lips in sync. No false starts, no narrator, no voice-over.`;
}

/** The prompt the engine renders. */
export function composeClipPrompt({ reading, photos, engine = 'veo', subtitles = false, music = false }: ComposeClipPrompt): string {
  const omni = engine === 'omni';
  const said = (line: string): string => `"${line.replace(/"/g, '')}"`;

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
  const rule = speechRule(reading);
  if (rule) parts.push(rule);
  else if (reading.silent) parts.push('No dialogue, no voices.');
  // ⚠️ GG's clip 2026-10-26 13:53Z (Omni 10 s 1080p): an upbeat track nobody asked for ran under the two voices.
  if (omni && rule && !music) parts.push('No background music.');
  if (omni && !subtitles) parts.push('No subtitles, captions or on-screen text.');
  return parts.join(' ');
}
