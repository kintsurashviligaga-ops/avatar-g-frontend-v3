/**
 * Capped-parallel job queue engine (framework-agnostic, unit-testable).
 * ====================================================================
 *
 * The product composer used to serialize ALL generation to one render at a time
 * (a single `busy` flag). This engine lifts that to N-concurrent with a real queue:
 * up to `maxConcurrent` jobs render at once; the rest wait as `queued` and each
 * carries a live 1-based `position` ("In Queue: #1") that ticks down as slots free.
 *
 * Design guarantees:
 *  - Pure orchestration — the actual render work is an INJECTED `run(ctx)` async fn,
 *    so this file has no React / no fetch / no DB and is fully deterministic to test
 *    (clock, id, and AbortController are all injectable).
 *  - A job ALWAYS reaches a terminal state (done | failed | canceled); a throwing or
 *    aborted runner can never wedge a slot — the slot is released and the next queued
 *    job is promoted (`pump`).
 *  - Every mutation emits a fresh immutable snapshot via `onChange`, so a store can
 *    subscribe and React re-renders the tray without reaching into internals.
 *
 * Billing is untouched: each runner still calls the same render endpoint that bills
 * exactly as before. This engine only decides WHEN a runner starts and tracks its
 * progress — it never charges, refunds, or double-submits.
 */

export type JobKind =
  | 'video'
  | 'music'
  | 'avatar'
  | 'image'
  | 'product'
  | 'remix'
  | 'lipsync';

export type JobStatus = 'queued' | 'rendering' | 'done' | 'failed' | 'canceled';

export interface Job {
  id: string;
  kind: JobKind;
  /** Human label shown in the tray (already localized by the caller). */
  label: string;
  status: JobStatus;
  /** 0–100; meaningful while rendering, 100 on done. */
  pct: number;
  /** Short stage line, e.g. "Rendering clip 3/6" · null when none. */
  stage: string | null;
  /** 1-based queue position while `queued`; null once rendering/terminal. */
  position: number | null;
  error: string | null;
  result: unknown;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

/** Progress the runner reports back as it works. */
export interface JobProgress {
  pct?: number;
  stage?: string | null;
}

export interface JobRunContext {
  jobId: string;
  signal: AbortSignal;
  onProgress: (p: JobProgress) => void;
}

export type JobRunner = (ctx: JobRunContext) => Promise<unknown>;

export interface SubmitInput {
  kind: JobKind;
  label: string;
  run: JobRunner;
}

export interface JobQueueOptions {
  /** Max jobs rendering at once (default 3). Overflow waits as `queued`. */
  maxConcurrent?: number;
  /** Injectable clock (tests pass a fake). */
  now?: () => number;
  /** Injectable id factory (tests pass a deterministic one). */
  makeId?: (kind: JobKind, seq: number) => string;
  /** Injectable AbortController factory (tests can inspect/abort). */
  makeAbort?: () => AbortController;
  /** Called with a fresh snapshot after every mutation. */
  onChange?: (jobs: Job[]) => void;
}

const clampPct = (n: number): number =>
  !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 100 ? 100 : Math.round(n);

interface Internal extends Job {
  _run: JobRunner;
  _abort: AbortController | null;
}

export class JobQueue {
  private readonly maxConcurrent: number;
  private readonly now: () => number;
  private readonly makeId: (kind: JobKind, seq: number) => string;
  private readonly makeAbort: () => AbortController;
  private readonly onChange?: (jobs: Job[]) => void;
  private readonly jobs: Internal[] = [];
  private seq = 0;

  constructor(opts: JobQueueOptions = {}) {
    this.maxConcurrent = Math.max(1, Math.floor(opts.maxConcurrent ?? 3));
    this.now = opts.now ?? (() => Date.now());
    this.makeId =
      opts.makeId ?? ((kind, seq) => `${kind}_${seq}_${Math.round(this.now())}`);
    this.makeAbort = opts.makeAbort ?? (() => new AbortController());
    this.onChange = opts.onChange;
  }

  /** Number of jobs currently rendering. */
  activeCount(): number {
    return this.jobs.filter((j) => j.status === 'rendering').length;
  }

  /** Public immutable snapshot (newest-last, i.e. submission order). */
  list(): Job[] {
    return this.jobs.map(publicView);
  }

