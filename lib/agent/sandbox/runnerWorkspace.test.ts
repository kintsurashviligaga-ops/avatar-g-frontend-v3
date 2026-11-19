/** @jest-environment node */
import { checkSandboxJob, type SandboxIO } from './policy';
import { memorySpendStore } from './budget';
import { collectCommand, hostRunner, pickOutputs, type SandboxHost } from './runner';
import { normalizeWsPath } from '@/lib/agent/workspace/paths';

const io = (inputs: SandboxIO['inputs'] = []): SandboxIO => ({ inputs, maxFiles: 3, maxFileBytes: 100, accept: (p) => normalizeWsPath(p) === p });

/** A sandbox as a Map: files written by "the program" are whatever `program` adds. */
function mapHost(program: (fs: Map<string, Buffer>) => void, opts: { noBytes?: boolean } = {}) {
  const fs = new Map<string, Buffer>();
  const cmds: string[][] = [];
  const order: string[] = [];
  let marked = false;
  const after = new Set<string>();
  const host: SandboxHost = {
    async create() {
      const h = {
        async writeFile(p: string, c: string) {
          order.push(p);
          fs.set(p, Buffer.from(c));
          if (p === '.ws_start') marked = true;
        },
        async writeBytes(p: string, b: Buffer) { order.push(p); fs.set(p, b); },
        async readBytes(p: string) { return fs.get(p) ?? null; },
        async exec(cmd: string, args: string[]) {
          cmds.push([cmd, ...args]);
          if (cmd === 'find') {
            return { exitCode: 0, stdout: [...after].map((p) => `${fs.get(p)!.length}\t${p}`).join('\n') + '\n', stderr: '' };
          }
          if (cmd === 'python3' || cmd === 'bash' || cmd === 'node') {
            const before = new Map(fs);
            program(fs);
            for (const [p, b] of fs) if (marked && before.get(p) !== b) after.add(p);
            return { exitCode: 0, stdout: 'done\n', stderr: '' };
          }
          return { exitCode: 0, stdout: '', stderr: '' };
        },
        async stop() { /* */ },
      };
      if (opts.noBytes) return { writeFile: h.writeFile, exec: h.exec, stop: h.stop };
      return h;
    },
  };
  return { host, fs, cmds, order };
}

function plan(language = 'python') {
  const c = checkSandboxJob({ language, code: 'x' });
  if (!c.ok) throw new Error(c.error);
  return c.plan;
}

describe('workspace run', () => {
  it('writes the inputs, then the marker, then the program under a name no workspace file can take', async () => {
    const { host, order, cmds } = mapHost(() => undefined);
    const r = await hostRunner(host, memorySpendStore(0)).run(plan(), new AbortController().signal, io([{ path: 'data/in.csv', bytes: Buffer.from('a') }, { path: 'main.py', bytes: Buffer.from('mine') }]));
    expect(r.ok).toBe(true);
    expect(order).toEqual(['data/in.csv', 'main.py', '.ws_start', '.ws_main.py']);
    expect(cmds[0]).toEqual(['mkdir', '-p', 'data']);
    expect(cmds).toContainEqual(['python3', '.ws_main.py']);
  });

  it('brings back what the program wrote (new and changed files), not what it only read', async () => {
    const { host } = mapHost((fs) => {
      fs.set('out/chart.png', Buffer.from('png'));
      fs.set('data/in.csv', Buffer.from('a,b'));
    });
    const r = await hostRunner(host, memorySpendStore(0)).run(plan(), new AbortController().signal, io([{ path: 'data/in.csv', bytes: Buffer.from('a') }, { path: 'keep.txt', bytes: Buffer.from('k') }]));
    if (!r.ok) throw new Error(r.message);
    expect(r.collected!.map((f) => f.path).sort()).toEqual(['data/in.csv', 'out/chart.png']);
    expect(r.outputs.sort()).toEqual(['data/in.csv', 'out/chart.png']);
    expect(r.skipped).toEqual([]);
  });

  it('a shell script runs with bash', async () => {
    const { host, cmds } = mapHost(() => undefined);
    await hostRunner(host, memorySpendStore(0)).run(plan('shell'), new AbortController().signal, io());
    expect(cmds).toContainEqual(['bash', '.ws_main.sh']);
  });

  it('refuses a workspace run on a host that cannot carry bytes, and still stops it', async () => {
    const { host } = mapHost(() => undefined, { noBytes: true });
    const r = await hostRunner(host, memorySpendStore(0)).run(plan(), new AbortController().signal, io());
    expect(r).toEqual({ ok: false, error: 'runner_failed', message: 'This sandbox host cannot carry workspace files.' });
  });

  it('a run without a workspace is unchanged: main.py, no marker, no listing', async () => {
    const { host, order, cmds } = mapHost(() => undefined);
    const r = await hostRunner(host, memorySpendStore(0)).run(plan(), new AbortController().signal);
    expect(order).toEqual(['main.py']);
    expect(cmds.map((c) => c[0])).toEqual(['python3']);
    expect(r.ok && r.collected).toBeUndefined();
  });
});

describe('pickOutputs', () => {
  it('keeps workspace names within the limits and says why the rest stayed behind', () => {
    const listing = ['5\ta.csv', '500\tbig.bin', '1\t.ws_start', '1\t../x', '1\tb.txt', '1\tc.txt', '1\td.txt', 'junk', ''].join('\n');
    const p = pickOutputs(listing, io());
    expect(p.take.map((t) => t.path)).toEqual(['a.csv', 'b.txt', 'c.txt']);
    expect(p.skipped).toEqual(['big.bin (over 0 MB)', '../x (name not allowed)', 'd.txt (more than 3 files)']);
  });

  it('the listing prunes tool caches and lists only files newer than the marker', () => {
    const c = collectCommand();
    expect(c.cmd).toBe('find');
    expect(c.args).toEqual(expect.arrayContaining(['__pycache__', 'node_modules', '-prune', '-newer', '.ws_start', '-type', 'f']));
  });
});
