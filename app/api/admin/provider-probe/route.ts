import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { veoTransport } from '@/lib/veo/engine';
import { checkVertexAuth } from '@/lib/veo/authCheck';
import { describeElevenLabsAccount, elevenLabsVoiceState, readElevenLabsAccount } from '@/lib/elevenlabs/account';
import { vertexConfigProblems } from '@/lib/veo/vertexAuth';
import { checkGoogleAiReadiness } from '@/lib/ai/google/readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/admin/provider-probe — CALL each provider and report what it actually says.
 *
 * ⚠️ WHY THIS IS NOT /api/health. That endpoint reports whether a key is SET, which turns out to be a
 * different question from whether it WORKS, and the gap between them is where a very expensive bug hid:
 *
 *   /api/health  → gemini: true          (the key is configured on Vercel)
 *   /api/chat/gemini → provider:"anthropic" ×3   (every Gemini model failed; the fallback answered)
 *
 * Both statements were true at the same time. A configured-but-rejected key looks identical to a
 * working one from the environment, and the only symptom is that the product quietly runs on its
 * backups — different engine, different quality, different cost — while every dashboard says healthy.
 *
 * So this makes the provider itself answer. Each probe is a cheap READ (list models, account info,
 * balance) — nothing is generated, nothing is charged — and the provider's own error text is returned
 * verbatim, because "which key is broken" is never as useful as "what did it say when we tried".
 *
 * ADMIN ONLY, and it returns no key material: statuses and provider error messages, nothing else.
 */

interface ProbeResult {
  provider: string;
  configured: boolean;
  ok: boolean;
  detail: string;
}

const TIMEOUT = 12_000;

async function probe(
  provider: string,
  key: string | undefined,
  run: (k: string) => Promise<ProbeResult>,
): Promise<ProbeResult> {
  if (!key || !key.trim()) return { provider, configured: false, ok: false, detail: 'not configured' };
  try {
    return await run(key.trim());
  } catch (e) {
    return { provider, configured: true, ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : 'probe threw' };
  }
}

const get = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT) });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  const gate = await assertAdminAccess(req, user);
  // 404, not 403 — an unauthorised caller should not learn the route exists.
  if (!gate.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const results = await Promise.all([
    // GEMINI — chat, images and Lyria run on Vertex AI only (MASTER TASK v3.1). The probe asks whether Vertex can serve
    // them: the policy, the variable names and a minted Workload Identity token. No model call, nothing billed, and an
    // AI Studio key is neither read nor sent (the Developer API listing this replaces proved nothing about Vertex).
    checkGoogleAiReadiness({ live: true }).then(
      (r): ProbeResult => ({ provider: 'gemini', configured: r.configured, ok: r.ok, detail: r.detail }),
    ),

    // VEO — which Google route renders clips right now, and what still keeps Vertex AI off (variable NAMES only).
    // With Vertex configured it also proves the keyless chain works: token, bucket, signBlob — no Veo call, free.
    (async (): Promise<ProbeResult> => {
      const transport = veoTransport();
      const missing = vertexConfigProblems();
      const detail = `transport:${transport ?? 'none'} · google-only:true · vertex:${missing.length ? `missing ${missing.join(', ')}` : 'ready'}`;
      const result: ProbeResult = missing.length
        ? { provider: 'veo', configured: transport !== null, ok: transport !== null, detail }
        : await checkVertexAuth(get).then((auth) => ({
            provider: 'veo',
            configured: true,
            ok: transport !== null && auth.ok,
            detail: `${detail} · auth:${auth.steps.join(' ')}`,
          }));
      // One log line, so the keyless-chain result can be read from the deployment's runtime logs and not only from the
      // admin's screen. Statuses, variable NAMES and redacted errors only: checkVertexAuth never returns a token.
      // console.warn, not info: next.config strips every console call but error/warn from deployed builds.
      console.warn(`[provider-probe] veo ok=${result.ok} ${result.detail}`);
      return result;
    })(),

    probe('anthropic', process.env.ANTHROPIC_API_KEY, async (k) => {
      const r = await get('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' },
      });
      return { provider: 'anthropic', configured: true, ok: r.ok, detail: `HTTP ${r.status}` };
    }),

    probe('replicate', process.env.REPLICATE_API_TOKEN, async (k) => {
      const r = await get('https://api.replicate.com/v1/account', { headers: { Authorization: `Bearer ${k}` } });
      const j = (await r.json().catch(() => ({}))) as { username?: string };
      return { provider: 'replicate', configured: true, ok: r.ok, detail: r.ok ? `account ${j.username ?? 'ok'}` : `HTTP ${r.status}` };
    }),

    // ELEVENLABS — every text-to-speech leg in the product. Reports the plan, whether it allows the cloned Georgian
    // voices, and the characters left: an account whose plan has no cloning, or no characters, is valid-but-useless and
    // looks like a working key everywhere else (2026-10-17 09:31Z: `401 subscription_required / ivc_not_permitted`).
    probe('elevenlabs', process.env.ELEVENLABS_API_KEY, async (k) => {
      const r = await get('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': k } });
      if (!r.ok) return { provider: 'elevenlabs', configured: true, ok: false, detail: `HTTP ${r.status}` };
      const account = readElevenLabsAccount(await r.json().catch(() => null));
      return { provider: 'elevenlabs', configured: true, ok: elevenLabsVoiceState(account) === 'ok', detail: describeElevenLabsAccount(account) };
    }),

    probe('heygen', process.env.HEYGEN_API_KEY, async (k) => {
      const r = await get('https://api.heygen.com/v1/user/remaining_quota', { headers: { 'X-Api-Key': k } });
      const body = await r.text().catch(() => '');
      return { provider: 'heygen', configured: true, ok: r.ok, detail: r.ok ? body.slice(0, 120) : `HTTP ${r.status}` };
    }),

    // STRIPE — the mode matters more than the balance: a site in test mode takes no real money, however
    // valid the key is.
    probe('stripe', process.env.STRIPE_SECRET_KEY, async (k) => {
      const r = await get('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${k}` } });
      const mode = k.startsWith('sk_live_') ? 'LIVE' : k.startsWith('sk_test_') ? 'TEST — takes no real money' : 'unknown mode';
      return { provider: 'stripe', configured: true, ok: r.ok && k.startsWith('sk_live_'), detail: `${mode} · HTTP ${r.status}` };
    }),

    probe('resend', process.env.RESEND_API_KEY, async (k) => {
      const r = await get('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${k}` } });
      if (!r.ok) return { provider: 'resend', configured: true, ok: false, detail: `HTTP ${r.status}` };
      const j = (await r.json()) as { data?: Array<{ name?: string; status?: string }> };
      const domains = (j.data ?? []).map((d) => `${d.name}:${d.status}`);
      // A verified domain is the thing that decides whether sign-up email actually leaves the building.
      const verified = (j.data ?? []).some((d) => d.status === 'verified');
      return { provider: 'resend', configured: true, ok: verified, detail: domains.join(', ') || 'no domains' };
    }),
  ]);

  const broken = results.filter((r) => r.configured && !r.ok).map((r) => r.provider);
  const unset = results.filter((r) => !r.configured).map((r) => r.provider);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    summary: {
      live: results.filter((r) => r.ok).length,
      configured_but_failing: broken,
      not_configured: unset,
    },
    results,
    billingVerification: {
      status: 'not_tested',
      paidInference: false,
      reason: 'Diagnostic GET requests never generate content. Model availability does not prove a funded inference request.',
    },
    note: 'Read-only provider diagnostics. No generation or paid billing probe is submitted.',
  });
}
