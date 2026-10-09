import 'server-only';

/**
 * Live binding for the ReAct coordinator (STEP 3). Wires the injected seams of ./coordinator
 * to real infrastructure:
 *   - llm      → llmText. Under AI_GOOGLE_ONLY (the default) that is Gemini ONLY (`googleOnly`); with the
 *                kill switch off it is the old multi-vendor chain (DeepSeek → Atlas → Gemini → Anthropic).
 *   - tools    → web_search, scrape_webpage, prepare_instagram_post (⛔ prepare-only), and quote_montage_to_music when
 *                the request carries the user's files and AGENT_G_MEDIA_EXEC is open to them (quote only, see MEDIA).
 *                They are the typed allowlist LIVE_TOOL_SPECS (lib/agent/tools/registry): each input is parsed by its
 *                schema before the tool runs, each tool has a per-request call limit and an effect class, and no
 *                effect lets the model start a job or spend credits.
 *
 * web_search is Gemini + Google Search grounding under AI_GOOGLE_ONLY (lib/agent/tools/googleSearch.ts) and
 * Tavily otherwise — the same `{ answer, results[] }` shape either way.
 *
 * MEDIA: ONE TOOL, AND IT ONLY QUOTES. `orchestrate_media` was removed because it called startAdRenderJob, which only
 * INSERTED a `generation_jobs` row: nothing ever processed it, and no credit was reserved or debited. A media tool came
 * back only with a real worker and the ledger reserve/refund saga behind it, and that is lib/agent/media (Agent G's
 * media execution, slice 1): `quote_montage_to_music` cuts the clips the user attached to THIS request to the music
 * track they attached, on the beat. The tool analyses, plans and prices (montageExec.quoteMontage); it renders nothing
 * and spends nothing. The signed quote goes back to the caller (`onMediaQuote` → the route's `mediaQuote`), and the
 * render runs only when the user confirms it (/api/agent/media/montage `run`: the existing montage lane, one job per
 * quote, QC, refund, audit). The tool exists only when AGENT_G_MEDIA_EXEC opens it to this user (the route decides,
 * from the session) AND the request carries files; the agent never sees a URL it could swap for someone else's, and
 * every file is checked to be the caller's own (lib/security/callerMedia). Every other render still belongs to the
 * Studio lanes: the agent writes the brief and sends the user there (AGENT_MEDIA_NOTE).
 *
 * The coordinator's control flow is unit-tested at $0 (coordinator.test.ts); this file's wiring is tested with
 * every provider mocked (bindLiveAgent.test.ts).
 */
import { llmText } from '@/lib/ai/llmText';
import { isAiGoogleOnly } from '@/lib/ai/google/policy';
import { runReActLoop, type AgentTool, type ReActResult } from './coordinator';
import { z } from 'zod';
import { scrapeWebpage, scrapeWebpageInput } from '@/lib/agent/tools/scrapeWebpage';
import { prepareInstagramPost, prepareInstagramPostInput } from '@/lib/agent/tools/prepareInstagramPost';
import { groundedWebSearch } from '@/lib/agent/tools/googleSearch';
import { bindTools, defineTool, type ToolSpec } from '@/lib/agent/tools/registry';
import { webSearch } from '@/lib/ai/webSearch';
import { MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';
import type { QuoteResult } from '@/lib/agent/media/montageExec';

export interface AgentContext {
  userId: string;
  /** The files the user attached to THIS request (their upload paths or our signed links), in their order. */
  files?: string[];
  /** Agent G's media execution is open to this user (lib/agent/media/access, decided from the session by the route). */
  media?: boolean;
  /** Receives every signed quote the media tool makes; the route hands the last one to the client's confirm card. */
  onMediaQuote?: (quote: Extract<QuoteResult, { ok: true }>) => void;
}

/** Appended to the system prompt when the agent has no media tool: it cannot render, so it must not promise a render. */
export const AGENT_MEDIA_NOTE =
  'You cannot start video, image or music renders from here. When the user wants media made, put a ' +
  'ready-to-use brief (prompt, style, duration, aspect) in your final answer and tell them to run it in the ' +
  'MyAvatar Studio, where it is created and billed.';

/** Appended instead when the request carries the user's files and the montage tool is on. */
export const AGENT_MONTAGE_NOTE =
  'The user attached files to this request. When they want their video clips cut to their music track, call ' +
  'quote_montage_to_music: it analyses the files, finds the beat and returns the plan and its price. It renders ' +
  'nothing: the user sees the plan with a Confirm button and the edit starts only when they press it. Tell them what ' +
  'the plan is (shots, length, beat, format, any clip left out and why) and that it starts on Confirm; never say it is ' +
  'already made. For any other video, image or music render, put a ready-to-use brief in your final answer and tell ' +
  'them to run it in the MyAvatar Studio, where it is created and billed.';

/** Each quote downloads and decodes every attached file: two per request (say, a second format) is plenty. */
export const MAX_QUOTES_PER_RUN = 2;
/** The tool is offered only for a request with files, and only when media execution is open to this user. */
export const montageToolOn = (ctx: AgentContext): boolean => ctx.media === true && (ctx.files?.length ?? 0) > 0;

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

/** The goal rides along so the montage quote reads the user's words (aspect, length) from it. */
type LiveCtx = AgentContext & { goal: string };

/** Numbers a model sends as text ("30") are read as numbers; anything else is left for the schema to refuse. */
const num = (schema: z.ZodNumber) => z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), schema);

