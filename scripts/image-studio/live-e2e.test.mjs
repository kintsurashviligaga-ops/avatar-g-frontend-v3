import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { createHash } from 'node:crypto';
import { run, configuration } from './live-e2e.mjs';

const directory = mkdtempSync(join(tmpdir(), 'image-harness-'));
after(() => rmSync(directory, { recursive: true }));
const env = { IMAGE_E2E_ENVIRONMENT: 'isolated', IMAGE_E2E_APP_ORIGIN: 'http://127.0.0.1:3147',
  IMAGE_E2E_SUPABASE_ORIGIN: 'https://isolated.supabase.co', IMAGE_E2E_PROJECT_REF: 'isolated',
  IMAGE_E2E_ANON_KEY: 'test-anon', IMAGE_E2E_SERVICE_KEY: 'test-service',
  IMAGE_E2E_USER_A_TOKEN: 'test-a', IMAGE_E2E_USER_B_TOKEN: 'test-b' };

test('default configuration mode makes zero requests', async () => {
  const report = await run(env, 'config', () => { throw new Error('Network forbidden'); });
  assert.equal(report.paidJobsSubmitted, 0);
});
test('missing environment and absent paid approval fail before network', async () => {
  for (const [input, mode] of [[{}, 'config'], [env, 'paid']]) {
    await assert.rejects(run(input, mode, () => { throw new Error('Network forbidden'); }), /BLOCKED|approval/);
  }
  assert.throws(() => configuration({ ...env, IMAGE_E2E_APP_ORIGIN: 'https://myavatar.ge' }, 'preflight'), /Production/);
  assert.throws(() => configuration({ ...env, IMAGE_E2E_PROJECT_REF: 'different' }, 'preflight'), /Project reference/);
});

function service() {
  const calls = [], jobs = new Map(); let balance = 20, n = 0;
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  const digest = createHash('sha256').update(png).digest('hex');
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input), body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: url.pathname, method: init.method || 'GET' });
    const other = init.headers?.Authorization === 'Bearer test-b';
    if (url.pathname === '/auth/v1/user') return json({ id: other ? 'b' : 'a' });
    if (url.pathname === '/storage/v1/bucket/renders') return json({ public: false });
    if (url.pathname === '/rest/v1/profiles') return json([{ credits_balance: balance }]);
    if (url.pathname === '/rest/v1/generation_jobs') return json([]);
    if (url.pathname === '/api/image/models') return json({ userId: 'a', models: [{ id: 'gemini-3.1-flash-image' }] });
    if (url.pathname === '/api/image/jobs/quote') return json({ ok: true, requiresConfirmation: true, jobId: 'job-' + ++n,
      credits: 2, token: 'signature-' + n, plan: { request: body } });
    if (url.pathname === '/api/image/jobs') {
      const id = 'job-' + body.token.split('-').at(-1), replay = jobs.has(id);
      if (!replay) { balance -= 2; jobs.set(id, body.plan.request); }
      return json({ jobId: id }, replay ? 200 : 202);
    }
    if (url.pathname.startsWith('/api/image/jobs/')) return json(other ? {} : { status: 'completed' }, other ? 404 : 200);
    if (url.pathname.startsWith('/api/image/assets/')) {
      if (other) return json({}, 404);
      const id = url.pathname.split('/')[4], request = jobs.get(id);
      if (url.pathname.endsWith('/versions')) return json({ current: { id, parentJobId: request.parentJobId ?? null } });
      return json({ id, image: { digest, url: 'https://isolated.supabase.co/storage/v1/object/sign/renders/image-studio/a/' + id } });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return new Response(png);
    if (url.pathname === '/rest/v1/credit_ledger') return json([{ delta: -2 }]);
    if (url.pathname === '/api/studio/library') return json({ items: [...jobs.keys()].map(id => ({ id })) });
    throw new Error('Unexpected request ' + url.pathname);
  };
  return { calls, fetchImpl };
}
test('preflight is GET-only and does not quote or confirm', async () => {
  const mock = service(); const report = await run(env, 'preflight', mock.fetchImpl);
  assert.equal(report.status, 'PREFLIGHT_PASS_NOT_E2E');
  assert(mock.calls.every(call => call.method === 'GET'));
  assert(!mock.calls.some(call => call.path.includes('/jobs')));
});
test('explicit paid harness handles initial 202, replay 200, two jobs and private lineage', async () => {
  const mock = service();
  const report = await run({ ...env, IMAGE_E2E_PAID_APPROVAL: 'explicit-owner-approval', IMAGE_E2E_MAX_CREDITS: '4', IMAGE_E2E_REPORT: join(directory, 'paid.json') }, 'paid', mock.fetchImpl);
  assert.equal(report.paidJobsSubmitted, 2);
  assert.equal(report.status, 'LIVE_TECHNICAL_PASS_VISUAL_REVIEW_REQUIRED');
  assert.equal(mock.calls.filter(call => call.path === '/api/image/jobs').length, 4);
});
test('a quote over the credit budget is never confirmed', async () => {
  const mock = service();
  await assert.rejects(run({ ...env, IMAGE_E2E_PAID_APPROVAL: 'explicit-owner-approval', IMAGE_E2E_MAX_CREDITS: '1', IMAGE_E2E_REPORT: join(directory, 'budget.json') }, 'paid', mock.fetchImpl), /credit cap/);
  assert(!mock.calls.some(call => call.path === '/api/image/jobs'));
});
