import { NextRequest, NextResponse } from 'next/server';
import { generateWithGemini } from '@/lib/gemini/client';

/**
 * Auto-write singable song lyrics from a theme — removes the biggest friction in the
 * music service (people don't have lyrics ready). Short + structured so MiniMax/Udio
 * can actually sing them. POST { theme, language?, style? } → { lyrics }.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { theme?: unknown; language?: unknown; style?: unknown };
  const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 500) : '';
  const language = typeof body.language === 'string' ? body.language : 'ka';
  const style = typeof body.style === 'string' ? body.style.trim().slice(0, 60) : '';
  if (!theme) return NextResponse.json({ success: false, error: 'theme is required' }, { status: 400 });

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
  for (const a of attempts) {
    try {
      const r = await generateWithGemini({ tier: a.tier, systemPrompt: sys, prompt: a.prompt, maxTokens: 400, temperature: a.temperature });
      const lyrics = clean(r.text || '');
      if (lyrics) return NextResponse.json({ success: true, lyrics });
    } catch {
      /* try the next attempt */
    }
  }
  return NextResponse.json({ success: false, error: 'Could not write lyrics, please try again.' }, { status: 502 });
}
