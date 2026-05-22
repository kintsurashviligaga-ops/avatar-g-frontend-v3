/**
 * POST /api/orchestrator/script — Creative Script Agent (Agent C).
 *
 * Maps a creative brief + target duration into an ordered matrix of 6-second
 * cinematic shots, powered by the Anthropic Claude API (the project's active
 * org balance). Each shot carries a render-ready prompt + cameraMotion that
 * maps 1:1 onto a VideoSegment, so the output feeds straight into the media
 * assembly pipeline (composition.ts → /api/video/assemble).
 *
 * Honest degradation: if ANTHROPIC_API_KEY is missing, or the model call/parse
 * fails, the route returns a deterministic breakdown with `degraded: true`
 * (HTTP 200) — the pipeline always receives a valid shot list, never a 500.
 *
 * Request:  { prompt: string, totalDurationSec?: number }   (default 30s)
 * Response: { segments: ScriptSegment[], model: string, degraded: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildScriptSystemPrompt,
  buildScriptUserPrompt,
  deterministicBreakdown,
  extractJson,
  normalizeBreakdown,
  planSegmentCount,
} from '@/lib/orchestrator/script-breakdown';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// Default to the exact model id the working App Builder route uses (proven
// valid on this org). Set ANTHROPIC_SCRIPT_MODEL to a Sonnet/Opus id to upgrade
// quality without a code change. (NOTE: a valid ANTHROPIC_API_KEY is required —
// the one currently in Vercel returns 401 and must be rotated.)
const SCRIPT_MODEL =
  process.env.ANTHROPIC_SCRIPT_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

interface ScriptBody {
  prompt?: string;
  totalDurationSec?: number;
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  // Degraded path: no key → deterministic shot list (still 200, pipeline-safe).
  if (!apiKey) {
    return NextResponse.json({
      segments: deterministicBreakdown(prompt, totalSec),
      model: 'deterministic',
      degraded: true,
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: SCRIPT_MODEL,
      max_tokens: 1500,
      system: buildScriptSystemPrompt(),
      messages: [{ role: 'user', content: buildScriptUserPrompt(prompt, totalSec) }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const parsed = extractJson(text);
    const segments = normalizeBreakdown(parsed, prompt, totalSec);

    return NextResponse.json({
      segments,
      model: SCRIPT_MODEL,
      degraded: parsed === null, // model answered but JSON was unusable → deterministic shape
    });
  } catch {
    // Any SDK / model / quota error → never break the pipeline.
    return NextResponse.json({
      segments: deterministicBreakdown(prompt, totalSec),
      model: 'deterministic',
      degraded: true,
      expectedShots: planSegmentCount(totalSec),
    });
  }
}
