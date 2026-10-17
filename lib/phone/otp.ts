import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

function secret(): string {
  return String(process.env.PHONE_OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

export function createOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtpCode(code: string, challengeId: string): string {
  const key = secret();
  if (!key) throw new Error('PHONE_OTP_SECRET is not configured');
  return createHmac('sha256', key).update(`myavatar:phone-otp:${challengeId}:${code}`).digest('hex');
}

export function otpMatches(code: string, expectedHash: string, challengeId: string): boolean {
  const actual = Buffer.from(hashOtpCode(code, challengeId), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
