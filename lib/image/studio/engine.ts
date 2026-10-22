import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import { quoteCredits } from '@/lib/credits/quote';
import { signQuote, verifyQuote, quoteBinding, QUOTE_TTL_MS } from '@/lib/agent/media/quoteToken';
import {
  enqueue, release, cancel, claim, heartbeat, mustStop, complete, fail, settled, reap, claimable, HEARTBEAT_MS,
  type LeaseRow, type LeaseStore,
} from '@/lib/orchestrator/jobLease';
import {
  IMAGE_KIND, parseImageRequest, parseImagePlan,
  type ImagePlan, type ImageRequest, type ImageReference, type ImageTransport,
  type PreparedReference, type ImageOutput, type SavedImage,
} from './contracts';
import { validateCapability } from './capabilities';
import { imagePayload, instructionParts, sha256, type ImagePayload } from './prompt';
import { qualityCheck, MAX_REFERENCE_BYTES_TOTAL } from './quality';
import { ImageError, imageError } from './errors';

export interface ImageDeps {
  store: LeaseStore;
  transport: ImageTransport;
  key(): string;
  now(): number;
  newId(): string;
  prepare(ref: ImageReference, userId: string): Promise<PreparedReference>;
  checkParent(id: string, userId: string): Promise<boolean>;
  assertConfigured(): void;
  // Admission is shared across instances, fail-closed; it is separate from the durable job lease.
  admit(id: string, userId: string): Promise<boolean>;
  releaseAdmission(id: string, userId: string): Promise<void>;
  reserve(userId: string, credits: number, ref: string): Promise<{ charged: boolean; reason: string }>;
  refund(userId: string, ref: string, credits: number): Promise<'refunded' | 'nothing' | 'error'>;
  persistPayload(id: string, userId: string, payload: ImagePayload): Promise<string>;
  generate(plan: ImagePlan, payload: ImagePayload, signal: AbortSignal): Promise<ImageOutput>;
  save(id: string, userId: string, image: Awaited<ReturnType<typeof qualityCheck>>): Promise<SavedImage>;
  recover(id: string, userId: string, request: ImageRequest): Promise<SavedImage | null>;
  resign(image: SavedImage, userId: string): Promise<SavedImage>;
  every(ms: number, tick: () => Promise<void>): () => void;
  audit(event: { userId: string; jobId?: string; phase: string; code: string; credits?: number }): Promise<void>;
}
interface ImageState {
  billing: 'reserving' | 'reserved' | 'rejected' | 'uncertain';
  dispatch: 'not_sent' | 'submitted' | 'stored';
  payloadPath?: string;
  payloadDigest?: string;
  saved?: SavedImage;
  providerRequestId?: string | null;
  usage?: Record<string, number> | null;
}
const stateOf = (row: LeaseRow): ImageState => row.params._image as ImageState;
const reserveOf = (row: LeaseRow) => row.params._reserve as { ref: string; credits: number };
const fingerprint = (plan: ImagePlan) => bodyFingerprint({ domain: IMAGE_KIND, plan });
const price = () => quoteCredits({ tool: 'image', count: 1 });
/** What the quote binds (lib/agent/media/quoteToken v2): the plan's model on the transport that will run it, one image. */
export const imageQuoteBinding = (model: string, transport: ImageTransport) => quoteBinding({ cap: 'image.studio', model, transport, units: 1 });
const isImage = (row: LeaseRow | null, userId?: string): row is LeaseRow =>
  !!row && row.exec?.kind === IMAGE_KIND && (!userId || row.userId === userId);

/** Image-owned state on the existing row. Compare-and-set preserves concurrent heartbeat/cancel changes. */
async function patchState(deps: ImageDeps, id: string, update: Partial<ImageState>, worker?: string): Promise<boolean> {
  for (let n = 0; n < 5; n++) {
    const row = await deps.store.read(id);
    if (!isImage(row) || !row.exec) return false;
    if (worker && (row.status !== 'processing' || row.exec.owner !== worker || (row.exec.leaseUntil ?? 0) <= deps.now())) return false;
    const params = { ...row.params, _image: { ...stateOf(row), ...update }, _exec: { ...row.exec, v: row.exec.v + 1 } };
    if (await deps.store.cas(id, { v: row.exec.v, from: [row.status] }, { params })) return true;
  }
  return false;
}

