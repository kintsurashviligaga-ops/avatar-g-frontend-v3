import { NextRequest, NextResponse } from 'next/server';
import { generateWithGemini } from '@/lib/gemini/client';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';

/**
 * Auto-write singable song lyrics from a theme — removes the biggest friction in the
 * music service (people don't have lyrics ready). Short + structured so MiniMax/Udio
 * can actually sing them. POST { theme, language?, style? } → { lyrics }.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as { theme?: unknown; language?: unknown; style?: unknown };
  const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 500) : '';
  const language = typeof body.language === 'string' ? body.language : 'ka';
  const style = typeof body.style === 'string' ? body.style.trim().slice(0, 60) : '';
  if (!theme) return NextResponse.json({ success: false, error: 'theme is required' }, { status: 400 });

  // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). One tap is up to THREE Gemini calls (two Flash takes + a Pro
  // fallback) on the platform balance, and the route had no session check and no rate limit. Its one caller is the
  // Music panel's ✨ button, whose lyrics feed only a music render — which already refuses a guest — so a guest's
  // lyrics could never become a song; the only thing an anonymous call could do was spend.
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) {
    return NextResponse.json(signInToGenerateBody(language), { status: 401 });
  }
  // ⚠️ SIGNED-IN WAS NOT ENOUGH. Sign-up is self-service, so "signed in" bounded nothing: one account could loop
  // this route at up to three Gemini calls a tap (one on Pro) with no cap, no budget check and nothing booked.
  // Same guard as /api/ai/magic-wand: per-IP (WRITE) above, per-account daily (HELPER_USER) here, the platform
  // chat budget before the first call, and every completed call booked against the user.
  const userId = user?.id ?? null;
  if (userId) {
    const capped = await checkRateLimitByKey(userId, RATE_LIMITS.HELPER_USER);
    if (capped) return capped;
  }

  const langName = language === 'en' ? 'English' : language === 'ru' ? 'Russian' : 'Georgian';
  const sys =
    `You are a professional songwriter. Write SHORT, ORIGINAL, singable lyrics in ${langName} ` +
    `with fresh, specific, personal imagery. Structure: one short verse + one chorus, 6–10 lines ` +
    `total, under 320 characters TOTAL (a music model will sing them). One line per line ` +
    `(newline-separated). Output ONLY the lyrics — no title, no section labels like ` +
    `[Verse]/[Chorus], no quotes, no commentary.`;
  const clean = (s: string) => s
    .replace(/^\s*\[[^\]]*\]\s*$/gm, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 360);

  // Gemini's recitation/safety check sometimes blocks a take (more so in English).
  // Retry with a fresher, higher-temperature attempt — and a pro-tier fallback — so the
  // ✨ button reliably returns lyrics instead of a 502.
  const attempts: Array<{ tier: 'flash' | 'pro'; prompt: string; temperature: number }> = [
    { tier: 'flash', prompt: `Theme: ${theme}${style ? `. Style/mood: ${style}` : ''}.`, temperature: 0.95 },
    { tier: 'flash', prompt: `Theme: ${theme}. Write something completely fresh, unusual and unique — nothing that resembles an existing song.`, temperature: 1.1 },
    { tier: 'pro', prompt: `Theme: ${theme}${style ? `. Mood: ${style}` : ''}. Fresh, original wording only.`, temperature: 1.0 },
  ];
  if (!(await chatBudgetAllows(`${sys} ${theme} ${style}`))) {
    return NextResponse.json({ success: false, error: 'budget_exhausted' }, { status: 503 });
  }
  for (const a of attempts) {
    try {
      // thinkingBudget 0 on Flash: a 400-token budget is shared with thinking tokens, and a take that spent them all
      // thinking came back empty — which triggered the next (paid) attempt. Pro cannot turn thinking off.
      const r = await generateWithGemini({
        tier: a.tier,
        systemPrompt: sys,
        prompt: a.prompt,
        maxTokens: 400,
        temperature: a.temperature,
        timeoutMs: 18_000,
        ...(a.tier === 'flash' ? { thinkingBudget: 0 } : {}),
      });
      const lyrics = clean(r.text || '');
      // Booked whether or not the take was usable — an empty or blocked take was still billed to us.
      void bookChatUsage({
        model: r.model,
        inputTokens: r.tokensIn,
        outputTokens: r.tokensOut,
        inputChars: sys.length + a.prompt.length,
        chars: lyrics.length,
        userId,
      });
      if (lyrics) return NextResponse.json({ success: true, lyrics });
    } catch {
      /* try the next attempt */
    }
  }
  return NextResponse.json({ success: false, error: 'Could not write lyrics, please try again.' }, { status: 502 });
}
