/**
 * Pipeline display stages — pure mapping + reducer that turns the raw
 * EventBroker topic stream into the human-facing progress rows the Swarm
 * Status Panel renders. No React, no IO → unit-testable.
 *
 * The eight transport topics collapse into six display stages that mirror
 * the brief's service groupings.
 */

import type { PipelineEvent, PipelineTopic } from './events';

export type StageId = 'sanitize' | 'orchestrate' | 'script' | 'audio' | 'visual' | 'assemble';
export type StageStatus = 'idle' | 'active' | 'done' | 'failed';

export interface StageView {
  id: StageId;
  status: StageStatus;
  /** 0–1 progress for stages that report it (e.g. visual: segments done / 5). */
  progress?: number;
  detail?: string;
}

export interface PipelineProgress {
  pipelineId: string | null;
  stages: Record<StageId, StageView>;
  failed: boolean;
  completed: boolean;
}

export const STAGE_ORDER: StageId[] = ['sanitize', 'orchestrate', 'script', 'audio', 'visual', 'assemble'];

export const STAGE_LABELS: Record<StageId, [string, string, string]> = {
  sanitize:    ['უსაფრთხოება & წმენდა', 'Sanitize & secure', 'Очистка и защита'],
  orchestrate: ['ორკესტრაცია (CEO)',    'Orchestrate (CEO)', 'Оркестрация (CEO)'],
  script:      ['სცენარი & ვექტორები',  'Script & vectors',  'Сценарий и векторы'],
  audio:       ['ხმა (ElevenLabs+Udio)', 'Audio (ElevenLabs+Udio)', 'Звук (ElevenLabs+Udio)'],
  visual:      ['ვიდეო სვარმი (5 სცენა)', 'Visual swarm (5 scenes)', 'Видео-сворм (5 сцен)'],
  assemble:    ['აწყობა (CapCut 60fps)', 'Assemble (CapCut 60fps)', 'Сборка (CapCut 60fps)'],
};

/** Which display stage a completed topic marks as DONE. */
const TOPIC_DONE_STAGE: Partial<Record<PipelineTopic, StageId>> = {
  'data.sanitized':       'sanitize',
  'asset.layout.ready':   'orchestrate',
  'script.compiled':      'script',
  'audio.segments.ready': 'audio',
  'video.segments.ready': 'visual',
};

/** Which display stage a topic marks as ACTIVE (work starting). */
const TOPIC_ACTIVE_STAGE: Partial<Record<PipelineTopic, StageId>> = {
  'media.pipeline.initiated': 'sanitize',
  'data.sanitized':           'orchestrate',
  'asset.layout.ready':       'script',
  'script.compiled':          'audio',
  'audio.segments.ready':     'visual',
  'video.segments.ready':     'assemble',
};

export function initialProgress(pipelineId: string | null = null): PipelineProgress {
  const stages = {} as Record<StageId, StageView>;
  for (const id of STAGE_ORDER) stages[id] = { id, status: 'idle' };
  return { pipelineId, stages, failed: false, completed: false };
}

/**
 * Pure reducer: fold one event into the progress state. Marks the matching
 * stage done + the next stage active; handles terminal completed/failed.
 * `payload.scenesDone` (0–5) on a video.segments.ready event drives the
 * visual stage's fractional progress.
 */
export function applyEvent(state: PipelineProgress, event: PipelineEvent): PipelineProgress {
  const next: PipelineProgress = {
    pipelineId: event.pipelineId,
    stages: { ...state.stages },
    failed: state.failed,
    completed: state.completed,
  };

  if (event.topic === 'pipeline.completed') {
    for (const id of STAGE_ORDER) next.stages[id] = { ...next.stages[id]!, status: 'done', progress: 1 };
    next.completed = true;
    return next;
  }
  if (event.topic === 'pipeline.failed') {
    const active = STAGE_ORDER.find(id => next.stages[id]!.status === 'active');
    if (active) next.stages[active] = { ...next.stages[active]!, status: 'failed' };
    next.failed = true;
    return next;
  }

  const doneStage = TOPIC_DONE_STAGE[event.topic];
  if (doneStage) next.stages[doneStage] = { ...next.stages[doneStage]!, status: 'done', progress: 1 };

  const activeStage = TOPIC_ACTIVE_STAGE[event.topic];
  if (activeStage && next.stages[activeStage]!.status !== 'done') {
    const scenes = typeof event.payload['scenesDone'] === 'number' ? (event.payload['scenesDone'] as number) : undefined;
    next.stages[activeStage] = {
      ...next.stages[activeStage]!,
      status: 'active',
      progress: scenes != null ? Math.max(0, Math.min(1, scenes / 5)) : next.stages[activeStage]!.progress,
    };
  }
  return next;
}

export function stageLabel(id: StageId, locale: 'ka' | 'en' | 'ru'): string {
  const triple = STAGE_LABELS[id];
  return locale === 'ka' ? triple[0] : locale === 'ru' ? triple[2] : triple[1];
}
