/** @jest-environment node */
jest.mock('server-only', () => ({}));
import { BROWSER_DENY_SUBNETS } from './runner';
import { BROWSER_WORKDIR, vercelBrowserHost, type BrowserCreateParams } from './vercelHost';

test('starts from the snapshot with no env, public sites allowed and private ranges denied; paths stay in the browser folder', async () => {
  const seen: BrowserCreateParams[] = [];
  const writes: string[] = [];
  const runs: Array<{ cmd: string; cwd: string; env: Record<string, string> }> = [];
  let stopped = 0;
  const host = vercelBrowserHost('snap_TEST123', async (p) => {
    seen.push(p);
    return {
      async writeFiles(files) { writes.push(...files.map((f) => f.path)); },
      async readFileToBuffer({ path }) { return path.endsWith('result.json') ? Buffer.from('{}') : null; },
      async runCommand({ cmd, cwd, env }) { runs.push({ cmd, cwd, env }); return { exitCode: 0, stdout: async () => 'o', stderr: async () => '' }; },
      async stop() { stopped++; },
    };
  });
  const h = await host.create({ vcpus: 2, timeoutMs: 180_000, denySubnets: BROWSER_DENY_SUBNETS });
  expect(seen[0]).toEqual({
    source: { type: 'snapshot', snapshotId: 'snap_TEST123' },
    resources: { vcpus: 2 },
    timeout: 180_000,
    networkPolicy: { allow: ['*'], subnets: { deny: [...BROWSER_DENY_SUBNETS] } },
    env: {},
  });
  await h.writeFile('task.json', '{}');
  expect(writes).toEqual([`${BROWSER_WORKDIR}/task.json`]);
  expect((await h.readBytes('result.json'))?.toString()).toBe('{}');
  expect(await h.exec('node', ['run.mjs'], new AbortController().signal)).toEqual({ exitCode: 0, stdout: 'o', stderr: '' });
  expect(runs).toEqual([{ cmd: 'node', cwd: BROWSER_WORKDIR, env: {} }]);
  await h.stop();
  expect(stopped).toBe(1);
});
