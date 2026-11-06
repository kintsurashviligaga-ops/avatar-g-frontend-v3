/**
 * lib/agent/media/genSteps.ts — an image, a track, a video or an avatar clip made in the chat, as the same timeline card
 * Agent G's montage, MP3 and edit work show (./taskSteps, components/studio/AgentTaskCard). GG 2026-11-06 11:22Z chose
 * „კი, ყველგან": the chat had two kinds of wait, a step card for Agent G's jobs and a percent tile for everything else.
 *
 * Only steps the browser really sees: the request it sent, the frames a storyboard draws (counted as they land), the
 * render (the poll's own percent and stage line when the pipeline reports one, nothing invented by the clock, §3.3) and
 * the result landing in the chat. Pure, no network, safe in the browser.
 */
import { countText, type StepState, type TaskCardModel, type TaskStatus, type TaskStep } from './taskSteps';

type Lang = 'ka' | 'en' | 'ru';
const pick = (locale: string): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export type GenKind = 'image' | 'music' | 'video' | 'lipsync';
export type GenPhase = 'working' | 'done' | 'failed' | 'stopped';

export interface GenTaskInput {
  kind: GenKind;
  phase: GenPhase;
  /** The pipeline's own percent (a film poll); absent where the route reports none. */
  pct?: number;
  /** The pipeline's own stage line (the bubble's status text while it renders). */
  stage?: string;
  /** A storyboard's frames: how many are drawn of how many. */
  frames?: { ready: number; total: number };
  clock: { from: number; to?: number } | null;
}

const T = {
  title: {
    image: { ka: 'სურათი', en: 'Image', ru: 'Изображение' },
    music: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
    video: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
    lipsync: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' },
  },
  render: {
    image: { ka: 'სურათის შექმნა', en: 'Create the image', ru: 'Создание изображения' },
    music: { ka: 'მუსიკის შექმნა', en: 'Compose the track', ru: 'Создание трека' },
    video: { ka: 'ვიდეოს შექმნა', en: 'Render the video', ru: 'Рендер видео' },
    lipsync: { ka: 'ავატარის ვიდეოს შექმნა', en: 'Make the avatar video', ru: 'Видео аватара' },
  },
  request: { ka: 'მოთხოვნის მიღება', en: 'Take the request', ru: 'Приём запроса' },
  frames: { ka: 'სცენების კადრები', en: 'Draw the scene frames', ru: 'Кадры сцен' },
  deliver: { ka: 'შედეგის ჩვენება ჩატში', en: 'Show it in the chat', ru: 'Показ в чате' },
  working: { ka: 'მუშაობს', en: 'Working', ru: 'В работе' },
  done: { ka: 'მზადაა', en: 'Done', ru: 'Готово' },
  failed: { ka: 'ვერ შესრულდა', en: 'Did not finish', ru: 'Не удалось' },
  stopped: { ka: 'გაჩერდა', en: 'Stopped', ru: 'Остановлено' },
} as const;

const clampPct = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(99, Math.round(n))) : null);

export function genTask(input: GenTaskInput, locale: string): TaskCardModel {
  const lang = pick(locale);
  const { kind, phase } = input;
  const keys = ['request', ...(input.frames && input.frames.total > 0 ? ['frames'] : []), 'render', 'deliver'];
  // Where the work is: the frames while any is still drawing, else the render; a finished job is past every step.
  const framesOpen = !!input.frames && input.frames.total > 0 && input.frames.ready < input.frames.total;
  const at = phase === 'done' ? keys.length : keys.indexOf(framesOpen ? 'frames' : 'render');
  const end: StepState | null = phase === 'failed' ? 'failed' : phase === 'stopped' ? 'stopped' : null;
  const pct = phase === 'working' && (kind === 'video' || kind === 'lipsync') ? clampPct(input.pct) : null;
  const stage = input.stage?.trim().replace(/^⚠️\s*/, '');

  const steps: TaskStep[] = keys.map((key, i) => {
    const state: StepState = i < at ? 'done' : i > at ? (end ? 'skipped' : 'pending') : (end ?? 'active');
    const label = key === 'request' ? T.request[lang] : key === 'frames' ? T.frames[lang] : key === 'render' ? T.render[kind][lang] : T.deliver[lang];
    const step: TaskStep = { key, label, state };
    if (key === 'frames' && input.frames) step.note = `${input.frames.ready}/${input.frames.total}`;
    if (key === 'render' && state === 'active' && pct !== null && pct > 0) step.note = `${pct}%`;
    if (key === 'render' && (state === 'active' || state === 'failed') && stage) step.detail = stage;
    return step;
  });

  const status: TaskStatus = phase === 'working' ? 'working' : phase;
  const done = steps.filter((s) => s.state === 'done').length;
  return {
    title: T.title[kind][lang],
    steps,
    done,
    total: steps.length,
    countText: countText(done, steps.length, locale),
    status,
    statusText: T[phase === 'working' ? 'working' : phase][lang],
    pct,
    clock: input.clock,
  };
}
