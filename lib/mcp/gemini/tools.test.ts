import { executeMcpTool } from './tools';
import { createClient } from '@supabase/supabase-js';
import { generateAgentGPersonalityReply } from '../../agentg/personality';
import { checkRateLimitByKey } from '../../api/rate-limit';

jest.mock('server-only', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../agentg/personality', () => ({ generateAgentGPersonalityReply: jest.fn() }));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(), RATE_LIMITS: { CHAT_USER: {} } }));
jest.mock('../../env/public', () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key' } }));

const principal = { userId: 'user-a', token: 'session-token' };
const content = (result: Awaited<ReturnType<typeof executeMcpTool>>) => JSON.parse(result.content[0].text);

beforeEach(() => jest.resetAllMocks());

test('charges chat to the authenticated user and honors the account limit', async () => {
  (checkRateLimitByKey as jest.Mock).mockResolvedValue(null);
  (generateAgentGPersonalityReply as jest.Mock).mockResolvedValue({ replyText: 'Hello' });
  const result = await executeMcpTool('chat_with_agent', { message: ' hi ', locale: 'en', userId: 'other' }, principal);
  expect(content(result)).toEqual({ reply: 'Hello' });
  expect(checkRateLimitByKey).toHaveBeenCalledWith('user-a', expect.anything());
  expect(generateAgentGPersonalityReply).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', userText: 'hi' }));
  (checkRateLimitByKey as jest.Mock).mockResolvedValue({ status: 429 });
  expect((await executeMcpTool('chat_with_agent', { message: 'hi' }, principal)).isError).toBe(true);
  expect(generateAgentGPersonalityReply).toHaveBeenCalledTimes(1);
});

test('works query uses the user bearer token and filters rows to the principal', async () => {
  const query = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), order: jest.fn(), limit: jest.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.neq.mockReturnValue(query); query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [
    { id: 'one', user_id: 'user-a', service_type: 'film', created_at: '2026-01-01', signed_url: 'expired-secret', params: { prompt: 'Ocean' } },
    { id: 'two', user_id: 'other', service_type: 'film', created_at: '2026-01-01', signed_url: 'other-secret' },
  ], error: null });
  (createClient as jest.Mock).mockReturnValue({ from: () => query });
  const result = await executeMcpTool('get_recent_works', { limit: 2, userId: 'other' }, principal);
  expect(content(result)).toEqual({ items: [{ id: 'one', kind: 'film', createdAt: '2026-01-01', prompt: 'Ocean' }], libraryUrl: 'https://myavatar.ge/ka/library' });
  expect(result.content[0].text).not.toContain('secret');
  expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ global: { headers: { Authorization: 'Bearer session-token' } } }));
  expect(query.eq).toHaveBeenCalledWith('user_id', 'user-a');
});

test('model supplied confirmation cannot cause a paid generation', async () => {
  const result = await executeMcpTool('create_generation_task', { confirmed: true, script: 'test', kind: 'video' }, principal);
  expect(result.isError).toBe(true);
  expect(content(result).error).toBe('approval_required');
  expect(createClient).not.toHaveBeenCalled();
});
