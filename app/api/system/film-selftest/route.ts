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
 * It also maps ALL NINE ecosystem providers to env presence (names only, never
 * values) and returns a 0–100 health score + ranked recommendations — the
 * structured signal the scheduled monitor consumes to decide what to improve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { LTX_API_KEY_ALIASES } from '@/lib/chat/ltxKey';
import {
  resolveAliasName,
  UDIO_API_KEY_ALIASES,
  ELEVENLABS_API_KEY_ALIASES,
  NANOBANANA_API_KEY_ALIASES,
} from '@/lib/chat/mediaKeys';
import { computeEditorReadiness } from '@/lib/chat/filmReadiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const envPresent = (...names: string[]): boolean =>
  names.some((n) => typeof process.env[n] === 'string' && process.env[n]!.trim().length > 0);

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
  const origin = new URL(req.url).origin;

  // ── 1. Nine-provider ecosystem map (env presence, names only) ──────────────
  const providers: Provider[] = [
    { key: 'gemini', role: 'Director / storyboard orchestrator', present: envPresent('GEMINI_API_KEY', 'GEMINI_API_KEYS'), critical: true },
    { key: 'ltx2', role: 'Cinematic clip render engine', present: resolveAliasName(LTX_API_KEY_ALIASES) !== null, critical: true },
    { key: 'nanobanana', role: 'Stylized identity frame synthesis', present: resolveAliasName(NANOBANANA_API_KEY_ALIASES) !== null, critical: false },
    { key: 'udio', role: 'Original score composition', present: resolveAliasName(UDIO_API_KEY_ALIASES) !== null, critical: false },
    { key: 'replicate', role: 'Spatial engine + global render fallback', present: envPresent('REPLICATE_API_TOKEN'), critical: true },
    { key: 'runpod', role: 'GPU: InsightFace identity + MusicGen fallback', present: envPresent('RUNPOD_API_TOKEN', 'RUNPOD_API_KEY'), critical: false },
    { key: 'elevenlabs', role: 'Georgian (ka-GE) voice synthesis', present: resolveAliasName(ELEVENLABS_API_KEY_ALIASES) !== null, critical: false },
    { key: 'heygen', role: 'Talking-avatar lip-sync pipeline', present: envPresent('HEYGEN_API_KEY'), critical: false },
    { key: 'anthropic', role: 'Background engineering agent', present: envPresent('ANTHROPIC_API_KEY'), critical: false },
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

  // ── 3. Editor (stitch + host) readiness ────────────────────────────────────
  const editor = computeEditorReadiness();

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
  for (const pr of probes.filter((x) => !x.ok)) recommendations.push(`[CONTRACT] ${pr.name}: ${pr.detail}`);
  if (!editor.canDeliverMaster) recommendations.push('[DELIVERY] Configure Supabase Storage so the stitched master can be hosted + signed.');
  if (!providers.find((p) => p.key === 'nanobanana')?.present) {
    recommendations.push('[QUALITY] NanoBanana absent — selfie→stylized-frame identity lock is degraded to direct image-to-video.');
  }

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
