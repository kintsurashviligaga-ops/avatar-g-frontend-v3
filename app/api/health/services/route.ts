/**
 * GET /api/health/services
 *
 * Production-grade connectivity probe for every provider + infrastructure
 * integration wired into MyAvatar.ge. Each probe:
 *   - confirms the env var is present
 *   - performs the lightest possible authenticated call (model list, account
 *     info, or HEAD request) — never burns generation credits
 *   - reports CONNECTED | UNCONFIGURED | ERROR with latency
 *
 * Admin-only, to prevent exfiltration of integration surface: a signed-in admin (the email allowlist) or the
 * `x-admin-key: <ADMIN_KEY>` HEADER. ⚠️ It used to take the key as `?key=` — a URL lands in access logs, traces and
 * error reports — so the query form is no longer accepted.
 * Caller: `curl -H "x-admin-key: $ADMIN_KEY" https://…/api/health/services`
 *
 * Returns JSON. NEVER throws — failures are encoded per-service so the matrix
 * always renders even when one provider is down.
 *
 * GOOGLE ONLY (MASTER TASK v3.1). Every model call is on Vertex AI and no other vendor may serve one, so the outside
 * vendors (Anthropic, OpenAI, NanoBanana, Replicate, LTX, Udio, HeyGen) are not probed: a probe sent this deployment's
 * key for a service it must not use, and its answer said nothing about what runs. Gemini (Vertex readiness) and Cloud
 * TTS cover the models; Supabase, Stripe and Sentry the infrastructure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminKeyHeaderMatches } from '@/lib/security/opsAccess';
import { isAdmin } from '@/lib/auth/adminGuard';
import { checkCloudTts } from '@/lib/audio/google-tts';
import { checkGoogleAiReadiness } from '@/lib/ai/google/readiness';

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
      // Redact BEFORE truncating: a thrown message must never carry the probe's own credential into the response.
      message: e instanceof Error ? e.message.split(envValue).join('[redacted]').slice(0, 120) : 'probe threw',
      envVar,
    };
  }
}

async function googleGeminiProbe(): Promise<ProbeResult> {
  const base = { service: 'Google Gemini (Vertex AI)', category: 'llm', envVar: 'GCP_PROJECT_ID' } as const;
  const t0 = Date.now();
  const readiness = await checkGoogleAiReadiness({ live: true });
  if (!readiness.configured) return { ...base, status: 'UNCONFIGURED', latencyMs: null, message: readiness.detail };
  return { ...base, status: readiness.ok ? 'CONNECTED' : 'ERROR', latencyMs: Date.now() - t0, message: readiness.detail };
}

/** Every spoken line runs on Google Cloud TTS with the Vertex identity (PR 5d): its free voices list, nothing synthesised. */
async function cloudTtsProbe(): Promise<ProbeResult> {
  const base = { service: 'Google Cloud TTS (voice)', category: 'voice', envVar: 'GCP_PROJECT_ID' } as const;
  const t0 = Date.now();
  const check = await checkCloudTts();
  if (check.state === 'unconfigured') return { ...base, status: 'UNCONFIGURED', latencyMs: null, message: check.detail };
  return { ...base, status: check.state === 'ok' ? 'CONNECTED' : 'ERROR', latencyMs: Date.now() - t0, message: check.detail };
}

export async function GET(req: NextRequest) {
  // Auth gate — only admins can see the integration surface (header key, constant-time; or an admin session).
  if (!adminKeyHeaderMatches(req) && !(await isAdmin().catch(() => false))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const probes: Array<Promise<ProbeResult>> = [
    // ── LLM / Text ─────────────────────────────────────────────────────────
    // Gemini runs on Vertex AI only (MASTER TASK v3.1): the policy, the variable names and a minted Workload Identity
    // token. No model call, nothing billed, and an AI Studio key is neither read nor sent.
    googleGeminiProbe(),

    // ── Voice TTS ──────────────────────────────────────────────────────────
    // ElevenLabs reads no line since PR 5d, so it is no longer probed (PR 6b).
    cloudTtsProbe(),

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
