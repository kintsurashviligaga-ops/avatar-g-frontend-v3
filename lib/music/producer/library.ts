/**
 * lib/music/producer/library.ts — the recipe saved next to every Music Producer track (renders/music-producer/<uid>/<id>.json).
 * It is what Extend / Restyle / Use in Video read back, and what the Library card shows. Pure.
 */
import type { LyricLine } from './lyricSync';
import type { Section } from './timeline';
import type { ProducerSpec } from './spec';
import type { ProducerAction, ProducerBook } from './price';

export interface ProducerMeta {
  v: 1;
  kind: 'music-producer';
  id: string;
  action: ProducerAction;
  spec: ProducerSpec;
  model: string;
  /** The exact text sent to Lyria. */
  input: string;
  /** The lyrics as sung (the user's, or the text Lyria returned). '' for instrumental. */
  lyrics: string;
  lines: LyricLine[];
  timeline: Section[];
  durationSec: number;
  bpm: number | null;
  /** 0 for an original, n for the n-th "Add 30 s". */
  part: number;
  parentId: string | null;
  credits: number;
  book: ProducerBook;
  audioPath: string;
  mime: string;
  createdAt: string;
}

/** Lyria answers with a caption and, for a sung track, the lyric sheet. Keep only lines that look like lyrics. */
export function lyricsFromCaption(caption: string | null): string {
  if (!caption) return '';
  const idx = caption.search(/\[(intro|verse|pre-chorus|chorus|bridge|outro|hook)[^\]]*\]/i);
  return (idx >= 0 ? caption.slice(idx) : '').trim().slice(0, 4000);
}
