/**
 * lib/services/montage/smart/silence.ts — "cut the boring parts" for talking-head clips (Phase 8.7, GG D2/D3
 * 2026-11-15: FREE; the default is silences + filler words). PURE + TOTAL.
 *
 * WHERE THE SIGNAL COMES FROM: ffmpeg `silencedetect` on our own server (lib/services/montage/segmentDetect
 * buildDetectArgs / parseDetectLog, the same pass Agent G's intro/outro trim already runs). No model, no Vertex call:
 * its only cost is a few seconds of function CPU, so it is free to the user. Filler words („ეე", „ამ", "um", „э-э")
 * come from the caption words (./captions) when captions are on — they cost nothing extra then.
 *
 * WHAT IS CUT: a pause longer than the sensitivity's `minSilenceSec`, minus `padSec` of breathing room kept on each side
 * (a cut flush against a word clips its first consonant). Pauses at the very start and end of a clip are trimmed whole
 * (to `padSec`). A clip is never cut below MIN_KEEP_SEC of speech, and a kept piece shorter than MIN_PIECE_SEC is merged
 * into its neighbour cut instead of flashing on screen for three frames.
 *
 * WHAT IT RETURNS: the cut list (ascending spans of the SOURCE), the kept pieces, and how much time it saves — so the UI
 * can show "14 pauses, −0:11" as red stripes BEFORE anything is applied. `applyToClip` turns one timeline clip into the
 * kept sub-clips the existing Montage sequence already knows how to render (hard cuts, each a normal clip).
 */
import type { CaptionLang, Span } from './captions';
export type { Span } from './captions';



export type Sensitivity = 'low' | 'normal' | 'tight';
export const SENSITIVITIES: readonly Sensitivity[] = ['low', 'normal', 'tight'];

export const SENSITIVITY: Record<Sensitivity, { minSilenceSec: number; padSec: number }> = {
  low: { minSilenceSec: 1.0, padSec: 0.25 },
  normal: { minSilenceSec: 0.6, padSec: 0.15 },
  tight: { minSilenceSec: 0.35, padSec: 0.08 },
};

