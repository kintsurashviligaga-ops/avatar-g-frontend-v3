/** @jest-environment node */
import { memorySpendStore } from '@/lib/agent/sandbox/budget';
import { checkBrowserTask, type BrowserPlan } from './policy';
import { BROWSER_DENY_SUBNETS, browserWorstCaseUsd, hostBrowserRunner, type BrowserHost, type BrowserHostSpec, type BrowserLive } from './runner';
import { BROWSER_SCRIPT } from './script';

const plan = (() => {
  const r = checkBrowserTask({ steps: [{ op: 'goto', url: 'https://example.com' }, { op: 'text' }, { op: 'screenshot', name: 'home' }] });
  if (!r.ok) throw new Error(r.error);
  return r.plan;
})();

function fakeHost(result: unknown, opts: { hang?: boolean; files?: Record<string, Buffer> } = {}) {
  const log: { specs: BrowserHostSpec[]; written: Record<string, string>; stopped: number; cmds: string[][] } = { specs: [], written: {}, stopped: 0, cmds: [] };
  const host: BrowserHost = {
    async create(spec) {
      log.specs.push(spec);
      return {
        async writeFile(p, c) { log.written[p] = c; },
        async readBytes(p) {
          if (p === 'result.json') return result === undefined ? null : Buffer.from(JSON.stringify(result));
          return opts.files?.[p] ?? null;
        },
        async exec(cmd, args, signal) {
          log.cmds.push([cmd, ...args]);
          if (opts.hang) await new Promise<void>((res) => signal.addEventListener('abort', () => res(), { once: true }));
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        async stop() { log.stopped++; },
      };
    },
  };
  return { host, log };
}

const sig = () => new AbortController().signal;

describe('hostBrowserRunner', () => {
  it('starts a sandbox with private ranges denied, writes the driver and the task, reads the screenshot back', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { host, log } = fakeHost({
      finalUrl: 'https://example.com/',
      steps: [{ op: 'goto', ok: true, url: 'https://example.com/', title: 'Example' }, { op: 'text', ok: true, text: 'Hello' }, { op: 'screenshot', ok: true, shot: 'home' }],
    }, { files: { 'shots/home.png': png } });
    const spend = memorySpendStore();
    const r = await hostBrowserRunner(host, spend).run(plan, sig());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shots).toEqual([{ name: 'home', bytes: png }]);
    expect(r.steps.map((s) => s.op)).toEqual(['goto', 'text', 'screenshot']);
    expect(log.specs[0]!.denySubnets).toBe(BROWSER_DENY_SUBNETS);
    for (const net of ['10.0.0.0/8', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10']) {
      expect(BROWSER_DENY_SUBNETS).toContain(net);
    }
    expect(log.written['run.mjs']).toBe(BROWSER_SCRIPT);
    expect(JSON.parse(log.written['task.json']!).steps).toEqual(plan.steps);
    expect(log.cmds).toEqual([['node', 'run.mjs']]);
    expect(log.stopped).toBe(1);
    expect(await spend.total()).toBeLessThanOrEqual(browserWorstCaseUsd(plan));
  });

  it('refuses before creating anything when the $20 ledger is full', async () => {
    const { host, log } = fakeHost({ steps: [], finalUrl: '' });
    const r = await hostBrowserRunner(host, memorySpendStore(20)).run(plan, sig());
    expect(r).toMatchObject({ ok: false, error: 'refused' });
    expect(log.specs).toHaveLength(0);
  });

  it('stops at the wall clock, stops the sandbox and settles', async () => {
    jest.useFakeTimers();
    try {
      const { host, log } = fakeHost(undefined, { hang: true });
      const spend = memorySpendStore();
      const p = hostBrowserRunner(host, spend).run({ ...plan, wallSec: 1 } as BrowserPlan, sig());
      await jest.advanceTimersByTimeAsync(40_000);
      expect(await p).toMatchObject({ ok: false, error: 'timeout' });
      expect(log.stopped).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a user Stop is cancelled, not a timeout', async () => {
    const { host } = fakeHost(undefined, { hang: true });
    const ac = new AbortController();
    const p = hostBrowserRunner(host, memorySpendStore()).run(plan, ac.signal);
    setTimeout(() => ac.abort(), 10);
    expect(await p).toMatchObject({ ok: false, error: 'cancelled' });
  });

  it('a driver that could not start Chromium is a failure with its reason', async () => {
    const { host, log } = fakeHost({ steps: [], finalUrl: '', error: 'Executable does not exist' });
    expect(await hostBrowserRunner(host, memorySpendStore()).run(plan, sig())).toMatchObject({ ok: false, error: 'runner_failed' });
    expect(log.stopped).toBe(1);
  });

  it('no result file is a failure, never an empty success', async () => {
    const { host } = fakeHost(undefined);
    expect(await hostBrowserRunner(host, memorySpendStore()).run(plan, sig())).toMatchObject({ ok: false, error: 'runner_failed' });
  });

  it('while the driver runs, it reads the progress and the live picture and hands them on (GG 08:38Z live view)', async () => {
    jest.useFakeTimers();
    try {
      const jpg = Buffer.from([0xff, 0xd8, 0xff]);
      let finish: () => void = () => {};
      let progress: unknown = { finalUrl: 'https://example.com/', steps: [{ op: 'goto', ok: true, url: 'https://example.com/', title: 'Example' }] };
      const host: BrowserHost = {
        async create() {
          return {
            async writeFile() {},
            async readBytes(p) { return p === 'result.json' ? Buffer.from(JSON.stringify(progress)) : p === 'live.jpg' ? jpg : null; },
            async exec() { await new Promise<void>((r) => { finish = r; }); return { exitCode: 0, stdout: '', stderr: '' }; },
            async stop() {},
          };
        },
      };
      const seen: BrowserLive[] = [];
      const run = hostBrowserRunner(host, memorySpendStore()).run(plan, sig(), (l) => seen.push(l));
      await jest.advanceTimersByTimeAsync(1600);
      expect(seen).toEqual([{ steps: [{ op: 'goto', ok: true, url: 'https://example.com/', title: 'Example' }], url: 'https://example.com/', jpeg: jpg }]);
      await jest.advanceTimersByTimeAsync(1600); // nothing new: nothing handed on
      expect(seen).toHaveLength(1);
      progress = { finalUrl: 'https://example.com/', steps: [{ op: 'goto', ok: true }, { op: 'text', ok: true, text: 'Hello' }, { op: 'screenshot', ok: true, shot: 'home' }] };
      await jest.advanceTimersByTimeAsync(1600);
      expect(seen[1]!.steps.map((x) => x.op)).toEqual(['goto', 'text', 'screenshot']);
      expect(JSON.stringify(seen[1])).not.toContain('Hello'); // the live view carries no page text
      finish();
      const r = await run;
      expect(r.ok).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
