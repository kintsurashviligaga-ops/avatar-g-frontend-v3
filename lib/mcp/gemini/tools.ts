import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { generateAgentGPersonalityReply } from '../../agentg/personality';
import { checkRateLimitByKey, RATE_LIMITS } from '../../api/rate-limit';
import { publicEnv } from '../../env/public';

/** The endpoint authenticates this token with Supabase before calling an adapter. */
export type McpPrincipal = { userId: string; token: string };
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
    // An MCP client-provided boolean (or annotation) is not evidence of a user's approval.
    // A first-party, one-time server-verified confirmation and the paid generation path
    // must be wired before this can safely create or charge for a job.
    return failure('approval_required', 'Generation is not available through this connector until first-party user confirmation is implemented. No task was created.');
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
    const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon } = publicEnv;
    if (!url || !anon) return failure('library_unavailable', 'The works library is unavailable.');
    try {
      // The caller's JWT, never the service role, enforces database RLS. Limit the
      // fields and filter user_id again before returning; no arbitrary URLs or tokens.
      const supabase = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${principal.token}` } },
      });
      const { data, error } = await supabase.from('generation_jobs')
        .select('id,user_id,service_type,created_at,signed_url,result,params')
        .eq('user_id', principal.userId).eq('status', 'completed').neq('service_type', 'voice')
        .order('created_at', { ascending: false }).limit(rawLimit);
      if (error || !Array.isArray(data)) return failure('library_unavailable', 'The works library is unavailable.');
      const items = data.filter((row) => row.user_id === principal.userId && (
        (typeof row.signed_url === 'string' && row.signed_url) ||
        (row.result && typeof row.result === 'object' && typeof row.result.url === 'string' && row.result.url)
      )).map((row) => ({
        id: row.id, kind: row.service_type, createdAt: row.created_at,
        prompt: row.params && typeof row.params === 'object' && typeof row.params.prompt === 'string' ? row.params.prompt : null,
      }));
      // The product library performs ownership checks and mints fresh signed URLs.
      // Do not expose potentially expired stored URLs or reimplement its signing path.
      return answer({ items, libraryUrl: 'https://myavatar.ge/ka/library' });
    } catch {
      return failure('library_unavailable', 'The works library is unavailable.');
    }
  }

  return failure('unknown_tool', 'Unknown tool.');
}
