/**
 * Film agent roster — the 9-agent "Director's Console" view-model.
 * =================================================================
 * The production film pipeline already streams a real per-leg matrix through
 * `driveFilmStudio({ onProgress })` (storyboard, each clip, the audio leg with
 * its narration/SFX/music tracks, and the final stitch). This module folds that
 * raw matrix into the Master-Prompt's unified 9-agent roster so the chatbot can
 * render a live Director's Console driven by *real* progress — not a fake timer.
 *
 * Pure + deterministic so it can be unit-tested without React. The dormant
 * specialists (lip-sync, graphics overlay, remix-AI) stay `idle` during a plain
 * film render and only light up in their own flows — exactly the "unified roster
 * with waiting states" the Master Prompt describes.
 */
import type { FilmStudioProgress } from '@/lib/chat/filmStudioClient';

export type FilmAgentStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'error';

export type FilmAgentId =
  | 'director'
  | 'storyboard'
  | 'video'
  | 'voice'
  | 'sfx'
  | 'montage'
  | 'lipsync'
  | 'overlay'
  | 'remix';

export interface FilmAgentVM {
  id: FilmAgentId;
  status: FilmAgentStatus;
  /** Self-progress 0-100. */
  pct: number;
  /** Video agent only — scenes landed / total. */
  ready?: number;
  total?: number;
}

/** Console layout order: the active production chain first, dormant specialists last. */
export const FILM_AGENT_ORDER: FilmAgentId[] = [
  'director',
  'storyboard',
  'video',
  'voice',
  'sfx',
  'montage',
  'lipsync',
  'overlay',
  'remix',
];

const PCT: Record<FilmAgentStatus, number> = { idle: 0, queued: 0, processing: 50, completed: 100, error: 100 };

/**
 * Fold a live `FilmStudioProgress` snapshot into the 9-agent roster. Accepts
 * `null`/`undefined` (before the first progress tick) and returns a sensible
 * "just dispatched" roster so the console renders immediately on click.
 */
export function deriveFilmRoster(p: FilmStudioProgress | null | undefined): FilmAgentVM[] {
  const phase = p?.phase ?? 'idle';
  const m = p?.matrix ?? null;
  const clips = m?.clips ?? [];
  const total = m?.sceneCount || clips.length || 6;
  const ready = clips.filter((c) => c.status === 'succeeded').length;

  const failedFilm = phase === 'failed';
  const rendered = phase === 'rendering' || phase === 'stitching' || phase === 'assembled';
  const done = phase === 'assembled';

  const a = (id: FilmAgentId, status: FilmAgentStatus, extra?: Partial<FilmAgentVM>): FilmAgentVM => ({
    id,
    status,
    pct: extra?.pct ?? PCT[status],
    ...extra,
  });

  // director — orchestration plan; done once the scenes are dispatched.
  const director = a(
    'director',
    failedFilm ? 'error' : phase === 'idle' ? 'queued' : phase === 'dispatching' ? 'processing' : 'completed',
  );

  // storyboard — shot list + frames; must be complete before any clip renders.
  const sbLeg = m?.storyboard;
  const storyboard = a(
    'storyboard',
    sbLeg === 'failed'
      ? 'error'
      : sbLeg === 'succeeded' || rendered
        ? 'completed'
        : phase === 'idle'
          ? 'queued'
          : 'processing',
  );

  // video — per-scene clip renders (the long leg).
  const videoStatus: FilmAgentStatus = failedFilm && ready < total
    ? 'error'
    : phase === 'rendering'
      ? ready >= total ? 'completed' : 'processing'
      : rendered
        ? 'completed'
        : 'queued';
  const video = a('video', videoStatus, {
    ready,
    total,
    pct: videoStatus === 'completed' ? 100 : total ? Math.round((Math.min(ready, total) / total) * 100) : 0,
  });

  // voice + sfx ride the single `audio` leg (narration / sound-design tracks).
  const audioLeg = m?.audio;
  const audioDone = audioLeg === 'succeeded';
  const audioFail = audioLeg === 'failed';
  const voice = a(
    'voice',
    m?.voiceUrl ? 'completed' : audioDone ? 'completed' : audioFail ? 'error' : rendered ? 'processing' : 'queued',
  );
  const sfx = a(
    'sfx',
    m?.sfxUrl ? 'completed' : audioDone ? 'completed' : audioFail ? 'error' : rendered ? 'processing' : 'queued',
  );

  // montage — the final editor/stitch.
  const montageStatus: FilmAgentStatus = failedFilm
    ? 'error'
    : done
      ? 'completed'
      : phase === 'stitching'
        ? 'processing'
        : m?.stitch === 'succeeded'
          ? 'completed'
          : 'queued';
  const montage = a('montage', montageStatus, {
    pct: montageStatus === 'completed' ? 100 : montageStatus === 'processing' ? 90 : 0,
  });

  // dormant specialists — light up in talking-avatar / B2B-overlay / remix flows.
  const lipsync = a('lipsync', 'idle');
  const overlay = a('overlay', 'idle');
  const remix = a('remix', 'idle');

  const byId: Record<FilmAgentId, FilmAgentVM> = {
    director,
    storyboard,
    video,
    voice,
    sfx,
    montage,
    lipsync,
    overlay,
    remix,
  };
  return FILM_AGENT_ORDER.map((id) => byId[id]);
}

/** Overall % across the *active* chain — dormant idle specialists don't drag it down. */
export function overallFilmPct(roster: FilmAgentVM[]): number {
  const active = roster.filter((r) => r.status !== 'idle');
  if (!active.length) return 0;
  const sum = active.reduce((s, r) => s + r.pct, 0);
  return Math.round(sum / active.length);
}
