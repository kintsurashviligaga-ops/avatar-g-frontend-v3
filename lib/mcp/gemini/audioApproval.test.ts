/** @jest-environment node */
import { requestOrExecuteAudio } from './audioApproval';
import { createServiceRoleClient } from '../../supabase/server';
import { quoteMusic, startMusic } from '../../music/studio/engine';

jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../music/studio/engine', () => ({ quoteMusic: jest.fn(), startMusic: jest.fn(), workMusic: jest.fn() }));
jest.mock('../../music/studio/live', () => ({ liveMusicDeps: () => ({}) }));
jest.mock('../../music/studio/capabilities', () => ({ musicStudioEnabled: () => true, CLIP_MODEL: 'test-model' }));
jest.mock('../../server/serviceSwitches', () => ({ serviceOffResponse: async () => null }));
jest.mock('../../env/previewIsolation', () => ({ paidWritesBlockedOnPreview: () => false }));
jest.mock('../../platform/afterResponse', () => ({ runAfterResponse: () => true }));
jest.mock('../../agent/media/montageLive', () => ({ newWorkerId: () => 'worker' }));

const principal = { userId: 'user-a', clientId: 'client-a', scopes: ['mcp:read', 'mcp:write'] };
const request = { kind: 'audio', script: 'Test instrumental music' };
const body = (result: Awaited<ReturnType<typeof requestOrExecuteAudio>>) => JSON.parse(result.content[0].text);
afterEach(() => { delete process.env.MCP_AUDIO_GENERATION_ENABLED; jest.resetAllMocks(); });

test('disabled audio and missing write scope cannot issue a quote or a paid job', async () => {
  expect(body(await requestOrExecuteAudio({ ...request, confirmed: true }, principal)).error).toBe('generation_unavailable');
  process.env.MCP_AUDIO_GENERATION_ENABLED = 'true';
  expect(body(await requestOrExecuteAudio(request, { ...principal, scopes: ['mcp:read'] })).error).toBe('insufficient_scope');
  expect(createServiceRoleClient).not.toHaveBeenCalled();
  expect(quoteMusic).not.toHaveBeenCalled();
  expect(startMusic).not.toHaveBeenCalled();
});

test('a model supplied confirmation only creates an approval request with the real quote', async () => {
  process.env.MCP_AUDIO_GENERATION_ENABLED = 'true';
  const insert = jest.fn(async () => ({ error: null }));
  (createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ insert }) });
  (quoteMusic as jest.Mock).mockResolvedValue({ expiresAt: Date.now() + 600_000, credits: 7, plan: { request }, token: 'signed-quote' });
  const result = body(await requestOrExecuteAudio({ ...request, confirmed: true }, principal));
  expect(result.status).toBe('approval_required');
  expect(result.quotedCredits).toBe(7);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: principal.userId, client_id: principal.clientId, quoted_credits: 7 }));
  expect(startMusic).not.toHaveBeenCalled();
});

test('one approval is consumed atomically before starting the quoted job; a replay cannot start it twice', async () => {
  process.env.MCP_AUDIO_GENERATION_ENABLED = 'true';
  let available = true;
  const query = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), gt: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), maybeSingle: jest.fn(async () => { const data = available ? { request: { plan: { safe: true }, quoteToken: 'signed-quote' } } : null; available = false; return { data, error: null }; }) };
  (createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => query });
  (startMusic as jest.Mock).mockResolvedValue({ status: 'queued', jobId: 'job-a' });
  const withApproval = { ...request, approvalId: '00000000-0000-4000-8000-000000000001' };
  expect(body(await requestOrExecuteAudio(withApproval, principal))).toEqual({ status: 'queued', jobId: 'job-a' });
  expect(body(await requestOrExecuteAudio(withApproval, principal)).error).toBe('approval_invalid');
  expect(startMusic).toHaveBeenCalledTimes(1);
  expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a');
  expect(query.eq).toHaveBeenCalledWith('client_id', 'client-a');
  expect(query.eq).toHaveBeenCalledWith('state', 'approved');
});
