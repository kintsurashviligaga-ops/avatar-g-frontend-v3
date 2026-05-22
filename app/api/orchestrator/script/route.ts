/**
 * POST /api/orchestrator/script — Hybrid Creative Script Agent (Agent C).
 *
 * Dual-engine orchestration:
 *   1. (optional) Gemini 2.5 vision analyzes an uploaded asset (image) into a
 *      text description — the multi-modal ingestion stage.
 *   2. Claude (Sonnet) acts as the CEO orchestrator: it splits the brief
 *      (+ Gemini's visual context) into N mathematically-exact 6-second shot
 *      manifests as strict JSON. 30s → exactly 5 shots.
 *
 * Each shot carries a render-ready prompt + cameraMotion that maps 1:1 onto a
 * VideoSegment, feeding straight into composition.ts → /api/video/assemble.
 *
 * Honest degradation at every hop:
 *   • no GEMINI key / vision error → skip analysis, use the brief alone.
 *   • no ANTHROPIC key / Claude error / unparseable JSON → deterministic
 *     breakdown (HTTP 200, degraded:true). The pipeline never receives a 500.
 *
 * Request:  { prompt: string, totalDurationSec?: number,
 *             image?: { base64: string, mimeType?: string } }
 * Response: { segments, model, degraded, vision: { used, model, analysis } }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  buildScriptSystemPrompt,
  buildScriptUserPrompt,
  deterministicBreakdown,
  extractJson,
  normalizeBreakdown,
} from '@/lib/orchestrator/script-breakdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // vision retries (503 backoff) + Claude breakdown

// Claude (CEO orchestrator) — Sonnet by default for quality, env-overridable.
const SCRIPT_MODEL =
  process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
// Gemini (multi-modal ingestion) — a vision-capable Flash model.
const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';

interface ScriptBody {
  prompt?: string;
  totalDurationSec?: number;
  image?: { base64?: string; mimeType?: string };
}

/**
 * Stage 1 — Gemini multi-modal ingestion. Returns a concise text description of
 * the uploaded asset to enrich the script, or null on any miss (fail-open).
 */
async function analyzeAssetWithGemini(
  image: { base64: string; mimeType?: string },
  brief: string,
): Promise<{ text: string | null; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return { text: null, error: 'no_gemini_key' };
  // Reuse the EXACT @ai-sdk/google pattern the working /api/chat/gemini route
  // uses (proven in production with vision). data-URL or raw base64 both accepted.
  const dataUrl = image.base64.startsWith('data:')
    ? image.base64
    : `data:${image.mimeType ?? 'image/jpeg'};base64,${image.base64}`;
  const google = createGoogleGenerativeAI({ apiKey });
  const prompt =
    `Analyze this asset to inform a short video. Creative brief: "${brief}". ` +
    'Describe the key subjects, setting, mood, lighting and colors in 2–4 sentences ' +
    'a video director could storyboard from. Plain prose, no preamble.';
  // gemini-2.5-flash has an available quota bucket but spikes to transient 503s
  // ("high demand"); the SDK backs off and retries those. We do NOT fall back to
  // gemini-2.0-flash — that model is hard-429'd on this project's free tier, so
  // retrying 2.5-flash is the reliable path (verified live).
  try {
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
    return trimmed ? { text: trimmed } : { text: null, error: 'empty' };
  } catch (e) {
    return { text: null, error: e instanceof Error ? e.message.slice(0, 100) : 'gemini_error' };
  }
}

export async function POST(req: NextRequest) {
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
    error: av.error ?? null,
  };

  // ── Stage 2: Claude CEO orchestrator → 6-second shot manifests ────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      segments: deterministicBreakdown(effectivePrompt, totalSec),
      model: 'deterministic',
      degraded: true,
      vision,
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: SCRIPT_MODEL,
      max_tokens: 1500,
      system: buildScriptSystemPrompt(),
      messages: [{ role: 'user', content: buildScriptUserPrompt(effectivePrompt, totalSec) }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    const parsed = extractJson(text);
    const segments = normalizeBreakdown(parsed, effectivePrompt, totalSec);
    return NextResponse.json({
      segments,
      model: SCRIPT_MODEL,
      degraded: parsed === null,
      vision,
    });
  } catch {
    return NextResponse.json({
      segments: deterministicBreakdown(effectivePrompt, totalSec),
      model: 'deterministic',
      degraded: true,
      vision,
    });
  }
}
