import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { sendTelegramMessage } from '@/lib/agent-g/channels/telegram-client';

export const dynamic = 'force-dynamic';

const schema = z.object({
  chat_id: z.string().min(1),
  text: z.string().min(1).max(4000),
  parse_mode: z.enum(['Markdown', 'HTML']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid send payload');

    const secret = request.headers.get('x-agent-g-secret');
    const isInternal = Boolean(process.env.AGENT_G_INTERNAL_SECRET) && secret === process.env.AGENT_G_INTERNAL_SECRET;

    if (!isInternal) {
      const user = await getAuthenticatedUser(request);
      if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const sent = await sendTelegramMessage({
      chatId: payload.data.chat_id,
      text: payload.data.text,
      parseMode: payload.data.parse_mode,
    });

    return apiSuccess(sent);
  } catch (error) {
    return apiError(error, 500, 'Telegram send failed');
  }
}
