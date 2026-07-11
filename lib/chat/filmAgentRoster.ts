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

export type FilmAgentStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'error' | 'skipped';

export type FilmAgentId =
  | 'prompt'
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
  /** Optional human-readable status detail (e.g. WHY the lip-sync stage skipped) — shown
   *  on the card in place of the generic status label so a skip is never silent. */
  note?: string;
}

/** Console layout order: the active production chain first, dormant specialists last. */
export const FILM_AGENT_ORDER: FilmAgentId[] = [
  'prompt',
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

const PCT: Record<FilmAgentStatus, number> = { idle: 0, queued: 0, processing: 50, completed: 100, error: 100, skipped: 100 };

/**
 * Fold a live `FilmStudioProgress` snapshot into the 9-agent roster. Accepts
 * `null`/`undefined` (before the first progress tick) and returns a sensible
 * "just dispatched" roster so the console renders immediately on click.
 */
export function deriveFilmRoster(
  p: FilmStudioProgress | null | undefined,
  /** Drives the Lip-Sync card when a post-assemble lip-sync pass runs (music videos).
   *  Omitted/undefined → the agent stays dormant ('idle'/Standby) as before. */
  lipsyncStatus?: FilmAgentStatus,
): FilmAgentVM[] {
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

  // prompt — the Master Prompt Agent runs FIRST (extracts the locked character + writes
  // every scene's image prompt), before the storyboard/dispatch. By the time anything
  // else is in flight its Master Film Brief is already produced (or it fell open), so it
  // shows queued before kick-off and completed as soon as the pipeline starts moving.
  const promptAgent = a(
    'prompt',
    phase === 'idle' ? 'queued' : 'completed',
  );

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

  // GRAPHICS (overlay agent) — the cinematic colour grade + 3D LUT, plus any
  // branded lower-third, are applied during the stitch/assemble stage, so the
  // Graphics agent genuinely lights up then and completes with the master. (Not
  // faked: this is the real grade+overlay pass in assembleWithFfmpeg.)
  const overlay = a(
    'overlay',
    failedFilm ? 'error'
      : done ? 'completed'
      : phase === 'stitching' ? 'processing'
      : phase === 'idle' ? 'idle'   // nothing started yet
      : 'queued',                    // rendering → graphics queued behind the clips
    { pct: done ? 100 : phase === 'stitching' ? 80 : 0 },
  );
  // Lip-sync lights up for the music-video post-assemble pass (syncing the singer's
  // mouth to the vocal); otherwise dormant. Remix stays dormant during a render.
  const lipsync = a('lipsync', lipsyncStatus ?? 'idle');
  const remix = a('remix', 'idle');

  const byId: Record<FilmAgentId, FilmAgentVM> = {
    prompt: promptAgent,
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
  const active = roster.filter((r) => r.status !== 'idle' && r.status !== 'skipped');
  if (!active.length) return 0;
  const sum = active.reduce((s, r) => s + r.pct, 0);
  return Math.round(sum / active.length);
}

// ─── Live activity log (Master-Prompt §P4 — the Director's Console log terminal) ──

export interface FilmLogLine {
  /** Stable identity so the UI accumulates lines without duplicating them. */
  key: string;
  icon: string;
  text: string;
  /** Elapsed seconds when this line FIRST appeared (stamped by the caller on merge). */
  ts?: number;
}

/**
 * Fold a live snapshot into the chronological activity log shown in the console's
 * terminal. Monotonic by construction — as the pipeline advances the returned set
 * only grows — so the caller can simply store the latest array (newest lines append
 * at the bottom). Localized (en/ru/ka).
 */
export function deriveFilmLog(p: FilmStudioProgress | null | undefined, locale: string): FilmLogLine[] {
  const loc = locale === 'ru' || locale === 'ka' ? locale : 'en';
  const T = (en: string, ru: string, ka: string) => (loc === 'ru' ? ru : loc === 'ka' ? ka : en);

  const phase = p?.phase ?? 'idle';
  const m = p?.matrix ?? null;
  const clips = m?.clips ?? [];
  const total = m?.sceneCount || clips.length || 6;
  const rendered = phase === 'rendering' || phase === 'stitching' || phase === 'assembled';
  const lines: FilmLogLine[] = [];

  if (phase === 'failed') {
    // Surface the dispatch + whatever landed, then the failure, so context isn't lost.
  }
  if (phase !== 'idle') {
    lines.push({ key: 'prompt', icon: '✨', text: T('Prompt Agent — master brief & character lock ready', 'Промпт-агент — мастер-бриф и фиксация персонажа готовы', 'Prompt აგენტი — მასტერ-ბრიფი და პერსონაჟის ჩაკეტვა მზადაა') });
    lines.push({ key: 'dispatch', icon: '🎬', text: T('Director — breaking down the script', 'Режиссёр — разбор сценария', 'რეჟისორი — სცენარის დაშლა') });
  }
  if (m) {
    lines.push({ key: 'plan', icon: '📝', text: T(`${total} scenes planned`, `Запланировано сцен: ${total}`, `დაიგეგმა ${total} სცენა`) });
  }
  if (m?.storyboard === 'succeeded' || rendered) {
    lines.push({ key: 'storyboard', icon: '🎞️', text: T('Storyboard — shot list locked', 'Раскадровка — кадры готовы', 'სცენარი — კადრები ჩაიკეტა') });
  }
  for (const c of clips.filter((x) => x.status === 'succeeded').sort((a, b) => a.ordinal - b.ordinal)) {
    lines.push({
      key: `clip-${c.ordinal}`,
      icon: '🎥',
      text: T(`Cinematographer — scene ${c.ordinal} rendered`, `Оператор — сцена ${c.ordinal} готова`, `ოპერატორი — სცენა ${c.ordinal} დარენდერდა`),
    });
  }
  if (m?.voiceUrl || m?.audio === 'succeeded') {
    lines.push({ key: 'voice', icon: '🎙️', text: T('Narrator — voiceover ready', 'Диктор — озвучка готова', 'ნარაცია — გახმოვანება მზადაა') });
  }
  if (m?.sfxUrl || m?.audio === 'succeeded') {
    lines.push({ key: 'sfx', icon: '🔊', text: T('Sound — music & SFX bed ready', 'Звук — музыка и эффекты готовы', 'ხმა — მუსიკა და ეფექტები მზადაა') });
  }
  if (phase === 'stitching') {
    lines.push({ key: 'stitch', icon: '✂️', text: T('Editor — assembling the final cut', 'Монтаж — финальная склейка', 'მონტაჟი — საბოლოო მონტაჟი') });
  }
  if (phase === 'assembled' || p?.masterUrl) {
    lines.push({ key: 'master', icon: '✅', text: T('Final master ready', 'Мастер готов', 'მასტერი მზადაა') });
  }
  if (phase === 'failed') {
    lines.push({ key: 'failed', icon: '⚠️', text: T('Render failed — see message', 'Ошибка рендера', 'რენდერი ჩაიშალა') });
  }
  return lines;
}
