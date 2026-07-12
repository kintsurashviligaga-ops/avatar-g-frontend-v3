/**
 * lib/ai/visionQualityGate.ts
 * ===========================
 * PHASE 27 (VECTOR 2) — POST-RENDER VISION QUALITY GATE.
 *
 * A fail-open, env-gated validator that samples keyframes from a rendered MP4 and asks Gemini Vision
 * to grade aesthetic consistency / character-deformity bounds / visual drift, returning a structured
 * verdict. Everything degrades safely: gate off, no Gemini key, no ffmpeg, a failed download, a
 * timeout, or an unparseable model reply all resolve to an ACCEPT verdict, so a good master is NEVER
 * blocked by the QA layer.
 *
 * FLOW (per the directive):
 *   1. extractKeyframes() (lib/ai/visionKeyframes, server-only ffmpeg) samples N frames → base64 JPEGs.
 *   2. generateWithGemini() — the frames + a rubric go to the vision-capable Gemini model.
 *   3. parseVisionVerdict() — the model's JSON becomes a grade + score + issues + an `action`.
 *
 * This module is intentionally FREE of `server-only`/node imports so its logic is unit-testable; the
 * real ffmpeg + Gemini IO is reached through DEFAULT deps that lazy-import (only when the gate runs).
 *
 * HONEST SCOPE of "self-healing single-pass re-render": the verdict carries `action: 'rerender'` on a
 * critical warp (grade F) as a SIGNAL the caller can surface/log. An actual re-render loop is NOT built
 * here — a poll-time scene re-render needs the film token to carry per-scene render params (it currently
 * carries only {ordinal, taskRef, status}); that token overhaul is the documented follow-up. So this
 * gate DETECTS + FLAGS (telemetry) rather than blocking a paid, already-assembled master.
 *
 * Gated on FILM_VISION_QA=1 (default OFF) → INERT + zero-cost in prod until explicitly enabled.
 */

export type VisionGrade = 'A' | 'B' | 'C' | 'F';
export interface VisionIssue {
  code: string;
  severity: 'critical' | 'warn' | 'info';
  detail: string;
}
export interface VisionVerdict {
  /** true only when the gate actually ran an evaluation; false = a fail-open skip. */
  ran: boolean;
  /** true unless a critical warp was found. A skip is always pass=true (never blocks). */
  pass: boolean;
  grade: VisionGrade;
  /** 0..100 aesthetic/consistency score from the vision model. */
  score: number;
  issues: VisionIssue[];
  /** 'rerender' ONLY on grade F — a SIGNAL for the caller, not a built re-render loop. */
  action: 'accept' | 'rerender';
  /** For a skip: why (disabled / no_key / no_frames / vision_unavailable / parse_error). */
  reason?: string;
  frameCount?: number;
}

/** Score below this floor → grade F → a re-render signal. Env-tunable. */
export const VISION_QUALITY_FLOOR = Math.max(0, Math.min(100, Number(process.env.FILM_VISION_QA_FLOOR) || 55));
/** How many keyframes to sample. Env-tunable, clamped 1..8 (bounds cost + latency). */
export const VISION_FRAME_COUNT = Math.max(1, Math.min(8, Number(process.env.FILM_VISION_QA_FRAMES) || 4));

export function visionQaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FILM_VISION_QA === '1';
}

/** A fail-open SKIP verdict — always accepts, never blocks. */
function skip(reason: string): VisionVerdict {
  return { ran: false, pass: true, grade: 'A', score: 100, issues: [], action: 'accept', reason };
}

/** Map a 0..100 score → grade. Pure. */
export function scoreToGrade(score: number, floor: number = VISION_QUALITY_FLOOR): VisionGrade {
  if (score < floor) return 'F';
  if (score >= 85) return 'A';
  if (score >= 72) return 'B';
  return 'C';
}

/** The vision rubric handed to Gemini. Pure → unit-testable. */
export function buildVisionQaPrompt(context?: { characterLock?: string; style?: string }): string {
  const who = context?.characterLock?.trim() ? `The intended protagonist: "${context.characterLock.trim().slice(0, 240)}". ` : '';
  const style = context?.style?.trim() ? `Intended visual style: ${context.style.trim().slice(0, 80)}. ` : '';
  return (
    'You are a film QA supervisor. These are keyframes sampled in order from ONE rendered film clip. ' +
    who + style +
    'Judge: (a) CHARACTER CONSISTENCY across the frames (same person — face, age, hair, wardrobe), ' +
    '(b) DEFORMITY (melted/warped faces, extra or fused fingers/limbs, broken anatomy), ' +
    '(c) VISUAL DRIFT (palette/tone/style jumping between frames), (d) gross artifacts (text, watermark, ' +
    'cartoon look on a photoreal brief). Respond with ONLY compact JSON, no prose: ' +
    '{"score": <0-100 overall quality>, "issues": [{"code":"<short_slug>","severity":"critical|warn|info","detail":"<one line>"}]}. ' +
    'Reserve severity "critical" for a genuine warp/deformity or a different-person swap. A clean, consistent clip scores 85-100.'
  );
}

