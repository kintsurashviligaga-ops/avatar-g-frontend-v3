/**
 * Runs the culling jobs: a small pool of same-origin workers (./cull.worker.ts) when the browser can decode and
 * draw inside one, the same pipeline on the main thread when it cannot. Either way nothing leaves the device.
 *
 * One job per worker at a time: a decoded 24-megapixel frame is ~100 MB, so the pool's size IS the memory ceiling.
 * Renders (an export the user is waiting on) jump the queue ahead of background analysis.
 */
import type { Grade } from '@/lib/photo/grade';
import { analyzePhoto, domCanvas, offscreenCanvas, renderGraded, type AnalyzeResult, type CanvasFactory, type RenderResult } from './pipeline';
import type { CullRequest, CullResponse } from './protocol';
import { spawnCullWorker } from './spawnWorker';

export interface CullClient {
  analyze(file: File): Promise<AnalyzeResult>;
  render(file: File, grade: Grade, mime: 'image/jpeg' | 'image/png'): Promise<RenderResult>;
  /** Drops every job that has not started (their promises reject with 'cancelled'). */
  cancelPending(): void;
  dispose(): void;
}

type JobReq = { type: 'analyze'; file: File } | { type: 'render'; file: File; grade: Grade; mime: 'image/jpeg' | 'image/png' };
interface Job { req: JobReq; resolve: (v: never) => void; reject: (e: Error) => void }
interface Slot { worker: Worker; job: Job | null; seq: number }

/** True when the worker path can work here: a Worker that can decode (createImageBitmap) and draw (OffscreenCanvas). */
export function canUseWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';
}

function poolSize(): number {
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
  return Math.max(1, Math.min(2, Math.floor(cores / 2)));
}

export function createCullClient(opts: { spawn?: () => Worker; useWorker?: boolean } = {}): CullClient {
  const queue: Job[] = [];
  const slots: Slot[] = [];
  let seq = 0;
  let broken = !(opts.useWorker ?? canUseWorker());
  let mainBusy = false;
  let disposed = false;
  const spawn = opts.spawn ?? spawnCullWorker;

  const runOnMain = async (job: Job) => {
    // OffscreenCanvas on the main thread where it exists (no DOM churn), else a detached <canvas>.
    const make: CanvasFactory = typeof OffscreenCanvas !== 'undefined' ? offscreenCanvas : domCanvas;
    try {
      const r = job.req.type === 'analyze'
        ? await analyzePhoto(job.req.file, make)
        : await renderGraded(job.req.file, job.req.grade, job.req.mime, make);
      job.resolve(r as never);
    } catch (e) {
      job.reject(e instanceof Error ? e : new Error('failed'));
    }
  };

  const failWorker = (slot: Slot) => {
    // A worker that cannot load or crashes (a blocked chunk, an engine bug) turns the whole client to the main
    // thread: its in-flight job goes back to the FRONT of the queue, so nothing the user added is dropped.
    broken = true;
    try { slot.worker.terminate(); } catch { /* already gone */ }
    const i = slots.indexOf(slot);
    if (i >= 0) slots.splice(i, 1);
    if (slot.job) queue.unshift(slot.job);
    slot.job = null;
    pump();
  };

  const addSlot = (): Slot | null => {
    try {
      const worker = spawn();
      const slot: Slot = { worker, job: null, seq: -1 };
      worker.onmessage = (e: MessageEvent<CullResponse>) => {
        const msg = e.data;
        if (!msg || msg.seq !== slot.seq || !slot.job) return;
        const job = slot.job;
        slot.job = null;
        if (msg.ok) job.resolve(msg.result as never);
        else job.reject(new Error(msg.error));
        pump();
      };
      worker.onerror = (ev) => { ev.preventDefault?.(); failWorker(slot); };
      worker.onmessageerror = () => failWorker(slot);
      slots.push(slot);
      return slot;
    } catch {
      broken = true;
      return null;
    }
  };

  function pump() {
    if (disposed) return;
    if (broken) {
      if (mainBusy) return;
      const job = queue.shift();
      if (!job) return;
      mainBusy = true;
      void runOnMain(job).finally(() => {
        mainBusy = false;
        // Yield a frame between jobs so the grid can paint and keys keep working.
        setTimeout(pump, 0);
      });
      return;
    }
    while (queue.length) {
      let slot = slots.find((s) => !s.job);
      if (!slot && slots.length < poolSize()) slot = addSlot() ?? undefined;
      if (broken) { pump(); return; }
      if (!slot) return;
      const job = queue.shift()!;
      slot.job = job;
      slot.seq = ++seq;
      const msg: CullRequest = job.req.type === 'analyze'
        ? { type: 'analyze', seq: slot.seq, file: job.req.file }
        : { type: 'render', seq: slot.seq, file: job.req.file, grade: job.req.grade, mime: job.req.mime };
      try {
        slot.worker.postMessage(msg);
      } catch {
        failWorker(slot);
        return;
      }
    }
  }

  const enqueue = <T>(req: JobReq, urgent: boolean) => new Promise<T>((resolve, reject) => {
    if (disposed) { reject(new Error('disposed')); return; }
    const job: Job = { req, resolve: resolve as (v: never) => void, reject };
    if (urgent) queue.unshift(job); else queue.push(job);
    pump();
  });

  return {
    analyze: (file) => enqueue<AnalyzeResult>({ type: 'analyze', file }, false),
    render: (file, grade, mime) => enqueue<RenderResult>({ type: 'render', file, grade, mime }, true),
    cancelPending() {
      for (const job of queue.splice(0)) job.reject(new Error('cancelled'));
    },
    dispose() {
      disposed = true;
      for (const job of queue.splice(0)) job.reject(new Error('disposed'));
      for (const s of slots.splice(0)) {
        s.job?.reject(new Error('disposed'));
        try { s.worker.terminate(); } catch { /* gone */ }
      }
    },
  };
}
