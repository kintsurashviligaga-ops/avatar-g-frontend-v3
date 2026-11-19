/**
 * lib/services/montage/smart/timeline.ts — the Smart Timeline's extra tracks and their operations. PURE + TOTAL: no
 * I/O, never throws; every op returns a new value and leaves its input untouched (the editor keeps undo history).
 *
 * The VIDEO track stays today's Montage clip sequence (components/studio/montage/project: clips play one after another,
 * so their times are derived, never stored). What Phase 8.7 adds are the tracks whose items sit at their OWN times on
 * the master:
 *
 *   text      free titles (start, end, words, style, position) — independent of which clip is under them
 *   effects   spans of Glitch / Zoom punch / Shake / Flash
 *   (captions are a track too, but generated: ./captions)
 *
 * Plus the two helpers every track shares: SNAPPING (an edge lands on the playhead, another item's edge, a clip
 * boundary or a beat when it is within a few pixels) and RIPPLE DELETE on the video track (removing a clip closes the
 * gap, which a derived-time sequence does by itself; text and effects after it move left with it).
 */

export type FxKind = 'glitch' | 'zoomPunch' | 'shake' | 'flash';
export const FX_KINDS: readonly FxKind[] = ['glitch', 'zoomPunch', 'shake', 'flash'];

export type TextPos = 'top' | 'middle' | 'bottom';
export type TextLook = 'title' | 'subtitle' | 'label';

export interface TextItem {
  id: string;
  t0: number;
  t1: number;
  text: string;
  pos: TextPos;
  look: TextLook;
}

export interface FxItem {
  id: string;
  t0: number;
  t1: number;
  kind: FxKind;
  /** 0–1; how strong (glitch shift, zoom amount, shake amplitude). */
  amount: number;
}

export interface SmartTracks {
  texts: TextItem[];
  effects: FxItem[];
}

export type TrackName = 'text' | 'effects';

/** A clip as the video track lays it: only its length matters for times. */
export interface SeqClip { id: string; startSec: number; endSec: number; speed?: number }

export const MIN_ITEM_SEC = 0.2;
export const MAX_TEXT_CHARS = 120;
export const MAX_TEXT_ITEMS = 30;
export const MAX_FX_ITEMS = 40;
/** Snap distance in screen pixels: edges this close to a target land on it. */
export const SNAP_PX = 8;

export const emptyTracks = (): SmartTracks => ({ texts: [], effects: [] });

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const fin = (n: unknown, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? n : d);

/** How long a clip plays on the master (its window, at its speed). */
export const seqLen = (c: SeqClip): number => Math.max(0, (c.endSec - c.startSec) / (c.speed && c.speed > 0 ? c.speed : 1));

/** Master times of each clip: [t0, t1] in order. */
export function seqLayout(clips: readonly SeqClip[]): Array<{ id: string; t0: number; t1: number }> {
  let t = 0;
  return clips.map((c) => {
    const t0 = t;
    t = r3(t + seqLen(c));
    return { id: c.id, t0: r3(t0), t1: t };
  });
}

export const seqTotal = (clips: readonly SeqClip[]): number => r3(clips.reduce((s, c) => s + seqLen(c), 0));

function itemsOf(tracks: SmartTracks, track: TrackName): Array<TextItem | FxItem> {
  return track === 'text' ? tracks.texts : tracks.effects;
}

function withItems(tracks: SmartTracks, track: TrackName, items: Array<TextItem | FxItem>): SmartTracks {
  return track === 'text' ? { ...tracks, texts: items as TextItem[] } : { ...tracks, effects: items as FxItem[] };
}

const byStart = <T extends { t0: number }>(a: T, b: T) => a.t0 - b.t0;