/**
 * The live agent's allowlist (lib/agent/tools/registry): every tool it can call, typed, with its effect. Nothing here
 * starts a render or spends a credit; the one media tool quotes, and its plan runs only on the user's Confirm.
 */
export const LIVE_TOOL_SPECS: ReadonlyArray<ToolSpec<LiveCtx>> = [
  defineTool({
    name: 'web_search',
    effect: 'read',
    description: 'Search the live web for facts, trends, prices, or news. Input {query}. Returns {answer, results[]}.',
    input: z.object({ query: z.string().trim().min(1).max(400) }),
    limit: 8,
    run: async ({ query }, ctx) => {
      if (isAiGoogleOnly()) {
        const r = await groundedWebSearch(query, { userId: ctx.userId, maxResults: 5 });
        return r.ok ? { answer: r.answer, results: r.results } : { error: `search unavailable (${r.code})` };
      }
      const r = await webSearch(query, { maxResults: 5 });
      return r ?? { error: 'search unavailable (no key or no results)' };
    },
  }),
  defineTool({
    name: 'scrape_webpage',
    effect: 'read',
    description: 'Fetch one URL and return its readable text. Input {url}. JS-heavy/anti-bot sites may fail — prefer web_search for those.',
    input: scrapeWebpageInput,
    limit: 8,
    run: async (input) => scrapeWebpage(input),
  }),
  defineTool({
    name: 'prepare_instagram_post',
    effect: 'prepare',
    description: 'PREPARE ONLY — assemble a caption + hashtags + media reference for the user to post themselves. Input {caption, hashtags?, mediaUrl?}. NEVER publishes.',
    input: prepareInstagramPostInput,
    limit: 4,
    run: async (input) => prepareInstagramPost(input),
  }),
  // quote_montage_to_music: plan and price only, from the request's own files (see MEDIA in the header). The model
  // gives the shape (aspect, length), never a file: the files are the ones attached to this request.
  defineTool({
    name: 'quote_montage_to_music',
    effect: 'quote',
    confirms: 'montage_run',
    description:
      "PLAN ONLY — cut the video clips the user attached to the music track they attached, on the beat. Input {aspect?: '9:16'|'16:9'|'1:1', targetSec?}. " +
      'Uses only the files attached to this request. Returns the plan (shots, length, bpm, format, unused files) and its price in credits; renders nothing until the user confirms.',
    input: z.object({ aspect: z.enum(['9:16', '16:9', '1:1']).optional(), targetSec: num(z.number().positive().max(MAX_TOTAL_SEC)).optional() }),
    offered: (ctx) => montageToolOn(ctx),
    limit: MAX_QUOTES_PER_RUN,
    run: async ({ aspect, targetSec }, ctx) => {
      // Loaded on use: ffmpeg and the storage client stay off the path of every request that has no files.
      const [{ quoteMontage }, { liveMontageDeps }] = await Promise.all([
        import('@/lib/agent/media/montageExec'),
        import('@/lib/agent/media/montageLive'),
      ]);
      const r = await quoteMontage(liveMontageDeps(), { userId: ctx.userId, files: ctx.files, prompt: ctx.goal, aspect, targetSec });
      if (!r.ok) return { error: r.error, message: r.message, ...(r.files ? { files: r.files.map((f) => f + 1) } : {}) };
      ctx.onMediaQuote?.(r);
      const q = r.quote;
      // The model gets the plan, never the token or the signed links: those go to the user's confirm card only.
      return {
        planned: true,
        rendered: false,
        credits: q.credits,
        shots: q.shots,
        clips: q.clips,
        lengthSec: q.totalSec,
        aspect: q.aspect,
        beatSynced: q.beatSynced,
        bpm: q.bpm,
        unusedFiles: q.unusedFiles.map((f) => f + 1),
        next: 'The user confirms the plan on its card; nothing starts before that.',
      };
    },
  }),
];

/** Build the real tool registry for one authenticated request. */
export function buildLiveToolRegistry(ctx: AgentContext, opts?: { goal?: string }): AgentTool[] {
  return bindTools(LIVE_TOOL_SPECS, { ...ctx, goal: opts?.goal ?? '' });
}

/** Run the autonomous agent against a user goal with live infrastructure. */
export async function runLiveAgent(
  userGoal: string,
  ctx: AgentContext,
  opts?: { maxSteps?: number; systemExtra?: string; deadlineMs?: number },
): Promise<ReActResult> {
  const mediaNote = montageToolOn(ctx) ? AGENT_MONTAGE_NOTE : AGENT_MEDIA_NOTE;
  const systemExtra = [mediaNote, opts?.systemExtra?.trim()].filter(Boolean).join('\n\n');
  return runReActLoop({
    llm: llmAdapter,
    tools: buildLiveToolRegistry(ctx, { goal: userGoal }),
    userGoal,
    maxSteps: opts?.maxSteps,
    systemExtra,
    deadlineMs: opts?.deadlineMs,
  });
}
