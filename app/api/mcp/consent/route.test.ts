/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { createServerClient, createServiceRoleClient } from '../../../../lib/supabase/server';

jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ createServerClient: jest.fn(), createServiceRoleClient: jest.fn() }));
const id = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  process.env.MCP_VIDEO_GENERATION_ENABLED = 'true';
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) } });
});
afterEach(() => { delete process.env.MCP_VIDEO_GENERATION_ENABLED; jest.resetAllMocks(); });

test('rejects cross-origin approval without touching the database', async () => {
  const req = new NextRequest('https://myavatar.ge/api/mcp/consent', { method: 'POST', headers: { origin: 'https://evil.example' }, body: new URLSearchParams({ id, decision: 'approve' }) });
  expect((await POST(req)).status).toBe(403);
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('requires a signed-in first-party user', async () => {
  (createServerClient as jest.Mock).mockReturnValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
  expect((await GET(new NextRequest(`https://myavatar.ge/api/mcp/consent?id=${id}`))).status).toBe(401);
  expect(createServiceRoleClient).not.toHaveBeenCalled();
});

test('renders the requested script escaped and scopes the approval lookup to the user', async () => {
  const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), gt: jest.fn().mockReturnThis(), maybeSingle: jest.fn(async () => ({ data: { id, quoted_credits: 20, expires_at: '2099-01-01', request: { kind: 'video', script: '<script>x</script>', avatarId: id, aspectRatio: '9:16' } }, error: null })) };
  (createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => query });
  const res = await GET(new NextRequest(`https://myavatar.ge/api/mcp/consent?id=${id}`));
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('&lt;script&gt;');
  expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a');
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
});
