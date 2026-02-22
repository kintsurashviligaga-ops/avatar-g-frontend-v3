import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramTextMessage } from '@/lib/server/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  message?: string;
  chatId?: string;
};

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedAdminKey = normalize(process.env.ADMIN_KEY);
  const providedAdminKey = normalize(req.headers.get('x-admin-key'));

  if (!expectedAdminKey || providedAdminKey !== expectedAdminKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const message = normalize(body.message);
    const chatId = normalize(body.chatId);

    if (!message) {
      return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 });
    }

    const result = await sendTelegramTextMessage({
      text: message,
      chatId: chatId || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error || 'Telegram send failed' }, { status: 502 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Telegram send failed' }, { status: 500 });
  }
}
