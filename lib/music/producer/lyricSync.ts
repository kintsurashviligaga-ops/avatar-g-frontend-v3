/**
 * lib/music/producer/lyricSync.ts — show the line being sung (the Music Card's lyrics pane). Pure.
 *
 * LYRIA RETURNS NO WORD TIMINGS. Both Lyria 3 models return the audio plus a text part with the lyrics and the song
 * structure, but no per-word or per-line times (Google's Lyria 3 model page, 2026-11-12). So karaoke at word level is not
 * possible from the model. What we can do honestly:
 *   1. If the returned text carries timestamps (`[0:12]` or `[0:12 - 0:24]` before a section), use them.
 *   2. Otherwise place each lyric section inside the section plan we ASKED for (timeline.ts; Pro follows timed sections),
 *      and spread its lines by length inside it.
 * The card says "Synced by section" so nobody mistakes it for word-level timing.
 */
import type { Section } from './timeline';

export interface LyricLine { text: string; start: number; end: number; section: string }
export interface LyricBlock { tag: string; lines: string[]; at?: number }

const TAG = /^\s*\[([^\]]+)\]\s*$/;
const TIME = /^(\d{1,2}):(\d{2})$/;
const TIMED_TAG = /^\s*\[(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\]\s*(.*)$/;

const secOf = (t: string): number | null => {
  const m = TIME.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Split lyrics into tagged blocks. Untagged leading lines are a Verse. A timed tag keeps its start. */
export function parseLyrics(text: string): LyricBlock[] {
  const blocks: LyricBlock[] = [];
  let cur: LyricBlock | null = null;
  for (const raw of (text ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const timed = TIMED_TAG.exec(line);
    if (timed) {
      const label = (timed[3] ?? '').replace(/[:.]+$/, '').trim() || 'Verse';
      cur = { tag: label, lines: [], at: secOf(timed[1] ?? '') ?? undefined };
      blocks.push(cur);
      continue;
    }
    const tag = TAG.exec(line);
    if (tag) { cur = { tag: (tag[1] ?? '').trim(), lines: [] }; blocks.push(cur); continue; }
    if (!cur) { cur = { tag: 'Verse', lines: [] }; blocks.push(cur); }
    cur.lines.push(line);
  }
  return blocks;
}

const weight = (s: string) => Math.max(4, s.replace(/\s+/g, '').length);

function spread(lines: readonly string[], start: number, end: number, section: string): LyricLine[] {
  const total = lines.reduce((n, l) => n + weight(l), 0);
  const out: LyricLine[] = [];
  let at = start;
  lines.forEach((text, i) => {
    const len = ((end - start) * weight(text)) / (total || 1);
    const e = i === lines.length - 1 ? end : at + len;
    out.push({ text, start: round(at), end: round(e), section });
    at = e;
  });
  return out;
}
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Time every line. `plan` is the section plan the track was asked for; `durationSec` the delivered length (the plan is
 * scaled to it, since Lyria lands near, not on, the asked length).
 */
export function syncLyrics(lyrics: string, plan: readonly Section[], durationSec: number): LyricLine[] {
  const blocks = parseLyrics(lyrics).filter((b) => b.lines.length);
  if (!blocks.length || !(durationSec > 0)) return [];
  const planned = plan[plan.length - 1]?.end ?? durationSec;
  const k = planned > 0 ? durationSec / planned : 1;

  // 1. Timestamps from the text win.
  if (blocks.every((b) => b.at != null)) {
    return blocks.flatMap((b, i) => {
      const start = Math.min(b.at as number, durationSec);
      const end = Math.min(i + 1 < blocks.length ? (blocks[i + 1]?.at as number) : durationSec, durationSec);
      return end > start ? spread(b.lines, start, end, b.tag) : [];
    });
  }

  // 2. Our plan's sung sections, in order; blocks beyond them share the last sung window.
  const sung = plan.filter((s) => s.sung).map((s) => ({ start: s.start * k, end: s.end * k }));
  if (!sung.length) {
    const lead = Math.min(4, durationSec * 0.1);
    sung.push({ start: lead, end: durationSec - Math.min(2, durationSec * 0.05) });
  }
  if (blocks.length <= sung.length) {
    return blocks.flatMap((b, i) => { const w = sung[i] as { start: number; end: number }; return spread(b.lines, w.start, w.end, b.tag); });
  }
  // More blocks than sung sections: the whole sung span, divided by block weight.
  const from = (sung[0] as { start: number }).start;
  const to = (sung[sung.length - 1] as { end: number }).end;
  const bw = blocks.map((b) => b.lines.reduce((n, l) => n + weight(l), 0));
  const tw = bw.reduce((a, b) => a + b, 0);
  let at = from;
  return blocks.flatMap((b, i) => {
    const end = i === blocks.length - 1 ? to : at + ((to - from) * (bw[i] ?? 0)) / tw;
    const lines = spread(b.lines, at, end, b.tag);
    at = end;
    return lines;
  });
}

/** The line sung at time `t` (seconds), or -1 between lines. Binary search; lines are in time order. */
export function activeLineAt(lines: readonly LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const l = lines[mid] as LyricLine;
    if (t < l.start) hi = mid - 1;
    else if (t >= l.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
