/**
 * POST /api/ai
 *
 * Unified AI pipeline endpoint — Google Gemini via the configured transport.
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
 *   - Google credentials remain server-side.
 *   - Input sanitised and length-bounded before forwarding.
 *   - Credits reserved before generation and refunded on failure.
 *   - Rate-limited: 10 req/min per IP (RATE_LIMITS.AI).
 */

import { NextRequest, NextResponse } from 'next/server';
import { compose } from '@/lib/api/compose';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { deductCredits, refundCredits } from '@/lib/orchestrator/ledger';
import { llmText } from '@/lib/ai/llmText';
import { googleAiConfigured } from '@/lib/ai/google/transport';
import { randomUUID } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

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
detailed, optimised prompt string for a Google Imagen model.
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

// ─── Route handler ────────────────────────────────────────────────────────────

export const POST = compose()
  .withRateLimit(RATE_LIMITS.AI)
  .handle(async (req: NextRequest) => {
    const startMs = Date.now();

    // 1. Auth — requires valid session (bypassed in demo mode when Supabase is not configured)
    // ⚠️ NEVER IN PRODUCTION. A missing or 'placeholder' Supabase URL used to switch auth OFF and answer as 'demo-user'
    // on the platform's Google identity — so a misconfigured production env failed OPEN into an anonymous model proxy.
    // The demo bypass is for a local `next dev` with no Supabase at all; production always requires a session.
    const supabaseConfigured =
      process.env.NODE_ENV === 'production' ||
      (!!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder'));

    let user: Awaited<ReturnType<typeof requireAuthenticatedUser>> | { id: string; email?: string };
    if (supabaseConfigured) {
      try {
        user = await requireAuthenticatedUser(req);
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      user = { id: 'demo-user', email: 'demo@myavatar.ge' };
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

    if (!googleAiConfigured()) return NextResponse.json({ error: 'Google AI is not configured' }, { status: 503 });
    const ref = `ai-${body.agent}-${user.id}-${randomUUID()}`;
    const debit = supabaseConfigured ? await deductCredits(user.id, creditCost, ref) : null;
    if (debit && !debit.ok) {
      return NextResponse.json({ error: debit.reason === 'insufficient' ? 'Insufficient credits' : 'Billing unavailable', required: creditCost }, { status: debit.reason === 'insufficient' ? 402 : 503 });
    }
    let result: string | null = null;
    try {
      result = await llmText({ system: AGENT_SYSTEM_PROMPTS[body.agent], user: userPrompt, maxTokens: DEFAULT_MAX_TOKENS, timeoutMs: TIMEOUT_MS });
    } finally {
      if (!result && debit?.ok) await refundCredits(user.id, creditCost, ref).catch(() => {});
    }
    if (!result) return NextResponse.json({ error: 'Google AI generation unavailable' }, { status: 502 });
    const newBalance = debit?.balance ?? null;

    const executionMs = Date.now() - startMs;

    // 7. Return structured response
    return NextResponse.json({
      result,
      agent:        body.agent,
      creditsUsed:  debit?.ok ? creditCost : 0,
      newBalance,
      executionMs,
      model:        'gemini',
    });
  });

// Only POST is accepted
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
