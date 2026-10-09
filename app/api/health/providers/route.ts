import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { ATLAS_DEFAULT_MODEL, atlasConfigured } from '@/lib/ai/atlasClient';
import { DEEPSEEK_DEFAULT_MODEL, deepseekConfigured } from '@/lib/ai/deepseekClient';
import { GEMINI_MODELS } from '@/lib/gemini/client';
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { runwayModel } from '@/lib/ai/runway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health/providers — admin-only diagnostic (Phase 88).
 *
 * WHY: "the accounts are funded but generations still degrade." A key that is funded on the
 * provider dashboard is useless if it is not BOUND in THIS deployment's env. This endpoint reports,
 * for the current deployment, which provider keys are present (booleans only — NEVER the key value)
 * and the exact model IDs in use. `scenePlanningLive` is the decisive signal: scene/script planning
 * routes through lib/ai/llmText.ts, which is Gemini ONLY (PROJECT_MASTER R7 — the DeepSeek / Atlas /
 * Anthropic legs are gone), so the SOLE trigger of degraded (deterministic camera-beat) output is the
 * Gemini key missing — i.e. this is false. The check is llmText's own gate (resolveGeminiKey), so it
 * reflects real routing; the other text keys are listed only as keys still bound in this deployment.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const gate = await assertAdminAccess(request, user ?? null);
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });

    const has = (...names: string[]) => names.some((n) => String(process.env[n] || '').trim().length > 0);

    // Text-LLM keys. Only `gemini` is a brain llmText uses (R7); the rest show which forbidden keys are still bound.
    const text = {
      deepseekDirect: deepseekConfigured(),      // DEEPSEEK_API_KEY — bound or not, llmText no longer calls it (R7)
      atlasDeepseek: atlasConfigured(),          // ATLAS_API_KEY || ATLAS_KLING_API_KEY — likewise unused by llmText
      gemini: !!resolveGeminiKey(),              // llmText's ONLY provider, behind this same gate
      anthropic: has('ANTHROPIC_API_KEY'),       // bound or not, nothing in llmText calls it any more (R7)
    };

    return NextResponse.json({
      ok: true,
      // TRUE ⇒ Gemini (llmText's only brain) is bound, so scene planning uses the LLM (not generic beats).
      scenePlanningLive: text.gemini,
      llm: {
        text,
        models: {
          deepseekDirect: DEEPSEEK_DEFAULT_MODEL,
          deepseekAtlas: ATLAS_DEFAULT_MODEL,
          geminiPro: GEMINI_MODELS.pro,
          geminiFlash: GEMINI_MODELS.flash,
          anthropic: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        },
      },
      media: {
        replicate: has('REPLICATE_API_TOKEN'),
        runway: has('RUNWAY_API_KEY', 'RUNWAYML_API_SECRET'),
        elevenlabs: has('ELEVENLABS_API_KEY'),
        ltx: has('LTX_API_KEY'),
        udio: has('UDIO_API_KEY'),
      },
      // Active model config (P90) — base image defaults to FLUX 1.1 Pro unless IMAGE_PRIMARY_PROVIDER=nanobanana;
      // video clips read REPLICATE_VIDEO_MODEL (a v1.6 value here is the usual "Kling v1.6" cause).
      pipeline: {
        imageBase: /^nanobanana$/i.test((process.env.IMAGE_PRIMARY_PROVIDER || '').trim()) ? 'NanoBanana' : 'FLUX 1.1 Pro',
        videoClipModel: (process.env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v2.1').trim(),
        videoPinnedToV16: /v1[.\-]?6/i.test((process.env.REPLICATE_VIDEO_MODEL || '').trim()),
        anchor: /^(fast|schnell)$/i.test((process.env.ANCHOR_MODEL || '').trim()) ? 'FLUX Schnell' : 'FLUX 1.1 Pro',
      },
      runwayModel: runwayModel(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'health check failed' }, { status: 500 });
  }
}
