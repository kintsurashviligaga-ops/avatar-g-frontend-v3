/**
 * Creative Script Agent — pure, client-safe core.
 *
 * Turns one creative brief ("a 30-second localized video for Sirniki.ge") into
 * an ordered matrix of 6-second cinematic shots. The math + validation live
 * here (pure, testable, no SDK); the Claude invocation lives in
 * app/api/orchestrator/script/route.ts and feeds its raw JSON through
 * `normalizeBreakdown` so a malformed model response can never corrupt the
 * downstream composition. When Claude is unavailable the route falls back to
 * `deterministicBreakdown` — honest degradation, never a hard failure.
 *
 * cameraMotion values are kept identical to VideoSegment['cameraMotion'] in
 * ./types so a ScriptSegment maps 1:1 onto a real render segment.
 */

import { SEGMENT_DURATION_SEC } from './types';

/** Safety cap — 8 × 6s = 48s, the longest composition we assemble in one pass. */
export const MAX_SEGMENTS = 8;

export const CAMERA_MOTIONS = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'dolly'] as const;
export type CameraMotion = (typeof CAMERA_MOTIONS)[number];

export interface ScriptSegment {
  index: number;
  durationSec: number;
  prompt: string;
  cameraMotion: CameraMotion;
}

/** 30s → 5 shots. Clamped to [1, MAX_SEGMENTS]; non-finite/≤0 → 1. */
export function planSegmentCount(totalSec: number): number {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return 1;
  return Math.max(1, Math.min(MAX_SEGMENTS, Math.round(totalSec / SEGMENT_DURATION_SEC)));
}

function coerceMotion(v: unknown): CameraMotion {
  const s = String(v);
  return (CAMERA_MOTIONS as readonly string[]).includes(s) ? (s as CameraMotion) : 'dolly';
}

/**
 * Deterministic fallback breakdown — used when ANTHROPIC_API_KEY is absent or
 * the Claude call/parse fails. Produces a valid, render-ready shot list so the
 * media pipeline always has something to assemble.
 */
export function deterministicBreakdown(basePrompt: string, totalSec: number): ScriptSegment[] {
  const count = planSegmentCount(totalSec);
  const prompt = basePrompt.trim() || 'cinematic establishing shot';
  return Array.from({ length: count }, (_, i): ScriptSegment => ({
    index: i,
    durationSec: SEGMENT_DURATION_SEC,
    prompt: count === 1 ? prompt : `${prompt} — shot ${i + 1} of ${count}`,
    cameraMotion: CAMERA_MOTIONS[i % CAMERA_MOTIONS.length]!,
  }));
}

/**
 * Validate + normalize raw Claude JSON into a clean ScriptSegment[]. Accepts
 * either a bare array or `{ segments: [...] }`; tolerates `prompt`/`description`
 * and `cameraMotion`/`camera_motion` aliases; re-indexes; drops empty shots; and
 * falls back to a deterministic shape if nothing usable survives.
 */
export function normalizeBreakdown(raw: unknown, basePrompt: string, totalSec: number): ScriptSegment[] {
  const source: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { segments?: unknown[] } | null)?.segments)
      ? (raw as { segments: unknown[] }).segments
      : [];

  const cleaned: ScriptSegment[] = [];
  for (const item of source) {
    if (cleaned.length >= MAX_SEGMENTS) break;
    const seg = (item ?? {}) as Record<string, unknown>;
    const prompt =
      typeof seg.prompt === 'string' ? seg.prompt.trim()
      : typeof seg.description === 'string' ? seg.description.trim()
      : '';
    if (!prompt) continue;
    cleaned.push({
      index: cleaned.length,
      durationSec: SEGMENT_DURATION_SEC,
      prompt,
      cameraMotion: coerceMotion(seg.cameraMotion ?? seg.camera_motion),
    });
  }

  return cleaned.length > 0 ? cleaned : deterministicBreakdown(basePrompt, totalSec);
}

export function buildScriptSystemPrompt(): string {
  return [
    'You are the Creative Script Agent for a short-form cinematic video generator.',
    'Break a single creative brief into a sequence of 6-second shots that tell one coherent story.',
    'Output ONLY minified JSON — no prose, no markdown, no code fences — matching exactly:',
    '{"segments":[{"prompt":string,"cameraMotion":"zoom_in"|"zoom_out"|"pan_left"|"pan_right"|"dolly"}]}',
    'Each "prompt" is a vivid, self-contained visual description of one 6-second shot',
    '(subject, setting, lighting, motion). Preserve visual continuity across shots.',
  ].join(' ');
}

export function buildScriptUserPrompt(prompt: string, totalSec: number): string {
  const count = planSegmentCount(totalSec);
  return [
    `Brief: "${prompt.trim()}"`,
    `Total duration: ${totalSec}s → produce EXACTLY ${count} shot(s) of ${SEGMENT_DURATION_SEC} seconds each.`,
    'Return the JSON object now.',
  ].join('\n');
}

/**
 * Extract a JSON value from a model text response that may be wrapped in prose
 * or ```json fences. Returns `null` (not throw) on failure so callers degrade.
 */
export function extractJson(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const slice = candidate.slice(start).trim();
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    // Trailing prose after the JSON — retry from the last balanced bracket.
    const lastCurly = slice.lastIndexOf('}');
    const lastSquare = slice.lastIndexOf(']');
    const end = Math.max(lastCurly, lastSquare);
    if (end > 0) {
      try { return JSON.parse(slice.slice(0, end + 1)) as unknown; } catch { /* give up */ }
    }
    return null;
  }
}
