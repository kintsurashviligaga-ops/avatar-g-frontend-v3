/**
 * components/studio/montage/smart/smartEdit.ts — the Smart Editor's half of the montage project (Phase 8.7 PR B), as
 * pure data. No React, no fetch: what the AI panel does to the edit (templates, silence cuts, cut-to-beat, glitch on
 * every cut) and what the export sends as `smart` (text/effects tracks + captions laid on the CUT edit).
 *
 * Captions are kept in SOURCE seconds (`wordsBySource`) and laid on the edit only at export (lib/services/montage/smart
 * wordsOnMaster), so trimming, splitting or reordering after recognition needs no new call and costs nothing.
 */
import { MAX_SHOTS, type MontageTransition } from '@/lib/services/montage/montagePlan';
import type { BeatGrid } from '@/lib/services/montage/beatPlan';
import type { CaptionWord } from '@/lib/pipeline/compositing/word-synced-captions';
import { wordsOnMaster, type CaptionLang, type CaptionPos, type CaptionStyleId } from '@/lib/services/montage/smart/captions';
import { applyToClip, type SilencePlan } from '@/lib/services/montage/smart/silence';
import { glitchAtCuts } from '@/lib/services/montage/smart/effects';
import { TEMPLATES, type TemplateId } from '@/lib/services/montage/smart/templates';
import { emptyTracks, type SeqClip, type SmartTracks } from '@/lib/services/montage/smart/timeline';
import type { BeatLaidClip } from '@/lib/services/montage/smart/beat';
import { layout, totalSec, type Clip, type Edit, type MediaSource } from '../project';

export interface SmartCaptions {
  lang: CaptionLang;
  style: CaptionStyleId;
  pos?: CaptionPos;
  /** sourceId → words in that source's own seconds. */
  wordsBySource: Record<string, CaptionWord[]>;
}

export interface SmartState {
  tracks: SmartTracks;
  captions: SmartCaptions | null;
  template: TemplateId | null;
  /** The music's beat grid once the beat button ran (draws ticks, snaps to beats). */
  grid: BeatGrid | null;
}

export const emptySmart = (): SmartState => ({ tracks: emptyTracks(), captions: null, template: null, grid: null });

export const seqClips = (edit: Edit): SeqClip[] => edit.clips.map((c) => ({ id: c.id, startSec: c.startSec, endSec: c.endSec }));

/** Cut times on the edit (every boundary between two clips). */
export const cutTimes = (edit: Edit): number[] => layout(edit.clips).slice(1).map((p) => p.t0);

export interface CaptionSourceReq { sourceId: string; url?: string; path?: string; startSec: number; endSec: number }

/**
 * What the captions route is asked to read: one window per VIDEO source — the union of the clips cut from it, so a clip
 * used twice is recognised once. Photos, muted clips and sources still uploading are left out.
 */
export function captionSources(edit: Edit, sources: Record<string, MediaSource>): CaptionSourceReq[] {
  const win = new Map<string, { a: number; b: number }>();
  for (const c of edit.clips) {
    const s = sources[c.sourceId];
    if (!s || s.kind !== 'video' || s.status !== 'ready' || !s.ref || c.muted) continue;
    const cur = win.get(s.id);
    win.set(s.id, cur ? { a: Math.min(cur.a, c.startSec), b: Math.max(cur.b, c.endSec) } : { a: c.startSec, b: c.endSec });
  }
  return [...win.entries()].map(([id, w]) => {
    const ref = sources[id]!.ref!;
    return { sourceId: id, ...(/^https?:/i.test(ref) ? { url: ref } : { path: ref }), startSec: w.a, endSec: w.b };
  });
}

/** Seconds of speech the captions would read (the quote's basis). */
export const captionSeconds = (reqs: readonly CaptionSourceReq[]): number => reqs.reduce((s, r) => s + Math.max(0, r.endSec - r.startSec), 0);

/** The captions as they land on the CURRENT edit (cuts, order, mutes), for the preview and the export. */
export function captionsOnEdit(edit: Edit, caps: SmartCaptions | null): CaptionWord[] {
  if (!caps || !edit.originalSound) return [];
  return wordsOnMaster(edit.clips, caps.wordsBySource);
}

