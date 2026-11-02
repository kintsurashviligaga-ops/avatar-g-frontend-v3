/** @jest-environment node */
import { authenticateMcp } from './auth';
const getUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser } }) }));
const req = (auth?: string) => new Request('https://myavatar.ge/api/mcp/gemini', { headers: auth ? { authorization: auth } : { cookie: 'session=untrusted' } });
beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'; });
afterEach(() => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; jest.clearAllMocks(); });
test('requires an explicit bearer and never accepts cookies as credentials', async () => {
  expect(await authenticateMcp(req())).toBeNull();
  expect(await authenticateMcp(req('Basic aaa'))).toBeNull();
  expect(getUser).not.toHaveBeenCalled();
});
test('rejects invalid tokens and binds verified user identity to the token', async () => {
  getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid') });
  expect(await authenticateMcp(req('Bearer bad'))).toBeNull();
  getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
  expect(await authenticateMcp(req('Bearer good'))).toEqual({ userId: 'user-1', token: 'good' });
  expect(getUser).toHaveBeenLastCalledWith('good');
});
test('fails closed on authentication outages and missing config', async () => {
  getUser.mockRejectedValueOnce(new Error('offline'));
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  expect(await authenticateMcp(req('Bearer token'))).toBeNull();
});