  /**
   * Enqueue a job. Starts it immediately if a slot is free, else it waits as
   * `queued` with a live position. Returns the assigned jobId.
   */
  submit(input: SubmitInput): string {
    const id = this.makeId(input.kind, ++this.seq);
    const job: Internal = {
      id,
      kind: input.kind,
      label: input.label,
      status: 'queued',
      pct: 0,
      stage: null,
      position: null,
      error: null,
      result: null,
      createdAt: this.now(),
      startedAt: null,
      endedAt: null,
      _run: input.run,
      _abort: null,
    };
    this.jobs.push(job);
    this.pump();
    this.emit();
    return id;
  }

  /** Cancel a job by id — aborts it if rendering, drops it if still queued. */
  cancel(id: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || isTerminal(job.status)) return;
    if (job.status === 'rendering' && job._abort) {
      try {
        job._abort.abort();
      } catch {
        /* noop */
      }
      // The runner's rejection handler will finalize as 'canceled' + pump.
      return;
    }
    // Queued → drop to terminal immediately.
    this.finalize(job, 'canceled', null, 'canceled');
    this.pump();
    this.emit();
  }

  /** Remove terminal jobs from the tray (does not touch running/queued). */
  clearFinished(): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (isTerminal(this.jobs[i]!.status)) this.jobs.splice(i, 1);
    }
    this.recomputePositions();
    this.emit();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Promote queued jobs into free slots (oldest first). */
  private pump(): void {
    for (const job of this.jobs) {
      if (this.activeCount() >= this.maxConcurrent) break;
      if (job.status === 'queued') this.start(job);
    }
    this.recomputePositions();
  }

  private start(job: Internal): void {
    job.status = 'rendering';
    job.position = null;
    job.startedAt = this.now();
    job.pct = job.pct || 1;
    const ac = this.makeAbort();
    job._abort = ac;

    const ctx: JobRunContext = {
      jobId: job.id,
      signal: ac.signal,
      onProgress: (p) => this.onProgress(job.id, p),
    };

    // Invoke the injected work SYNCHRONOUSLY so the render starts the instant a slot
    // is free (a synchronous throw is caught here too). Settlement still happens on a
    // microtask via .then/.catch, so it never re-enters `pump` mid-flight. Either way
    // the slot is released and the next queued job is promoted. Never rejects outward.
    let work: Promise<unknown>;
    try {
      work = Promise.resolve(job._run(ctx));
    } catch (err) {
      work = Promise.reject(err);
    }
    work.then(
      (result) => this.settle(job.id, 'done', result, null),
      (err) => {
        const aborted =
          ac.signal.aborted ||
          (err instanceof Error &&
            (err.name === 'AbortError' || /abort/i.test(err.message)));
        this.settle(
          job.id,
          aborted ? 'canceled' : 'failed',
          null,
          aborted ? 'canceled' : errText(err),
        );
      },
    );
  }

  private onProgress(id: string, p: JobProgress): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status !== 'rendering') return;
    if (typeof p.pct === 'number') job.pct = clampPct(p.pct);
    if (p.stage !== undefined) job.stage = p.stage;
    this.emit();
  }

  private settle(
    id: string,
    status: Extract<JobStatus, 'done' | 'failed' | 'canceled'>,
    result: unknown,
    error: string | null,
  ): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || isTerminal(job.status)) return;
    this.finalize(job, status, result, error);
    this.pump();
    this.emit();
  }

  private finalize(
    job: Internal,
    status: Extract<JobStatus, 'done' | 'failed' | 'canceled'>,
    result: unknown,
    error: string | null,
  ): void {
    job.status = status;
    job.pct = status === 'done' ? 100 : job.pct;
    job.result = result;
    job.error = error;
    job.position = null;
    job.endedAt = this.now();
    job._abort = null;
  }

  private recomputePositions(): void {
    let pos = 0;
    for (const job of this.jobs) {
      if (job.status === 'queued') job.position = ++pos;
      else job.position = null;
    }
  }

  private emit(): void {
    this.onChange?.(this.list());
  }
}

function isTerminal(s: JobStatus): boolean {
  return s === 'done' || s === 'failed' || s === 'canceled';
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message || 'render failed';
  if (typeof err === 'string') return err;
  return 'render failed';
}

function publicView(j: Internal): Job {
  return {
    id: j.id,
    kind: j.kind,
    label: j.label,
    status: j.status,
    pct: j.pct,
    stage: j.stage,
    position: j.position,
    error: j.error,
    result: j.result,
    createdAt: j.createdAt,
    startedAt: j.startedAt,
    endedAt: j.endedAt,
  };
}
