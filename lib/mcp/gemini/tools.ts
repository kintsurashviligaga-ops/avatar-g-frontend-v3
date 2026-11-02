import 'server-only';

import { generateAgentGPersonalityReply } from '../../agentg/personality';
import { checkRateLimitByKey, RATE_LIMITS } from '../../api/rate-limit';
import { readRecentWorks } from './works';
import { requestOrExecuteVideo } from './videoApproval';
import type { McpPrincipal } from './auth';

/** The endpoint authenticates this token with Supabase before calling an adapter. */
export type { McpPrincipal } from './auth';
type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const answer = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const failure = (code: string, message: string): ToolResult => ({
  isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
});

/**
 * Invoke adapters only with the principal authenticated by the MCP transport.
 * Never derive user identity, credentials, or user approval from model-supplied arguments.
 */
export async function executeMcpTool(name: string, args: Record<string, unknown>, principal: McpPrincipal): Promise<ToolResult> {
  if (name === 'create_generation_task') {
    if (args.kind === 'audio') return failure('generation_unavailable', 'Audio generation is not available through this connector. No task was created.');
    return requestOrExecuteVideo(args, principal);
  }

  if (name === 'chat_with_agent') {
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (!message || message.length > 4000) return failure('invalid_arguments', 'message must contain 1–4000 characters.');
    const locale = args.locale === undefined ? 'ka' : args.locale;
    if (locale !== 'ka' && locale !== 'en' && locale !== 'ru') return failure('invalid_arguments', 'locale must be ka, en or ru.');
    try {
      const limited = await checkRateLimitByKey(principal.userId, RATE_LIMITS.CHAT_USER);
      if (limited) return failure('rate_limited', 'Chat rate limit reached. Please try again later.');
      const result = await generateAgentGPersonalityReply({ userText: message, channel: 'web', userId: principal.userId, locale });
      return answer({ reply: result.replyText });
    } catch {
      return failure('chat_unavailable', 'Agent G is temporarily unavailable.');
    }
  }

  if (name === 'get_recent_works') {
    const rawLimit = args.limit ?? 10;
    if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 20) {
      return failure('invalid_arguments', 'limit must be an integer between 1 and 20.');
    }
    try {
      const items = await readRecentWorks(principal, rawLimit);
      return answer({ items, libraryUrl: 'https://myavatar.ge/ka/library' });
    } catch {
      return failure('library_unavailable', 'The works library is unavailable.');
    }
  }

  return failure('unknown_tool', 'Unknown tool.');
}
