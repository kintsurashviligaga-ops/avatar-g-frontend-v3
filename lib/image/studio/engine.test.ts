/** @jest-environment node */
import { claim, LEASE_MS, HOLD_MS } from '@/lib/orchestrator/jobLease';
import { quoteImage, startImage, workImage, imageStatus, cancelImage, sweepImages, settleImage } from './engine';
import { ImageError } from './errors';
import { fakeImage, imageRequest, deferred } from './testing';

const USER = 'user-a';
async function queued() {
  const f = await fakeImage();
  const q = await quoteImage(f.deps, USER, imageRequest());
  await startImage(f.deps, USER, q.plan, q.token, true);
  return { ...f, q };
}
test('quote has no debit, job or provider call; caller must explicitly confirm', async () => {
  const f = await fakeImage(), q = await quoteImage(f.deps, USER, imageRequest());
  expect(f.store.rows.size).toBe(0);
  expect(f.deps.reserve).not.toHaveBeenCalled();
  expect(f.deps.generate).not.toHaveBeenCalled();
  await expect(startImage(f.deps, USER, q.plan, q.token, false)).rejects.toMatchObject({ code: 'confirmation_required' });
  expect(f.net()).toBe(0);
});
test('tampering, wrong user, stale quote or different transport spends nothing', async () => {
  const f = await fakeImage(), q = await quoteImage(f.deps, USER, imageRequest());
  await expect(startImage(f.deps, 'user-b', q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_invalid' });
  const changed = { ...q.plan, request: { ...q.plan.request, originalPrompt: 'different' } };
  await expect(startImage(f.deps, USER, changed, q.token, true)).rejects.toMatchObject({ code: 'quote_changed' });
  f.deps.transport = 'gemini_api';
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_changed' });
  f.clock.now = q.expiresAt;
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'quote_expired' });
  expect(f.deps.reserve).not.toHaveBeenCalled();
});
test('eight concurrent confirms and workers charge/infer/save once; refresh reuses the completed row', async () => {
  const f = await fakeImage(), q = await quoteImage(f.deps, USER, imageRequest());
  const starts = await Promise.all(Array.from({ length: 8 }, () => startImage(f.deps, USER, q.plan, q.token, true)));
  expect(starts.filter(s => !s.replay)).toHaveLength(1);
  await Promise.all(Array.from({ length: 8 }, (_, n) => workImage(f.deps, q.jobId, 'worker-' + n)));
  expect(f.deps.reserve).toHaveBeenCalledTimes(1);
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
  expect(f.deps.save).toHaveBeenCalledTimes(1);
  expect(f.net()).toBe(q.credits);
  const s = await imageStatus(f.deps, USER, q.jobId);
  expect(s.view).toMatchObject({ status: 'completed', progress: 100, settlementPending: false, result: {
    originalPrompt: imageRequest().originalPrompt, providerCostUSD: null, qc: { decoded: true, visualAdherence: 'unverified' },
  } });
  expect(s.needsWorker).toBe(false);
  expect((await startImage(f.deps, USER, q.plan, q.token, true)).replay).toBe(true);
  expect(f.ticks.size).toBe(0);
});
test('failed provider refunds once and replay never calls it again', async () => {
  const f = await queued();
  f.deps.generate = jest.fn(async () => { throw new ImageError('provider_rate_limit', 'capacity'); });
  await workImage(f.deps, f.q.jobId, 'w');
  expect(f.net()).toBe(0);
  await sweepImages(f.deps, 'sweep');
  await startImage(f.deps, USER, f.q.plan, f.q.token, true);
  await workImage(f.deps, f.q.jobId, 'replay');
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
  expect(f.deps.refund).toHaveBeenCalledTimes(1);
  expect((await imageStatus(f.deps, USER, f.q.jobId)).view).toMatchObject({ status: 'failed', error: 'provider_rate_limit' });
});
test('refund outage leaves debt which sweep settles later', async () => {
  const f = await queued(), refund = f.deps.refund;
  f.deps.refund = jest.fn(async () => 'error');
  f.deps.generate = async () => { throw new ImageError('provider_failed', 'failed'); };
  await workImage(f.deps, f.q.jobId, 'w');
  expect(f.net()).toBe(f.q.credits);
  expect(f.store.rows.get(f.q.jobId)?.exec?.owe).toBe('refund');
  f.deps.refund = refund;
  await sweepImages(f.deps, 'sweep');
  expect(f.net()).toBe(0);
  expect(f.store.rows.get(f.q.jobId)?.exec?.owe).toBeUndefined();
});
test('queued cancel refunds and prohibits late delivery', async () => {
  const f = await queued();
  expect((await cancelImage(f.deps, USER, f.q.jobId)).status).toBe('cancelled');
  expect((await workImage(f.deps, f.q.jobId, 'w')).ran).toBe(false);
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect(f.net()).toBe(0);
});
test('cancel while provider is in flight fences late output and keeps remote capacity until TTL', async () => {
  const f = await queued(), entered = deferred<void>(), output = deferred<Awaited<ReturnType<typeof f.deps.generate>>>();
  f.deps.generate = jest.fn(async () => { entered.resolve(); return output.promise; });
  const working = workImage(f.deps, f.q.jobId, 'w');
  await entered.promise;
  await cancelImage(f.deps, USER, f.q.jobId);
  output.resolve({ bytes: f.png, mime: 'image/png', providerRequestId: null, usage: null });
  await working;
  expect(f.deps.save).not.toHaveBeenCalled();
  expect(f.net()).toBe(0);
  expect(f.deps.releaseAdmission).not.toHaveBeenCalled();
});
test('cancel during reservation never clears a zero refund before the late debit lands', async () => {
  const f = await fakeImage(), entered = deferred<void>(), finish = deferred<void>();
  const reserve = f.deps.reserve;
  f.deps.reserve = async (uid, credits, ref) => { entered.resolve(); await finish.promise; return reserve(uid, credits, ref); };
  const q = await quoteImage(f.deps, USER, imageRequest());
  const starting = startImage(f.deps, USER, q.plan, q.token, true);
  await entered.promise;
  await cancelImage(f.deps, USER, q.jobId);
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBe('refund');
  finish.resolve();
  expect((await starting).status).toBe('cancelled');
  expect(f.net()).toBe(0);
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBeUndefined();
  expect(f.deps.generate).not.toHaveBeenCalled();
});
test('unknown reserve outcome stays reconcilable when the ledger initially reports no debit', async () => {
  const f = await fakeImage();
  f.deps.reserve = async () => { throw new Error('RPC disconnected'); };
  const q = await quoteImage(f.deps, USER, imageRequest());
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toThrow();
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBe('refund');
  f.ledger.set('image-studio-v1:' + q.jobId, q.credits); // late RPC commit
  await settleImage(f.deps, q.jobId);
  expect(f.net()).toBe(0);
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBeUndefined();
});
test.each(['insufficient', 'skipped'])('%s reservation is fail-closed without inference or debt', async reason => {
  const f = await fakeImage();
  f.deps.reserve = jest.fn(async () => ({ charged: false, reason }));
  const q = await quoteImage(f.deps, USER, imageRequest());
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toThrow();
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBeUndefined();
});
test('queue backpressure precedes debit and carries no invented refund debt', async () => {
  const f = await fakeImage(); f.deps.admit = async () => false;
  const q = await quoteImage(f.deps, USER, imageRequest());
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'queue_full' });
  expect(f.deps.reserve).not.toHaveBeenCalled();
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBeUndefined();
});
test('private job status and cancellation cannot be probed by another user', async () => {
  const f = await queued();
  await expect(imageStatus(f.deps, 'user-b', f.q.jobId)).rejects.toMatchObject({ code: 'not_found' });
  await expect(cancelImage(f.deps, 'user-b', f.q.jobId)).rejects.toMatchObject({ code: 'not_found' });
  expect(f.net()).toBe(f.q.credits);
});
test('source bytes changed after quote: no provider call; credits refunded', async () => {
  const f = await fakeImage();
  const request = { ...imageRequest(), operation: 'edit' as const, references: [{
    id: 'source', role: 'subject' as const, asset: { kind: 'upload' as const, path: 'user-a/photo.png' },
  }] };
  const q = await quoteImage(f.deps, USER, request);
  await startImage(f.deps, USER, q.plan, q.token, true);
  const prepare = f.deps.prepare;
  f.deps.prepare = async (r, u) => ({ ...await prepare(r, u), digest: 'b'.repeat(64) });
  await workImage(f.deps, q.jobId, 'w');
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect(f.net()).toBe(0);
});
test('dead worker before dispatch can resume, but an ambiguous dispatch never infers twice', async () => {
  const f = await queued();
  await claim(f.deps.store, f.q.jobId, 'dead', f.clock.now);
  const row = f.store.rows.get(f.q.jobId)!;
  row.params._image = { ...(row.params._image as object), dispatch: 'submitted' };
  f.clock.now += LEASE_MS + 1;
  await workImage(f.deps, f.q.jobId, 'recovery');
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect(f.net()).toBe(0);
  expect((await imageStatus(f.deps, USER, f.q.jobId)).view.error).toBe('provider_outcome_unknown');
});
test('crash after storing output recovers the file without a new inference or charge', async () => {
  const f = await queued();
  await claim(f.deps.store, f.q.jobId, 'dead', f.clock.now);
  const row = f.store.rows.get(f.q.jobId)!;
  row.params._image = { ...(row.params._image as object), dispatch: 'submitted' };
  f.outputs.set(f.q.jobId, { path: 'private.png', url: 'https://private.example/result', width: 1024, height: 1024, bytes: f.png.length, mime: 'image/png', digest: 'a'.repeat(64) });
  f.clock.now += LEASE_MS + 1;
  await workImage(f.deps, f.q.jobId, 'recovery');
  expect(f.deps.generate).not.toHaveBeenCalled();
  expect((await imageStatus(f.deps, USER, f.q.jobId)).view.status).toBe('completed');
  expect(f.net()).toBe(f.q.credits);
});
test('abandoned billing hold is failed and remains owed until its ambiguous debit is reconciled', async () => {
  const f = await fakeImage(), entered = deferred<void>(), block = deferred<void>();
  f.deps.reserve = async () => { entered.resolve(); await block.promise; throw new Error('worker dead'); };
  const q = await quoteImage(f.deps, USER, imageRequest());
  const starting = startImage(f.deps, USER, q.plan, q.token, true).catch(() => undefined);
  await entered.promise;
  f.clock.now += HOLD_MS + 1;
  await sweepImages(f.deps, 'sweep');
  expect(f.store.rows.get(q.jobId)?.status).toBe('failed');
  expect(f.store.rows.get(q.jobId)?.exec?.owe).toBe('refund');
  block.resolve(); await starting;
});
test('QC and storage errors never produce a completed Library row', async () => {
  for (const failure of ['qc', 'storage']) {
    const f = await queued();
    if (failure === 'qc') f.deps.generate = async () => ({ bytes: Buffer.from('not an image'), mime: 'image/png', providerRequestId: null, usage: null });
    else f.deps.save = async () => { throw new ImageError('storage_error', 'unavailable'); };
    await workImage(f.deps, f.q.jobId, 'w');
    expect(f.store.rows.get(f.q.jobId)?.status).toBe('failed');
    expect(f.store.rows.get(f.q.jobId)?.signedUrl).toBeNull();
    expect(f.net()).toBe(0);
  }
});
test('a delivered image whose row was deleted cannot be re-submitted with its quote for a refund', async () => {
  const f = await queued();
  await workImage(f.deps, f.q.jobId, 'w');
  expect((await imageStatus(f.deps, USER, f.q.jobId)).view).toMatchObject({ status: 'completed' });
  const charged = f.net();
  expect(charged).toBeGreaterThan(0);
  f.store.rows.delete(f.q.jobId); // the owner deleted it from the Library, the quote is still within its TTL
  await expect(startImage(f.deps, USER, f.q.plan, f.q.token, true)).rejects.toMatchObject({ code: 'quote_used' });
  await sweepImages(f.deps, 'sweep');
  expect(f.deps.refund).not.toHaveBeenCalled();
  expect(f.net()).toBe(charged);
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
});
test('a heartbeat that cannot read the row is no reason to abandon a healthy generation', async () => {
  const f = await queued(), entered = deferred<void>(), output = deferred<Awaited<ReturnType<typeof f.deps.generate>>>();
  f.deps.generate = jest.fn(async () => { entered.resolve(); return output.promise; });
  const working = workImage(f.deps, f.q.jobId, 'w');
  await entered.promise;
  const read = f.store.read.bind(f.store);
  f.store.read = jest.fn(async () => null) as typeof f.store.read; // the database away for one beat
  for (const tick of [...f.ticks]) await tick();
  f.store.read = read;
  output.resolve({ bytes: f.png, mime: 'image/png', providerRequestId: null, usage: null });
  await working;
  expect((await imageStatus(f.deps, USER, f.q.jobId)).view).toMatchObject({ status: 'completed' });
  expect(f.deps.generate).toHaveBeenCalledTimes(1);
});
test('an ambiguous reservation that never debited is settled as nothing after a day, not owed forever', async () => {
  const f = await fakeImage();
  f.deps.reserve = jest.fn(async () => ({ charged: false, reason: 'error' }));
  const q = await quoteImage(f.deps, USER, imageRequest());
  await expect(startImage(f.deps, USER, q.plan, q.token, true)).rejects.toMatchObject({ code: 'billing_unavailable' });
  await sweepImages(f.deps, 'sweep');
  expect((await imageStatus(f.deps, USER, q.jobId)).view.settlementPending).toBe(true); // a late debit may still land
  f.clock.now += 24 * 60 * 60_000 + 1;
  await sweepImages(f.deps, 'sweep');
  expect((await imageStatus(f.deps, USER, q.jobId)).view.settlementPending).toBe(false);
  expect(f.net()).toBe(0);
  expect(f.deps.audit).toHaveBeenCalledWith(expect.objectContaining({ jobId: q.jobId, phase: 'settlement', code: 'nothing' }));
});
