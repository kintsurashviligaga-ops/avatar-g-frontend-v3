/** @jest-environment node */
import { checkSandboxJob, type SandboxPlan } from './policy';
import { memorySpendStore, worstCaseUsd, SANDBOX_CAP_USD } from './budget';
import { hostRunner, type SandboxHost, type SandboxHostSpec } from './runner';

function plan(over: Record<string, unknown> = {}): SandboxPlan {
  const c = checkSandboxJob({ language: 'python', code: 'print(1)', ...over });
  if (!c.ok) throw new Error(c.error);
  return c.plan;
}

function fakeHost(behave: { exec?: (signal: AbortSignal) => Promise<{ exitCode: number; stdout: string; stderr: string }>; createFails?: boolean } = {}) {
  const log: { specs: SandboxHostSpec[]; files: Array<[string, string]>; cmds: string[][]; stopped: number } = { specs: [], files: [], cmds: [], stopped: 0 };
  const host: SandboxHost = {
    async create(spec) {
      log.specs.push(spec);
      if (behave.createFails) throw new Error('no capacity');
      return {
        async writeFile(p, c) { log.files.push([p, c]); },
        async exec(cmd, args, signal) {
          log.cmds.push([cmd, ...args]);
          return behave.exec ? behave.exec(signal) : { exitCode: 0, stdout: '1\n', stderr: '' };
        },
        async stop() { log.stopped += 1; },
      };
    },
  };
  return { host, log };
}

describe('sandbox budget', () => {
  it('prices the largest job at a few cents', () => {
    const usd = worstCaseUsd({ cpus: 2, memoryMb: 2048, wallSec: 300 });
    expect(usd).toBeGreaterThan(0.02);
    expect(usd).toBeLessThan(0.03);
  });

  it('refuses a reservation that would cross the cap', async () => {
    const store = memorySpendStore(19.99);
    expect(await store.reserve(0.02, 20)).toBeNull();
    expect(await store.total()).toBeCloseTo(19.99);
    expect(await store.reserve(0.01, 20)).toBeTruthy();
  });
});

describe('hostRunner', () => {
  it('runs python with no env, deny-all network and the plan limits, then stops the host', async () => {
    const { host, log } = fakeHost();
    const spend = memorySpendStore();
    const res = await hostRunner(host, spend).run(plan(), new AbortController().signal);
    expect(res).toMatchObject({ ok: true, exitCode: 0, stdout: '1\n' });
    expect(log.specs[0]).toEqual({ language: 'python', vcpus: 2, memoryMb: 2048, timeoutMs: 300_000, allowedDomains: [], env: {} });
    expect(log.files).toEqual([['main.py', 'print(1)']]);
    expect(log.cmds).toEqual([['python3', 'main.py']]);
    expect(log.stopped).toBe(1);
    expect(await spend.total()).toBeLessThanOrEqual(worstCaseUsd({ cpus: 2, memoryMb: 2048, wallSec: 300 }));
  });

  it('runs node as main.mjs', async () => {
    const { host, log } = fakeHost();
    await hostRunner(host, memorySpendStore()).run(plan({ language: 'node', code: 'console.log(1)' }), new AbortController().signal);
    expect(log.cmds).toEqual([['node', 'main.mjs']]);
  });

  it('creates nothing when the $20 budget is used up', async () => {
    const { host, log } = fakeHost();
    const spend = memorySpendStore(SANDBOX_CAP_USD);
    const res = await hostRunner(host, spend).run(plan(), new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: 'refused' });
    expect(log.specs).toHaveLength(0);
    expect(await spend.total()).toBe(SANDBOX_CAP_USD);
  });

  it('gives back the reservation when the host cannot be created', async () => {
    const { host, log } = fakeHost({ createFails: true });
    const spend = memorySpendStore();
    const res = await hostRunner(host, spend).run(plan(), new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: 'runner_failed', message: 'no capacity' });
    expect(log.stopped).toBe(0);
    expect(await spend.total()).toBe(0);
  });

  it('stops at the wall clock, stops the host, and says timeout', async () => {
    const { host, log } = fakeHost({
      exec: (signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ exitCode: 137, stdout: '', stderr: '' }))),
    });
    const res = await hostRunner(host, memorySpendStore()).run(plan({ limits: { wallSec: 0.05 } }), new AbortController().signal);
    expect(res).toMatchObject({ ok: false, error: 'timeout' });
    expect(log.stopped).toBe(1);
  });

  it('cancels when the caller aborts', async () => {
    const { host, log } = fakeHost({
      exec: (signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ exitCode: 137, stdout: '', stderr: '' }))),
    });
    const ac = new AbortController();
    const p = hostRunner(host, memorySpendStore()).run(plan(), ac.signal);
    setTimeout(() => ac.abort(), 10);
    expect(await p).toMatchObject({ ok: false, error: 'cancelled' });
    expect(log.stopped).toBe(1);
  });

  it('cuts output to the plan limit', async () => {
    const { host } = fakeHost({ exec: async () => ({ exitCode: 0, stdout: 'x'.repeat(5000), stderr: '' }) });
    const res = await hostRunner(host, memorySpendStore()).run(plan({ limits: { outputBytes: 100 } }), new AbortController().signal);
    expect(res.ok && res.stdout.startsWith('x'.repeat(100)) && res.stdout.endsWith('[cut]')).toBe(true);
  });
});
