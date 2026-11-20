/**
 * lib/music/producer/timeline.ts — the section plan of a track: which part plays when, and how intense it is.
 *
 * Lyria 3 Pro reads timed sections in the prompt (`[0:00 - 0:12] Intro: … Intensity: 3/10`, Google's prompt guide,
 * "Detailed structure"), so for a Pro track this plan IS what we ask for, and the lyric sync (lyricSync.ts) can then place
 * each sung line inside the section it was written for. Lyria 3 Clip takes no timestamps; its 30 s still follows a fixed
 * intro / verse / chorus shape, which is what the plan describes for it, best effort.
 *
 * Pure, deterministic, whole seconds.
 */
export type SectionKind = 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'break' | 'build' | 'theme' | 'outro';

export interface Section {
  kind: SectionKind;
  /** 1-based index among sections of the same kind (Verse 2). */
  n: number;
  start: number;
  end: number;
  /** 1–10, Google's "Intensity: N/10". */
  intensity: number;
  /** Lyrics belong in it (false for intro, break, outro and every instrumental section). */
  sung: boolean;
}

type Shape = ReadonlyArray<readonly [SectionKind, number, number]>; // kind, weight, intensity

const VOCAL_SHORT: Shape = [['intro', 2, 3], ['verse', 6, 5], ['chorus', 5, 7]];
const VOCAL_60: Shape = [['intro', 2, 3], ['verse', 6, 5], ['chorus', 5, 7], ['verse', 5, 5], ['chorus', 5, 8], ['outro', 2, 3]];
const VOCAL_LONG: Shape = [
  ['intro', 2, 3], ['verse', 5, 4], ['chorus', 4, 7], ['verse', 5, 5], ['chorus', 4, 8],
  ['bridge', 3, 5], ['chorus', 4, 9], ['outro', 2, 3],
];
const INSTR_SHORT: Shape = [['intro', 2, 3], ['theme', 6, 5], ['build', 4, 7]];
const INSTR_LONG: Shape = [['intro', 2, 2], ['theme', 5, 4], ['build', 4, 6], ['chorus', 5, 8], ['break', 3, 4], ['chorus', 4, 9], ['outro', 2, 3]];

const SUNG: ReadonlySet<SectionKind> = new Set(['verse', 'pre-chorus', 'chorus', 'bridge']);

/** Lay `shape` over `lengthSec`, whole seconds, last section ending exactly at the end. */
export function layout(shape: Shape, lengthSec: number, vocals: boolean): Section[] {
  const total = shape.reduce((n, [, w]) => n + w, 0);
  const counts: Partial<Record<SectionKind, number>> = {};
  const out: Section[] = [];
  let acc = 0;
  shape.forEach(([kind, w, intensity], i) => {
    const start = Math.round((acc / total) * lengthSec);
    acc += w;
    const end = i === shape.length - 1 ? lengthSec : Math.round((acc / total) * lengthSec);
    counts[kind] = (counts[kind] ?? 0) + 1;
    out.push({ kind, n: counts[kind] as number, start, end, intensity, sung: vocals && SUNG.has(kind) });
  });
  return out;
}

export function planTimeline(lengthSec: number, vocals: boolean): Section[] {
  if (vocals) return layout(lengthSec <= 30 ? VOCAL_SHORT : lengthSec <= 60 ? VOCAL_60 : VOCAL_LONG, lengthSec, true);
  return layout(lengthSec <= 30 ? INSTR_SHORT : INSTR_LONG, lengthSec, false);
}

export const mmss = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const NAME: Record<SectionKind, string> = {
  intro: 'Intro', verse: 'Verse', 'pre-chorus': 'Pre-chorus', chorus: 'Chorus', bridge: 'Bridge', break: 'Breakdown',
  build: 'Build', theme: 'Main theme', outro: 'Outro',
};
export const sectionName = (s: Pick<Section, 'kind' | 'n'>): string =>
  (s.kind === 'verse' || s.kind === 'chorus') && s.n > 1 ? `${NAME[s.kind]} ${s.n}` : NAME[s.kind];

/** The prompt lines for a Pro track, in Google's documented form. */
export function timelineLines(sections: readonly Section[]): string[] {
  return sections.map((s) => `[${mmss(s.start)} - ${mmss(s.end)}] ${sectionName(s)}. Intensity: ${s.intensity}/10`);
}
