/** @jest-environment node */
import { createOtpCode, hashOtpCode, otpMatches } from './otp';

const saved = process.env.PHONE_OTP_SECRET;
beforeEach(() => { process.env.PHONE_OTP_SECRET = 'test-secret'; });
afterAll(() => {
  if (saved === undefined) delete process.env.PHONE_OTP_SECRET;
  else process.env.PHONE_OTP_SECRET = saved;
});

test('creates six digits and matches only the same challenge/code', () => {
  const code = createOtpCode();
  const challenge = '00000000-0000-4000-8000-000000000000';
  const hash = hashOtpCode(code, challenge);
  expect(code).toMatch(/^\d{6}$/);
  expect(hash).not.toContain(code);
  expect(otpMatches(code, hash, challenge)).toBe(true);
  expect(otpMatches('000000', hash, challenge)).toBe(code === '000000');
  expect(otpMatches(code, hash, '00000000-0000-4000-8000-000000000001')).toBe(false);
});
