/**
 * POST /api/ai
 *
 * Unified AI pipeline endpoint — Claude 3.5 Sonnet via Anthropic API.
 *
 * Supported agents (maps to credit costs):
 *   avatar  → 10 credits
 *   image   → 5  credits
 *   video   → 15 credits
 *   music   → 8  credits
 *   copy    → 3  credits
 *
 * Request body:
 *   {
 *     agent:   "avatar" | "image" | "video" | "music" | "copy"
 *     prompt:  string          (user instruction, max 4000 chars)
 *     context?: string         (optional system context, max 1000 chars)
 *     stream?:  boolean        (default false — streaming not yet wired to client)
 *   }
 *
 * Response (non-stream):
 *   {
 *     result:       string
 *     agent:        string
 *     creditsUsed:  number
 *     newBalance:   number
 *     executionMs:  number
 *     model:        string
 *   }
 *
 * Security:
 *   - Requires authenticated Supabase session (Bearer or cookie).
 *   - CORS restricted to same origin via compose middleware.
 *   - ANTHROPIC_API_KEY read from env only — never exposed to client.
 *   - Input sanitised and length-bounded before forwarding.
 *   - Single retry (non-streaming) on transient 5xx from Anthropic.
 *   - Rate-limited: 10 req/min per IP (RATE_LIMITS.AI).
 */

import { NextRequest, NextResponse } from 'next/server';
import { compose } from '@/lib/api/compose';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { deductCreditsTransaction } from '@/lib/billing/enforce';
import { randomUUID } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-3-5-sonnet-20240620';
const ANTHROPIC_VERSION = '2023-06-01';

const MAX_PROMPT_LENGTH   = 4000;
const MAX_CONTEXT_LENGTH  = 1000;
const DEFAULT_MAX_TOKENS  = 2048;
const TIMEOUT_MS          = 30_000;

// Credit costs per agent — kept in sync with lib/monetization/credits.ts
const AGENT_COSTS: Record<AgentType, number> = {
  avatar : 10,
  image  :  5,
  video  : 15,
  music  :  8,
  copy   :  3,
} as const;

// System prompts per agent
const AGENT_SYSTEM_PROMPTS: Record<AgentType, string> = {
  avatar: `You are an expert avatar creation assistant. When given a description, respond with a detailed, 
structured JSON object that specifies avatar appearance, personality traits, voice style, and use-case 
recommendations. Always respond in valid JSON wrapped in triple backticks.`,

  image: `You are an expert AI image generation prompt engineer. Transform the user's idea into a 
detailed, optimised prompt string for a diffusion model (Stable Diffusion / SDXL / FLUX). 
Include: subject, style, lighting, composition, quality tags. Return JSON: { "prompt": "...", "negative_prompt": "...", "suggested_model": "..." }`,

  video: `You are an expert AI video production assistant. Produce a detailed shot-by-shot script and 
a generation prompt for the user's concept. Return structured JSON: 
{ "title": "...", "description": "...", "shots": [...], "generation_prompt": "...", "estimated_duration_s": n }`,

  music: `You are an expert AI music composition assistant. Design a full music generation prompt for the 
user's concept. Return JSON: { "title": "...", "genre": "...", "bpm": n, "key": "...", 
"instruments": [...], "mood": "...", "generation_prompt": "...", "duration_s": n }`,

  copy: `You are an expert copywriter and SEO specialist. When given a topic or product, respond with 
structured marketing copy. Return JSON: { "headline": "...", "subheadline": "...", 
"body": "...", "cta": "...", "meta_title": "...", "meta_description": "...", "keywords": [...] }`,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentType = 'avatar' | 'image' | 'video' | 'music' | 'copy';

interface RequestBody {
  agent:     AgentType;
  prompt:    string;
  context?:  string;
  stream?:   boolean;
}

// ─── Input validation ─────────────────────────────────────────────────────────

const VALID_AGENTS = new Set<AgentType>(['avatar', 'image', 'video', 'music', 'copy']);

function parseAndValidateBody(raw: unknown): { body: RequestBody } | { error: string; status: number } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Request body must be a JSON object', status: 400 };
  }

  const b = raw as Record<string, unknown>;

  if (!b.agent || typeof b.agent !== 'string' || !VALID_AGENTS.has(b.agent as AgentType)) {
    return {
      error: `"agent" must be one of: ${[...VALID_AGENTS].join(', ')}`,
      status: 400,
    };
  }

  if (!b.prompt || typeof b.prompt !== 'string' || b.prompt.trim().length === 0) {
    return { error: '"prompt" is required and must be a non-empty string', status: 400 };
  }

  if (b.prompt.length > MAX_PROMPT_LENGTH) {
    return { error: `"prompt" must not exceed ${MAX_PROMPT_LENGTH} characters`, status: 400 };
  }

  if (b.context !== undefined) {
    if (typeof b.context !== 'string') {
      return { error: '"context" must be a string', status: 400 };
    }
    if (b.context.length > MAX_CONTEXT_LENGTH) {
      return { error: `"context" must not exceed ${MAX_CONTEXT_LENGTH} characters`, status: 400 };
    }
  }

  return {
    body: {
      agent:   b.agent as AgentType,
      prompt:  b.prompt.trim(),
      context: typeof b.context === 'string' ? b.context.trim() : undefined,
      stream:  b.stream === true,
    },
  };
}

