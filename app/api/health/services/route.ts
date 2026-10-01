/**
 * GET /api/health/services
 *
 * Production-grade connectivity probe for every AI provider + infrastructure
 * integration wired into MyAvatar.ge. Each probe:
 *   - confirms the env var is present
 *   - performs the lightest possible authenticated call (model list, account
 *     info, or HEAD request) — never burns generation credits
 *   - reports CONNECTED | UNCONFIGURED | ERROR with latency
 *
 * Protected by ADMIN_KEY query param to prevent exfiltration of integration
 * surface. Caller: `GET /api/health/services?key=<ADMIN_KEY>`
 *
 * Returns JSON. NEVER throws — failures are encoded per-service so the matrix
 * always renders even when one provider is down.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30; // health probes must finish fast

type ProbeStatus = 'CONNECTED' | 'UNCONFIGURED' | 'ERROR';

interface ProbeResult {
  service: string;
  category: 'llm' | 'image' | 'video' | 'music' | 'voice' | 'avatar' | 'infra' | 'billing' | 'monitoring';
  status: ProbeStatus;
  latencyMs: number | null;
  message: string;
  envVar: string;
}

const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function probe(
  service: string,
  category: ProbeResult['category'],
  envVar: string,
  envValue: string | undefined,
  call: () => Promise<{ ok: boolean; message: string }>,
): Promise<ProbeResult> {
  if (!envValue?.trim()) {
    return { service, category, status: 'UNCONFIGURED', latencyMs: null, message: `${envVar} not set`, envVar };
  }
  const t0 = Date.now();
  try {
    const r = await call();
    return {
      service,
      category,
      status: r.ok ? 'CONNECTED' : 'ERROR',
      latencyMs: Date.now() - t0,
      message: r.message,
      envVar,
    };
  } catch (e) {
    return {
      service,
      category,
      status: 'ERROR',
      latencyMs: Date.now() - t0,
      message: e instanceof Error ? e.message.slice(0, 120) : 'probe threw',
      envVar,
    };
  }
}

export async function GET(req: NextRequest) {
  // Auth gate — only admins can see the integration surface
  const adminKey = process.env.ADMIN_KEY;
  const provided = req.nextUrl.searchParams.get('key');
  if (!adminKey || provided !== adminKey) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const probes: Array<Promise<ProbeResult>> = [
    // ── LLM / Text ─────────────────────────────────────────────────────────
    probe('Anthropic Claude', 'llm', 'ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY, async () => {
      const r = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      });
      return { ok: r.ok, message: r.ok ? `${r.status} OK` : `${r.status} ${r.statusText}` };
    }),
    probe('OpenAI', 'llm', 'OPENAI_API_KEY', process.env.OPENAI_API_KEY, async () => {
      const r = await fetchWithTimeout('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      return { ok: r.ok, message: r.ok ? `${r.status} OK` : `${r.status} ${r.statusText}` };
    }),
    probe('Google Gemini', 'llm', 'GEMINI_API_KEY', process.env.GEMINI_API_KEY, async () => {
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      );
      return { ok: r.ok, message: r.ok ? `${r.status} OK` : `${r.status} ${r.statusText}` };
    }),

    // ── Image ──────────────────────────────────────────────────────────────
    probe('NanoBanana (image)', 'image', 'NANOBANANA_API_KEY', process.env.NANOBANANA_API_KEY, async () => {
      const base = process.env.NANOBANANA_API_BASE_URL || 'https://api.nanobananaapi.ai';
      // GET record-info with a sentinel taskId — auth-valid keys hit the app layer
      // (returns 200 with code:422 "record does not exist"), invalid keys are rejected
      // at HTTP layer with 401/403.
      const r = await fetchWithTimeout(`${base}/api/v1/nanobanana/record-info?taskId=healthcheck`, {
        headers: { Authorization: `Bearer ${process.env.NANOBANANA_API_KEY}` },
      });
      if ([401, 403].includes(r.status)) {
        return { ok: false, message: `${r.status} auth rejected` };
      }
      return { ok: r.ok, message: `${r.status} OK · key valid` };
    }),
    probe('Replicate (fallback)', 'image', 'REPLICATE_API_TOKEN', process.env.REPLICATE_API_TOKEN, async () => {
      const r = await fetchWithTimeout('https://api.replicate.com/v1/account', {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
      });
      const ok = r.ok;
      let msg = `${r.status} ${r.statusText}`;
      if (ok) {
        const j = (await r.json().catch(() => ({}))) as { username?: string; type?: string };
        msg = `${r.status} OK · ${j.username ?? 'user'}/${j.type ?? '?'}`;
      }
      return { ok, message: msg.slice(0, 80) };
    }),

    // ── Video ──────────────────────────────────────────────────────────────
    probe('LTX Video', 'video', 'LTX_VIDEO_API_KEY', process.env.LTX_VIDEO_API_KEY ?? process.env.LTX2_API_KEY, async () => {
      const key = process.env.LTX_VIDEO_API_KEY ?? process.env.LTX2_API_KEY;
      // LTX has no list endpoint; do an OPTIONS or POST with invalid body to confirm 401 vs 200
      const r = await fetchWithTimeout('https://api.ltx.video/v1/text-to-video', {
        method: 'OPTIONS',
        headers: { Authorization: `Bearer ${key}` },
      });
      // OPTIONS often returns 204/200/405 — anything that's NOT 401/403 means key works
      return {
        ok: ![401, 403].includes(r.status),
        message: `${r.status} ${r.statusText}`.slice(0, 80),
      };
    }),

    // ── Music ──────────────────────────────────────────────────────────────
    probe('Udio (music)', 'music', 'UDIO_API_KEY', process.env.UDIO_API_KEY, async () => {
      const base = process.env.UDIO_API_URL || 'https://udioapi.pro';
      const r = await fetchWithTimeout(`${base}/api/feed?limit=1`, {
        headers: { Authorization: `Bearer ${process.env.UDIO_API_KEY}` },
      });
      return {
        ok: ![401, 403].includes(r.status),
        message: `${r.status} ${r.statusText}`.slice(0, 80),
      };
    }),

    // ── Voice TTS ──────────────────────────────────────────────────────────
    probe('ElevenLabs (TTS)', 'voice', 'ELEVENLABS_API_KEY', process.env.ELEVENLABS_API_KEY, async () => {
      const r = await fetchWithTimeout('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
      });
      if (!r.ok) return { ok: false, message: `${r.status} ${r.statusText}` };
      const j = (await r.json().catch(() => ({}))) as { subscription?: { character_count?: number; character_limit?: number } };
      const used = j.subscription?.character_count ?? 0;
      const limit = j.subscription?.character_limit ?? 0;
      return { ok: true, message: `${r.status} OK · ${used}/${limit} chars used` };
    }),

    // ── Avatar / Talking Head ──────────────────────────────────────────────
    probe('HeyGen (avatar)', 'avatar', 'HEYGEN_API_KEY', process.env.HEYGEN_API_KEY, async () => {
      // /v2/voices is much lighter than /v2/avatars (~5KB vs >1MB) but still
      // requires a valid API key — perfect for a fast reachability probe.
      // Allow extra timeout since HeyGen US-East has variable latency.
      const r = await fetchWithTimeout(
        'https://api.heygen.com/v2/voices',
        { headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY! } },
        12000,
      );
      if (!r.ok) return { ok: false, message: `${r.status} ${r.statusText}` };
      const j = (await r.json().catch(() => ({}))) as { data?: { voices?: unknown[] } };
      const count = j.data?.voices?.length;
      return { ok: true, message: `${r.status} OK · ${count ?? '?'} voices available` };
    }),

    // ── Infra ──────────────────────────────────────────────────────────────
    probe('Supabase (DB+Auth)', 'infra', 'NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL, async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
      const r = await fetchWithTimeout(`${url}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
      });
      return { ok: r.ok, message: `${r.status} ${r.statusText}` };
    }),

    // ── Billing ────────────────────────────────────────────────────────────
    probe('Stripe', 'billing', 'STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY, async () => {
      const r = await fetchWithTimeout('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      return { ok: r.ok, message: `${r.status} ${r.statusText}` };
    }),

    // ── Monitoring ─────────────────────────────────────────────────────────
    probe(
      'Sentry',
      'monitoring',
      'NEXT_PUBLIC_SENTRY_DSN',
      // sentry.server.config.ts accepts either SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN.
      // Probe both so the matrix matches the runtime behavior.
      process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
      async () => {
        const dsn = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)!;
        const match = dsn.match(/^https:\/\/[a-f0-9]+@([\w.-]+)\/([0-9]+)$/);
        if (!match) return { ok: false, message: 'DSN format invalid' };
        const [, host, projectId] = match;
        // Optional reachability ping — Sentry returns 200/405 on the project envelope endpoint
        try {
          const r = await fetchWithTimeout(`https://${host}/api/${projectId}/envelope/`, { method: 'OPTIONS' }, 4000);
          return { ok: true, message: `DSN valid · host=${host} · probe ${r.status}` };
        } catch {
          return { ok: true, message: `DSN valid · host=${host} (no reach probe)` };
        }
      },
    ),
  ];

  const results = await Promise.all(probes);

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status.toLowerCase() as Lowercase<ProbeStatus>]++;
      return acc;
    },
    { connected: 0, unconfigured: 0, error: 0 } as Record<Lowercase<ProbeStatus>, number>,
  );

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      summary,
      results: results.sort((a, b) => a.category.localeCompare(b.category) || a.service.localeCompare(b.service)),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