export async function quoteImage(deps: ImageDeps, userId: string, value: unknown) {
  const request = parseImageRequest(value);
  validateCapability(request, deps.transport);
  deps.assertConfigured();
  if (!deps.key()) throw new ImageError('not_configured', 'Image quotes are unavailable.', 503);
  if (request.parentJobId && !await deps.checkParent(request.parentJobId, userId)) throw new ImageError('not_found', 'The source version was not found.', 404);
  const references = [];
  for (const ref of request.references) {
    const { data: _data, ...manifest } = await deps.prepare(ref, userId);
    references.push(manifest);
    if (references.reduce((sum, item) => sum + item.bytes, 0) > MAX_REFERENCE_BYTES_TOTAL) {
      throw new ImageError('invalid_reference', 'The normalized references exceed the 12 MB combined limit.');
    }
  }
  const plan: ImagePlan = { v: 1, kind: IMAGE_KIND, request, transport: deps.transport, references };
  const jobId = deps.newId(), credits = price(), expiresAt = deps.now() + QUOTE_TTL_MS;
  const token = signQuote({ u: userId, j: jobId, f: fingerprint(plan), c: credits, x: expiresAt }, deps.key(), imageQuoteBinding(request.modelId, deps.transport));
  if (!token) throw new ImageError('not_configured', 'Image quotes are unavailable.', 503);
  await deps.audit({ userId, jobId, phase: 'quote', code: 'prepared', credits });
  return { ok: true as const, jobId, credits, expiresAt, plan, token,
    supplementaryInstructions: instructionParts(plan), requiresConfirmation: true, providerCostUSD: null };
}

export function imageView(row: LeaseRow) {
  const failed = row.status === 'failed';
  const cancelled = failed && row.error?.startsWith('cancelled');
  return {
    ok: true as const, jobId: row.id,
    status: cancelled ? 'cancelled' as const : failed ? 'failed' as const : row.status === 'completed' ? 'completed' as const :
      row.status === 'processing' ? 'running' as const : 'queued' as const,
    stage: row.status === 'pending' && row.exec?.hold ? 'reserving' : row.stage ?? 'queued',
    progress: row.status === 'completed' ? 100 : null,
    attempt: row.exec?.attempt ?? 0,
    error: failed ? row.error?.split(':')[0] ?? 'unknown_error' : null,
    settlementPending: !!row.exec?.owe,
    result: row.status === 'completed' ? row.result : null,
    cancellable: !['failed', 'completed'].includes(row.status),
  };
}
/** How long an unknown reservation outcome may still turn into a debit. */
const AMBIGUOUS_DEBIT_MS = 24 * 60 * 60_000;

export async function settleImage(deps: ImageDeps, id: string) {
  const row = await deps.store.read(id);
  if (!isImage(row) || !row.exec?.owe) return;
  const state = stateOf(row), reservation = reserveOf(row);
  if (!state || !reservation) return; // corrupt state must not mint a refund
  if (state.billing === 'rejected') { await settled(deps.store, id); return; }
  const paid = await deps.refund(row.userId, reservation.ref, reservation.credits);
  // A late debit can still land after cancel or an ambiguous RPC; a zero read is NOT settlement evidence — until a day has
  // passed: no reservation RPC is still in flight by then, so a ledger that shows nothing taken means nothing is owed.
  // (Owed forever, the row locked the user's workspace and crowded real refunds out of the sweep.)
  const ambiguityOver = deps.now() - row.createdAt > AMBIGUOUS_DEBIT_MS;
  if (paid === 'error' || (paid === 'nothing' && state.billing !== 'reserved' && !ambiguityOver)) return;
  await settled(deps.store, id);
  await deps.audit({ userId: row.userId, jobId: id, phase: 'settlement', code: paid, credits: reservation.credits });
}

/** Change a held/pending row to failed while preserving any refund debt, including ambiguous reservations. */
async function refusePending(deps: ImageDeps, row: LeaseRow, code: string, owe: boolean) {
  if (!row.exec) return;
  await deps.store.cas(row.id, { v: row.exec.v, from: ['pending'] }, {
    status: 'failed', stage: 'failed', error: code,
    params: { ...row.params, _exec: { ...row.exec, v: row.exec.v + 1, hold: undefined, ...(owe ? { owe: 'refund' } : {}) } },
  });
}

