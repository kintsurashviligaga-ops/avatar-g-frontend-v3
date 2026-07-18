import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { ATLAS_DEFAULT_MODEL, atlasConfigured } from '@/lib/ai/atlasClient';
import { GEMINI_MODELS } from '@/lib/gemini/client';
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
 * routes through lib/ai/llmText.ts (DeepSeek-V3 → Gemini → Anthropic), and the SOLE trigger of
 * degraded (deterministic camera-beat) output is ALL THREE text brains missing — i.e. this is false.
 * The check mirrors llmText's exact per-provider gates so it reflects real routing, not guesses.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const gate = assertAdminAccess(request, user ?? null);
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });

    const has = (...names: string[]) => names.some((n) => String(process.env[n] || '').trim().length > 0);

    // Text-LLM brains — mirror llmText.ts's exact per-provider gates.
    const text = {
      atlasDeepseek: atlasConfigured(),          // ATLAS_API_KEY || ATLAS_KLING_API_KEY
      gemini: has('GEMINI_API_KEY'),             // llmText.viaGemini gates on GEMINI_API_KEY specifically
      anthropic: has('ANTHROPIC_API_KEY'),       // llmText.viaAnthropic
    };

    return NextResponse.json({
      ok: true,
      // TRUE ⇒ at least one premium brain is live, so scene planning uses the LLM (not generic beats).
      scenePlanningLive: text.atlasDeepseek || text.gemini || text.anthropic,
      llm: {
        text,
        models: {
          deepseek: ATLAS_DEFAULT_MODEL,
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
      runwayModel: runwayModel(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'health check failed' }, { status: 500 });
  }
}
