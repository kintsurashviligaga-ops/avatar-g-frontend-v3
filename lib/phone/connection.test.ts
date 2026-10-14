/** @jest-environment node */
import { phoneCallsReady, phoneOtpProvider, phoneOtpReady } from './connection';

test('phone onboarding prefers existing Twilio Verify when configured', () => {
  const env = {
    PHONE_CONNECTION_UI_ENABLED: '1',
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_VERIFY_SERVICE_SID: 'VA123',
  } as NodeJS.ProcessEnv;
  expect(phoneOtpProvider(env)).toBe('twilio');
  expect(phoneOtpReady(env)).toBe(true);
});

test('uBill is accepted only with its key, brand, and signing secret', () => {
  const env = {
    PHONE_CONNECTION_UI_ENABLED: '1',
    PHONE_OTP_PROVIDER: 'ubill',
    UBILL_API_KEY: 'key',
    UBILL_BRAND_ID: '7',
    PHONE_OTP_SECRET: 'otp-secret',
  } as NodeJS.ProcessEnv;
  expect(phoneOtpProvider(env)).toBe('ubill');
  expect(phoneOtpReady(env)).toBe(true);
});

test('call readiness stays false until the real-call proof flag is set', () => {
  const env = {
    PHONE_AGENT_ENABLED: '1',
    PHONE_VOICE_PROVIDER: 'didww',
    DIDWW_API_KEY: 'key',
    PHONE_BRIDGE_URL: 'https://bridge.example',
    PHONE_BRIDGE_SHARED_SECRET: 'secret',
  } as NodeJS.ProcessEnv;
  expect(phoneCallsReady(env)).toBe(false);
  expect(phoneCallsReady({ ...env, PHONE_REAL_CALL_PROVEN: '1' })).toBe(true);
});
