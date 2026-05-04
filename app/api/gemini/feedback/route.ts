import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { messageId, rating } = (await req.json()) as {
      messageId?: string;
      rating?: number;
    };

    if (!messageId || ![-1, 1].includes(rating as number)) {
      return NextResponse.json({ error: 'Invalid request: messageId and rating (-1|1) required' }, { status: 400 });
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      await supabase
        .from('gemini_message_feedback')
        .upsert({ message_id: messageId, rating }, { onConflict: 'message_id' });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[gemini/feedback] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
