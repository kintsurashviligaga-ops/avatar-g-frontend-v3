import 'server-only';

import { normalizePhoneNumber } from '@/lib/voice/phone';

const UBILL_SEND_URL = 'https://api.ubill.dev/v1/sms/send';

export function ubillReady(env: NodeJS.ProcessEnv = process.env): boolean {
  const brandId = Number.parseInt(String(env.UBILL_BRAND_ID ?? ''), 10);
  return Boolean(String(env.UBILL_API_KEY ?? '').trim()) && Number.isInteger(brandId) && brandId > 0;
}

export async function sendUbillOtp(phoneNumber: string, code: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!ubillReady(env)) throw new Error('SMS provider is not configured');
  const normalized = normalizePhoneNumber(phoneNumber);
  const digits = normalized.replace(/\D/g, '');
  const brandID = Number.parseInt(String(env.UBILL_BRAND_ID), 10);
  const text = `MyAvatar.ge-ის დადასტურების კოდია: ${code}. კოდი მოქმედებს 10 წუთი.`;

  const response = await fetch(UBILL_SEND_URL, {
    method: 'POST',
    headers: { key: String(env.UBILL_API_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandID, numbers: [digits], text, otp: true, stopList: true }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as { statusID?: number; message?: string };
  if (!response.ok || body.statusID !== 0) {
    throw new Error(`SMS provider rejected OTP (${response.status}:${String(body.statusID ?? 'unknown')})`);
  }
}
