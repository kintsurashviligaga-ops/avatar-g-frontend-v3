import 'server-only';

import { maskNumber } from '@/lib/agent-g/channels/whatsapp-text';
import { ubillReady } from '@/lib/sms/providers/ubill';

function isEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function twilioVerifyReady(env: NodeJS.ProcessEnv): boolean {
  return Boolean(String(env.TWILIO_ACCOUNT_SID ?? '').trim())
    && Boolean(String(env.TWILIO_AUTH_TOKEN ?? '').trim())
    && Boolean(String(env.TWILIO_VERIFY_SERVICE_SID ?? '').trim());
}

export function phoneOtpProvider(env: NodeJS.ProcessEnv = process.env): 'twilio' | 'ubill' | null {
  const provider = String(env.PHONE_OTP_PROVIDER ?? '').trim().toLowerCase();
  if (provider === 'twilio') return twilioVerifyReady(env) ? 'twilio' : null;
  if (provider === 'ubill') return ubillReady(env) && Boolean(String(env.PHONE_OTP_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()) ? 'ubill' : null;
  if (twilioVerifyReady(env)) return 'twilio';
  if (ubillReady(env) && Boolean(String(env.PHONE_OTP_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim())) return 'ubill';
  return null;
}

export function phoneOtpReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabled(env.PHONE_CONNECTION_UI_ENABLED) && phoneOtpProvider(env) !== null;
}

/**
 * This flag is deliberately stricter than “a key exists”. It is turned on only after the provider bridge
 * and a real Georgian call have been proven. Until then the UI may verify a number, but cannot claim that
 * Agent G can call it.
 */
export function phoneCallsReady(env: NodeJS.ProcessEnv = process.env): boolean {
  return isEnabled(env.PHONE_AGENT_ENABLED)
    && String(env.PHONE_VOICE_PROVIDER ?? '').trim().toLowerCase() === 'didww'
    && Boolean(String(env.DIDWW_API_KEY ?? '').trim())
    && Boolean(String(env.PHONE_BRIDGE_URL ?? '').trim())
    && Boolean(String(env.PHONE_BRIDGE_SHARED_SECRET ?? '').trim())
    && isEnabled(env.PHONE_REAL_CALL_PROVEN);
}

export function maskPhoneNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? '').trim();
  if (!digits) return null;
  return maskNumber(digits);
}

export function phoneConnectionStatus(env: NodeJS.ProcessEnv = process.env) {
  return { onboardingReady: phoneOtpReady(env), callsReady: phoneCallsReady(env) };
}
