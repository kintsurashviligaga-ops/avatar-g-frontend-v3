/** @jest-environment node */
jest.mock('./report-error', () => ({ reportError: jest.fn() }));
import { claimedUserId, withFeatureLog } from './featureLog';
import { reportError } from './report-error';

const UID = '3f1c2a9e-1111-4222-8333-444455556666';
const jwt = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.sig`;
const cookieFor = (sub: string) => {
  const session = Buffer.from(JSON.stringify({ access_token: jwt(sub) })).toString('base64');
  const v = `base64-${session}`;
  return `other=1; sb-abcref-auth-token.0=${v.slice(0, 20)}; sb-abcref-auth-token.1=${v.slice(20)}`;
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());
const lines = () => warn.mock.calls.filter((c) => c[0] === '[feature-error]').map((c) => JSON.parse(c[1] as string));

describe('claimedUserId', () => {
  it('reads a chunked base64 Supabase cookie', () => {
    expect(claimedUserId(new Request('https://x/api', { headers: { cookie: cookieFor(UID) } }))).toBe(UID);
  });
  it('reads a Bearer token', () => {
    expect(claimedUserId(new Request('https://x/api', { headers: { authorization: `Bearer ${jwt(UID)}` } }))).toBe(UID);
  });
  it('gives up quietly on junk', () => {
    expect(claimedUserId(new Request('https://x/api', { headers: { cookie: 'sb-abc-auth-token=%%%' } }))).toBeUndefined();
    expect(claimedUserId(new Request('https://x/api'))).toBeUndefined();
  });
});

describe('withFeatureLog', () => {
  it('logs a failure with feature, route, status, code, user and task', async () => {
    const h = withFeatureLog('studio3d', async () => json(429, { error: 'user_busy', id: 'job_123456' }));
    const res = await h(new Request('https://x/api/studio3d', { method: 'POST', headers: { cookie: cookieFor(UID) } }), undefined);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'user_busy', id: 'job_123456' }); // the body is still readable
    expect(lines()).toEqual([expect.objectContaining({ feature: 'studio3d', route: '/api/studio3d', method: 'POST', status: 429, code: 'user_busy', userId: UID, taskId: 'job_123456' })]);
  });
  it('takes the task id from the route params and a nested error code', async () => {
    const h = withFeatureLog('art', async () => json(503, { error: { code: 'DAILY_BUDGET_EXCEEDED' } }));
    await h(new Request('https://x/api/a/run_abcdef'), { params: { id: 'run_abcdef' } });
    expect(lines()[0]).toMatchObject({ code: 'DAILY_BUDGET_EXCEEDED', taskId: 'run_abcdef' });
  });
  it('stays quiet on success, 401 and the flag-off 404', async () => {
    for (const s of [200, 201, 401, 404]) await withFeatureLog('f', async () => json(s, {}))(new Request('https://x/a'), undefined);
    expect(lines()).toEqual([]);
  });
  it('logs a throw, reports it and re-throws it unchanged', async () => {
    const boom = new Error('boom');
    const h = withFeatureLog('f', async () => {
      throw boom;
    });
    await expect(h(new Request('https://x/a'), undefined)).rejects.toBe(boom);
    expect(lines()[0]).toMatchObject({ status: 500, code: 'thrown' });
    expect(reportError).toHaveBeenCalledWith(boom, expect.objectContaining({ feature: 'f' }));
  });
  it('never writes the body, cookie or token', async () => {
    const h = withFeatureLog('f', async () => json(400, { error: 'bad', message: 'secret prompt text' }));
    await h(new Request('https://x/a', { headers: { cookie: cookieFor(UID) } }), undefined);
    const out = JSON.stringify(warn.mock.calls);
    expect(out).not.toContain('secret prompt text');
    expect(out).not.toContain('auth-token');
  });
});
