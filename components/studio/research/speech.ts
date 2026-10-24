/**
 * components/studio/research/speech.ts — the text a report (or an answer about it) is read aloud from.
 *
 * `plainTextForSpeech` (lib/research/report) turns Markdown into lines a voice can read (no marks, no URLs, no code,
 * tables as sentences, citation markers dropped). A whole report is not read: the read is CAPPED at READ_MAX_CHARS (the
 * start of the report — its summary and first sections) and the screen says so; the rest is what "Summarize" and the Live
 * call are for. The cap bounds the TTS spend per tap and the per-user daily allowance.
 *
 * The page's one player (lib/speech/player) reads the text: it cuts it into sentence chunks, reads every chunk once and in
 * order, and stops at a chunk that fails instead of skipping it. This file maps that player's state onto the viewer's.
 */
import { plainTextForSpeech } from '@/lib/research/report';
import { SPEECH_CHUNK_MAX_CHARS } from '@/lib/speech/chunk';
import type { SpeechState } from '@/lib/speech/player';

/** One TTS request's text at most (the player's chunk size). */
export const CHUNK_MAX_CHARS = SPEECH_CHUNK_MAX_CHARS;
/** How much of a report one "Read aloud" tap speaks (≈ 7–9 minutes). */
export const READ_MAX_CHARS = 7_200;

export interface SpeechPlan {
  /** The plain text to read. */
  text: string;
  /** The text was longer than READ_MAX_CHARS — the screen says only the start is read. */
  partial: boolean;
}

/** The text for a REPORT: speech text, capped at a sentence end. */
export function planReportSpeech(markdown: string, opts: { maxChars?: number } = {}): SpeechPlan {
  const cap = opts.maxChars ?? READ_MAX_CHARS;
  const text = plainTextForSpeech(markdown ?? '').trim();
  const partial = text.length > cap;
  return { text: partial ? cutAtSentence(text, cap) : text, partial };
}

/** The text for a short ANSWER (already plain-ish Markdown): speech text, never capped below a few thousand characters. */
export function planAnswerSpeech(markdown: string): SpeechPlan {
  return planReportSpeech(markdown, { maxChars: 4_000 });
}

function cutAtSentence(text: string, max: number): string {
  const slice = text.slice(0, max);
  const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  return end > max * 0.6 ? slice.slice(0, end + 1) : slice;
}

// ─── the viewer's view of the player ─────────────────────────────────────────────────────────────────────────

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error';
export interface PlayerState {
  status: PlayerStatus;
  /** 0-based index of the chunk now loading or playing (or the one that failed). */
  index: number;
  total: number;
}

export const IDLE_PLAYER: PlayerState = { status: 'idle', index: 0, total: 0 };

/** The player's state as the viewer shows it: idle while another owner's read is under way; a failed read is an error. */
export function viewerPlayerState(s: SpeechState, owner: string): PlayerState {
  if (s.owner !== owner) return IDLE_PLAYER;
  const status: PlayerStatus = s.status === 'failed' ? 'error' : s.status;
  return { status, index: s.index, total: s.total };
}
