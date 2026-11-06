/** @jest-environment node */
import { CODE_RUN_LIMITS, codeRequestOf, quoteCodeRun, runCodeQuote, type CodeDeps } from './codeQuote';
import { worstCaseUsd } from './budget';
import type { SandboxIO, SandboxPlan, SandboxRunner } from './policy';
import { memoryBlobs, workspaceStore } from '@/lib/agent/workspace/store';

const U = '11111111-2222-3333-4444-555555555555';

function deps(over: Partial<CodeDeps> = {}) {
  const runs: SandboxPlan[] = [];
  const claimed = new Set<string>();
  let t = 1_000_000;
  const runner: SandboxRunner = {
    async run(plan) {
      runs.push(plan);
      return { ok: true, exitCode: 0, stdout: '4\n', stderr: '', outputs: [], wallMs: 900 };
    },
  };
  const d: CodeDeps = {
    key: () => 'k',
    now: () => t,
    newId: () => `job-${claimed.size + runs.length}`,
    claim: async (_o, key) => (claimed.has(key) ? 'held' : (claimed.add(key), 'claimed')),
    enabled: () => true,
    runner: () => runner,
    ...over,
  };
  return { d, runs, advance: (ms: number) => { t += ms; } };
}

const sig = new AbortController().signal;

describe('codeQuote', () => {
  it('reads python / node / shell (and js / py / bash / sh) only', () => {
    expect(codeRequestOf({ language: 'py', code: 'x' })).toEqual({ language: 'python', code: 'x' });
    expect(codeRequestOf({ language: 'javascript', code: 'x' })).toEqual({ language: 'node', code: 'x' });
    expect(codeRequestOf({ language: 'bash', code: 'x' })).toEqual({ language: 'shell', code: 'x' });
    expect(codeRequestOf({ language: 'ruby', code: 'x' })).toBeNull();
    expect(codeRequestOf({ language: 'python', code: 'x', workspaceId: '../etc' })).toBeNull();
    expect(codeRequestOf({ language: 'python', code: 3 })).toBeNull();
  });

  it('quotes with the server limits, 0 credits, no network, and runs nothing', () => {
    const { d, runs } = deps();
    const q = quoteCodeRun(d, { userId: U, request: { language: 'python', code: 'print(2+2)' } });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.quote).toMatchObject({ language: 'python', credits: 0, wallSec: 60, network: 'none', worstCaseUsd: worstCaseUsd(CODE_RUN_LIMITS) });
    expect(q.quote.worstCaseUsd).toBeLessThan(0.005);
    expect(runs).toHaveLength(0);
  });

  it('refuses empty code, too much code, and no key', () => {
    const { d } = deps();
    expect(quoteCodeRun(d, { userId: U, request: { language: 'python', code: '  ' } })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(quoteCodeRun(d, { userId: U, request: { language: 'python', code: 'x'.repeat(64 * 1024 + 1) } })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(quoteCodeRun(deps({ key: () => '' }).d, { userId: U, request: { language: 'python', code: 'print(1)' } })).toMatchObject({ ok: false, error: 'not_configured' });
  });

  it('runs the quoted code once, with the server plan; a second run of the same quote runs nothing', async () => {
    const { d, runs } = deps();
    const q = quoteCodeRun(d, { userId: U, request: { language: 'node', code: 'console.log(4)' } });
    if (!q.ok) throw new Error('quote');
    const r = await runCodeQuote(d, { userId: U, request: q.request, token: q.token }, sig);
    expect(r).toEqual({ ok: true, exitCode: 0, stdout: '4\n', stderr: '', wallMs: 900 });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ language: 'node', egress: [], env: {}, limits: { cpus: 1, wallSec: 60 } });
    expect(await runCodeQuote(d, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'quote_used' });
    expect(runs).toHaveLength(1);
  });

  it('refuses changed code, another user, an expired quote and a forged token', async () => {
    const { d, runs, advance } = deps();
    const q = quoteCodeRun(d, { userId: U, request: { language: 'python', code: 'print(1)' } });
    if (!q.ok) throw new Error('quote');
    expect(await runCodeQuote(d, { userId: U, request: { language: 'python', code: 'print(2)' }, token: q.token }, sig)).toMatchObject({ error: 'quote_changed' });
    expect(await runCodeQuote(d, { userId: 'other', request: q.request, token: q.token }, sig)).toMatchObject({ error: 'quote_invalid' });
    expect(await runCodeQuote(d, { userId: U, request: q.request, token: `${q.token}x` }, sig)).toMatchObject({ error: 'quote_invalid' });
    advance(31 * 60 * 1000);
    expect(await runCodeQuote(d, { userId: U, request: q.request, token: q.token }, sig)).toMatchObject({ error: 'quote_expired' });
    expect(runs).toHaveLength(0);
  });

  it('fails closed: no run when the duplicate guard cannot answer, and no burned quote when the host is off', async () => {
    const off = deps({ enabled: () => false });
    const q1 = quoteCodeRun(off.d, { userId: U, request: { language: 'python', code: 'print(1)' } });
    if (!q1.ok) throw new Error('quote');
    expect(await runCodeQuote(off.d, { userId: U, request: q1.request, token: q1.token }, sig)).toMatchObject({ error: 'sandbox_disabled' });

    const down = deps({ claim: async () => 'unavailable' });
    const q2 = quoteCodeRun(down.d, { userId: U, request: { language: 'python', code: 'print(1)' } });
    if (!q2.ok) throw new Error('quote');
    expect(await runCodeQuote(down.d, { userId: U, request: q2.request, token: q2.token }, sig)).toMatchObject({ error: 'guard_unavailable' });
    expect(down.runs).toHaveLength(0);
  });

  it('passes a runner refusal through (the $20 ledger is full)', async () => {
    const full: SandboxRunner = { run: async () => ({ ok: false, error: 'refused', message: 'Sandbox budget of $20 is used up.' }) };
    const { d } = deps({ runner: () => full });
    const q = quoteCodeRun(d, { userId: U, request: { language: 'python', code: 'print(1)' } });
    if (!q.ok) throw new Error('quote');
    expect(await runCodeQuote(d, { userId: U, request: q.request, token: q.token }, sig)).toEqual({ ok: false, error: 'refused', message: 'Sandbox budget of $20 is used up.' });
  });

  describe('workspace run', () => {
    async function wsSetup() {
      const store = workspaceStore(memoryBlobs());
      const w = await store.create(U, 'Agent G');
      if (!w.ok) throw new Error('create');
      await store.write(U, w.workspace.id, 'data/in.csv', Buffer.from('a,b\n1,2\n'), 'user');
      await store.write(U, w.workspace.id, 'notes.txt', Buffer.from('keep'), 'user');
      const seen: SandboxIO[] = [];
      const runner: SandboxRunner = {
        async run(_plan, _sig, io) {
          seen.push(io!);
          return {
            ok: true, exitCode: 0, stdout: 'ok\n', stderr: '', outputs: [], wallMs: 10,
            collected: [
              { path: 'out/chart.png', bytes: Buffer.from('png') },
              { path: 'notes.txt', bytes: Buffer.from('keep') },
            ],
            skipped: ['huge.bin (over 10 MB)'],
          };
        },
      };
      const { d } = deps({ runner: () => runner, workspace: () => store });
      return { store, id: w.workspace.id, d, seen };
    }

    it('binds the workspace into the signed plan: another workspace is a changed plan', async () => {
      const { d, id } = await wsSetup();
      const q = quoteCodeRun(d, { userId: U, request: { language: 'python', code: 'x', workspaceId: id } });
      if (!q.ok) throw new Error(q.message);
      expect(q.quote.workspaceId).toBe(id);
      const r = await runCodeQuote(d, { userId: U, request: { language: 'python', code: 'x', workspaceId: 'ws_another1' }, token: q.token }, sig);
      expect(r).toMatchObject({ ok: false, error: 'quote_changed' });
    });

    it('puts the live files in, saves what the program wrote as versions of this run, lists only real changes', async () => {
      const { d, id, store, seen } = await wsSetup();
      const request = { language: 'python', code: 'x', workspaceId: id };
      const q = quoteCodeRun(d, { userId: U, request });
      if (!q.ok) throw new Error(q.message);
      const r = await runCodeQuote(d, { userId: U, request, token: q.token }, sig);
      if (!r.ok) throw new Error(r.message);
      expect(seen[0]!.inputs.map((f) => f.path)).toEqual(['data/in.csv', 'notes.txt']);
      expect(seen[0]!.accept('../x')).toBe(false);
      expect(r.workspace!.written.map((f) => [f.path, f.by])).toEqual([['out/chart.png', `run:${q.quote.jobId}`]]);
      expect(r.workspace!.skipped).toEqual(['huge.bin (over 10 MB)']);
      const l = await store.files(U, id);
      expect(l.ok && l.files.map((f) => f.path)).toEqual(['data/in.csv', 'notes.txt', 'out/chart.png']);
    });

    it('an unknown workspace runs nothing; no store configured refuses the quote', async () => {
      const { d } = await wsSetup();
      const request = { language: 'python', code: 'x', workspaceId: 'ws_missing1' };
      const q = quoteCodeRun(d, { userId: U, request });
      if (!q.ok) throw new Error(q.message);
      expect(await runCodeQuote(d, { userId: U, request, token: q.token }, sig)).toMatchObject({ ok: false, error: 'bad_input' });
      const { d: bare } = deps();
      expect(quoteCodeRun(bare, { userId: U, request })).toMatchObject({ ok: false, error: 'not_configured' });
    });
  });
});
