/**
 * lib/agent/run/runAdapters.ts — the step tools a run drives, over their own executors (lib/agent/media): the montage,
 * the audio extraction and the edit, called exactly as their own routes call them. The executors' effects are passed in, so the
 * live wiring (./runLive) and the tests (real executors over in-memory effects) build the same adapters.
 */
import { claimable, type LeaseRow } from '@/lib/orchestrator/jobLease';
import {
  KICK_AFTER_MS, MONTAGE_KIND, MONTAGE_PRICE_CREDITS, cancelMontageJob, enqueueMontageJob, quoteMontage, viewOf, type MontageExecDeps,
} from '@/lib/agent/media/montageExec';
import {
  AUDIO_KICK_AFTER_MS, AUDIO_KIND, AUDIO_PRICE_CREDITS, audioViewOf, cancelAudioJob, enqueueAudioJob, quoteAudioExtract,
  type AudioExecDeps,
} from '@/lib/agent/media/audioExtract';
import {
  EDIT_KICK_AFTER_MS, EDIT_KIND, EDIT_PRICE_CREDITS, cancelEditJob, editViewOf, enqueueEditJob, quoteEdit, type EditExecDeps,
} from '@/lib/agent/media/editExec';
import type { ChildView } from './runEngine';
import type { StepAdapter } from './runExec';

const cancelled = (r: { ok: true } | { ok: false; error: string }): 'ok' | 'not_running' | 'not_found' =>
  r.ok ? 'ok' : r.error === 'not_running' ? 'not_running' : 'not_found';

const kickAfter = (ms: number) => (row: LeaseRow, now: number) => claimable(row, now) && (row.status === 'processing' || now - row.createdAt >= ms);

/** A montage step: quoteMontage → enqueueMontageJob, its worker, its cancel. */
export function montageAdapter(deps: () => MontageExecDeps): StepAdapter {
  return {
    kind: MONTAGE_KIND,
    listPrice: MONTAGE_PRICE_CREDITS,
    async quote(userId, step) {
      if (step.tool !== 'montage') return { ok: false, error: 'bad_spec' };
      const q = await quoteMontage(deps(), {
        userId, files: step.files, prompt: step.prompt, aspect: step.aspect, targetSec: step.targetSec, musicFromSec: step.musicFromSec,
      });
      if (!q.ok) return { ok: false, error: q.error };
      return { ok: true, quote: { taskId: q.quote.jobId, credits: q.quote.credits, request: q.request, token: q.token, expiresAt: q.quote.expiresAt } };
    },
    async enqueue(userId, quote, ctx) {
      const r = await enqueueMontageJob(deps(), { userId, request: quote.request, token: quote.token, prompt: ctx.prompt, parent: ctx.runId });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    view(row): ChildView {
      const v = viewOf(row);
      if (v.status === 'completed') return { state: 'completed', output: { url: v.videoUrl, media: 'video', durationSec: v.durationSec } };
      if (v.status === 'failed') return v.error === 'cancelled' ? { state: 'cancelled' } : { state: 'failed', error: v.error };
      return { state: 'live', running: v.status === 'running', stage: v.stage, pct: v.pct };
    },
    needsWorker: kickAfter(KICK_AFTER_MS),
    async cancel(userId, taskId) {
      return cancelled(await cancelMontageJob(deps(), { userId, jobId: taskId }));
    },
  };
}

/** An audio-extraction step: quoteAudioExtract → enqueueAudioJob, its worker, its cancel. */
export function audioAdapter(deps: () => AudioExecDeps): StepAdapter {
  return {
    kind: AUDIO_KIND,
    listPrice: AUDIO_PRICE_CREDITS,
    async quote(userId, step) {
      if (step.tool !== 'audio_extract') return { ok: false, error: 'bad_spec' };
      const src = step.source;
      const q = await quoteAudioExtract(deps(), {
        userId,
        ...('url' in src ? { url: src.url } : { file: src.file }),
        ...(step.name ? { name: step.name } : {}),
      });
      if (!q.ok) return { ok: false, error: q.error };
      return { ok: true, quote: { taskId: q.quote.jobId, credits: q.quote.credits, request: q.request, token: q.token, expiresAt: q.quote.expiresAt } };
    },
    async enqueue(userId, quote, ctx) {
      const r = await enqueueAudioJob(deps(), { userId, request: quote.request, token: quote.token, parent: ctx.runId });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    view(row): ChildView {
      const v = audioViewOf(row);
      if (v.status === 'completed') return { state: 'completed', output: { url: v.audioUrl, media: 'audio', durationSec: v.durationSec, name: v.name } };
      if (v.status === 'failed') return v.error === 'cancelled' ? { state: 'cancelled' } : { state: 'failed', error: v.error };
      return { state: 'live', running: v.status === 'running', stage: v.stage, pct: v.pct };
    },
    needsWorker: kickAfter(AUDIO_KICK_AFTER_MS),
    async cancel(userId, taskId) {
      return cancelled(await cancelAudioJob(deps(), { userId, jobId: taskId }));
    },
  };
}

/** An edit step: quoteEdit → enqueueEditJob, its worker, its cancel. A still comes back as an image. */
export function editAdapter(deps: () => EditExecDeps): StepAdapter {
  return {
    kind: EDIT_KIND,
    listPrice: EDIT_PRICE_CREDITS,
    async quote(userId, step) {
      if (step.tool !== 'edit' || typeof step.file !== 'string') return { ok: false, error: 'bad_spec' };
      const q = await quoteEdit(deps(), { userId, file: step.file, edits: step.edits, ...(step.name ? { name: step.name } : {}) });
      if (!q.ok) return { ok: false, error: q.error };
      return { ok: true, quote: { taskId: q.quote.jobId, credits: q.quote.credits, request: q.request, token: q.token, expiresAt: q.quote.expiresAt } };
    },
    async enqueue(userId, quote, ctx) {
      const r = await enqueueEditJob(deps(), { userId, request: quote.request, token: quote.token, parent: ctx.runId });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    view(row): ChildView {
      const v = editViewOf(row);
      if (v.status === 'completed') {
        return { state: 'completed', output: { url: v.url, media: v.output === 'jpg' ? 'image' : 'video', name: v.name, ...(v.output === 'mp4' ? { durationSec: v.durationSec } : {}) } };
      }
      if (v.status === 'failed') return v.error === 'cancelled' ? { state: 'cancelled' } : { state: 'failed', error: v.error };
      return { state: 'live', running: v.status === 'running', stage: v.stage, pct: v.pct };
    },
    needsWorker: kickAfter(EDIT_KICK_AFTER_MS),
    async cancel(userId, taskId) {
      return cancelled(await cancelEditJob(deps(), { userId, jobId: taskId }));
    },
  };
}