/** Clamp an item's span into [0, total] and to at least MIN_ITEM_SEC. Returns null when it cannot fit at all. */
export function fitSpan(t0: number, t1: number, totalSec: number): { t0: number; t1: number } | null {
  const total = Math.max(0, fin(totalSec));
  if (total < MIN_ITEM_SEC) return null;
  let a = clamp(fin(t0), 0, total);
  let b = clamp(fin(t1, a + MIN_ITEM_SEC), 0, total);
  if (b < a) [a, b] = [b, a];
  if (b - a < MIN_ITEM_SEC) {
    b = Math.min(total, a + MIN_ITEM_SEC);
    a = Math.max(0, b - MIN_ITEM_SEC);
  }
  return { t0: r3(a), t1: r3(b) };
}

export function addText(tracks: SmartTracks, item: Omit<TextItem, 'id'> & { id?: string }, totalSec: number, id: string): SmartTracks {
  const text = String(item.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
  if (!text || tracks.texts.length >= MAX_TEXT_ITEMS) return tracks;
  const span = fitSpan(item.t0, item.t1, totalSec);
  if (!span) return tracks;
  const next: TextItem = { id: item.id ?? id, ...span, text, pos: item.pos ?? 'bottom', look: item.look ?? 'title' };
  return { ...tracks, texts: [...tracks.texts, next].sort(byStart) };
}

export function addEffect(tracks: SmartTracks, item: Omit<FxItem, 'id' | 'amount'> & { amount?: number; id?: string }, totalSec: number, id: string): SmartTracks {
  if (!FX_KINDS.includes(item.kind) || tracks.effects.length >= MAX_FX_ITEMS) return tracks;
  const span = fitSpan(item.t0, item.t1, totalSec);
  if (!span) return tracks;
  const next: FxItem = { id: item.id ?? id, ...span, kind: item.kind, amount: r3(clamp(fin(item.amount, 0.6), 0, 1)) };
  return { ...tracks, effects: [...tracks.effects, next].sort(byStart) };
}

export function removeItem(tracks: SmartTracks, track: TrackName, id: string): SmartTracks {
  return withItems(tracks, track, itemsOf(tracks, track).filter((i) => i.id !== id));
}

/** Move an item so it starts at `t0` (its length kept, never past the end). */
export function moveItem(tracks: SmartTracks, track: TrackName, id: string, t0: number, totalSec: number): SmartTracks {
  const items = itemsOf(tracks, track).map((i) => {
    if (i.id !== id) return i;
    const len = i.t1 - i.t0;
    const a = clamp(fin(t0), 0, Math.max(0, totalSec - len));
    return { ...i, t0: r3(a), t1: r3(a + len) };
  });
  return withItems(tracks, track, items.sort(byStart));
}

/** Drag one edge of an item. The other edge stays; the item never gets shorter than MIN_ITEM_SEC. */
export function trimItem(tracks: SmartTracks, track: TrackName, id: string, edge: 'start' | 'end', value: number, totalSec: number): SmartTracks {
  const items = itemsOf(tracks, track).map((i) => {
    if (i.id !== id) return i;
    if (edge === 'start') return { ...i, t0: r3(clamp(fin(value), 0, i.t1 - MIN_ITEM_SEC)) };
    return { ...i, t1: r3(clamp(fin(value), i.t0 + MIN_ITEM_SEC, Math.max(i.t0 + MIN_ITEM_SEC, totalSec))) };
  });
  return withItems(tracks, track, items.sort(byStart));
}

/** Split an item at master time `at` into two. Refused (unchanged) when either half would be under MIN_ITEM_SEC. */
export function splitItem(tracks: SmartTracks, track: TrackName, id: string, at: number, newId: string): SmartTracks {
  const items = itemsOf(tracks, track);
  const i = items.find((x) => x.id === id);
  if (!i || at - i.t0 < MIN_ITEM_SEC || i.t1 - at < MIN_ITEM_SEC) return tracks;
  const left = { ...i, t1: r3(at) };
  const right = { ...i, id: newId, t0: r3(at) };
  return withItems(tracks, track, [...items.filter((x) => x.id !== id), left, right].sort(byStart));
}

/**
 * RIPPLE: the video track lost (or gained) `deltaSec` at master time `atSec` — a clip removed, trimmed or a silence cut.
 * Items after it move by the same amount; an item that straddles the change is shortened (or lengthened) at its end;
 * an item entirely inside a removed stretch is dropped.
 */
export function rippleTracks(tracks: SmartTracks, atSec: number, deltaSec: number, totalSec: number): SmartTracks {
  const shift = <T extends { t0: number; t1: number }>(items: readonly T[]): T[] => {
    const out: T[] = [];
    for (const i of items) {
      if (deltaSec >= 0) {
        if (i.t0 >= atSec) out.push({ ...i, t0: r3(i.t0 + deltaSec), t1: r3(i.t1 + deltaSec) });
        else if (i.t1 > atSec) out.push({ ...i, t1: r3(i.t1 + deltaSec) });
        else out.push(i);
        continue;
      }
      const cutEnd = atSec - deltaSec; // the removed stretch is [atSec, cutEnd)
      const map = (t: number) => (t <= atSec ? t : t < cutEnd ? atSec : t + deltaSec);
      const t0 = map(i.t0), t1 = map(i.t1);
      if (t1 - t0 >= MIN_ITEM_SEC) out.push({ ...i, t0: r3(t0), t1: r3(t1) });
    }
    return out
      .map((i) => ({ ...i, t0: r3(Math.min(i.t0, totalSec)), t1: r3(Math.min(i.t1, totalSec)) }))
      .filter((i) => i.t1 - i.t0 >= MIN_ITEM_SEC)
      .sort(byStart);
  };
  return { texts: shift(tracks.texts), effects: shift(tracks.effects) };
}

/** Remove a clip from the sequence and ripple the other tracks with it. */
export function rippleDeleteClip<C extends SeqClip>(clips: readonly C[], tracks: SmartTracks, id: string): { clips: C[]; tracks: SmartTracks } {
  const placed = seqLayout(clips).find((p) => p.id === id);
  if (!placed) return { clips: [...clips], tracks };
  const next = clips.filter((c) => c.id !== id);
  return { clips: next, tracks: rippleTracks(tracks, placed.t0, -(placed.t1 - placed.t0), seqTotal(next)) };
}

// ── SNAPPING ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type SnapKind = 'playhead' | 'clip' | 'item' | 'beat' | 'start' | 'end';
export interface SnapTarget { t: number; kind: SnapKind }

/**
 * Everything an edge may snap to: 0 and the end, the playhead, every clip boundary, every other item's edges (the item
 * being dragged is left out) and the beat ticks of the music when a beat was found.
 */
export function snapTargets(o: {
  clips: readonly SeqClip[];
  tracks: SmartTracks;
  playheadSec?: number;
  beats?: readonly number[];
  excludeId?: string;
}): SnapTarget[] {
  const total = seqTotal(o.clips);
  const out: SnapTarget[] = [{ t: 0, kind: 'start' }, { t: total, kind: 'end' }];
  if (typeof o.playheadSec === 'number' && Number.isFinite(o.playheadSec)) out.push({ t: r3(o.playheadSec), kind: 'playhead' });
  for (const p of seqLayout(o.clips)) out.push({ t: p.t1, kind: 'clip' });
  for (const i of [...o.tracks.texts, ...o.tracks.effects]) {
    if (i.id === o.excludeId) continue;
    out.push({ t: i.t0, kind: 'item' }, { t: i.t1, kind: 'item' });
  }
  for (const b of o.beats ?? []) if (b >= 0 && b <= total) out.push({ t: r3(b), kind: 'beat' });
  return out;
}

/** Order of preference when two targets are equally close: the playhead first, beats last. */
const SNAP_RANK: Record<SnapKind, number> = { playhead: 0, start: 1, end: 1, clip: 2, item: 3, beat: 4 };

/**
 * Snap one time: the nearest target within SNAP_PX screen pixels (at `pxPerSec` zoom), or the time unchanged.
 * `free` (Alt held / long press) turns snapping off.
 */
export function snapTime(t: number, targets: readonly SnapTarget[], pxPerSec: number, opts: { free?: boolean; px?: number } = {}): { t: number; snapped: SnapTarget | null } {
  if (opts.free || !(pxPerSec > 0)) return { t, snapped: null };
  const limit = (opts.px ?? SNAP_PX) / pxPerSec;
  let best: SnapTarget | null = null;
  let bestD = Infinity;
  for (const g of targets) {
    const d = Math.abs(g.t - t);
    if (d > limit) continue;
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && best && SNAP_RANK[g.kind] < SNAP_RANK[best.kind])) {
      best = g;
      bestD = d;
    }
  }
  return best ? { t: best.t, snapped: best } : { t, snapped: null };
}

