import { NextRequest, NextResponse } from 'next/server';
import { analyzeRoomImage } from '@/lib/gemini/image-analysis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, locale } = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      locale?: string;
    };

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'imageBase64 and mimeType required' },
        { status: 400 },
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
    }

    const result = await analyzeRoomImage(imageBase64, mimeType, locale ?? 'ka');
    return NextResponse.json({ ok: true, analysis: result });
  } catch (err) {
    console.error('[gemini/analyze] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
