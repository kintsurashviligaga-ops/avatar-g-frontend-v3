/** @jest-environment node */
import { requestOrExecuteVideo, videoRequestHash } from './videoApproval';

jest.mock('server-only', () => ({}));
const principal = { userId: 'owner', clientId: 'client', token: 'token', scopes: ['mcp:read', 'mcp:write'] };
const request = { kind: 'video' as const, script: 'A short test', avatarId: '550e8400-e29b-41d4-a716-446655440000', aspectRatio: '9:16' };
afterEach(() => { delete process.env.MCP_VIDEO_GENERATION_ENABLED; });

test.each([undefined, 'true'])('legacy video stays fail-closed even when feature flag is %s', async (flag) => {
  if (flag) process.env.MCP_VIDEO_GENERATION_ENABLED = flag;
  const result = await requestOrExecuteVideo({ ...request, confirmed: true, approvalId: '00000000-0000-4000-8000-000000000001' }, principal);
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).error).toBe('generation_unavailable');
});

test('future approval binding changes when the requested video changes', () => {
  expect(videoRequestHash(request)).not.toBe(videoRequestHash({ ...request, script: 'A different test' }));
  expect(videoRequestHash(request)).not.toBe(videoRequestHash({ ...request, aspectRatio: '16:9' }));
});
