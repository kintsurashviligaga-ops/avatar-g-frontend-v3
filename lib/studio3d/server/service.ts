/**
 * lib/studio3d/server/service.ts — the 3D Studio's server orchestration: create a job, approve the reference, poll the
 * worker, cancel. Every outside thing (database, ledger, storage, Gemini, the Cloud Run job) is an injected dependency, so
 * the whole money flow runs in tests with mocks. Real wiring: ./deps.ts. Routes: app/api/studio3d/*.
 *
 * LEDGER MAPPING (this app reserves up front and refunds on failure; see lib/orchestrator/ledger):
 *   hold    → deductCreditsOnce(ref studio3d:<id>)        (the user pays when the job is queued)
 *   charge  → deductCreditsOnce(same ref) — a replay is a no-op, so "charge on delivery" never double-charges
 *   release → refundCredits(ref studio3d:<id>:refund)    (any failure after the hold)
 * The reference picture (✦8) is charged when it is delivered, ref studio3d:<id>:ref.
 */
import {
  advance, admit, newJob, MAX_PARALLEL, etaSeconds,
  type Effect, type Studio3dEvent, type Studio3dJob, type Studio3dOutputs,
} from '../pipeline';
import { validateStudio3d, type Studio3dRequest } from '../spec';
import { journeyQuote, quote3d, type MarginGate } from '../price';
import { referencePrompt, retexturePrompt, safetyCheckPrompt, parseSafetyAnswer } from '../prompts';
import { buildSpec, parseManifest, type Studio3dEngine, type WorkerSpec } from '../engine';

export interface JobRow {
  id: string;
  userId: string;
  request: Studio3dRequest;
  state: Studio3dJob;
  /** Storage path of the reference picture (text / retexture), once made. */
  referencePath?: string;
  createdAt: number;
}

export interface Studio3dDeps {
  store: {
    get(id: string): Promise<JobRow | null>;
    insert(row: JobRow): Promise<boolean>;
    update(row: JobRow): Promise<boolean>;
    /** running = starting..export, queued = queued; today = jobs created since UTC midnight; user = user's active jobs. */
    counts(userId: string): Promise<{ running: number; queued: number; todayTotal: number; userActive: number }>;
    oldestQueuedId(): Promise<string | null>;
  };
  ledger: {
    deductOnce(userId: string, credits: number, ref: string): Promise<{ ok: boolean; reason?: string }>;
    refund(userId: string, credits: number, ref: string): Promise<{ ok: boolean }>;
  };
  storage: {
    /** Signed READ link for a path in the private studio3d bucket. */
    signRead(path: string, sec?: number): Promise<string | null>;
    /** Signed UPLOAD link the worker PUTs to. */
    signUpload(path: string): Promise<string | null>;
    putBase64(path: string, base64: string, mime: string): Promise<boolean>;
    readJson(path: string): Promise<unknown | null>;
    /** Storage path of one of OUR storage urls (photo the user uploaded, an earlier model), or null. */
    pathOfOwnUrl(url: string): { bucket: string; path: string } | null;
    signReadAny(bucket: string, path: string, sec?: number): Promise<string | null>;
  };
  gemini: {
    image(prompt: string, refs?: string[]): Promise<{ base64: string; mimeType: string } | null>;
    text(prompt: string): Promise<string | null>;
  };
  engine: Studio3dEngine | null;
  /** File a delivered model in the Library (once). Optional: tests and old wiring may leave it out. */
  library?: { record(row: JobRow, glbUrl: string): Promise<boolean> };
  /** Bytes of a file in the private studio3d bucket (downloads). */
  readBytes?: (path: string) => Promise<Uint8Array | null>;
  gate?: MarginGate;
  newId(): string;
  now(): number;
  dailyCap?: number;
}

export const BUCKET = 'studio3d';
export const paths = (userId: string, jobId: string) => {
  const dir = `${userId}/${jobId}`;
  return {
    dir,
    reference: `${dir}/reference.png`,
    glb: `${dir}/model.glb`,
    turntable: `${dir}/turntable.mp4`,
    preview: `${dir}/preview.png`,
    manifest: `${dir}/manifest.json`,
  };
};