/** A clip keeps at least this much, whatever the detector says (a silent clip is the user's choice, not a bug). */
export const MIN_KEEP_SEC = 0.5;
/** A kept piece shorter than this between two cuts is cut too: a 0.1 s flash of picture is worse than a jump. */
export const MIN_PIECE_SEC = 0.3;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Sort, clip into [0, duration] and merge overlapping spans. */
export function normalizeSpans(spans: readonly Span[], durationSec: number): Span[] {
  const d = Math.max(0, durationSec);
  const s = spans
    .map((x) => ({ startSec: Math.max(0, Math.min(d, x.startSec)), endSec: Math.max(0, Math.min(d, x.endSec)) }))
    .filter((x) => x.endSec > x.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const out: Span[] = [];
  for (const x of s) {
    const p = out[out.length - 1];
    if (p && x.startSec <= p.endSec + 1e-6) p.endSec = Math.max(p.endSec, x.endSec);
    else out.push({ ...x });
  }
  return out.map((x) => ({ startSec: r3(x.startSec), endSec: r3(x.endSec) }));
}

/** The complement of `cuts` in [0, duration]. */
export function keptSpans(cuts: readonly Span[], durationSec: number): Span[] {
  const out: Span[] = [];
  let t = 0;
  for (const c of normalizeSpans(cuts, durationSec)) {
    if (c.startSec > t) out.push({ startSec: r3(t), endSec: r3(c.startSec) });
    t = Math.max(t, c.endSec);
  }
  if (durationSec > t) out.push({ startSec: r3(t), endSec: r3(durationSec) });
  return out;
}

/** Silences → spans to cut (padded, edges trimmed whole). */
export function silenceCuts(silences: readonly Span[], durationSec: number, sensitivity: Sensitivity = 'normal'): Span[] {
  const { minSilenceSec, padSec } = SENSITIVITY[sensitivity] ?? SENSITIVITY.normal;
  const d = Math.max(0, durationSec);
  const cuts: Span[] = [];
  for (const s of normalizeSpans(silences, d)) {
    const atStart = s.startSec <= 0.02;
    const atEnd = s.endSec >= d - 0.02;
    const len = s.endSec - s.startSec;
    if (!atStart && !atEnd && len < minSilenceSec) continue;
    // a cut keeps padSec of air next to every word; a pause at an edge of the clip goes all the way to that edge
    const span = { startSec: atStart ? 0 : s.startSec + padSec, endSec: atEnd ? d : s.endSec - padSec };
    if (span.endSec - span.startSec > 0.05) cuts.push(span);
  }
  return normalizeSpans(cuts, d);
}

// ── FILLER WORDS ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Hesitation sounds, per language, matched on the WHOLE word (punctuation stripped). Conservative on purpose: „ანუ"
 * ("that is"), „ესე იგი", "like", "so", „ну" are real words in most sentences and are NOT here — cutting a real word is
 * a worse error than leaving an „ეე" in.
 */
export const FILLERS: Record<CaptionLang, readonly string[]> = {
  ka: ['ეე', 'ეეე', 'ეეეე', 'ამ', 'ამმ', 'ამმმ', 'მმ', 'მმმ', 'ჰმ', 'ჰმმ', 'ააა', 'ა-ა'],
  en: ['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'hmm', 'mm', 'mmm', 'ah', 'ahh'],
  ru: ['э', 'ээ', 'эээ', 'э-э', 'м', 'мм', 'ммм', 'хм', 'эм', 'эмм', 'а-а'],
};

const strip = (w: string) => w.toLocaleLowerCase().replace(/[.,!?…:;«»"'„“”()\[\]]/g, '').trim();

export function isFiller(word: string, lang: CaptionLang): boolean {
  const w = strip(word);
  return !!w && (FILLERS[lang] ?? []).includes(w);
}

/** Filler words → spans to cut (the word itself, plus nothing: the silence pass takes the pauses around it). */
export function fillerCuts(words: ReadonlyArray<{ text: string; startSec: number; endSec: number }>, lang: CaptionLang): Span[] {
  return words.filter((w) => w.endSec > w.startSec && isFiller(w.text, lang)).map((w) => ({ startSec: r3(w.startSec), endSec: r3(w.endSec) }));
}

// ── THE PLAN ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SilencePlan {
  cuts: Span[];
  kept: Span[];
  /** How many separate stretches are removed (the UI's "14 pauses"). */
  count: number;
  removedSec: number;
  durationSec: number;
  /** The length after the cuts. */
  resultSec: number;
  fillers: number;
  /** Nothing to cut: the clip is already tight, or the cuts would leave less than MIN_KEEP_SEC. */
  untouched: boolean;
}

export function planSilenceRemoval(o: {
  durationSec: number;
  silences: readonly Span[];
  sensitivity?: Sensitivity;
  /** Caption words, when captions were made: their filler words are cut too. */
  words?: ReadonlyArray<{ text: string; startSec: number; endSec: number }>;
  lang?: CaptionLang;
  removeFillers?: boolean;
}): SilencePlan {
  const d = Math.max(0, Number.isFinite(o.durationSec) ? o.durationSec : 0);
  const fill = o.removeFillers !== false && o.words && o.lang ? fillerCuts(o.words, o.lang) : [];
  let cuts = normalizeSpans([...silenceCuts(o.silences, d, o.sensitivity ?? 'normal'), ...fill], d);
  // a sliver of picture between two cuts goes too
  let kept = keptSpans(cuts, d);
  const slivers = kept.filter((k) => k.endSec - k.startSec < MIN_PIECE_SEC);
  if (slivers.length && slivers.length < kept.length) {
    cuts = normalizeSpans([...cuts, ...slivers], d);
    kept = keptSpans(cuts, d);
  }
  const keptSec = kept.reduce((s, k) => s + (k.endSec - k.startSec), 0);
  if (!cuts.length || keptSec < MIN_KEEP_SEC) {
    return { cuts: [], kept: d > 0 ? [{ startSec: 0, endSec: r3(d) }] : [], count: 0, removedSec: 0, durationSec: r3(d), resultSec: r3(d), fillers: 0, untouched: true };
  }
  const removed = cuts.reduce((s, c) => s + (c.endSec - c.startSec), 0);
  return { cuts, kept, count: cuts.length, removedSec: r3(removed), durationSec: r3(d), resultSec: r3(d - removed), fillers: fill.length, untouched: false };
}

/**
 * One timeline clip [startSec, endSec] of its source → the kept sub-clips inside that window, in order. The plan's
 * spans are SOURCE seconds; a clip already trimmed by the user only keeps what lies inside its own window.
 */
export function applyToClip<C extends { id: string; startSec: number; endSec: number }>(clip: C, plan: SilencePlan, idOf: (i: number) => string): C[] {
  if (plan.untouched) return [clip];
  const pieces = plan.kept
    .map((k) => ({ startSec: Math.max(k.startSec, clip.startSec), endSec: Math.min(k.endSec, clip.endSec) }))
    .filter((k) => k.endSec - k.startSec >= MIN_PIECE_SEC);
  if (!pieces.length) return [clip];
  return pieces.map((p, i) => ({ ...clip, id: i === 0 ? clip.id : idOf(i), startSec: r3(p.startSec), endSec: r3(p.endSec) }));
}

/** Master-time spans the edit LOSES when `plan` is applied to a clip that starts at `clipT0` on the master. */
export function masterCuts(clip: { startSec: number; endSec: number }, clipT0: number, plan: SilencePlan): Span[] {
  return plan.cuts
    .map((c) => ({ startSec: Math.max(c.startSec, clip.startSec), endSec: Math.min(c.endSec, clip.endSec) }))
    .filter((c) => c.endSec > c.startSec)
    .map((c) => ({ startSec: r3(clipT0 + c.startSec - clip.startSec), endSec: r3(clipT0 + c.endSec - clip.startSec) }));
}

// ── THE DETECTOR (audio only) ────────────────────────────────────────────────────────────────────────────────────

/** ffmpeg's own threshold for "silence": the same level Agent G's intro/outro trim uses (segmentDetect SILENCE_DB). */
export const DETECT_DB = -35;
/** The shortest pause ffmpeg reports; the plan decides which of them are cut (SENSITIVITY). */
export const DETECT_MIN_SEC = 0.3;

/**
 * One audio-only decode (`-vn`): far cheaper than segmentDetect's full pass, which also reads blacks and scene cuts.
 * `windowSec` limits it to a clip's trim window (input seeking), so a 10 s window of a long source decodes 10 s.
 */
export function silenceDetectArgs(source: string, windowSec?: { startSec: number; endSec: number }): string[] {
  const seek = windowSec ? ['-ss', windowSec.startSec.toFixed(3), '-t', Math.max(0.1, windowSec.endSec - windowSec.startSec).toFixed(3)] : [];
  return ['-hide_banner', '-nostats', ...seek, '-i', source, '-vn', '-af', `silencedetect=noise=${DETECT_DB}dB:d=${DETECT_MIN_SEC}`, '-f', 'null', '-'];
}

/** The silences in ffmpeg's log; an open silence (no end line) runs to `durationSec`. Offsets by `offsetSec`. */
export function parseSilenceLog(stderr: string, durationSec: number, offsetSec = 0): Span[] {
  const out: Span[] = [];
  let open: number | null = null;
  for (const line of String(stderr).split('\n')) {
    const s = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (s) { open = Math.max(0, Number(s[1])); continue; }
    const e = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (e && open !== null) { out.push({ startSec: r3(open + offsetSec), endSec: r3(Number(e[1]) + offsetSec) }); open = null; }
  }
  if (open !== null && durationSec > open) out.push({ startSec: r3(open + offsetSec), endSec: r3(durationSec + offsetSec) });
  return out.filter((x) => x.endSec > x.startSec);
}
