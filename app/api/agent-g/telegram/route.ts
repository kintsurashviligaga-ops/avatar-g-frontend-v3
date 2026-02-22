import { handleTelegramWebhook } from '@/lib/agent-g/channels/telegram-webhook-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  return handleTelegramWebhook(req);
}
