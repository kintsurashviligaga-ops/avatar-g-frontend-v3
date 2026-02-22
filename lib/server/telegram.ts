import 'server-only';

export type TelegramSendResult = {
  ok: boolean;
  status: number | null;
  error?: string;
};

function normalize(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function resolveTelegramDefaultChatId(): string {
  return normalize(process.env.TELEGRAM_NOTIFY_CHAT_ID) || normalize(process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramTextMessage(params: {
  text: string;
  chatId?: string;
}): Promise<TelegramSendResult> {
  const token = normalize(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = normalize(params.chatId) || resolveTelegramDefaultChatId();
  const text = String(params.text || '').trim().slice(0, 3500);

  if (!token) return { ok: false, status: null, error: 'missing_telegram_bot_token' };
  if (!chatId) return { ok: false, status: null, error: 'missing_telegram_chat_id' };
  if (!text) return { ok: false, status: null, error: 'empty_text' };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.description || 'telegram_send_failed',
      };
    }

    return {
      ok: true,
      status: response.status,
    };
  } catch {
    return {
      ok: false,
      status: null,
      error: 'telegram_send_exception',
    };
  }
}