/** Snap a whole span being dragged: whichever of its two edges is closer to a target wins; the length is kept. */
export function snapSpan(t0: number, len: number, targets: readonly SnapTarget[], pxPerSec: number, opts: { free?: boolean } = {}): { t0: number; snapped: SnapTarget | null } {
  const a = snapTime(t0, targets, pxPerSec, opts);
  const b = snapTime(t0 + len, targets, pxPerSec, opts);
  const da = a.snapped ? Math.abs(a.t - t0) : Infinity;
  const db = b.snapped ? Math.abs(b.t - (t0 + len)) : Infinity;
  if (da === Infinity && db === Infinity) return { t0, snapped: null };
  return da <= db ? { t0: a.t, snapped: a.snapped } : { t0: r3(b.t - len), snapped: b.snapped };
}

/** The beat ticks the music row draws: every beat from the song's start offset over the edit's length. */
export function beatTicks(grid: { periodSec: number; phaseSec: number } | null, musicStartSec: number, editSec: number, maxTicks = 2000): number[] {
  if (!grid || !(grid.periodSec > 0.2)) return [];
  const out: number[] = [];
  // first beat at or after the music start, in song time
  const k0 = Math.ceil((musicStartSec - grid.phaseSec) / grid.periodSec - 1e-9);
  for (let k = k0; out.length < maxTicks; k += 1) {
    const songT = grid.phaseSec + k * grid.periodSec;
    const masterT = songT - musicStartSec;
    if (masterT > editSec + 1e-9) break;
    if (masterT >= -1e-9) out.push(r3(Math.max(0, masterT)));
  }
  return out;
}

