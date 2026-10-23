import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { GEMINI_MODELS } from '@/lib/gemini/client';
import { googleTransportBlocker } from '@/lib/ai/google/transport';
import { geminiFrameModel } from '@/lib/ai/geminiImage';
import { geminiImagenModel, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { STUDIO_DEFAULT_VEO_TIER } from '@/lib/credits/videoPricing';
import { resolveModel } from '@/lib/veo/capabilities';
import { veoTransport } from '@/lib/veo/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health/providers — admin-only diagnostic (Phase 88).
 *
 * WHY: "the accounts are funded but generations still degrade." A credential that is funded on the provider dashboard
 * is useless if it is not BOUND in THIS deployment's env. This endpoint reports, for the current deployment, whether
 * Vertex AI can serve (a boolean, NEVER a credential) and the exact Google model IDs in use. `scenePlanningLive` is the
 * decisive signal: scene/script planning routes through lib/ai/llmText.ts, which is Gemini ONLY (PROJECT_MASTER R7), so
 * the SOLE trigger of degraded (deterministic camera-beat) output is Vertex AI being unable to serve, i.e. this is false.
 * The check is llmText's own gate (googleTransportBlocker), so it reflects real routing.
 *
 * GOOGLE ONLY (MASTER TASK v3.1): no outside vendor is reported. The DeepSeek, Atlas, Anthropic, Replicate, Runway,
 * ElevenLabs, LTX and Udio rows named keys no engine reads, and listing them read as if they were still a route.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const gate = await assertAdminAccess(request, user ?? null);
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });

    const veo = veoTransport();
    const gemini = !googleTransportBlocker(); // llmText's ONLY provider (Gemini on Vertex AI), behind this same gate

    return NextResponse.json({
      ok: true,
      // TRUE ⇒ Gemini (llmText's only brain) can serve, so scene planning uses the LLM (not generic beats).
      scenePlanningLive: gemini,
      llm: {
        text: { gemini },
        models: { geminiPro: GEMINI_MODELS.pro, geminiFlash: GEMINI_MODELS.flash },
      },
      // The engines the code runs today (the same reads as lib/pipeline/statusAgent). Google-only, always (MASTER TASK
      // v3.1): film clips are Veo alone and the storyboard/anchor frames are Gemini's image model. The Replicate legs
      // (Kling clips via REPLICATE_VIDEO_MODEL, the FLUX anchor behind AUTO_ANCHOR_FRAME=1) are gone, whatever
      // VIDEO_GOOGLE_ONLY says.
      pipeline: {
        googleOnly: true,
        // Chat text-to-image (ServiceManager.runTextToImage): Imagen first for a prompt-only request when it is switched
        // on, then Google's image model. FLUX and NanoBanana are gone, whatever IMAGE_PRIMARY_PROVIDER says.
        imageBase: hasGeminiImagenProvider()
          ? `Imagen ${geminiImagenModel()}, then Gemini ${geminiFrameModel()}`
          : `Gemini ${geminiFrameModel()}`,
        videoClipEngine: 'Veo',
        // null when there is no Veo route at all: every film leg then fails (no other engine).
        videoClipModel: veo ? resolveModel(veo, STUDIO_DEFAULT_VEO_TIER) : null,
        videoPinnedToV16: false,
        anchor: `Gemini ${geminiFrameModel()}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'health check failed' }, { status: 500 });
  }
}
