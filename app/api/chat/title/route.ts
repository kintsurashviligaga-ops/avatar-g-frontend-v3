/**
 * app/api/chat/title/route.ts
 * ===========================
 * Fast-tier conversation-title generator for the `/dashboard` sidebar.
 *
 * Takes the first user prompt of a new chat and returns a clean ≤4-word title
 * via the FAST Gemini tier (flash) — the cheap text path, never a paid render.
 * The client (titleClient.generateConversationTitle) treats any failure as
 * "no title" and falls back to the deterministic first-prompt title, so this
 * endpoint is best-effort by design: a signed-in caller always gets 200 with a
 * (possibly empty) `title` string, and nothing here throws into the chat.
 *
 * Signed-in only (mustSignInToGenerate): a guest gets the canonical 401 body and
 * no Gemini call — the studio only titles a signed-in user's conversations, and
 * an open title endpoint was a free anonymous Gemini proxy (2000-char prompts).
 *
 * ⚠️ THINKING OFF (thinkingBudget: 0). The flash tier thinks by default, and the
 * thinking tokens come out of maxOutputTokens: with the old cap of 24 the model
 * spent the whole budget thinking and returned an EMPTY title on almost every
 * call, so the sidebar always showed the deterministic fallback. Thinking off +
 * TITLE_MAX_TOKENS leaves room for a ≤4-word title in any script (Georgian is
 * token-dense) while still bounding a runaway reply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS, checkRateLimitByKey } from '@/lib/api/rate-limit';
import { generateWithGemini } from '@/lib/gemini/client';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const titleSchema = z.object({
  prompt: z.string().min(1).max(2000),
  locale: z.string().default('en'),
});

/** Room for a ≤4-word title in any script with thinking off; a cap, not a cost (billing is per token used). */
const TITLE_MAX_TOKENS = 128;
const TITLE_MAX_CHARS = 80;

/** First line, no wrapping quotes / markdown emphasis, bounded. The client sanitizes again (titleClient). */
function cleanTitle(raw: string): string {
  const line = (raw || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  return line
    .replace(/^#+\s*/, '')
    .replace(/^[\s"'`*_«»„“”]+|[\s"'`*_«»„“”]+$/g, '')
    .slice(0, TITLE_MAX_CHARS)
    .trim();
}

const LANG_NAME: Record<string, string> = {
  ka: 'Georgian',
  ru: 'Russian',
  en: 'English',
};

function buildSystemPrompt(locale: string): string {
  const lang = LANG_NAME[locale] ?? 'English';
  return [
    'You generate ultra-short chat titles.',
    `Summarize the user's first message as a title of AT MOST 4 words in ${lang}.`,
    'Rules: no quotes, no punctuation at the end, no emojis, no markdown, Title Case where natural.',
    'Reply with ONLY the title text — nothing else.',
  ].join(' ');
}

export async function POST(req: NextRequest) {
  // Title generation is a tiny convenience helper — rate-limit as a READ and
  // never charge the daily AI budget for it.
  const empty = NextResponse.json({ title: '' });
  try {
    const body = await req.json().catch(() => null);
    const parsed = titleSchema.safeParse(body);
    if (!parsed.success) return empty;

    const gate = await applyApiGuards(req, {
      limit: RATE_LIMITS.READ,
      skipBudget: true,
      label: 'chat.title',
    });
    if (gate.response) return gate.response;

    const { prompt, locale } = parsed.data;
    // The guard already resolved a cookie session; the bearer path (non-browser clients) is the fallback.
    const userId = gate.auth?.userId ?? (await authedClientFromRequest(req)).user?.id ?? null;
    if (mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
    if (userId) {
      const capped = await checkRateLimitByKey(userId, RATE_LIMITS.HELPER_USER);
      if (capped) return capped;
    }

    // resolveGeminiKey() also honours GOOGLE_GENERATIVE_AI_API_KEY and the GEMINI_API_KEYS pool.
    if (!resolveGeminiKey()) return empty;

    const systemPrompt = buildSystemPrompt(locale);
    const input = prompt.slice(0, 2000);
    // BUDGET GATE (§2.1.1). Titles are tiny but run on EVERY conversation, so they are metered too.
    if (!(await chatBudgetAllows(`${systemPrompt} ${input}`))) {
      return NextResponse.json({ title: null, reason: 'budget_exhausted' }, { status: 200 });
    }
    const gemini = await generateWithGemini({
      prompt: input,
      systemPrompt,
      tier: 'flash',
      maxTokens: TITLE_MAX_TOKENS,
      temperature: 0.2,
      thinkingBudget: 0,
      timeoutMs: 10_000,
    });
    void bookChatUsage({
      model: gemini.model,
      inputTokens: gemini.tokensIn,
      outputTokens: gemini.tokensOut,
      inputChars: systemPrompt.length + input.length,
      chars: (gemini.text || '').length,
      userId,
    });

    return NextResponse.json({ title: cleanTitle(gemini.text || '') });
  } catch {
    // Best-effort: any failure (Gemini error, timeout, parse) → empty title so
    // the client falls back to the deterministic first-prompt title.
    return empty;
  }
}
