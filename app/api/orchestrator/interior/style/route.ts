/**
 * POST /api/orchestrator/interior/style — Agent K (Interior Style Orchestrator).
 *
 * Takes Agent N's RoomGeometry + the client brief and produces a cinematic
 * StyleGuide JSON (named style, palette, furniture, lighting temperature,
 * materials, mood, ambient SFX for Agent J) — NOT textures. Powered by Gemini (lib/ai/llmText, no second provider).
 *
 * Request:  { geometry: RoomGeometry, brief: string }
 * Response: { style: StyleGuide, walkthrough: string[], model: string, degraded: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { llmText } from '@/lib/ai/llmText';
import { geminiTierModel } from '@/lib/ai/google/models';
import { authedClientFromRequest } from '@/lib/supabase/server';
import {
  buildStyleSystemPrompt, buildStyleUserPrompt, normalizeRoomGeometry,
  normalizeStyleGuide, buildWalkthroughPrompts, DEFAULT_STYLE_GUIDE,
} from '@/lib/orchestrator/interior';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;


interface Body { geometry?: unknown; brief?: string }

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const c = fenced?.[1] ?? text;
  const s = c.search(/[[{]/);
  if (s === -1) return null;
  try { return JSON.parse(c.slice(s)); } catch { /* trailing */ }
  const e = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'));
  if (e > s) { try { return JSON.parse(c.slice(s, e + 1)); } catch { /* nope */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE); if (rl) return rl;

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const geometry = normalizeRoomGeometry(body.geometry);
  const brief = String(body.brief ?? '').trim();

  const finish = (style = DEFAULT_STYLE_GUIDE, model = 'deterministic', degraded = true) =>
    NextResponse.json({ style, walkthrough: buildWalkthroughPrompts(geometry, style), model, degraded });

  const text = await llmText({ user: buildStyleUserPrompt(geometry, brief), system: buildStyleSystemPrompt(), maxTokens: 1200, json: true, timeoutMs: 25_000 });
  const parsed = text ? extractJson(text) : null;
  if (!parsed) return finish();
  const style = normalizeStyleGuide(parsed);
  return NextResponse.json({ style, walkthrough: buildWalkthroughPrompts(geometry, style), model: geminiTierModel('flash'), degraded: false });
}
