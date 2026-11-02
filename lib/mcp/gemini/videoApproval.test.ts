/** @jest-environment node */
import { requestOrExecuteVideo, videoRequestHash } from './videoApproval';
import { createServiceRoleClient } from '../../supabase/server';
import { POST as generateVideo } from '../../../app/api/video/generate/route';

jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../billing/plans', () => ({ getCreditCost: () => 20 }));
jest.mock('../../../app/api/video/generate/route', () => ({ POST: jest.fn() }));

const principal = { userId: 'owner', clientId: 'client', token: 'token', scopes: ['mcp:read', 'mcp:write'] };
const request = { kind: 'video' as const, script: 'A short test', avatarId: '550e8400-e29b-41d4-a716-446655440000', aspectRatio: '9:16' };
const errorOf = (result: Awaited<ReturnType<typeof requestOrExecuteVideo>>) => JSON.parse(result.content[0].text).error;

afterEach(() => { delete process.env.MCP_VIDEO_GENERATION_ENABLED; jest.resetAllMocks(); });

test('a model confirmation cannot start a paid action while the feature is disabled', async () => {
  const result = await requestOrExecuteVideo({ ...request, confirmed: true }, principal);
  expect(errorOf(result)).toBe('generation_unavailable');
  expect(createServiceRoleClient).not.toHaveBeenCalled();
  expect(generateVideo).not.toHaveBeenCalled();
});

test('write scope is required before an approval can be created', async () => {
  process.env.MCP_VIDEO_GENERATION_ENABLED = 'true';
  const result = await requestOrExecuteVideo(request, { ...principal, scopes: ['mcp:read'] });
  expect(errorOf(result)).toBe('insufficient_scope');
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('an approval binds the exact avatar, script and aspect ratio', () => {
  expect(videoRequestHash(request)).not.toBe(videoRequestHash({ ...request, script: 'A different test' }));
  expect(videoRequestHash(request)).not.toBe(videoRequestHash({ ...request, aspectRatio: '16:9' }));
});

test('the same approved request can be consumed at most once', async () => {
  process.env.MCP_VIDEO_GENERATION_ENABLED = 'true';
  let available = true;
  const query = {
    update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(async () => {
      const data = available ? { id: 'approval' } : null;
      available = false;
      return { data, error: null };
    }),
  };
  (createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => query });
  (generateVideo as jest.Mock).mockResolvedValue(Response.json({ data: { job: { id: 'job' } } }));
  const approved = { ...request, approvalId: '00000000-0000-4000-8000-000000000001' };
  const first = await requestOrExecuteVideo(approved, principal);
  const second = await requestOrExecuteVideo(approved, principal);
  expect(first.isError).toBeUndefined();
  expect(errorOf(second)).toBe('approval_invalid');
  expect(generateVideo).toHaveBeenCalledTimes(1);
  expect(query.eq).toHaveBeenCalledWith('user_id', principal.userId);
  expect(query.eq).toHaveBeenCalledWith('client_id', principal.clientId);
  expect(query.eq).toHaveBeenCalledWith('request_hash', videoRequestHash(request));
  expect(query.eq).toHaveBeenCalledWith('state', 'approved');
});