/**
 * Parse the vision model's reply → verdict. Fail-SAFE: an unparseable reply returns an ACCEPT (we never
 * block a master because the QA model returned garbage). Pure → unit-testable.
 */
export function parseVisionVerdict(text: string, frameCount: number, floor: number = VISION_QUALITY_FLOOR): VisionVerdict {
  try {
    const m = /\{[\s\S]*\}/.exec(text || '');
    if (!m) return { ...skip('parse_error'), frameCount };
    const raw = JSON.parse(m[0]) as { score?: unknown; issues?: unknown };
    const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.min(100, raw.score)) : 100;
    const issues: VisionIssue[] = Array.isArray(raw.issues)
      ? raw.issues
          .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
          .map((i): VisionIssue => {
            const severity: VisionIssue['severity'] = i.severity === 'critical' ? 'critical' : i.severity === 'warn' ? 'warn' : 'info';
            return {
              code: typeof i.code === 'string' ? i.code.slice(0, 40) : 'issue',
              severity,
              detail: typeof i.detail === 'string' ? i.detail.slice(0, 200) : '',
            };
          })
          .slice(0, 12)
      : [];
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const grade = hasCritical ? 'F' : scoreToGrade(score, floor);
    const pass = grade !== 'F';
    return { ran: true, pass, grade, score, issues, action: grade === 'F' ? 'rerender' : 'accept', frameCount };
  } catch {
    return { ...skip('parse_error'), frameCount };
  }
}

/** Injectable deps so the orchestration is unit-testable without ffmpeg or the network. */
export interface VisionGateDeps {
  enabled?: () => boolean;
  keyPresent?: () => boolean;
  extract?: (videoUrl: string) => Promise<string[]>;
  score?: (prompt: string, frames: string[]) => Promise<string | null>;
}

/** Default env-based Gemini key pre-check (avoids extraction cost when clearly no key). */
function defaultKeyPresent(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY);
}

/** Default keyframe extractor — lazy-imports the server-only ffmpeg module so THIS file stays testable. */
async function defaultExtract(videoUrl: string): Promise<string[]> {
  try {
    const mod = await import('./visionKeyframes');
    return await mod.extractKeyframes(videoUrl, VISION_FRAME_COUNT);
  } catch {
    return [];
  }
}

/** Default vision scorer — lazy-imports the Gemini client; fail-open (no key/timeout/error → null). */
async function defaultScore(prompt: string, frames: string[]): Promise<string | null> {
  try {
    const { generateWithGemini } = await import('@/lib/gemini/client');
    const attachments = frames.map((data) => ({ type: 'image' as const, mimeType: 'image/jpeg', data }));
    const res = await generateWithGemini({ prompt, attachments, tier: 'flash', thinkingBudget: 0, maxTokens: 600, temperature: 0 });
    return res?.text ?? null;
  } catch {
    return null;
  }
}

/**
 * THE GATE. Evaluate a rendered MP4's visual quality. Fail-open at every step. Gated on FILM_VISION_QA
 * + a Gemini key. Deps are injectable for tests; prod uses the real (lazy-loaded) ffmpeg + Gemini impls.
 */
export async function evaluateRenderQuality(
  input: { videoUrl: string; characterLock?: string; style?: string },
  deps: VisionGateDeps = {},
): Promise<VisionVerdict> {
  try {
    const enabled = deps.enabled ?? visionQaEnabled;
    if (!enabled()) return skip('disabled');
    const keyPresent = deps.keyPresent ?? defaultKeyPresent;
    if (!keyPresent()) return skip('no_key');

    const extract = deps.extract ?? defaultExtract;
    const frames = await extract(input.videoUrl).catch(() => []);
    if (!frames.length) return skip('no_frames');

    const prompt = buildVisionQaPrompt({ characterLock: input.characterLock, style: input.style });
    const score = deps.score ?? defaultScore;
    const text = await score(prompt, frames).catch(() => null);
    if (!text) return { ...skip('vision_unavailable'), frameCount: frames.length };
    return parseVisionVerdict(text, frames.length);
  } catch {
    // Belt-and-suspenders: the gate can NEVER throw into the render/assemble path.
    return skip('gate_error');
  }
}
