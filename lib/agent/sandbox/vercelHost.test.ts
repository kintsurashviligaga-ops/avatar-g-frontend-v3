/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { vercelHost, type VercelCreate } from './vercelHost';
import { getSandboxRunner } from './index';
import { disabledSandbox } from './policy';

function fakeCreate() {
  const seen: { params?: Parameters<VercelCreate>[0]; files: unknown[]; cmds: unknown[]; stopped: number } = { files: [], cmds: [], stopped: 0 };
  const create: VercelCreate = async (params) => {
    seen.params = params;
    return {
      async writeFiles(f) {
        seen.files.push(...f);
      },
      async runCommand(p) {
        seen.cmds.push({ cmd: p.cmd, args: p.args, cwd: p.cwd, env: p.env });
        return { exitCode: 0, stdout: async () => 'hi\n', stderr: async () => '' };
      },
      async stop() {
        seen.stopped++;
      },
    };
  };
  return { create, seen };
}

describe('vercelHost', () => {
  it('creates a deny-all, env-free sandbox on the managed runtime and runs in the workdir', async () => {
    const { create, seen } = fakeCreate();
    const h = await vercelHost(create).create({ language: 'python', vcpus: 2, memoryMb: 2048, timeoutMs: 300_000, allowedDomains: [], env: {} });
    expect(seen.params).toEqual({ runtime: 'python3.13', resources: { vcpus: 2 }, timeout: 300_000, networkPolicy: 'deny-all', env: {} });
    await h.writeFile('main.py', 'print(1)');
    expect(seen.files).toEqual([{ path: '/vercel/sandbox/main.py', content: 'print(1)' }]);
    expect(await h.exec('python3', ['main.py'], new AbortController().signal)).toEqual({ exitCode: 0, stdout: 'hi\n', stderr: '' });
    expect(seen.cmds).toEqual([{ cmd: 'python3', args: ['main.py'], cwd: '/vercel/sandbox', env: {} }]);
    await h.stop();
    expect(seen.stopped).toBe(1);
  });

  it('allows only the named hosts when the plan has egress', async () => {
    const { create, seen } = fakeCreate();
    await vercelHost(create).create({ language: 'node', vcpus: 1, memoryMb: 512, timeoutMs: 1000, allowedDomains: ['example.com'], env: {} });
    expect(seen.params?.networkPolicy).toEqual({ allow: ['example.com'] });
    expect(seen.params?.runtime).toBe('node24');
  });
});

describe('getSandboxRunner', () => {
  it('is the disabled runner unless SANDBOX_ENABLED=1', () => {
    expect(getSandboxRunner(null, {} as NodeJS.ProcessEnv)).toBe(disabledSandbox);
    expect(getSandboxRunner(null, { SANDBOX_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(disabledSandbox);
    expect(getSandboxRunner(null, { SANDBOX_ENABLED: '1' } as unknown as NodeJS.ProcessEnv)).not.toBe(disabledSandbox);
  });
});
