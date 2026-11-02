import { executeMcpTool } from './tools';
import { readRecentWorks } from './works';
import { generateAgentGPersonalityReply } from '../../agentg/personality';
import { checkRateLimitByKey } from '../../api/rate-limit';
import { requestOrExecuteVideo } from './videoApproval';

jest.mock('server-only', () => ({}));
jest.mock('./works', () => ({ readRecentWorks: jest.fn() }));
jest.mock('./videoApproval', () => ({ requestOrExecuteVideo: jest.fn() }));
jest.mock('../../agentg/personality', () => ({ generateAgentGPersonalityReply: jest.fn() }));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(), RATE_LIMITS: { CHAT_USER: {} } }));
jest.mock('../../env/public', () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key' } }));

const principal = { userId: 'user-a', token: 'session-token', clientId: 'client-a', scopes: ['mcp:read'] };
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
  (readRecentWorks as jest.Mock).mockResolvedValue([{ id: 'one', kind: 'film', createdAt: '2026-01-01', prompt: 'Ocean', url: 'https://media.example.test/one' }]);
  const result = await executeMcpTool('get_recent_works', { limit: 2, userId: 'other' }, principal);
  expect(content(result)).toEqual({ items: [{ id: 'one', kind: 'film', createdAt: '2026-01-01', prompt: 'Ocean', url: 'https://media.example.test/one' }], libraryUrl: 'https://myavatar.ge/ka/library' });
  expect(readRecentWorks).toHaveBeenCalledWith(principal, 2);
});

test('model supplied confirmation cannot cause a paid generation', async () => {
  (requestOrExecuteVideo as jest.Mock).mockResolvedValue({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'generation_unavailable' }) }] });
  const result = await executeMcpTool('create_generation_task', { confirmed: true, script: 'test', kind: 'video' }, principal);
  expect(result.isError).toBe(true);
  expect(content(result).error).toBe('generation_unavailable');
  expect(readRecentWorks).not.toHaveBeenCalled();
});
