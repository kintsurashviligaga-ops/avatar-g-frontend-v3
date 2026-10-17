import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isValidGeorgianMobile, normalizePhoneNumber } from '@/lib/voice/phone';
import { maskPhoneNumber, phoneCallsReady, phoneConnectionStatus, phoneOtpProvider } from '@/lib/phone/connection';
import { createOtpCode, hashOtpCode, otpMatches } from '@/lib/phone/otp';
import { sendUbillOtp } from '@/lib/sms/providers/ubill';
import { checkOtpCode, sendOtpSms } from '@/lib/server/twilio-verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const startSchema = z.object({ action: z.literal('start'), phoneNumber: z.string().max(40) }).strict();
const verifySchema = z.object({ action: z.literal('verify'), challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
const toggleSchema = z.object({ enabled: z.boolean() }).strict();
const CHALLENGE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

async function currentUser(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const readiness = phoneConnectionStatus();
    if (!user) return apiSuccess({ guest: true, available: readiness.onboardingReady, callsReady: readiness.callsReady, verified: false, enabled: false, phone: null });

    const sb = createServiceRoleClient();
    const result = await sb.from('agent_g_user_prefs').select('phone_number,phone_verified,phone_verified_at,phone_agent_enabled').eq('user_id', user.id).maybeSingle();
    if (result.error) return apiError(result.error, 500, 'Failed to load phone connection');
    const verified = Boolean(result.data?.phone_verified && result.data.phone_number);
    return apiSuccess({
      guest: false,
      available: readiness.onboardingReady,
      callsReady: readiness.callsReady,
      verified,
      enabled: readiness.callsReady && verified && Boolean(result.data?.phone_agent_enabled),
      phone: verified ? maskPhoneNumber(String(result.data?.phone_number)) : null,
      verifiedAt: verified ? result.data?.phone_verified_at ?? null : null,
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to load phone connection');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await currentUser(request);
    const ipLimited = await checkRateLimit(request, RATE_LIMITS.AUTH_IP, user.id);
    if (ipLimited) return ipLimited;
    const userLimited = await checkRateLimitByKey(user.id, RATE_LIMITS.OTP_ADDRESS);
    if (userLimited) return userLimited;
    if (!phoneConnectionStatus().onboardingReady) return apiError(new Error('Phone OTP is not configured'), 503, 'Phone connection is not available yet');

    const body = await request.json().catch(() => null);
    const parsed = startSchema.safeParse(body);
    if (parsed.success) {
      const phone = normalizePhoneNumber(parsed.data.phoneNumber);
      if (!isValidGeorgianMobile(phone)) return apiError(new Error('invalid_phone_number'), 400, 'Enter a valid Georgian mobile number');
      const sb = createServiceRoleClient();
      const existing = await sb.from('agent_g_user_prefs').select('user_id').eq('phone_number', phone).eq('phone_verified', true).maybeSingle();
      if (existing.error) return apiError(existing.error, 500, 'Could not check phone ownership');
      if (existing.data && existing.data.user_id !== user.id) return apiError(new Error('phone_already_linked'), 409, 'This number is already linked to another account');

      await sb.from('agent_g_phone_otp_challenges').delete().eq('user_id', user.id).is('consumed_at', null);
      const id = randomUUID();
      const provider = phoneOtpProvider();
      if (!provider) return apiError(new Error('Phone OTP is not configured'), 503, 'Phone connection is not available yet');
      const code = provider === 'ubill' ? createOtpCode() : null;
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60_000).toISOString();
      const inserted = await sb.from('agent_g_phone_otp_challenges').insert({ id, user_id: user.id, phone_e164: phone, provider, code_hash: code ? hashOtpCode(code, id) : `external:${provider}`, expires_at: expiresAt });
      if (inserted.error) return apiError(inserted.error, 500, 'Could not start phone verification');
      try {
        if (provider === 'ubill') await sendUbillOtp(phone, code!);
        else {
          const sent = await sendOtpSms(phone);
          if (!sent.ok) throw new Error(sent.error);
        }
      } catch (error) {
        await sb.from('agent_g_phone_otp_challenges').delete().eq('id', id);
        console.warn('[agent-g/phone] OTP delivery failed', { userId: user.id, error: String(error) });
        return apiError(new Error('otp_delivery_failed'), 502, 'Could not send the verification code');
      }
      return apiSuccess({ challengeId: id, expiresAt, phone: maskPhoneNumber(phone) }, 201);
    }

    const verify = verifySchema.safeParse(body);
    if (!verify.success) return apiError(verify.error, 400, 'Invalid phone verification request');
    const sb = createServiceRoleClient();
    const challenge = await sb.from('agent_g_phone_otp_challenges').select('id,user_id,phone_e164,provider,code_hash,attempts,expires_at,consumed_at').eq('id', verify.data.challengeId).eq('user_id', user.id).maybeSingle();
    if (challenge.error) return apiError(challenge.error, 500, 'Could not read verification');
    const row = challenge.data;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now() || Number(row.attempts) >= MAX_ATTEMPTS) return apiError(new Error('invalid_or_expired_code'), 400, 'The code is invalid or expired');
    const approved = row.provider === 'twilio'
      ? (await checkOtpCode({ phone: row.phone_e164, code: verify.data.code })).ok
      : otpMatches(verify.data.code, row.code_hash, row.id);
    if (!approved) {
      await sb.from('agent_g_phone_otp_challenges').update({ attempts: Number(row.attempts) + 1 }).eq('id', row.id).eq('user_id', user.id).is('consumed_at', null);
      return apiError(new Error('invalid_code'), 400, 'The code is incorrect');
    }
    const consumed = await sb.from('agent_g_phone_otp_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', row.id).eq('user_id', user.id).is('consumed_at', null).select('id').maybeSingle();
    if (consumed.error || !consumed.data) return apiError(new Error('verification_already_used'), 409, 'Please request a new code');
    const saved = await sb.from('agent_g_user_prefs').upsert({ user_id: user.id, phone_number: row.phone_e164, phone_verified: true, phone_verified_at: new Date().toISOString(), phone_agent_enabled: false, voice_connected: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('phone_number,phone_verified,phone_verified_at').single();
    if (saved.error || !saved.data) return apiError(saved.error ?? new Error('save_failed'), 500, 'Could not save the verified number');
    return apiSuccess({ verified: true, enabled: false, callsReady: phoneCallsReady(), phone: maskPhoneNumber(row.phone_e164) });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return apiError(error, 401, 'Login required');
    return apiError(error, 500, 'Could not update phone connection');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await currentUser(request);
    const parsed = toggleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(parsed.error, 400, 'Invalid toggle request');
    if (parsed.data.enabled && !phoneCallsReady()) return apiError(new Error('phone_calls_not_ready'), 503, 'Phone calls are not available yet');
    const sb = createServiceRoleClient();
    const prefs = await sb.from('agent_g_user_prefs').select('phone_number,phone_verified').eq('user_id', user.id).maybeSingle();
    if (prefs.error) return apiError(prefs.error, 500, 'Could not read phone connection');
    if (parsed.data.enabled && !(prefs.data?.phone_verified && prefs.data.phone_number)) return apiError(new Error('phone_not_verified'), 409, 'Verify your phone number first');
    const updated = await sb.from('agent_g_user_prefs').upsert({ user_id: user.id, phone_agent_enabled: parsed.data.enabled, voice_connected: parsed.data.enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('phone_agent_enabled').single();
    if (updated.error) return apiError(updated.error, 500, 'Could not save phone connection');
    return apiSuccess({ enabled: Boolean(updated.data?.phone_agent_enabled), callsReady: phoneCallsReady() });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return apiError(error, 401, 'Login required');
    return apiError(error, 500, 'Could not update phone connection');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser(request);
    const sb = createServiceRoleClient();
    const result = await sb.from('agent_g_user_prefs').upsert({ user_id: user.id, phone_number: null, phone_verified: false, phone_verified_at: null, phone_agent_enabled: false, voice_connected: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('user_id').single();
    await sb.from('agent_g_phone_otp_challenges').delete().eq('user_id', user.id);
    if (result.error) return apiError(result.error, 500, 'Could not disconnect phone');
    return apiSuccess({ disconnected: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return apiError(error, 401, 'Login required');
    return apiError(error, 500, 'Could not disconnect phone');
  }
}
