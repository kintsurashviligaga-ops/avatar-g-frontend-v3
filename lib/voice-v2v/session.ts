import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';

import type { RealtimeVoiceLanguage } from '@/types/voice';

type SessionTokenPayload = {
  sessionId: string;
  language: RealtimeVoiceLanguage;
  userId?: string | null;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getSessionSecret(): string {
  const secret = String(process.env.VOICE_V2V_WS_TOKEN_SECRET || '').trim();
  if (secret) {
    return secret;
  }

  const fallback = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (fallback) {
    return fallback;
  }

  return 'voice-v2v-local-dev-secret';
}

function signTokenPayload(encodedPayload: string): string {
  return createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}

export function issueRealtimeSessionToken(input: {
  sessionId?: string;
  language: RealtimeVoiceLanguage;
  userId?: string | null;
  ttlSeconds?: number;
}): {
  token: string;
  sessionId: string;
  expiresAt: number;
} {
  const sessionId = String(input.sessionId || randomUUID()).trim() || randomUUID();
  const now = Date.now();
  const ttlSeconds = Number(input.ttlSeconds || 120);
  const expiresAt = now + Math.max(30_000, ttlSeconds * 1000);

  const payload: SessionTokenPayload = {
    sessionId,
    language: input.language,
    userId: input.userId ?? null,
    exp: expiresAt,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    sessionId,
    expiresAt,
  };
}

export function verifyRealtimeSessionToken(token: string): SessionTokenPayload | null {
  const value = String(token || '').trim();
  if (!value.includes('.')) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = signTokenPayload(encodedPayload);
  if (signature !== expected) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionTokenPayload;
    if (!payload?.sessionId || !payload?.language || !payload?.exp) {
      return null;
    }

    if (Date.now() >= Number(payload.exp)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