// ─── Anthropic call (with 1 retry on transient 5xx) ──────────────────────────

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
  attempt = 0
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ApiError('ANTHROPIC_API_KEY is not configured', 500);
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model:      ANTHROPIC_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
    signal,
  });

  if (!response.ok) {
    // Retry once on transient server errors
    if (response.status >= 500 && attempt === 0) {
      return callAnthropic(systemPrompt, userPrompt, signal, 1);
    }

    let details = '';
    try { details = await response.text(); } catch { /* ignore */ }

    if (response.status === 401) throw new ApiError('Invalid Anthropic API key', 500);
    if (response.status === 429) throw new ApiError('AI rate limit exceeded — please wait a moment', 429);
    throw new ApiError(`Anthropic API error (${response.status}): ${details}`, 502);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const text = data.content?.find(c => c.type === 'text')?.text;
  if (!text) throw new ApiError('Anthropic returned an empty response', 502);

  return text;
}

// ─── Custom error class ───────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = compose()
  .withRateLimit(RATE_LIMITS.AI)
  .handle(async (req: NextRequest) => {
    const startMs = Date.now();

    // 1. Auth — requires valid session
    let user: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
    try {
      user = await requireAuthenticatedUser(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse & validate body
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = parseAndValidateBody(raw);
    if ('error' in validation) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
    const { body } = validation;

    // 3. Determine credit cost
    const creditCost = AGENT_COSTS[body.agent];

    // 4. Build the user prompt (prompt + optional context)
    const userPrompt = body.context
      ? `Context: ${body.context}\n\n${body.prompt}`
      : body.prompt;

    // 5. Call Anthropic with timeout
    const controller  = new AbortController();
    const timeout     = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let   result: string;

    try {
      result = await callAnthropic(
        AGENT_SYSTEM_PROMPTS[body.agent],
        userPrompt,
        controller.signal
      );
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.statusCode });
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({ error: 'AI request timed out' }, { status: 504 });
      }
      return NextResponse.json({ error: 'Internal AI pipeline error' }, { status: 500 });
    } finally {
      clearTimeout(timeout);
    }

    // 6. Deduct credits (transaction-safe, idempotency-keyed)
    const idempotencyKey = `ai-${body.agent}-${user.id}-${randomUUID()}`;
    let newBalance = 0;

    try {
      const deduction = await deductCreditsTransaction({
        userId:         user.id,
        amount:         creditCost,
        jobId:          idempotencyKey,
        agentId:        `ai_${body.agent}`,
        reason:         `AI ${body.agent} generation`,
        idempotencyKey,
      });
      newBalance = deduction.newBalance;
    } catch (err) {
      // Cascade billing errors with appropriate status codes
      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes('insufficient') || msg.includes('balance')) {
          return NextResponse.json(
            { error: 'Insufficient credits', required: creditCost },
            { status: 402 }
          );
        }
      }
      // If credit deduction fails after a successful AI call, log but don't fail the user
      console.error('[/api/ai] Credit deduction failed after AI call:', err);
    }

    const executionMs = Date.now() - startMs;

    // 7. Return structured response
    return NextResponse.json({
      result,
      agent:        body.agent,
      creditsUsed:  creditCost,
      newBalance,
      executionMs,
      model:        ANTHROPIC_MODEL,
    });
  });

// Only POST is accepted
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
