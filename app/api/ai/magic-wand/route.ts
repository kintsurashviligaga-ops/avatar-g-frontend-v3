import { NextRequest, NextResponse } from 'next/server';
import { generateWithGemini } from '@/lib/gemini/client';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

/**
 * Magic Wand — one-tap prompt enhancer (Section 7 / 8A).
 *
 * POST { prompt } → { enhanced }. Rewrites a raw user idea into ONE
 * production-ready, vivid generation prompt (style · mood · lighting · camera ·
 * composition · palette) WITHOUT asking questions, preserving the user's intent
 * and language. FAIL-OPEN by construction: any error / empty model reply / budget
 * refusal returns the ORIGINAL prompt, so the composer is never left blank.
 *
 * Signed-in only (mustSignInToGenerate → the canonical 401 body). The wand sits in
 * the studio composer next to Send, and a guest cannot send anyway; the route used
 * to be an anonymous Gemini proxy on the platform key. Both callers (OmniStudio,
 * ConversationalFilmStudio) read only `enhanced`, so a 401 keeps the user's text.
 *
 * ⚠️ Thinking OFF (thinkingBudget: 0): a rewrite needs no reasoning, and the flash
 * tier's default dynamic thinking adds seconds of latency to a button the user is
 * waiting on, and its tokens come out of maxTokens — the failure that left
 * /api/chat/title returning empty titles.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const SYSTEM_PROMPT =
  'You are an expert AI prompt engineer for video, music, and image generation. ' +
  "Rewrite the user's raw idea into ONE production-ready, vivid, optimized generation prompt. " +
  'Enrich it with concrete style, mood, lighting, camera movement, composition and colour-palette detail, ' +
  "while strictly preserving the user's original subject and intent. " +
  'Do NOT ask questions. Do NOT add any commentary, preamble, headings, quotes or markdown — ' +
  'output ONLY the rewritten prompt as a single plain-text block. ' +
  'ALWAYS respond in the SAME language the user wrote in (Georgian, English or Russian).';

// ⚠️ THE GENERIC PROMPT ABOVE WRITES FOR PICTURES AND FILM — "lighting, camera movement, composition, colour palette" —
// and asked of a song idea it adds exactly that to a music brief. The Create screen's Styles wand sends `kind: 'music'` and
// gets a description of how the song should SOUND instead (what the engines actually read).
const MUSIC_SYSTEM_PROMPT =
  'You are a music producer writing a brief for an AI music generator. ' +
  "Rewrite the user's raw idea as ONE vivid description of how the song should SOUND: genre and sub-genre, mood, tempo, " +
  'key instruments and sounds, the vocal character if it is a song, and the production style. ' +
  "Strictly preserve the user's intent and any named style or reference. " +
  'Do NOT write lyrics or a title, do NOT describe visuals, lighting or camera, and do NOT ask questions. ' +
  'At most two sentences and under 300 characters, as plain text with no markdown, headings or quotes. ' +
  'ALWAYS respond in the SAME language the user wrote in (Georgian, English or Russian).';

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  if (userId) {
    const capped = await checkRateLimitByKey(userId, RATE_LIMITS.HELPER_USER);
    if (capped) return capped;
  }

  let prompt = '';
  let music = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; kind?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    music = body.kind === 'music';
  } catch {
    /* malformed body → handled by the guard below */
  }

  if (!prompt) {
    return NextResponse.json({ enhanced: '', error: 'prompt is required' }, { status: 400 });
  }

  // Hard input cap (Section 14D) so a pasted essay can't blow the token budget.
  const capped = prompt.slice(0, 2000);
  const systemPrompt = music ? MUSIC_SYSTEM_PROMPT : SYSTEM_PROMPT;

  // BUDGET GATE (§2.1.1) — fail-soft like every other miss: the user keeps their own prompt.
  if (!(await chatBudgetAllows(`${systemPrompt} ${capped}`))) {
    return NextResponse.json({ enhanced: capped, reason: 'budget_exhausted' });
  }

  try {
    // tier:'flash' = the proven model on AI-Studio keys ('pro' 404s there); fast + strong enough for a
    // prompt rewrite. timeoutMs aborts the request itself (the old Promise.race left the fetch running).
    const result = await generateWithGemini({
      prompt: capped,
      systemPrompt,
      tier: 'flash',
      maxTokens: music ? 320 : 1024,
      temperature: 0.8,
      thinkingBudget: 0,
      timeoutMs: 25_000,
    });
    // A music brief is two sentences; whatever the model adds past that is cut, never sent on to an engine.
    const rewritten = (result.text || '').trim();
    const enhanced = music ? rewritten.slice(0, 400) : rewritten;
    void bookChatUsage({
      model: result.model,
      inputTokens: result.tokensIn,
      outputTokens: result.tokensOut,
      inputChars: systemPrompt.length + capped.length,
      chars: enhanced.length,
      userId,
    });
    return NextResponse.json({ enhanced: enhanced.length > 0 ? enhanced : capped });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[magic-wand] enhance failed (returning original):', (err instanceof Error ? err.message : String(err)).slice(0, 120));
    return NextResponse.json({ enhanced: capped });
  }
}
