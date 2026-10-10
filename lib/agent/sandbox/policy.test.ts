/** @jest-environment node */
/**
 * The sandbox contract (lib/agent/sandbox/policy): python or node only, limits that can only go down, no network
 * unless a host is on the (empty) allowlist, no secrets, and a runner that refuses until an isolated host exists.
 */
import { SANDBOX_EGRESS_ALLOWLIST, SANDBOX_MAX, checkSandboxJob, disabledSandbox } from './policy';

const job = { language: 'python', code: 'print(1)' };

test('a plain job gets the maximum limits, no network and an empty environment', () => {
  expect(checkSandboxJob(job)).toEqual({
    ok: true,
    plan: { language: 'python', code: 'print(1)', files: [], limits: { ...SANDBOX_MAX }, egress: [], env: {} },
  });
});

test('only python or node, and real code of bounded size', () => {
  for (const language of ['bash', 'sh', 'ruby', undefined, 'Python']) {
    expect(checkSandboxJob({ ...job, language })).toEqual({ ok: false, error: 'language: python or node only' });
  }
  expect(checkSandboxJob({ ...job, code: '  ' })).toMatchObject({ ok: false });
  expect(checkSandboxJob({ ...job, code: 'x'.repeat(64 * 1024 + 1) })).toMatchObject({ ok: false, error: expect.stringMatching(/^code: over/) });
});

test('limits may go down, never up, and only the known ones', () => {
  const r = checkSandboxJob({ ...job, language: 'node', limits: { wallSec: 30, memoryMb: 512 } });
  expect(r.ok && r.plan.limits).toMatchObject({ wallSec: 30, memoryMb: 512, cpus: SANDBOX_MAX.cpus });
  expect(checkSandboxJob({ ...job, limits: { wallSec: 301 } })).toMatchObject({ ok: false, error: 'limits: wallSec is over 300' });
  expect(checkSandboxJob({ ...job, limits: { memoryMb: -1 } })).toMatchObject({ ok: false });
  expect(checkSandboxJob({ ...job, limits: { gpu: 1 } })).toMatchObject({ ok: false, error: 'limits: unknown gpu' });
});

test('the network is denied: the allowlist is empty, so any host is refused; an allowlisted host passes', () => {
  expect(SANDBOX_EGRESS_ALLOWLIST).toEqual([]);
  expect(checkSandboxJob({ ...job, egress: ['pypi.org'] })).toEqual({ ok: false, error: 'egress: not allowed (pypi.org)' });
  expect(checkSandboxJob({ ...job, egress: 'pypi.org' })).toMatchObject({ ok: false });
  const allowed = checkSandboxJob({ ...job, egress: ['API.Example.com'] }, ['api.example.com']);
  expect(allowed.ok && allowed.plan.egress).toEqual(['api.example.com']);
});

test('input files: a bounded list of paths', () => {
  expect(checkSandboxJob({ ...job, files: ['u/a.mp4'] })).toMatchObject({ ok: true, plan: { files: ['u/a.mp4'] } });
  expect(checkSandboxJob({ ...job, files: [''] })).toMatchObject({ ok: false });
  expect(checkSandboxJob({ ...job, files: Array(11).fill('u/a') })).toMatchObject({ ok: false, error: 'files: at most 10' });
});

test('the only runner refuses every job', async () => {
  const r = checkSandboxJob(job);
  if (!r.ok) throw new Error(r.error);
  await expect(disabledSandbox.run(r.plan, new AbortController().signal)).resolves.toMatchObject({ ok: false, error: 'sandbox_disabled' });
});
