/**
 * app/api/system/film-selftest/route.ts
 * =====================================
 * AUTOMATED PIPELINE SELF-TEST — the sensor of the self-improving film system.
 *
 *   GET /api/system/film-selftest
 *
 * Unlike /film-readiness (env presence only), this endpoint actively probes the
 * LIVE critical-path CONTRACTS that have regressed before, so a scheduled agent
 * can catch a re-break the moment it ships — WITHOUT spending a single render
 * credit (every probe is free: a malformed-token poll + a sub-threshold
 * assemble, both of which the pipeline rejects cheaply by design):
 *
 *   • poll-contract   — a { predictionId } poll must NOT 400 "Invalid request"
 *                       (the bug that froze every render — see orchestrate
 *                       schema refine). Expected: a normal poll/error response.
 *   • stitch-contract — assemble must be reachable for anonymous callers and
 *                       reject a <2-segment body with "at least 2 …", NOT 401
 *                       (the dead-end that lost the final cut) or 500.
 *
 * It also maps the film's engines to env presence (names only, never values) and
 * returns a 0–100 health score + ranked recommendations — the structured signal
 * the scheduled monitor consumes to decide what to improve.
 *
 * ⚠️ GOOGLE'S ENGINES ONLY (MASTER TASK v3.1). Until 2026-10-23 the map held nine providers, with Replicate ("global render
 * fallback") and LTX critical, RunPod as "InsightFace identity + MusicGen fallback", and Nano Banana, Udio, ElevenLabs,
 * HeyGen and Anthropic beside them; `?udio=1` read Udio's credit balance. The film uses none of them, so a Google-only
 * deploy scored DEGRADED and was told to provision them. The map is now the four legs of lib/chat/filmEngines (Gemini
 * storyboard and director, Veo clips critical; Lyria score, Cloud TTS voice optional) plus RunPod as the optional GPU
 * stitch, and nothing here calls an outside vendor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { filmEnginesByLeg } from '@/lib/chat/filmEngines';
import { computeEditorReadiness } from '@/lib/chat/filmReadiness';
import { opsCallerAllowed, opsNotFound } from '@/lib/security/opsAccess';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Provider = { key: string; role: string; present: boolean; critical: boolean };
type Probe = { name: string; ok: boolean; detail: string };

async function probe(
  name: string,
  url: string,
  body: unknown,
  judge: (status: number, json: unknown) => { ok: boolean; detail: string },
): Promise<Probe> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(t));
    const json = await res.json().catch(() => null);
    const { ok, detail } = judge(res.status, json);
    return { name, ok, detail };
  } catch (err) {
    return { name, ok: false, detail: `probe failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function GET(req: NextRequest) {
  // ⚠️ OPERATORS ONLY (lib/security/opsAccess). Each anonymous hit made the server POST to two of its own routes, and
  // ?udio=1 (removed 2026-10-23) answered with our Udio credit balance and the provider's raw failure text. A scheduled
  // monitor passes CRON_SECRET; everyone else gets a 404 in production.
  if (!(await opsCallerAllowed(req))) return opsNotFound();
  const origin = new URL(req.url).origin;

  // ── 1. The film's engines (env presence, names only) and the editor (stitch + host), whose GPU stitch is a row ──
  const editor = computeEditorReadiness();
  const legs = filmEnginesByLeg();
  const providers: Provider[] = [
    { key: 'gemini', role: `Director + storyboard frames (${legs.storyboard.engine})`, present: legs.storyboard.present, critical: true },
    { key: 'veo', role: `Clip render (${legs.director.engine})`, present: legs.director.present, critical: true },
    { key: 'lyria', role: `Score (${legs.score.engine}; a miss is no music, never another engine)`, present: legs.score.present, critical: false },
    { key: 'cloud-tts', role: `Voice (${legs.voice.engine})`, present: legs.voice.present, critical: false },
    { key: 'runpod', role: 'GPU stitch + 60fps interpolation (the bundled CPU FFmpeg delivers without it)', present: editor.gpuConfigured, critical: false },
  ];

  // ── 2. Live, FREE contract probes (catch the regressions that broke before) ─
  const probes: Probe[] = await Promise.all([
    probe(
      'poll-contract',
      `${origin}/api/chat/orchestrate`,
      { predictionId: 'film:selftest', sessionId: 'selftest' },
      (status, json) => {
        const err = (json as { error?: string } | null)?.error;
        // The FIX holds when a poll is NOT rejected as "Invalid request" by the
        // schema. A malformed-token poll legitimately returns a film error.
        const broken = status === 400 && err === 'Invalid request';
        return { ok: !broken, detail: broken ? 'REGRESSION: poll rejected as "Invalid request" (schema requires message again)' : `poll accepted (status ${status})` };
      },
    ),
    probe(
      'stitch-contract',
      `${origin}/api/video/assemble`,
      { segments: [{ url: 'https://example.com/one.mp4', durationSec: 6 }] },
      (status, json) => {
        const err = (json as { error?: string } | null)?.error;
        if (status === 401) return { ok: false, detail: 'REGRESSION: assemble 401 for anonymous (final cut dead-end)' };
        if (status >= 500) return { ok: false, detail: `REGRESSION: assemble ${status} server error` };
        const ok = err === 'at least 2 ready segments required';
        return { ok, detail: ok ? 'assemble reachable; segment guard intact' : `unexpected: ${status} ${err ?? ''}` };
      },
    ),
  ]);

  // ── 4. Score + verdict + ranked recommendations ────────────────────────────
  const criticalProviders = providers.filter((p) => p.critical);
  const criticalOk = criticalProviders.every((p) => p.present);
  const probesOk = probes.every((p) => p.ok);
  const optionalPresent = providers.filter((p) => !p.critical && p.present).length;
  const optionalTotal = providers.filter((p) => !p.critical).length;

  // 50 pts critical providers · 30 pts live contracts · 20 pts optional richness.
  const score = Math.round(
    (criticalProviders.filter((p) => p.present).length / criticalProviders.length) * 50 +
      (probes.filter((p) => p.ok).length / probes.length) * 30 +
      (optionalPresent / Math.max(1, optionalTotal)) * 20,
  );

  const recommendations: string[] = [];
  for (const p of providers.filter((x) => !x.present)) {
    recommendations.push(`${p.critical ? '[CRITICAL] ' : ''}Provision ${p.key.toUpperCase()} — ${p.role}.`);
  }
  // The env names behind a Google leg that cannot serve (names only, never a value).
  const missingEnv = [...new Set(Object.values(legs).flatMap((l) => l.missing))];
  if (missingEnv.length) {
    recommendations.push(`[CONFIG] Set or fix in Vercel: ${missingEnv.join(', ')} (Vertex AI on the keyless WIF chain, docs/VEO_ENGINE.md; never an API key).`);
  }
  for (const pr of probes.filter((x) => !x.ok)) recommendations.push(`[CONTRACT] ${pr.name}: ${pr.detail}`);
  if (!editor.canDeliverMaster) recommendations.push('[DELIVERY] Configure Supabase Storage so the stitched master can be hosted + signed.');

  const verdict =
    !criticalOk || !probesOk
      ? 'DEGRADED — a critical provider or live contract failed; see recommendations'
      : score >= 90
        ? 'OPTIMAL — full chain healthy end-to-end'
        : 'HEALTHY — core chain works; optional providers would raise quality';

  return NextResponse.json({
    pipeline: '30-second-film',
    generatedAt: new Date().toISOString(),
    score,
    verdict,
    healthy: criticalOk && probesOk && editor.canDeliverMaster,
    providers,
    liveContracts: probes,
    delivery: { canDeliverMaster: editor.canDeliverMaster, stitchPath: editor.stitchPath },
    recommendations,
    note: 'Free self-test: contract probes use cost-free rejection paths (malformed poll token + sub-threshold assemble). Provider presence is names-only and never reads a secret value.',
  });
}
