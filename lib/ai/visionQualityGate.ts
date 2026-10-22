/**
 * lib/ai/visionQualityGate.ts
 * ===========================
 * PHASE 27 (VECTOR 2) — POST-RENDER VISION QUALITY GATE.
 *
 * An optional, env-gated validator that samples keyframes from a rendered MP4 and asks Gemini Vision
 * to grade consistency / deformity / visual drift. Missing or malformed evaluation is explicitly
 * SKIPPED/UNAVAILABLE, with no grade or score and pass=false. This optional telemetry does not itself
 * block publication; a required-QA publication policy must require status=PASS, never infer it from
 * the absence of a finding. Full decode, timing, audio and mandatory scene coverage are separate gates.
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
interface VisionMeasurement {
  status: 'PASS' | 'FAIL';
  ran: true;
  pass: boolean;
  grade: VisionGrade;
  /** 0..100 aesthetic/consistency score from the vision model. */
  score: number;
  issues: VisionIssue[];
  /** 'rerender' ONLY on grade F — a SIGNAL for the caller, not a built re-render loop. */
  action: 'accept' | 'rerender';
  reason?: undefined;
  frameCount?: number;
}
interface VisionNotMeasured {
  status: 'SKIPPED' | 'UNAVAILABLE';
  ran: false;
  pass: false;
  grade: null;
  score: null;
  issues: VisionIssue[];
  action: 'review';
  reason: string;
  frameCount?: number;
}
export type VisionVerdict = VisionMeasurement | VisionNotMeasured;

/** Score below this floor → grade F → a re-render signal. Env-tunable. */
export const VISION_QUALITY_FLOOR = Math.max(0, Math.min(100, Number(process.env.FILM_VISION_QA_FLOOR) || 55));
/** How many keyframes to sample. Env-tunable, clamped 1..8 (bounds cost + latency). */
export const VISION_FRAME_COUNT = Math.max(1, Math.min(8, Number(process.env.FILM_VISION_QA_FRAMES) || 4));

export function visionQaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FILM_VISION_QA === '1';
}

/** No quality claim can be made without a complete evaluation. No automatic re-render is requested. */
export function visionQaUnavailable(reason: string, frameCount?: number): VisionNotMeasured {
  return { status: reason === 'disabled' ? 'SKIPPED' : 'UNAVAILABLE', ran: false, pass: false,
    grade: null, score: null, issues: [], action: 'review', reason, ...(frameCount !== undefined ? { frameCount } : {}) };
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
 * Parse a complete measured reply. A missing score/issue list or malformed issue is unavailable:
 * never invent a perfect score, discard a malformed critical finding, or clamp invalid scores to pass.
 */
export function parseVisionVerdict(text: string, frameCount: number, floor: number = VISION_QUALITY_FLOOR): VisionVerdict {
  try {
    const m = /\{[\s\S]*\}/.exec(text || '');
    if (!m) return visionQaUnavailable('parse_error', frameCount);
    const raw = JSON.parse(m[0]) as { score?: unknown; issues?: unknown };
    if (!raw || Array.isArray(raw) || typeof raw.score !== 'number' || !Number.isFinite(raw.score)
      || raw.score < 0 || raw.score > 100 || !Array.isArray(raw.issues) || raw.issues.length > 12) {
      return visionQaUnavailable('parse_error', frameCount);
    }
    const score = raw.score;
    const issues: VisionIssue[] = [];
    for (const issue of raw.issues) {
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)
        || typeof issue.code !== 'string' || !issue.code.trim()
        || !['critical', 'warn', 'info'].includes(issue.severity)
        || typeof issue.detail !== 'string' || !issue.detail.trim()) return visionQaUnavailable('parse_error', frameCount);
      issues.push({ code: issue.code.slice(0, 40), severity: issue.severity, detail: issue.detail.slice(0, 200) });
    }
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const grade = hasCritical ? 'F' : scoreToGrade(score, floor);
    const pass = grade !== 'F';
    return { status: pass ? 'PASS' : 'FAIL', ran: true, pass, grade, score, issues, action: grade === 'F' ? 'rerender' : 'accept', frameCount };
  } catch {
    return visionQaUnavailable('parse_error', frameCount);
  }
}

/** Injectable deps so the orchestration is unit-testable without ffmpeg or the network. */
export interface VisionGateDeps {
  enabled?: () => boolean;
  /** Whether a Google model call can be made at all. May be async: the default asks the selected transport. */
  keyPresent?: () => boolean | Promise<boolean>;
  extract?: (videoUrl: string) => Promise<string[]>;
  score?: (prompt: string, frames: string[]) => Promise<string | null>;
}

/**
 * Default pre-check (avoids extraction cost when no Google call can be made): Vertex AI can serve. An AI Studio key
 * no longer counts (MASTER TASK v3.1): it used to start the ffmpeg extraction for a model call the transport then
 * refused. The `no_key` reason name is kept for the callers that read it. The transport is server-only, so it is
 * lazy-imported like the extractor.
 */
