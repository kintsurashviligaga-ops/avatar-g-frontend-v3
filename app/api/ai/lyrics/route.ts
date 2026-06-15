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
  try {
    const r = await generateWithGemini({
      tier: 'flash',
      systemPrompt:
        `You are a professional songwriter. Write SHORT, ORIGINAL, singable lyrics in ${langName} ` +
        `with fresh, specific, personal imagery. Structure: one short verse + one chorus, 6–10 lines ` +
        `total, under 320 characters TOTAL (a music model will sing them). One line per line ` +
        `(newline-separated). Output ONLY the lyrics — no title, no section labels like ` +
        `[Verse]/[Chorus], no quotes, no commentary.`,
      prompt: `Theme: ${theme}${style ? `. Style/mood: ${style}` : ''}.`,
      maxTokens: 400,
      temperature: 0.95,
    });
    const lyrics = (r.text || '')
      .replace(/^\s*\[[^\]]*\]\s*$/gm, '') // strip [Verse]/[Chorus] label lines
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 360);
    if (!lyrics) return NextResponse.json({ success: false, error: 'Could not write lyrics, try again.' }, { status: 502 });
    return NextResponse.json({ success: true, lyrics });
  } catch {
    return NextResponse.json({ success: false, error: 'Lyrics generation failed.' }, { status: 502 });
  }
}
