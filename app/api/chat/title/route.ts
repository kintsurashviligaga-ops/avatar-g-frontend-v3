/**
 * app/api/chat/title/route.ts
 * ===========================
 * Fast-tier conversation-title generator for the `/dashboard` sidebar.
 *
 * Takes the first user prompt of a new chat and returns a clean ≤4-word title
 * via the FAST Gemini tier (flash) — the cheap text path, never a paid render.
 * The client (titleClient.generateConversationTitle) treats any failure as
 * "no title" and falls back to the deterministic first-prompt title, so this
 * endpoint is best-effort by design: it always responds 200 with a (possibly
 * empty) `title` string and never throws into the chat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { generateWithGemini } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const titleSchema = z.object({
  prompt: z.string().min(1).max(2000),
  locale: z.string().default('en'),
});

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

    if (!process.env.GEMINI_API_KEY) return empty;

    const { prompt, locale } = parsed.data;
    const gemini = await generateWithGemini({
      prompt: prompt.slice(0, 2000),
      systemPrompt: buildSystemPrompt(locale),
      tier: 'flash',
      maxTokens: 24,
      temperature: 0.2,
    });

    return NextResponse.json({ title: (gemini.text || '').trim() });
  } catch {
    // Best-effort: any failure (Gemini error, timeout, parse) → empty title so
    // the client falls back to the deterministic first-prompt title.
    return empty;
  }
}