export type ServiceError = { ok: false; status: number; code: string; message?: string };
export type JobView = {
  ok: true;
  id: string;
  mode: Studio3dRequest['mode'];
  step: Studio3dJob['step'];
  error?: string;
  quote: { credits: number; action: string }[];
  referenceUrl?: string;
  model?: { glbUrl: string; turntableUrl?: string; previewUrl?: string; faces?: number };
  etaSec?: number;
};

const err = (status: number, code: string, message?: string): ServiceError => ({ ok: false, status, code, ...(message ? { message } : {}) });

/* ------------------------------------------------------------------ effects ------------------------------------------------------------------ */

/** Apply one event, run its money / work effects, persist. Returns the final row (effects may cascade into more events). */
async function step(deps: Studio3dDeps, row: JobRow, ev: Studio3dEvent): Promise<JobRow> {
  const r = advance(row.state, ev);
  if (!r.applied) return row;
  let cur: JobRow = { ...row, state: r.job };
  const follow: Studio3dEvent[] = [];
  for (const e of r.effects) {
    const next = await runEffect(deps, cur, e);
    if (next.event) follow.push(next.event);
    if (next.row) cur = next.row;
  }
  await deps.store.update(cur);
  for (const f of follow) cur = await step(deps, cur, f);
  return cur;
}

