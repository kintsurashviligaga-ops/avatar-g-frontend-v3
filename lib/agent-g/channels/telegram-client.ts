import crypto from 'node:crypto';

export type TelegramSendParams = {
  chatId: string;
  text: string;
  parseMode?: 'Markdown' | 'HTML';
};

const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function isAllowedTelegramUser(chatId: string): boolean {
  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true;
  return allowed.includes(chatId);
}

export async function sendTelegramMessage(params: TelegramSendParams): Promise<{ ok: boolean; simulated: boolean; response?: unknown }> {
  const token = getBotToken();
  if (!token) {
    return { ok: true, simulated: true, response: { reason: 'Missing TELEGRAM_BOT_TOKEN' } };
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: params.parseMode,
      disable_web_page_preview: false,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  return { ok: response.ok, simulated: false, response: payload };
}

export async function telegramGetFilePath(fileId: string): Promise<string | null> {
  const token = getBotToken();
  if (!token) return null;

  const response = await fetch(`${TELEGRAM_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
    method: 'GET',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { file_path?: string } } | null;
  if (!response.ok || !payload?.ok || !payload.result?.file_path) return null;

  return payload.result.file_path;
}

export function telegramFileDownloadUrl(filePath: string): string | null {
  const token = getBotToken();
  if (!token) return null;
  return `${TELEGRAM_API}/file/bot${token}/${filePath}`;
}

export function buildOneTimeCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let code = '';

  for (let idx = 0; idx < length; idx += 1) {
    const byte = bytes[idx] ?? 0;
    code += chars[byte % chars.length];
  }

  return code;
}
