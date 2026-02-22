/** @jest-environment node */

import { POST as sendOtpPost } from '@/app/api/auth/otp/send/route';
import { POST as checkOtpPost } from '@/app/api/auth/otp/check/route';
import { checkOtpCode, normalizeOtpCode, normalizePhoneE164, sendOtpSms } from '@/lib/server/twilio-verify';
import { sendTelegramTextMessage } from '@/lib/server/telegram';

jest.mock('@/lib/api/rate-limit', () => ({
  RATE_LIMITS: { AUTH: { maxRequests: 5, windowMs: 900000 } },
  checkRateLimit: jest.fn(async () => null),
}));

jest.mock('@/lib/server/twilio-verify', () => ({
  normalizePhoneE164: jest.fn((value: string) => {
    if (!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('invalid_phone');
    return value;
  }),
  normalizeOtpCode: jest.fn((value: string) => {
    if (!/^\d{4,8}$/.test(value)) throw new Error('invalid_code');
    return value;
  }),
  sendOtpSms: jest.fn(async () => ({ ok: true })),
  checkOtpCode: jest.fn(async () => ({ ok: true, status: 'approved' })),
}));

jest.mock('@/lib/server/telegram', () => ({
  sendTelegramTextMessage: jest.fn(async () => ({ ok: true, status: 200 })),
}));

describe('OTP routes', () => {
  test('send route validates phone and returns 400 for invalid input', async () => {
    const req = new Request('http://localhost/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '123' }),
    });

    const res = await sendOtpPost(req as never);
    expect(res.status).toBe(400);
  });

  test('check route returns approved and triggers telegram notification', async () => {
    const req = new Request('http://localhost/api/auth/otp/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+995555555555', code: '123456' }),
    });

    const res = await checkOtpPost(req as never);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('approved');
    expect(normalizePhoneE164).toHaveBeenCalled();
    expect(normalizeOtpCode).toHaveBeenCalled();
    expect(checkOtpCode).toHaveBeenCalled();
    expect(sendOtpSms).not.toHaveBeenCalled();
    expect(sendTelegramTextMessage).toHaveBeenCalled();
  });
});
