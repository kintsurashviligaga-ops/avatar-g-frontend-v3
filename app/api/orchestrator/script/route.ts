/**
 * POST /api/orchestrator/script — Hybrid Creative Script Agent (Agent C).
 *
 * Dual-engine orchestration:
 *   1. (optional) Gemini 2.5 vision analyzes an uploaded asset (image) into a
 *      text description — the multi-modal ingestion stage.
 *   2. Gemini (lib/ai/llmText, no second provider) acts as the orchestrator: it splits the brief
 *      (+ Gemini's visual context) into N mathematically-exact 6-second shot
 *      manifests as strict JSON. 30s → exactly 5 shots.
 *
 * Each shot carries a render-ready prompt + cameraMotion that maps 1:1 onto a
 * VideoSegment, feeding straight into composition.ts → /api/video/assemble.
 *
 * Honest degradation at every hop:
 *   • no GEMINI key / vision error → skip analysis, use the brief alone.
 *   • Gemini miss (no key / error / budget refusal) or unparseable JSON → deterministic
 *     breakdown (HTTP 200, degraded:true). The pipeline never receives a 500.
 *
 * Request:  { prompt: string, totalDurationSec?: number,
 *             image?: { base64: string, mimeType?: string } }
 * Response: { segments, model, degraded, vision: { used, model, analysis } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { generateText } from 'ai';
import { getActiveConfig } from '@/lib/agent/optimizer/activeConfig';
import { createGoogleGenerativeAI } from '@/lib/ai/google/provider';
import { googleCallAttempts } from '@/lib/ai/google/transport';
import { geminiTierModel } from '@/lib/ai/google/models';
import {
  buildScriptSystemPrompt,
  buildScriptUserPrompt,
  deterministicBreakdown,
  extractJson,
  normalizeBreakdown,
} from '@/lib/orchestrator/script-breakdown';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // vision retries (503 backoff) + the Gemini breakdown

// The breakdown model: the REST flash tier llmText calls (GEMINI_MODEL_FLASH overrides it).
const SCRIPT_MODEL = geminiTierModel('flash');
// Gemini (multi-modal ingestion) — a vision-capable Flash model.
const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? geminiTierModel('flash');

interface ScriptBody {
  prompt?: string;
  totalDurationSec?: number;
  image?: { base64?: string; mimeType?: string };
  locale?: string;
}

/**
 * Stage 1 — Gemini multi-modal ingestion. Returns a concise text description of
 * the uploaded asset to enrich the script, or null on any miss (fail-open).
 */
async function analyzeAssetWithGemini(
  image: { base64: string; mimeType?: string },
  brief: string,
): Promise<{ text: string | null; error?: string }> {
  // One attempt per pooled key on the Gemini API, one on Vertex AI (GEMINI_TRANSPORT).
  const attempts = googleCallAttempts(geminiKeys());
  if (attempts.length === 0) return { text: null, error: 'no_gemini_key' };
  // data-URL or raw base64 both accepted by @ai-sdk/google (proven in the chat route).
  const dataUrl = image.base64.startsWith('data:')
    ? image.base64
    : `data:${image.mimeType ?? 'image/jpeg'};base64,${image.base64}`;
  const prompt =
    `Analyze this asset to inform a short video. Creative brief: "${brief}". ` +
    'Describe the key subjects, setting, mood, lighting and colors in 2–4 sentences ' +
    'a video director could storyboard from. Plain prose, no preamble.';
  // Token rotation: gemini-2.5-flash has an available quota bucket but spikes to
  // transient 503s; maxRetries:4 backs those off. If a key is hard-429'd
  // (quota/billing), rotate to the next configured key. With one key this is just
  // the retry path; with GEMINI_API_KEYS=k1,k2,… it zeroes out quota stalls.
  let lastErr = 'empty';
  for (const apiKey of attempts) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const { text } = await generateText({
        model: google(VISION_MODEL),
        maxRetries: 4,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image', image: dataUrl },
            ],
          },
        ],
      });
      const trimmed = text?.trim();
      if (trimmed) return { text: trimmed };
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 100) : 'gemini_error';
      // fall through and rotate to the next key
    }
  }
  return { text: null, error: lastErr };
}

/** All configured Gemini keys (GEMINI_API_KEYS csv ∪ GEMINI_API_KEY ∪ GOOGLE_GENERATIVE_AI_API_KEY), de-duped. */
function geminiKeys(): string[] {
  const csv = (process.env.GEMINI_API_KEYS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const single = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '').trim();
  if (single) csv.push(single);
  return [...new Set(csv)];
}

export async function POST(req: NextRequest) {
  const ipLimited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (ipLimited) return ipLimited;
  let body: ScriptBody;
  try {
    body = (await req.json()) as ScriptBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). Both stages spend the platform's keys — Gemini vision (retried up
  // to 4× per key, rotated across every configured key) on a caller-supplied image, then a Gemini breakdown — and
  // no screen in the product calls this route. "Honest degradation" below is about provider misses; it was never
  // meant to make an anonymous POST two free Gemini calls.
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id)) {
    return NextResponse.json(signInToGenerateBody(typeof body.locale === 'string' ? body.locale : 'ka'), { status: 401 });
  }
  // ⚠️ Signed-in was the only guard: sign-up is self-service, so one account could loop Gemini vision (up to 4 retries
  // per configured key) + a Gemini breakdown with no cap. Per-ACCOUNT daily helper cap (HELPER_USER).
  if (user?.id) {
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.HELPER_USER);
    if (capped) return capped;
  }
  const totalSec = Number.isFinite(body.totalDurationSec) ? Number(body.totalDurationSec) : 30;

  // ── Stage 1: Gemini multi-modal ingestion (optional) ──────────────────────
  const hasImage = typeof body.image?.base64 === 'string' && body.image.base64.length > 0;
  const av = hasImage
    ? await analyzeAssetWithGemini({ base64: body.image!.base64!, mimeType: body.image?.mimeType }, prompt)
    : { text: null as string | null, error: undefined as string | undefined };
  const analysis = av.text;
  const effectivePrompt = analysis
    ? `${prompt}\n\nVisual context (analyzed from the uploaded asset): ${analysis}`
    : prompt;
  const vision = {
    used: Boolean(analysis),
    model: analysis ? VISION_MODEL : null,
    analysis,
    // A machine code only — the provider's own error text stays server-side.
    error: av.error ? 'vision_unavailable' : null,
  };

  // ── Stage 2: Gemini orchestrator → 6-second shot manifests ────────────────
  // SELF-IMPROVING (STEP 5): if an admin has APPROVED an active 'script' config, append its learned
  // directive to the system prompt so the loop's improvement reaches generation. Fail-soft.
  const activeScriptCfg = await getActiveConfig('script').catch(() => null);
  const scriptSystem = activeScriptCfg?.prompt ? `${buildScriptSystemPrompt()} ${activeScriptCfg.prompt}` : buildScriptSystemPrompt();
  const text = await llmText({
    user: buildScriptUserPrompt(effectivePrompt, totalSec),
    system: scriptSystem,
    maxTokens: 1500,
    json: true,
    timeoutMs: 30_000,
  });
  if (!text) {
    return NextResponse.json({
      segments: deterministicBreakdown(effectivePrompt, totalSec),
      model: 'deterministic',
      degraded: true,
      vision,
    });
  }
  const parsed = extractJson(text);
  return NextResponse.json({
    segments: normalizeBreakdown(parsed, effectivePrompt, totalSec),
    model: SCRIPT_MODEL,
    degraded: parsed === null,
    vision,
  });
}
