import { NextRequest, NextResponse } from 'next/server';
import { generateWithGemini } from '@/lib/gemini/client';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * Magic Wand — one-tap prompt enhancer (Section 7 / 8A).
 *
 * POST { prompt } → { enhanced }. Rewrites a raw user idea into ONE
 * production-ready, vivid generation prompt (style · mood · lighting · camera ·
 * composition · palette) WITHOUT asking questions, preserving the user's intent
 * and language. FAIL-OPEN by construction: any error / empty model reply returns
 * the ORIGINAL prompt, so the composer is never left blank.
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

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  let prompt = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  } catch {
    /* malformed body → handled by the guard below */
  }

  if (!prompt) {
    return NextResponse.json({ enhanced: '', error: 'prompt is required' }, { status: 400 });
  }

  // Hard input cap (Section 14D) so a pasted essay can't blow the token budget.
  const capped = prompt.slice(0, 2000);

  try {
    const result = await Promise.race([
      // tier:'flash' = gemini-2.5-flash — the proven model on AI-Studio keys
      // ('pro' 404s there); fast + strong enough for a prompt rewrite.
      generateWithGemini({
        prompt: capped,
        systemPrompt: SYSTEM_PROMPT,
        tier: 'flash',
        maxTokens: 1024,
        temperature: 0.8,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('magic-wand timed out')), 25_000)),
    ]);
    const enhanced = (result.text || '').trim();
    return NextResponse.json({ enhanced: enhanced.length > 0 ? enhanced : capped });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[magic-wand] enhance failed (returning original):', err instanceof Error ? err.message : err);
    return NextResponse.json({ enhanced: capped });
  }
}
