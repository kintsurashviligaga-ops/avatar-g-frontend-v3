/**
 * lib/tasks/agentProgress.ts — one Agent G task as the live timeline event the chat card listens to (GG 2026-11-06
 * 06:30Z: „Collapsible Timeline/Stepper … WebSockets ან Server-Sent Events … JSON Payload").
 *
 *   { type: 'agent_progress', task_id, total_steps, current_step,
 *     step_details: { key, title, description, status: 'pending' | 'in_progress' | 'completed' | 'failed' },
 *     steps: [ …every step with its status ], status, stage, pct, task }
 *
 * The steps are what the SERVER really runs for the task's kind: a lease job's worker legs (its `stage` names the leg it
 * is on), a multi-step run's own steps (each a tool call of Agent G's plan, with its own status). An optional leg (the
 * footage over the speaker, the music) is listed only once the job has been on it, so the list never names work the
 * job does not do. `task` is the whole TaskView, so a card that already reads /api/tasks reads the stream the same way.
 *
 * Pure and isomorphic: the stream route (app/api/tasks/stream) builds it, the tests read it.
 */
import { isFinalStatus, type TaskStatus } from './statusModel';
import type { TaskView } from './taskView';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
type Lang = 'ka' | 'en' | 'ru';

export interface ProgressStep {
  key: string;
  title: string;
  description: string;
  status: StepStatus;
}

export interface AgentProgressEvent {
  type: 'agent_progress';
  task_id: string;
  kind: string;
  total_steps: number;
  /** 1-based: the step in progress, or the last one when the task ended. */
  current_step: number;
  step_details: ProgressStep;
  steps: ProgressStep[];
  status: TaskStatus;
  stage: string | null;
  pct: number | null;
  task: TaskView;
}

/** A worker leg: its key, the stages that mean the worker is on it, its title, and whether every job has it. */
interface Leg { key: string; stages: readonly string[]; title: Record<Lang, string>; optional?: boolean }

const PREPARE: Leg = { key: 'prepare', stages: ['queued', 'starting', 'retrying', 'resolve', 'bridge'], title: { ka: 'მომზადება', en: 'Getting ready', ru: 'Подготовка' } };
const SAVE: Leg = { key: 'save', stages: ['upload', 'completed'], title: { ka: 'შენახვა', en: 'Saving', ru: 'Сохранение' } };

const LEGS: Record<string, readonly Leg[]> = {
  'agent-montage': [
    PREPARE,
    { key: 'normalize', stages: ['normalize'], title: { ka: 'ვიდეოების ჭრა', en: 'Cutting the clips', ru: 'Нарезка клипов' } },
    { key: 'stitch', stages: ['stitch'], title: { ka: 'ნაწილების შეერთება', en: 'Joining the parts', ru: 'Склейка частей' } },
    { key: 'inserts', stages: ['inserts'], title: { ka: 'რეალური კადრები ზედა ეკრანზე', en: 'Real footage in the top half', ru: 'Кадры в верхней половине' }, optional: true },
    { key: 'music', stages: ['music'], title: { ka: 'ხმის და მუსიკის დადება', en: 'Laying the sound', ru: 'Звук и музыка' }, optional: true },
    { key: 'qc', stages: ['qc'], title: { ka: 'ხმის და კადრის სინქრონის შემოწმება', en: 'Checking picture and sound sync', ru: 'Проверка синхронизации' } },
    { key: 'save', stages: ['completed'], title: SAVE.title },
  ],
  'agent-audio-extract': [
    PREPARE,
    { key: 'extract', stages: ['extract'], title: { ka: 'ხმის ამოღება', en: 'Extracting the sound', ru: 'Извлечение звука' } },
    { key: 'qc', stages: ['qc'], title: { ka: 'ხარისხის შემოწმება', en: 'Checking the quality', ru: 'Проверка качества' } },
    SAVE,
  ],
  'agent-media-edit': [
    PREPARE,
    { key: 'render', stages: ['render'], title: { ka: 'რედაქტირება', en: 'Editing', ru: 'Редактирование' } },
    { key: 'qc', stages: ['qc'], title: { ka: 'ხარისხის შემოწმება', en: 'Checking the quality', ru: 'Проверка качества' } },
    SAVE,
  ],
};
const RENDER_LEGS: readonly Leg[] = [
  PREPARE,
  { key: 'render', stages: [], title: { ka: 'გენერაცია', en: 'Generating', ru: 'Генерация' } },
  { key: 'save', stages: ['completed'], title: SAVE.title },
];

