import { runJobWithLifecycle, type JobLifecycleDeps } from './jobLifecycle';

function mockDeps() {
  return {
    markProcessing: jest.fn(async () => {}),
    markCompleted: jest.fn(async () => {}),
    markFailed: jest.fn(async () => {}),
  } satisfies JobLifecycleDeps;
}
const noSleep = async () => {};

describe('job lifecycle runner (STEP 2.4 guardrail)', () => {
  it('success → marks processing then completed, never failed', async () => {
    const d = mockDeps();
    const out = await runJobWithLifecycle(async () => 'MASTER_URL', d, { sleep: noSleep });
    expect(out).toEqual({ ok: true, result: 'MASTER_URL' });
    expect(d.markProcessing).toHaveBeenCalledTimes(1);
    expect(d.markCompleted).toHaveBeenCalledWith('MASTER_URL');
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it('retries a transient failure then completes', async () => {
    const d = mockDeps();
    let n = 0;
    const out = await runJobWithLifecycle(async () => { if (++n < 3) throw new Error('kling 429'); return 'ok'; }, d, { sleep: noSleep, maxAttempts: 3 });
    expect(out.ok).toBe(true);
    expect(n).toBe(3);
    expect(d.markCompleted).toHaveBeenCalledTimes(1);
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it('CRITICAL: a render that always fails is marked FAILED after maxAttempts — never stuck processing', async () => {
    const d = mockDeps();
    let n = 0;
    const out = await runJobWithLifecycle(async () => { n++; throw new Error('Kling generation failed'); }, d, { sleep: noSleep, maxAttempts: 3 });
    expect(out.ok).toBe(false);
    if (!out.ok) { expect(out.attempts).toBe(3); expect(out.error).toMatch(/Kling/); }
    expect(n).toBe(3); // bounded
    expect(d.markFailed).toHaveBeenCalledTimes(1);
    expect(d.markCompleted).not.toHaveBeenCalled();
  });

  it('a non-retryable error fails immediately (no wasted retries)', async () => {
    const d = mockDeps();
    let n = 0;
    const out = await runJobWithLifecycle(async () => { n++; throw new Error('insufficient_credits'); }, d, {
      sleep: noSleep, maxAttempts: 3, isRetryable: (e) => !String((e as Error).message).includes('insufficient_credits'),
    });
    expect(out.ok).toBe(false);
    expect(n).toBe(1);
    expect(d.markFailed).toHaveBeenCalledTimes(1);
  });

  it('never rejects, and still marks failed even if markProcessing throws', async () => {
    const d = mockDeps();
    d.markProcessing.mockRejectedValueOnce(new Error('db blip'));
    const out = await runJobWithLifecycle(async () => { throw new Error('boom'); }, d, { sleep: noSleep, maxAttempts: 1 });
    expect(out.ok).toBe(false);
    expect(d.markFailed).toHaveBeenCalledTimes(1); // terminal guarantee holds
  });
});
