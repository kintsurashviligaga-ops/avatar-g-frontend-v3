import 'server-only';

/**
 * Live binding for the ReAct coordinator (STEP 3). Wires the injected seams of ./coordinator
 * to real infrastructure:
 *   - llm      → the proven-live llmText provider chain (Atlas → Gemini → Anthropic)
 *   - tools    → scrape_webpage, web_search, prepare_instagram_post (⛔), orchestrate_media
 *
 * The coordinator's control flow is unit-tested at $0 (coordinator.test.ts); this file is the
 * thin, server-only glue that can only run with live keys, so it is tsc-gated, not unit-tested.
 */
import { llmText } from '@/lib/ai/llmText';
import { runReActLoop, type AgentTool, type ReActResult } from './coordinator';
import { scrapeWebpage } from '@/lib/agent/tools/scrapeWebpage';
import { prepareInstagramPost, prepareInstagramPostInput } from '@/lib/agent/tools/prepareInstagramPost';
import { webSearch } from '@/lib/ai/webSearch';
import { startAdRenderJob } from '@/lib/ads/adRenderJob';

export interface AgentContext {
  userId: string;
}

/** Collapse the ReAct transcript into a single llmText call. */
async function llmAdapter(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  const system = messages.find((m) => m.role === 'system')?.content;
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => (m.role === 'assistant' ? `Assistant: ${m.content}` : m.content))
    .join('\n\n');
  return llmText({ system, user: convo, maxTokens: 900, temperature: 0.4, timeoutMs: 40_000 });
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
    {
      name: 'orchestrate_media',
      description: 'Kick off a marketing-video render from a brief. Input {hook, images?, aspect?, ...}. Returns {jobId, status} to poll — does NOT block on the render.',
      run: async (input) => {
        const jobId = await startAdRenderJob(ctx.userId, (input ?? {}) as Record<string, unknown>);
        return jobId ? { jobId, status: 'queued' } : { error: 'could not queue render' };
      },
    },
  ];
}

/** Run the autonomous agent against a user goal with live infrastructure. */
export async function runLiveAgent(
  userGoal: string,
  ctx: AgentContext,
  opts?: { maxSteps?: number; systemExtra?: string },
): Promise<ReActResult> {
  return runReActLoop({
    llm: llmAdapter,
    tools: buildLiveToolRegistry(ctx),
    userGoal,
    maxSteps: opts?.maxSteps,
    systemExtra: opts?.systemExtra,
  });
}