async function defaultKeyPresent(): Promise<boolean> {
  try {
    const { googleAiConfigured } = await import('./google/transport');
    return googleAiConfigured();
  } catch {
    return false;
  }
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
 * Evaluate a rendered MP4's visual quality without inventing a pass on missing evaluation. Gated on
 * FILM_VISION_QA + a configured Google transport. Deps are injectable; production uses lazy IO.
 */
export async function evaluateRenderQuality(
  input: { videoUrl: string; characterLock?: string; style?: string; signal?: AbortSignal },
  deps: VisionGateDeps = {},
): Promise<VisionVerdict> {
  try {
    if (input.signal?.aborted) return visionQaUnavailable('cancelled');
    const enabled = deps.enabled ?? visionQaEnabled;
    if (!enabled()) return visionQaUnavailable('disabled');
    const keyPresent = deps.keyPresent ?? defaultKeyPresent;
    const configured = await keyPresent();
    if (input.signal?.aborted) return visionQaUnavailable('cancelled');
    if (!configured) return visionQaUnavailable('no_key');

    const extract = deps.extract ?? defaultExtract;
    const frames = await extract(input.videoUrl).catch(() => []);
    if (input.signal?.aborted) return visionQaUnavailable('cancelled');
    if (!frames.length) return visionQaUnavailable('no_frames');

    const prompt = buildVisionQaPrompt({ characterLock: input.characterLock, style: input.style });
    const score = deps.score ?? defaultScore;
    const text = await score(prompt, frames).catch(() => null);
    if (input.signal?.aborted) return visionQaUnavailable('cancelled', frames.length);
    if (!text) return visionQaUnavailable('vision_unavailable', frames.length);
    return parseVisionVerdict(text, frames.length);
  } catch {
    // Belt-and-suspenders: the gate can NEVER throw into the render/assemble path.
    return visionQaUnavailable('gate_error');
  }
}

/** One scene clip's grade, as the assembler reports it. Issue codes only; their details stay in the logs. */
export type SceneQaEntry = { ordinal: number; issues: string[] } & (
  | Pick<VisionMeasurement, 'status' | 'grade' | 'score' | 'action'>
  | Pick<VisionNotMeasured, 'status' | 'grade' | 'score' | 'action' | 'reason'>
);

/** Scene clips graded at once: each one downloads its clip and runs ffmpeg inside the same function. */
export const SCENE_QA_CONCURRENCY = 2;

/**
 * Grade each scene clip of a film on its own (audit item 3b, 2026-10-17), so a weak scene can be named and shot
 * again at the scene's price instead of only grading the whole master. Every submitted clip retains an outcome,
 * including disabled/unavailable/deadline checks. This is input coverage, not proof of an approved manifest.
 * Deadline cancellation prevents a late extraction/configuration result from starting new inference; it does not
 * cancel or refund an already-submitted provider operation. Sorted by ordinal.
 */
export async function evaluateSceneClips(
  clips: ReadonlyArray<{ url: string; ordinal: number }>,
  opts: { deadlineMs: number; characterLock?: string; style?: string; concurrency?: number },
  deps: VisionGateDeps = {},
): Promise<SceneQaEntry[]> {
  if (!clips.length) return [];
  const entry = (ordinal: number, v: VisionVerdict): SceneQaEntry => {
    const common = { ordinal, issues: v.issues.map((i) => i.code) };
    return v.ran
      ? { ...common, status: v.status, grade: v.grade, score: v.score, action: v.action }
      : { ...common, status: v.status, grade: null, score: null, action: 'review', reason: v.reason };
  };
  const deadline = Number.isFinite(opts.deadlineMs) ? Math.max(0, opts.deadlineMs) : 0;
  const graded = clips.map((clip) => entry(clip.ordinal, visionQaUnavailable('deadline')));
  if (deadline === 0) return graded.sort((a, b) => a.ordinal - b.ordinal);
  const queue = clips.map((clip, index) => ({ ...clip, index }));
  let expired = false;
  const controller = new AbortController();
  const worker = async () => {
    while (!expired && queue.length) {
      const clip = queue.shift()!;
      const v = await evaluateRenderQuality({ videoUrl: clip.url, characterLock: opts.characterLock, style: opts.style, signal: controller.signal }, deps);
      if (!expired) graded[clip.index] = entry(clip.ordinal, v);
    }
  };
  const requestedWidth = opts.concurrency ?? SCENE_QA_CONCURRENCY;
  const width = Number.isFinite(requestedWidth) ? Math.max(1, Math.min(Math.floor(requestedWidth), clips.length)) : SCENE_QA_CONCURRENCY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(Array.from({ length: width }, worker)),
    new Promise<void>((resolve) => { timer = setTimeout(() => { expired = true; controller.abort(); resolve(); }, deadline); }),
  ]);
  if (timer) clearTimeout(timer);
  expired = true;
  controller.abort();
  return [...graded].sort((a, b) => a.ordinal - b.ordinal);
}