async function runEffect(deps: Studio3dDeps, row: JobRow, e: Effect): Promise<{ event?: Studio3dEvent; row?: JobRow }> {
  const uid = row.userId;
  switch (e.kind) {
    case 'hold':
    case 'charge': {
      const r = await deps.ledger.deductOnce(uid, e.credits, e.ref);
      // A replay (already debited under this ref) is success: that is how "charge on delivery" settles a hold.
      if (r.ok || r.reason === 'replay') return {};
      if (e.kind === 'hold') return { event: { type: 'fail', error: r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable' }, row: { ...row, state: { ...row.state, held: false } } };
      // A charge after delivery that the ledger refused: the hold already paid it. Nothing more to do.
      return {};
    }
    case 'release':
      await deps.ledger.refund(uid, e.credits, e.ref);
      return {};
    case 'make_reference': {
      const p = paths(uid, row.id);
      const req = row.request;
      let refs: string[] | undefined;
      if (req.mode === 'retexture') {
        // The model's own front picture, so Gemini repaints the same silhouette.
        const src = req.imageUrl ? deps.storage.pathOfOwnUrl(req.imageUrl) : null;
        const signed = src ? await deps.storage.signReadAny(src.bucket, src.path, 600) : null;
        if (!signed) return { event: { type: 'fail', error: 'model_preview_missing' } };
        refs = [signed];
      }
      const prompt = req.mode === 'retexture' ? retexturePrompt(req.prompt) : referencePrompt(req.prompt);
      const img = await deps.gemini.image(prompt, refs);
      if (!img) return { event: { type: 'fail', error: 'reference_failed' } };
      if (!(await deps.storage.putBase64(p.reference, img.base64, img.mimeType))) return { event: { type: 'fail', error: 'storage_failed' } };
      return { event: { type: 'reference_ready' }, row: { ...row, referencePath: p.reference } };
    }
    case 'start_worker': {
      if (!deps.engine) return { event: { type: 'fail', error: 'worker_not_configured' } };
      const spec = await workerSpec(deps, row);
      if (!spec) return { event: { type: 'fail', error: 'storage_failed' } };
      try {
        const { execution } = await deps.engine.start(spec);
        return { event: { type: 'started', execution } };
      } catch {
        return { event: { type: 'fail', error: 'worker_start_failed' } };
      }
    }
    case 'notify':
      return {};
  }
}

async function workerSpec(deps: Studio3dDeps, row: JobRow): Promise<WorkerSpec | null> {
  const p = paths(row.userId, row.id);
  const req = row.request;
  let imageUrl: string | null = null;
  if (row.referencePath) imageUrl = await deps.storage.signRead(row.referencePath, 3600);
  else if (req.imageUrl) {
    const src = deps.storage.pathOfOwnUrl(req.imageUrl);
    imageUrl = src ? await deps.storage.signReadAny(src.bucket, src.path, 3600) : null;
  }
  let meshUrl: string | undefined;
  if (req.mode === 'retexture' && req.meshUrl) {
    const src = deps.storage.pathOfOwnUrl(req.meshUrl);
    meshUrl = (src && (await deps.storage.signReadAny(src.bucket, src.path, 3600))) || undefined;
    if (!meshUrl) return null;
  }
  const [glb, turntable, preview, manifest] = await Promise.all([p.glb, p.turntable, p.preview, p.manifest].map((x) => deps.storage.signUpload(x)));
  if (!imageUrl || !glb || !turntable || !preview || !manifest) return null;
  return buildSpec({ jobId: row.id, mode: req.mode, imageUrl, meshUrl, high: req.detail === 'high', faces: req.faces, uploads: { glb, turntable, preview, manifest } });
}

/* ------------------------------------------------------------------ public API ------------------------------------------------------------------ */

export function quoteFor(req: Studio3dRequest, gate?: MarginGate) {
  return journeyQuote(req.mode, req.detail === 'high', gate).map((q) => ({ action: q.action, credits: q.credits }));
}

export async function createJob(deps: Studio3dDeps, userId: string, body: unknown): Promise<JobView | ServiceError> {
  const v = validateStudio3d(body);
  if (!v.ok) return err(400, 'invalid_request', v.error);
  const req = v.request;
  if (req.mode === 'retexture' && !req.imageUrl) return err(400, 'invalid_request', 'imageUrl (the model preview) is required');

  const c = await deps.store.counts(userId);
  const a = admit({ ...c, dailyCap: deps.dailyCap });
  if (!a.ok) return err(429, a.reason);

  const modelAction = req.mode === 'retexture' ? 'retexture' : req.detail === 'high' ? 'model_high' : 'model';
  const id = deps.newId();
  let row: JobRow = {
    id,
    userId,
    request: req,
    state: newJob(id, req.mode, quote3d(modelAction, deps.gate).credits, quote3d('reference', deps.gate).credits),
    createdAt: deps.now(),
  };
  if (!(await deps.store.insert(row))) return err(503, 'store_unavailable');

  // Gemini safety pre-check on the user's words (image mode: only when there is a note). Fails closed.
  const words = req.prompt;
  const verdict = words ? parseSafetyAnswer((await deps.gemini.text(safetyCheckPrompt(words))) ?? '') : 'allow';
  row = await step(deps, row, { type: 'safety', verdict });
  row = await tryAdmit(deps, row);
  return view(deps, row);
}

/** Admit a queued job when a GPU is free and it is first in line. */
async function tryAdmit(deps: Studio3dDeps, row: JobRow): Promise<JobRow> {
  if (row.state.step !== 'queued') return row;
  const c = await deps.store.counts(row.userId);
  if (c.running >= MAX_PARALLEL) return row;
  const first = await deps.store.oldestQueuedId();
  if (first && first !== row.id) return row;
  return step(deps, row, { type: 'admitted' });
}

async function owned(deps: Studio3dDeps, userId: string, id: string): Promise<JobRow | ServiceError> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return err(404, 'not_found');
  const row = await deps.store.get(id);
  return row && row.userId === userId ? row : err(404, 'not_found');
}

export async function actOnJob(deps: Studio3dDeps, userId: string, id: string, action: unknown): Promise<JobView | ServiceError> {
  const r = await owned(deps, userId, id);
  if (!('state' in r)) return r;
  let row = r;
  if (action === 'approve') {
    if (row.state.step !== 'awaiting_approval') return err(409, 'not_awaiting_approval');
    const c = await deps.store.counts(userId);
    const a = admit({ ...c, dailyCap: deps.dailyCap });
    if (!a.ok) return err(429, a.reason);
    row = await step(deps, row, { type: 'approve' });
    row = await tryAdmit(deps, row);
  } else if (action === 'cancel') {
    const before = row.state.step;
    row = await step(deps, row, { type: 'cancel' });
    if (row.state.step === before) return err(409, 'cannot_cancel');
  } else return err(400, 'unknown_action');
  return view(deps, row);
}

/** GET: read the worker's progress, settle on delivery, refund on failure. Safe to call as often as the card polls. */
export async function pollJob(deps: Studio3dDeps, userId: string, id: string): Promise<JobView | ServiceError> {
  const r = await owned(deps, userId, id);
  if (!('state' in r)) return r;
  let row = r;
  if (row.state.step === 'queued') row = await tryAdmit(deps, row);
  if (['starting', 'shape', 'texture', 'export'].includes(row.state.step)) row = await syncWorker(deps, row);
  return view(deps, row);
}

async function syncWorker(deps: Studio3dDeps, row: JobRow): Promise<JobRow> {
  const p = paths(row.userId, row.id);
  const manifest = parseManifest(await deps.storage.readJson(p.manifest), row.id);
  if (manifest?.step === 'done') {
    const outputs: Studio3dOutputs = { glb: p.glb, turntable: p.turntable, preview: p.preview, ...(manifest.faces ? { faces: manifest.faces } : {}), ...(manifest.gpuSeconds ? { gpuSeconds: manifest.gpuSeconds } : {}) };
    if (row.state.step === 'starting') row = await step(deps, row, { type: 'started', execution: row.state.execution ?? 'unknown' });
    const done = await step(deps, row, { type: 'delivered', outputs });
    if (done.state.step === 'done' && deps.library) {
      const glbUrl = await deps.storage.signRead(p.glb, 3600);
      if (glbUrl) await deps.library.record(done, glbUrl).catch(() => false);
    }
    return done;
  }
  if (manifest?.step === 'failed') return step(deps, row, { type: 'fail', error: manifest.error || 'worker_failed' });
  if (manifest && ['shape', 'texture', 'export'].includes(manifest.step)) {
    row = await step(deps, row, { type: 'progress', step: manifest.step as 'shape' | 'texture' | 'export' });
  }
  // The execution ended without a "done" manifest: the worker crashed or hit the task timeout. Refund.
  if (deps.engine && row.state.execution) {
    try {
      const s = await deps.engine.status(row.state.execution);
      if (s.state === 'failed') return step(deps, row, { type: 'fail', error: s.detail || 'worker_failed' });
      if (s.state === 'succeeded' && !manifest) return step(deps, row, { type: 'fail', error: 'worker_returned_nothing' });
    } catch {
      /* status unavailable: try again on the next poll */
    }
  }
  return row;
}

async function view(deps: Studio3dDeps, row: JobRow): Promise<JobView> {
  const s = row.state;
  const out: JobView = { ok: true, id: row.id, mode: row.request.mode, step: s.step, quote: quoteFor(row.request, deps.gate) };
  if (s.error) out.error = s.error;
  if (row.referencePath && ['awaiting_approval', 'queued', 'starting', 'shape', 'texture', 'export', 'done'].includes(s.step)) {
    out.referenceUrl = (await deps.storage.signRead(row.referencePath)) ?? undefined;
  }
  if (s.step === 'done' && s.outputs) {
    const [glbUrl, turntableUrl, previewUrl] = await Promise.all([
      deps.storage.signRead(s.outputs.glb, 3600),
      s.outputs.turntable ? deps.storage.signRead(s.outputs.turntable, 3600) : Promise.resolve(null),
      s.outputs.preview ? deps.storage.signRead(s.outputs.preview, 3600) : Promise.resolve(null),
    ]);
    if (glbUrl) out.model = { glbUrl, ...(turntableUrl ? { turntableUrl } : {}), ...(previewUrl ? { previewUrl } : {}), ...(s.outputs.faces ? { faces: s.outputs.faces } : {}) };
  }
  if (s.step === 'queued') out.etaSec = etaSeconds(1);
  else if (s.step === 'starting' || s.step === 'shape') out.etaSec = etaSeconds(0);
  return out;
}

/** A finished model as GLB / OBJ (zip) / STL. Owner only; free. */
export async function downloadJob(
  deps: Studio3dDeps,
  userId: string,
  id: string,
  format: unknown,
  mm?: unknown,
): Promise<{ ok: true; file: import('./download').DownloadFile } | ServiceError> {
  const { isDownloadFormat, buildDownload } = await import('./download');
  if (!isDownloadFormat(format)) return err(400, 'bad_format');
  const r = await owned(deps, userId, id);
  if (!('state' in r)) return r;
  if (r.state.step !== 'done' || !r.state.outputs?.glb || !deps.readBytes) return err(409, 'not_ready');
  const glb = await deps.readBytes(r.state.outputs.glb);
  if (!glb) return err(502, 'storage_failed');
  try {
    return { ok: true, file: await buildDownload(glb, format, { mm, base: r.request.prompt }) };
  } catch {
    return err(422, 'convert_failed');
  }
}