/** Validates tracks that came over the wire (the render route); bad items are dropped, never thrown on. */
export function coerceTracks(raw: unknown, totalSec: number): SmartTracks {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { texts?: unknown; effects?: unknown };
  let t = emptyTracks();
  const texts = Array.isArray(o.texts) ? o.texts.slice(0, MAX_TEXT_ITEMS) : [];
  texts.forEach((x, i) => {
    const v = (x ?? {}) as Partial<TextItem>;
    const pos: TextPos = v.pos === 'top' || v.pos === 'middle' ? v.pos : 'bottom';
    const look: TextLook = v.look === 'subtitle' || v.look === 'label' ? v.look : 'title';
    t = addText(t, { t0: fin(v.t0), t1: fin(v.t1), text: String(v.text ?? ''), pos, look }, totalSec, `t${i}`);
  });
  const fx = Array.isArray(o.effects) ? o.effects.slice(0, MAX_FX_ITEMS) : [];
  fx.forEach((x, i) => {
    const v = (x ?? {}) as Partial<FxItem>;
    if (!v.kind || !FX_KINDS.includes(v.kind)) return;
    t = addEffect(t, { t0: fin(v.t0), t1: fin(v.t1), kind: v.kind, amount: fin(v.amount, 0.6) }, totalSec, `f${i}`);
  });
  return t;
}
