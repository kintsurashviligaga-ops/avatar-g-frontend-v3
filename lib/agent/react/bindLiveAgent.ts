import 'server-only';

/**
 * Live binding for the ReAct coordinator (STEP 3). Wires the injected seams of ./coordinator
 * to real infrastructure:
 *   - llm      → llmText. Under AI_GOOGLE_ONLY (the default) that is Gemini ONLY (`googleOnly`); with the
 *                kill switch off it is the old multi-vendor chain (DeepSeek → Atlas → Gemini → Anthropic).
 *   - tools    → web_search, scrape_webpage, prepare_instagram_post (⛔ prepare-only)
 *
 * web_search is Gemini + Google Search grounding under AI_GOOGLE_ONLY (lib/agent/tools/googleSearch.ts) and
 * Tavily otherwise — the same `{ answer, results[] }` shape either way.
 *
 * ⚠️ THERE IS NO MEDIA TOOL, ON PURPOSE. `orchestrate_media` used to call startAdRenderJob, which only
 * INSERTS a `generation_jobs` row — nothing in the codebase ever calls processAdRenderJob, and the drain-renders
 * cron reaps `processing` rows only. Every call left a permanently `pending` "video" in the user's history, and
 * no credit was ever reserved or debited for it. Renders belong to the Studio lanes, which reserve credits
 * before they spend; the agent writes the brief and sends the user there (AGENT_MEDIA_NOTE). Re-adding a
 * media tool needs a real worker AND the ledger reserve/refund saga first.
 *
 * The coordinator's control flow is unit-tested at $0 (coordinator.test.ts); this file's wiring is tested with
 * every provider mocked (bindLiveAgent.test.ts).
 */
import { llmText } from '@/lib/ai/llmText';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { runReActLoop, type AgentTool, type ReActResult } from './coordinator';
import { scrapeWebpage } from '@/lib/agent/tools/scrapeWebpage';
import { prepareInstagramPost, prepareInstagramPostInput } from '@/lib/agent/tools/prepareInstagramPost';
import { groundedWebSearch } from '@/lib/agent/tools/googleSearch';
import { webSearch } from '@/lib/ai/webSearch';

export interface AgentContext {
  userId: string;
}

/** Always appended to the system prompt: the agent cannot render, so it must not promise a render. */
export const AGENT_MEDIA_NOTE =
  'You cannot start video, image or music renders from here. When the user wants media made, put a ' +
  'ready-to-use brief (prompt, style, duration, aspect) in your final answer and tell them to run it in the ' +
  'MyAvatar Studio, where it is created and billed.';

/** Collapse the ReAct transcript into a single llmText call. */
async function llmAdapter(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'assistant' ? `Assistant: ${m.content}` : m.content))
    .join('\n\n');
  // Read per call (not at module load) so the kill switch applies without a redeploy of this module.
  return llmText({ system, user: convo, maxTokens: 900, temperature: 0.4, timeoutMs: 40_000, googleOnly: isAiGoogleOnly() });
}

/** Build the real tool registry for one authenticated request. */
export function buildLiveToolRegistry(ctx: AgentContext): AgentTool[] {
  return [
    {
      name: 'web_search',
      description: 'Search the live web for facts, trends, prices, or news. Input {query}. Returns {answer, results[]}.',
      run: async (input) => {
        const query = String((input as { query?: unknown })?.query ?? '').trim();
        if (!query) return { error: 'query required' };
        if (isAiGoogleOnly()) {
          const r = await groundedWebSearch(query, { userId: ctx.userId, maxResults: 5 });
          return r.ok ? { answer: r.answer, results: r.results } : { error: `search unavailable (${r.code})` };
        }
        const r = await webSearch(query, { maxResults: 5 });
        return r ?? { error: 'search unavailable (no key or no results)' };
      },
    },
    {
      name: 'scrape_webpage',
      description: 'Fetch one URL and return its readable text. Input {url}. JS-heavy/anti-bot sites may fail — prefer web_search for those.',
      run: async (input) => scrapeWebpage(input as { url: string }),
    },
    {
      name: 'prepare_instagram_post',
      description: 'PREPARE ONLY — assemble a caption + hashtags + media reference for the user to post themselves. Input {caption, hashtags?, mediaUrl?}. NEVER publishes.',
      run: async (input) => {
        const parsed = prepareInstagramPostInput.safeParse(input);
        if (!parsed.success) return { error: 'invalid post input', issues: parsed.error.issues.map((i) => i.message) };
        return prepareInstagramPost(parsed.data);
      },
    },
  ];
}

/** Run the autonomous agent against a user goal with live infrastructure. */
export async function runLiveAgent(
  userGoal: string,
  ctx: AgentContext,
  opts?: { maxSteps?: number; systemExtra?: string; deadlineMs?: number },
): Promise<ReActResult> {
  const systemExtra = [AGENT_MEDIA_NOTE, opts?.systemExtra?.trim()].filter(Boolean).join('\n\n');
  return runReActLoop({
    llm: llmAdapter,
    tools: buildLiveToolRegistry(ctx),
    userGoal,
    maxSteps: opts?.maxSteps,
    systemExtra,
    deadlineMs: opts?.deadlineMs,
  });
}