const TOOL_TITLE: Record<string, Record<Lang, string>> = {
  montage: { ka: 'ვიდეოს მონტაჟი', en: 'Video montage', ru: 'Монтаж видео' },
  audio_extract: { ka: 'MP3-ის ამოღება', en: 'MP3 extraction', ru: 'Извлечение MP3' },
  edit: { ka: 'ვიდეოს რედაქტირება', en: 'Video edit', ru: 'Редактирование видео' },
};

const WAITING: Record<Lang, string> = { ka: 'გელოდება დასტურს', en: 'Waiting for your yes', ru: 'Ждёт вашего подтверждения' };
const QUEUED: Record<Lang, string> = { ka: 'რიგშია', en: 'Queued', ru: 'В очереди' };

export const pickLang = (x: unknown): Lang => (x === 'en' || x === 'ru' ? x : 'ka');

const pctText = (pct: number | null): string => (pct === null ? '' : `${Math.max(0, Math.min(100, Math.round(pct)))}%`);

function stepOfStatus(s: TaskStatus, reached: boolean): StepStatus {
  if (s === 'completed' || s === 'partially_completed') return 'completed';
  if (s === 'failed' || s === 'cancelled') return 'failed';
  return reached ? 'in_progress' : 'pending';
}

/** A multi-step run: each of its steps is one tool call of Agent G's plan. */
function runSteps(task: TaskView, lang: Lang): ProgressStep[] {
  return (task.steps ?? []).map((st) => {
    const live = st.status === 'running' || st.status === 'awaiting_approval';
    const status = stepOfStatus(st.status, live);
    const description = st.status === 'awaiting_approval' ? WAITING[lang]
      : st.status === 'queued' ? QUEUED[lang]
        : live ? [st.stage, pctText(st.pct)].filter(Boolean).join(' · ')
          : st.error ?? '';
    return { key: st.id, title: TOOL_TITLE[st.tool]?.[lang] ?? st.tool, description, status };
  });
}

/** A lease job or a studio render: the worker's legs, lit up to the one its stage names. */
function legSteps(task: TaskView, lang: Lang, seen: ReadonlySet<string>): ProgressStep[] {
  const all = LEGS[task.kind] ?? RENDER_LEGS;
  const at = (stage: string | null) => (stage ? all.findIndex((l) => l.stages.includes(stage)) : -1);
  const legs = all.filter((l) => !l.optional || [...seen].some((s) => l.stages.includes(s)) || l.stages.includes(task.stage ?? ''));
  const final = isFinalStatus(task.status);
  const done = task.status === 'completed' || task.status === 'partially_completed';
  // The leg in progress: the one the stage names; a render with an unknown stage is on its one middle leg once running.
  let cur = at(task.stage);
  let idx = cur >= 0 ? legs.indexOf(all[cur]!) : task.status === 'running' ? Math.min(1, legs.length - 1) : 0;
  if (idx < 0) idx = 0;
  if (done) idx = legs.length - 1;
  cur = idx;
  return legs.map((l, i) => {
    let status: StepStatus;
    if (done) status = 'completed';
    else if (i < cur) status = 'completed';
    else if (i === cur) status = final ? 'failed' : 'in_progress';
    else status = 'pending';
    const description = status === 'in_progress'
      ? task.status === 'queued' ? QUEUED[lang] : pctText(task.pct)
      : status === 'failed' ? task.error ?? '' : '';
    return { key: l.key, title: l.title[lang], description, status };
  });
}

/**
 * The event for one read of a task. `seen` is every stage the stream has read for it so far (an optional leg stays
 * listed after the job moved past it).
 */
export function agentProgress(task: TaskView, opts: { lang?: unknown; seen?: ReadonlySet<string> } = {}): AgentProgressEvent {
  const lang = pickLang(opts.lang);
  const steps = task.kind === 'agent-run' && task.steps?.length ? runSteps(task, lang) : legSteps(task, lang, opts.seen ?? new Set());
  let i = steps.findIndex((s) => s.status === 'in_progress' || s.status === 'failed');
  if (i < 0) i = steps.every((s) => s.status === 'completed') ? steps.length - 1 : Math.max(0, steps.findIndex((s) => s.status === 'pending'));
  const current = steps[i] ?? { key: 'task', title: '', description: '', status: 'pending' as const };
  return {
    type: 'agent_progress',
    task_id: task.id,
    kind: task.kind,
    total_steps: steps.length,
    current_step: steps.length ? i + 1 : 0,
    step_details: current,
    steps,
    status: task.status,
    stage: task.stage,
    pct: task.pct,
    task,
  };
}