export async function startImage(deps: ImageDeps, userId: string, value: unknown, token: unknown, confirmed: unknown) {
  if (confirmed !== true) throw new ImageError('confirmation_required', 'Confirm the displayed image quote before starting.', 400);
  const plan = parseImagePlan(value);
  // The binding is built from the transport that will run it now, so a changed transport, project or price is refused.
  const signed = verifyQuote(token, deps.key(), {
    userId, fingerprint: fingerprint(plan), now: deps.now(), credits: price(), binding: imageQuoteBinding(plan.request.modelId, deps.transport),
  });
  if (!signed.ok) {
    if (signed.reason === 'changed' && signed.field !== 'fingerprint') throw new ImageError('quote_changed', 'The transport or price changed. Request a new quote.', 409);
    throw new ImageError(signed.reason === 'expired' ? 'quote_expired' : signed.reason === 'changed' ? 'quote_changed' : 'quote_invalid', 'The quote is invalid, changed or expired.', 409);
  }
  validateCapability(plan.request, deps.transport);
  if (plan.transport !== deps.transport) throw new ImageError('quote_changed', 'The transport or price changed. Request a new quote.', 409);
  const { j: id, c: credits } = signed.claims;
  const existing = await deps.store.read(id);
  if (existing) {
    if (!isImage(existing, userId) || bodyFingerprint(existing.params._job) !== bodyFingerprint(plan)) throw new ImageError('quote_invalid', 'The quoted job cannot be used.', 409);
    return { ...imageView(existing), replay: true };
  }
  deps.assertConfigured();
  if (plan.request.parentJobId && !await deps.checkParent(plan.request.parentJobId, userId)) throw new ImageError('not_found', 'The source version was not found.', 404);
  const ref = IMAGE_KIND + ':' + id;
  const put = await enqueue(deps.store, { id, userId, serviceType: 'image', kind: IMAGE_KIND, hold: true, maxAttempts: 3,
    params: { prompt: plan.request.originalPrompt, subtype: IMAGE_KIND, via: 'image-studio',
      model: plan.request.modelId, aspect: plan.request.aspectRatio,
      orientation: Number(plan.request.aspectRatio.split(':')[0]) < Number(plan.request.aspectRatio.split(':')[1]) ? 'vertical' : 'landscape',
      _job: plan, _reserve: { ref, credits }, _approval: { channel: 'tap', confirmedAt: deps.now() },
      _image: { billing: 'reserving', dispatch: 'not_sent' } satisfies ImageState } });
  if (put === 'error') throw new ImageError('jobs_unavailable', 'The image job could not be recorded.', 503);
  if (put === 'exists') {
    const row = await deps.store.read(id);
    if (!isImage(row, userId)) throw new ImageError('jobs_unavailable', 'The image job could not be read.', 503);
    return { ...imageView(row), replay: true };
  }
  let reservationAttempted = false;
  try {
    if (!await deps.admit(id, userId)) {
      await patchState(deps, id, { billing: 'rejected' });
      const row = await deps.store.read(id);
      if (row) await refusePending(deps, row, 'queue_full', false);
      throw new ImageError('queue_full', 'The image queue is full. No generation was charged.', 429);
    }
    const beforeCharge = await deps.store.read(id);
    if (!beforeCharge || beforeCharge.status !== 'pending') {
      await patchState(deps, id, { billing: 'rejected' });
      await settleImage(deps, id);
      await deps.releaseAdmission(id, userId);
      if (beforeCharge) return { ...imageView((await deps.store.read(id))!), replay: false };
      throw new ImageError('jobs_unavailable', 'Image job unavailable.', 503);
    }
    reservationAttempted = true;
    const charge = await deps.reserve(userId, credits, ref);
    // ⚠️ 'replay' = this quote's ref was charged by an EARLIER job (its row since deleted — a twin of this one is stopped
    // by enqueue above). Treating it as uncertain made the row owe a refund, and settlement paid back the image already
    // delivered. It is a used quote: no debit was taken here, nothing is owed.
    const billing = charge.charged ? 'reserved' : charge.reason === 'insufficient' || charge.reason === 'skipped' || charge.reason === 'replay' ? 'rejected' : 'uncertain';
    if (!await patchState(deps, id, { billing })) throw new ImageError('jobs_unavailable', 'Billing is being reconciled before generation can start.', 503);
    if (!charge.charged) {
      const row = await deps.store.read(id);
      if (charge.reason === 'replay') {
        if (row) await refusePending(deps, row, 'quote_used', false);
        throw new ImageError('quote_used', 'This quote was already used. Request a new quote.', 409);
      }
      if (row) await refusePending(deps, row, charge.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable', billing === 'uncertain');
      throw new ImageError(charge.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable', 'The image was not started; billing could not confirm the reservation.', 503);
    }
    if (!await release(deps.store, id)) {
      await settleImage(deps, id);
      const row = await deps.store.read(id);
      if (isImage(row, userId) && row.status === 'failed') {
        await deps.releaseAdmission(id, userId);
        return { ...imageView(row), replay: false };
      }
      throw new ImageError('jobs_unavailable', 'The reserved job is awaiting recovery.', 503);
    }
    await deps.audit({ userId, jobId: id, phase: 'start', code: 'queued', credits });
    return { ...imageView((await deps.store.read(id))!), replay: false };
  } catch (e) {
    if (!reservationAttempted) await patchState(deps, id, { billing: 'rejected' });
    const row = await deps.store.read(id);
    // Admission/RPC throws: retain debt on a final row, never leave an unbounded billing hold.
    if (isImage(row) && row.status === 'pending') {
      await refusePending(deps, row, imageError(e).code, stateOf(row).billing !== 'rejected');
    }
    await settleImage(deps, id).catch(() => undefined);
    await deps.releaseAdmission(id, userId).catch(() => undefined);
    throw e;
  }
}

export async function cancelImage(deps: ImageDeps, userId: string, id: string) {
  const before = await deps.store.read(id);
  if (!isImage(before, userId)) throw new ImageError('not_found', 'Image job not found.', 404);
  const r = await cancel(deps.store, id, userId, 'cancelled: stopped by the user', stateOf(before).billing !== 'rejected');
  if (!r.ok && r.reason === 'busy') throw new ImageError('jobs_unavailable', 'The image job is still running; the stop did not land. Try again.', 503);
  if (!r.ok) throw new ImageError('not_running', 'This image job is already final.', 409);
  await settleImage(deps, id);
  // If inference is active, keep its admission until worker cleanup / TTL; HTTP abort is not remote completion.
  if (stateOf(before).dispatch === 'not_sent') await deps.releaseAdmission(id, userId);
  await deps.audit({ userId, jobId: id, phase: 'cancel', code: 'cancelled' });
  return imageView((await deps.store.read(id))!);
}

export async function imageStatus(deps: ImageDeps, userId: string, id: string) {
  let row = await deps.store.read(id);
  if (!isImage(row, userId)) throw new ImageError('not_found', 'Image job not found.', 404);
  await settleImage(deps, id);
  row = (await deps.store.read(id))!;
  const view = imageView(row);
  if (view.result && stateOf(row).saved) {
    const saved = await deps.resign(stateOf(row).saved!, userId);
    view.result = { ...view.result, url: saved.url };
  }
  return { view, needsWorker: claimable(row, deps.now()) };
}

export async function workImage(deps: ImageDeps, id: string, worker: string) {
  const before = await deps.store.read(id);
  if (!isImage(before)) return { ran: false };
  const claimed = await claim(deps.store, id, worker, deps.now());
  if (!claimed.ok) return { ran: false };
  const row = claimed.row;
  const ctl = new AbortController();
  const stop = deps.every(HEARTBEAT_MS, async () => {
    // Only what the row SAYS stops the worker ('lost', 'stopped'); a beat that could not read it ('unsure') carries on —
    // the lease the last beat renewed still holds, and complete()/fail() are owner-fenced anyway.
    try { if (mustStop(await heartbeat(deps.store, id, worker, deps.now()))) ctl.abort(); }
    catch { /* no evidence either way: the next beat tries again */ }
  });
  const fence = async () => {
    if (ctl.signal.aborted || mustStop(await heartbeat(deps.store, id, worker, deps.now()))) throw new ImageError('cancelled', 'The worker no longer owns this image job.');
  };
  try {
    const plan = parseImagePlan(row.params._job);
    validateCapability(plan.request, deps.transport);
    if (plan.transport !== deps.transport) throw new ImageError('not_configured', 'The approved transport changed.', 503);
    await fence();
    let saved: SavedImage | null = null;
    // Recover stored output, but never send an ambiguous inference again.
    if (stateOf(row).dispatch !== 'not_sent') {
      await deps.store.progress(id, worker, 'recovering', 0);
      saved = await deps.recover(id, row.userId, plan.request);
      if (!saved) throw new ImageError('provider_outcome_unknown', 'A previous request may have completed remotely; it will not be submitted again.', 502);
    } else {
      if (!await deps.admit(id, row.userId)) throw new ImageError('queue_full', 'Image capacity is unavailable.', 429);
      await deps.store.progress(id, worker, 'preparing', 0);
      const references: PreparedReference[] = [];
      for (const ref of plan.request.references) {
        references.push(await deps.prepare(ref, row.userId));
        await fence();
      }
      const payload = imagePayload(plan, references);
      const payloadPath = await deps.persistPayload(id, row.userId, payload);
      await fence();
      if (!await patchState(deps, id, { dispatch: 'submitted', payloadPath, payloadDigest: sha256(JSON.stringify(payload)) }, worker)) {
        throw new ImageError('jobs_unavailable', 'The provider dispatch could not be recorded.', 503);
      }
      await deps.store.progress(id, worker, 'generating', 0);
      const output = await deps.generate(plan, payload, ctl.signal);
      await fence();
      await deps.store.progress(id, worker, 'quality_checking', 0);
      const checked = await qualityCheck(output.bytes, output.mime, plan.request);
      await fence();
      await deps.store.progress(id, worker, 'saving', 0);
      saved = await deps.save(id, row.userId, checked);
      if (!await patchState(deps, id, { dispatch: 'stored', saved, providerRequestId: output.providerRequestId, usage: output.usage }, worker)) {
        throw new ImageError('jobs_unavailable', 'The saved image is awaiting job recovery.', 503);
      }
    }
    await fence();
    if (!await patchState(deps, id, { dispatch: 'stored', saved }, worker)) throw new ImageError('jobs_unavailable', 'The image is awaiting recovery.', 503);
    const fresh = (await deps.store.read(id))!;
    const s = stateOf(fresh);
    const done = await complete(deps.store, id, worker, { signedUrl: saved.url, result: {
      ...saved, kind: 'image', subtype: IMAGE_KIND, modelId: plan.request.modelId,
      operation: plan.request.operation, originalPrompt: plan.request.originalPrompt,
      instructions: plan.request.instructions, references: plan.request.references, referenceManifest: plan.references,
      parentJobId: plan.request.parentJobId ?? null, transport: plan.transport,
      effectivePayloadPath: s.payloadPath ?? null, effectivePayloadDigest: s.payloadDigest ?? null,
      providerRequestId: s.providerRequestId ?? null, usage: s.usage ?? null, providerCostUSD: null,
      credits: reserveOf(fresh).credits, qc: { decoded: true, checkedAt: deps.now(), visualAdherence: 'unverified' },
    } });
    if (!done) return { ran: true, outcome: 'lost' };
    await deps.audit({ userId: row.userId, jobId: id, phase: 'complete', code: 'saved' });
    return { ran: true, outcome: 'completed' };
  } catch (e) {
    const error = imageError(e);
    const landed = await fail(deps.store, id, worker, error.code + ': ' + error.message, true);
    if (landed) await deps.audit({ userId: row.userId, jobId: id, phase: 'failed', code: error.code });
    await settleImage(deps, id).catch(() => undefined);
    return { ran: true, outcome: landed ? 'failed' : 'lost', error: error.code };
  } finally {
    stop();
    const fresh = await deps.store.read(id).catch(() => null);
    // Unknown remote outcome: keep capacity until its bounded admission TTL.
    if (fresh && !(stateOf(fresh)?.dispatch === 'submitted' && ['provider_timeout', 'provider_outcome_unknown', 'cancelled'].some(x => fresh.error?.startsWith(x)))) {
      await deps.releaseAdmission(id, row.userId).catch(() => undefined);
    }
  }
}

export async function sweepImages(deps: ImageDeps, worker: string, run = true) {
  const report = await reap(deps.store, IMAGE_KIND, deps.now(), {
    owesRefund: row => stateOf(row)?.billing !== 'rejected',
    error: 'provider_outcome_unknown: image recovery attempts exhausted',
    abandonedError: 'billing_unavailable: image reservation interrupted',
  });
  for (const row of [...report.exhausted, ...await deps.store.listOwed(IMAGE_KIND, 25)]) {
    await settleImage(deps, row.id);
    if (stateOf(row)?.dispatch === 'not_sent') await deps.releaseAdmission(row.id, row.userId).catch(() => undefined);
  }
  if (run && report.runnable[0]) await workImage(deps, report.runnable[0], worker);
  return { waiting: report.runnable.length, exhausted: report.exhausted.length, unsettled: (await deps.store.listOwed(IMAGE_KIND, 25)).length };
}