/** The `smart` field of the render body, or null when there is nothing to lay (the render then runs as before). */
export function smartRenderField(state: SmartState, edit: Edit): Record<string, unknown> | null {
  const words = captionsOnEdit(edit, state.captions);
  const hasTracks = state.tracks.texts.length > 0 || state.tracks.effects.length > 0;
  if (!hasTracks && !words.length) return null;
  return {
    tracks: state.tracks,
    ...(words.length && state.captions ? { captions: { words, style: state.captions.style, ...(state.captions.pos ? { pos: state.captions.pos } : {}) } } : {}),
    ...(state.template ? { template: state.template } : {}),
  };
}

export type SmartApply<T> = { ok: true; value: T } | { ok: false; reason: 'too_many_pieces' | 'nothing' };

/**
 * Silence removal applied to ONE clip: the clip becomes its kept pieces (hard cuts between them, the caption stays on
 * the first). Montage renders up to MAX_SHOTS pieces, so a plan that would go past it is refused, not truncated.
 */
export function applySilence(edit: Edit, clipId: string, plan: SilencePlan, idOf: (i: number) => string): SmartApply<Edit> {
  const i = edit.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || plan.untouched) return { ok: false, reason: 'nothing' };
  const clip = edit.clips[i]!;
  const pieces = applyToClip(clip, plan, idOf).map((p, k): Clip => (k === 0 ? p : { ...p, transition: 'cut', caption: '' }));
  if (pieces.length === 1 && pieces[0]!.startSec === clip.startSec && pieces[0]!.endSec === clip.endSec) return { ok: false, reason: 'nothing' };
  if (edit.clips.length - 1 + pieces.length > MAX_SHOTS) return { ok: false, reason: 'too_many_pieces' };
  return { ok: true, value: { ...edit, clips: [...edit.clips.slice(0, i), ...pieces, ...edit.clips.slice(i + 1)] } };
}

/**
 * Cut-to-beat applied: each clip takes the window the planner laid on the beat. The editor has no speed control yet, so
 * a sped-up window is kept at normal speed and shortened to the same length on screen (the cut still lands on the beat).
 */
export function applyBeat(edit: Edit, laid: readonly BeatLaidClip[], musicStartSec: number): Edit {
  const byId = new Map(edit.clips.map((c) => [c.id, c]));
  const clips: Clip[] = [];
  for (const l of laid) {
    // A clip the planner reused (a long take laid twice) comes back under a new id: it copies its source's first clip.
    const base = byId.get(l.id) ?? edit.clips.find((c) => c.sourceId === l.sourceId);
    if (!base) continue;
    const speed = l.speed && l.speed > 0 ? l.speed : 1;
    const len = (l.endSec - l.startSec) / speed;
    clips.push({ ...base, id: l.id, startSec: l.startSec, endSec: Math.round((l.startSec + len) * 1000) / 1000, ...(byId.has(l.id) ? {} : { caption: '' }) });
  }
  return { ...edit, clips: clips.length ? clips.slice(0, MAX_SHOTS) : edit.clips, musicStartSec };
}

/** Glitch on every cut (the "Glitch" transition): an effect item centred on each boundary, replacing earlier ones. */
export function glitchEveryCut(state: SmartState, edit: Edit): SmartTracks {
  const kept = state.tracks.effects.filter((f) => !f.id.startsWith('gx'));
  return { ...state.tracks, effects: [...kept, ...glitchAtCuts(cutTimes(edit), totalSec(edit.clips))] };
}

/** A template: the format, the transition into every clip, and the caption look. It never touches the clips' content. */
export function applyTemplate(edit: Edit, state: SmartState, id: TemplateId): { edit: Edit; state: SmartState } {
  const tpl = TEMPLATES[id];
  const transition: MontageTransition = tpl.transition === 'glitch' ? 'cut' : tpl.transition;
  const nextEdit: Edit = { ...edit, aspect: tpl.aspect, clips: edit.clips.map((c, i) => ({ ...c, transition: i === 0 ? 'cut' : transition })) };
  let nextState: SmartState = { ...state, template: id, captions: state.captions ? { ...state.captions, style: tpl.captionStyle, pos: tpl.captionPos } : null };
  if (tpl.transition === 'glitch') nextState = { ...nextState, tracks: glitchEveryCut(nextState, nextEdit) };
  return { edit: nextEdit, state: nextState };
}
