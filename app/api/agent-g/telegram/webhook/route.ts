import { NextRequest } from 'next/server';
import { handleTelegramWebhook } from '@/lib/agent-g/channels/telegram-webhook-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleTelegramWebhook(request);
}