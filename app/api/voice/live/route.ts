/**
 * app/api/voice/live/route.ts — mints a SHORT-LIVED EPHEMERAL token for a browser-direct Gemini
 * Multimodal Live session. This route is request/response (Vercel-safe); the persistent WebSocket to
 * Gemini is opened by the BROWSER (lib/voice/geminiLive.ts) using this token, so the raw GEMINI_API_KEY
 * never reaches the client.
 *
 * INERT BY DEFAULT + fail-closed: returns 503 unless GEMINI_LIVE_ENABLED is truthy ('1'|'true'|'yes'|'on') AND a Gemini key is
 * configured. The principal is the AUTHENTICATED CALLER (requireUser → session cookie), never a userId
 * from the request body — otherwise anyone could mint a cost-bearing token against another funded
 * account (IDOR). Rate-limited (EXPENSIVE) + credit-gated so a flipped flag can't be abused to burn the
 * platform's Gemini quota. Additive: does not touch the existing VAD/realtime voice stack.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { RATE_LIMITS, checkRateLimit } from '@/lib/api/rate-limit';
import { isTruthyFlag } from '@/lib/env/flag';
import { structuredLog } from '@/lib/logger';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { MINIMUM_CREDITS_TO_START_CALL, hasMinimumVoiceCredits } from '@/lib/voice/credits';
import { DEFAULT_LIVE_MODEL } from '@/lib/voice/geminiLive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({ model: z.string().optional() });

const AUTH_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const SESSION_TTL_MS = 30 * 60 * 1000; // token valid ~30 min
const NEW_SESSION_WINDOW_MS = 2 * 60 * 1000; // must OPEN the session within ~2 min

async function getCreditsBalance(userId: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase.from('credits').select('balance').eq('user_id', userId).maybeSingle();
  return Number(data?.balance || 0);
}

export async function POST(request: NextRequest) {
  try {
    // ── Gate 1: feature flag (inert by default; accepts '1'|'true'|'yes'|'on') ──
    if (!isTruthyFlag(process.env.GEMINI_LIVE_ENABLED)) {
      return NextResponse.json({ error: 'gemini_live_disabled' }, { status: 503 });
    }
    // ── Gate 2: key present (fail-closed, never leaked) ──────────────────────
    const apiKey = resolveGeminiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'gemini_key_missing' }, { status: 503 });
    }
    // ── Gate 3: rate limit a cost-bearing mint ───────────────────────────────
    const limited = await checkRateLimit(request, RATE_LIMITS.EXPENSIVE);
    if (limited) return limited;

    // ── Gate 4: authenticate the CALLER via their session (never a body userId) ──
    let userId: string;
    try {
      userId = (await requireUser()).id;
    } catch {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }

    const payload = requestSchema.safeParse(await request.json().catch(() => ({})));
    const model = (payload.success && payload.data.model) || DEFAULT_LIVE_MODEL;

    // ── Gate 5: the authenticated caller must hold call credits ──────────────
    const creditsBalance = await getCreditsBalance(userId);
    if (!hasMinimumVoiceCredits(creditsBalance)) {
      return NextResponse.json(
        { error: 'insufficient_credits', required: MINIMUM_CREDITS_TO_START_CALL, current: creditsBalance },
        { status: 402 },
      );
    }

    const now = Date.now();
    const expireTime = new Date(now + SESSION_TTL_MS).toISOString();
    const newSessionExpireTime = new Date(now + NEW_SESSION_WINDOW_MS).toISOString();

    // Mint the ephemeral token server-side (key stays server-side). Constrain it to the Live model so a
    // leaked token can't be repointed at a different (costlier) model.
    const res = await fetch(`${AUTH_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: { model },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      structuredLog('warn', 'voice.live.token_mint_failed', { status: res.status, detail: detail.slice(0, 300) });
      // Do not leak the upstream body / key to the client.
      return NextResponse.json({ error: 'live_token_unavailable', status: res.status }, { status: 503 });
    }
    const data = (await res.json().catch(() => ({}))) as { name?: string };
    const token = String(data.name || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'live_token_empty' }, { status: 503 });
    }

    return NextResponse.json({ token, model, expiresAt: expireTime });
  } catch (error) {
    structuredLog('error', 'voice.live.failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'voice_live_failed' }, { status: 500 });
  }
}
