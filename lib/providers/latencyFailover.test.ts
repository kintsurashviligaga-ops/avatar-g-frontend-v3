import { runWithLatencyFailover, type Timer } from './latencyFailover';

/** A timer scheduler the test fires manually (one budget timer active at a time). */
function manualTimer() {
  let pending: Array<() => void> = [];
  const setTimer = (fn: () => void): Timer => {
    pending.push(fn);
    return { clear: () => { pending = pending.filter((f) => f !== fn); } };
  };
  return { setTimer, fire: () => { const f = pending.shift(); if (f) f(); }, count: () => pending.length };
}

/** A provider whose settlement the test controls; records whether it was invoked. */
function deferredProvider<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  let signal: AbortSignal | undefined;
  let called = false;
  const run = (s: AbortSignal) => {
    called = true;
    signal = s;
    return new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  };
  return {
    run,
    resolve: (v: T) => resolve(v),
    reject: (e?: unknown) => reject(e),
    wasCalled: () => called,
    signal: () => signal,
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('runWithLatencyFailover — sequential, no double-submit', () => {
  it('returns the primary result when it succeeds within budget', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0 },
    );
    await flush();
    p1.resolve('kling-ok');
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('kling');
    expect(res.result).toBe('kling-ok');
    expect(p2.wasCalled()).toBe(false); // never touched the secondary
  });

  it('does NOT start the secondary until the primary settles (sequential)', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0 },
    );
    await flush();
    expect(p1.wasCalled()).toBe(true);
    expect(p2.wasCalled()).toBe(false);
  });

  it('reroutes to the secondary when the primary exceeds its budget, and aborts it', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const reroutes: Array<{ from: string; to: string | null; reason: string }> = [];
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0, onReroute: (i) => reroutes.push(i) },
    );
    await flush();
    t.fire(); // kling budget elapsed
    await flush();
    expect(p1.signal()!.aborted).toBe(true); // slow primary was aborted
    expect(p2.wasCalled()).toBe(true); // rerouted to secondary
    p2.resolve('ltx-ok');
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('ltx');
    expect(res.attempts.map((a) => a.reason)).toEqual(['timeout', undefined]);
    expect(reroutes).toEqual([{ from: 'kling', to: 'ltx', reason: 'timeout' }]);
  });

  it('reroutes on a primary error', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0 },
    );
    await flush();
    p1.reject(new Error('provider 500'));
    await flush();
    expect(p2.wasCalled()).toBe(true);
    p2.resolve('ltx-ok');
    const res = await promise;
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('ltx');
    expect(res.attempts[0]).toMatchObject({ name: 'kling', ok: false, reason: 'error' });
  });

  it('skips a tripped provider without spending its budget', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0, isTripped: (n) => n === 'kling' },
    );
    await flush();
    expect(p1.wasCalled()).toBe(false); // skipped entirely
    expect(p2.wasCalled()).toBe(true);
    p2.resolve('ltx-ok');
    const res = await promise;
    expect(res.provider).toBe('ltx');
    expect(res.attempts[0]).toMatchObject({ name: 'kling', skipped: true, reason: 'tripped' });
  });

  it('records every attempt outcome (for the circuit breaker + telemetry)', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const recs: Array<{ name: string; ok: boolean }> = [];
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0, record: (name, ok) => recs.push({ name, ok }) },
    );
    await flush();
    p1.reject(new Error('boom'));
    await flush();
    p2.resolve('ok');
    await promise;
    expect(recs).toEqual([{ name: 'kling', ok: false }, { name: 'ltx', ok: true }]);
  });

  it('fails when every provider is exhausted', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }],
      { setTimer: t.setTimer, now: () => 0 },
    );
    await flush();
    p1.reject(new Error('boom'));
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(res.error).toBe('all providers exhausted');
  });

  it('stops and reports canceled when the outer signal aborts the in-flight provider', async () => {
    const t = manualTimer();
    const p1 = deferredProvider<string>();
    const p2 = deferredProvider<string>();
    const outer = new AbortController();
    const promise = runWithLatencyFailover(
      [{ name: 'kling', run: p1.run }, { name: 'ltx', run: p2.run }],
      { setTimer: t.setTimer, now: () => 0, signal: outer.signal },
    );
    await flush();
    outer.abort();
    p1.reject(new DOMException('aborted', 'AbortError'));
    const res = await promise;
    expect(res.ok).toBe(false);
    expect(res.error).toBe('canceled');
    expect(p2.wasCalled()).toBe(false); // did not reroute after a user cancel
  });

  it('returns ok:false with no providers configured', async () => {
    const res = await runWithLatencyFailover<string>([], { now: () => 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('no providers configured');
  });
});
