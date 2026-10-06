import { googleAiConfigured } from '@/lib/ai/google/transport';
import 'server-only';

/**
 * lib/agent/tools/googleSearch.ts — the ReAct agent's `web_search`, answered by Gemini with Google Search
 * grounding instead of Tavily.
 *
 * One grounded Gemini turn per query: the model runs Google Search itself (the `google_search` tool, the same
 * one product chat uses) and writes a short factual answer; the grounding chunks become the result list. The
 * returned shape is Tavily's (`{ answer, results[] }`, lib/ai/webSearch.ts), so the agent's protocol and the
 * Agent Terminal's rendering do not change with the provider.
 *
 * Why not keep Tavily: under AI_GOOGLE_ONLY every model and search leg must be Google (lib/ai/google/policy.ts),
 * and TAVILY_API_KEY was a second vendor whose outage silently turned the tool into "search unavailable".
 *
 * ⚠️ `results[].content` IS ALWAYS ''. Grounding returns source URLs and titles, not page snippets — the facts
 * are already folded into `answer`. The URLs are usually vertexaisearch.cloud.google.com redirect links that
 * resolve to the cited page; the agent's `scrape_webpage` can follow one when it needs the page text.
 *
 * Metered like chat: the platform budget pre-check runs before the call, and the call is booked afterwards
 * with the real token usage, the serving model, the user and the number of Google Search queries it issued
 * (grounding is billed per query). Never throws.
 */
import { streamGeminiChat, unbookedAttempts } from '@/lib/ai/google/chatStream';
import { chatModelChain } from '@/lib/ai/google/models';
import { safetySettingsFor } from '@/lib/agents/profile';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';
import type { ChatErrorCode } from '@/lib/chat/sse';
import type { WebSearchResult } from '@/lib/ai/webSearch';

/** Well inside the coordinator's 45 s per-tool ceiling, so a hung search is a clean error observation. */
export const GROUNDED_SEARCH_TIMEOUT_MS = 25_000;
const MAX_QUERY_CHARS = 500;
const MAX_ANSWER_TOKENS = 1024;

export const GROUNDED_SEARCH_SYSTEM = [
  'You are a web research tool for an autonomous agent.',
  'ALWAYS run Google Search before answering, and answer ONLY from what the search returned.',
  'Reply with a concise factual summary (at most ~8 sentences): the key facts, names, numbers and dates.',
  'No preamble, no follow-up questions, no markdown headings, no raw URLs.',
  'If the search did not answer the question, say so in one sentence.',
  "Reply in the language of the query.",
].join(' ');

export type GroundedSearchResult =
  | { ok: true; answer: string; results: WebSearchResult[]; model: string }
  | { ok: false; code: ChatErrorCode };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Answer `query` with a Google-Search-grounded Gemini turn. `userId` attributes the booked spend.
 * Returns a typed failure (`auth`, `quota`, `budget`, `safety`, …) instead of null so the agent's observation
 * says WHY search is down — an unfunded key reads as `quota`, not as "no results".
 */
export async function groundedWebSearch(
  query: string,
  opts: { userId?: string | null; maxResults?: number } = {},
): Promise<GroundedSearchResult> {
  const q = typeof query === 'string' ? query.trim().slice(0, MAX_QUERY_CHARS) : '';
  if (q.length < 2) return { ok: false, code: 'bad_request' };

  const apiKey = resolveGeminiKey();
  if (!googleAiConfigured()) return { ok: false, code: 'auth' };

  const models = chatModelChain('standard');
  const inputText = `${GROUNDED_SEARCH_SYSTEM} ${q}`;
  if (!(await chatBudgetAllows(inputText, models[0]))) return { ok: false, code: 'budget' };

  const res = await streamGeminiChat({
    apiKey,
    models,
    messages: [{ role: 'user', content: q }],
    config: {
      system: GROUNDED_SEARCH_SYSTEM,
      temperature: 0.2,
      topP: 0.95,
      maxOutputTokens: MAX_ANSWER_TOKENS,
      // The platform floor (BLOCK_ONLY_HIGH), the same as chat — never looser.
      safetySettings: safetySettingsFor('platform'),
      // A lookup, not a reasoning task: thinking would only add latency and eat the output budget.
      thinking: { level: 'off' },
      googleSearch: true,
    },
    abortSignal: AbortSignal.timeout(GROUNDED_SEARCH_TIMEOUT_MS),
    // The agent reads the summary result, not the frames.
    onFrame: () => undefined,
  });

  // Book whatever the provider consumed: a success, or a failure that still reported usage (it was billed).
  if (res.ok || res.usage) {
    void bookChatUsage({
      model: res.model ?? models[0] ?? 'chat',
      inputTokens: res.usage?.inputTokens,
      outputTokens: res.usage?.outputTokens,
      totalTokens: res.usage?.totalTokens,
      inputChars: inputText.length,
      chars: res.text.length,
      userId: opts.userId ?? null,
      groundingQueries: res.groundingQueries,
    });
  }
  // …and every earlier attempt Google billed before the rotation (a text-less 200 still consumed tokens + queries).
  for (const a of unbookedAttempts(res)) {
    void bookChatUsage({ model: a.model, ...a.usage, inputChars: inputText.length, userId: opts.userId ?? null, groundingQueries: a.groundingQueries ?? 0 });
  }

  if (!res.ok || !res.text.trim()) return { ok: false, code: res.error?.code ?? 'unavailable' };

  const max = Math.min(Math.max(opts.maxResults ?? 5, 1), 10);
  const results: WebSearchResult[] = res.sources.slice(0, max).map((s) => ({
    title: s.title?.trim() || hostOf(s.url),
    url: s.url,
    content: '',
  }));
  return { ok: true, answer: res.text.trim(), results, model: res.model ?? models[0] ?? '' };
}
