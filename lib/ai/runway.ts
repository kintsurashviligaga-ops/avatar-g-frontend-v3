export async function generateVideo(
  prompt: string,
  imageUrl?: string,
  duration: number = 4
) {
  try {
    const response = await fetch("https://api.runwayml.com/v1/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        image_prompt: imageUrl,
        duration,
        ratio: "16:9",
        motion: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Runway API error: ${response.status}`);
    }

    const data = await response.json();
    const videoUrl = await pollGenerationStatus(data.id);

    return {
      videoUrl,
      prompt,
      duration,
      id: data.id
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Runway error:", error);
    throw new Error(`Video generation failed: ${message}`);
  }
}

async function pollGenerationStatus(generationId: string): Promise<string> {
  const maxAttempts = 60;
  const delay = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://api.runwayml.com/v1/generations/${generationId}`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`
        }
      }
    );

    const data = await response.json();

    if (data.status === "complete") {
      return data.output;
    }

    if (data.status === "failed") {
      throw new Error("Video generation failed");
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error("Video generation timeout");
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 24 — RUNWAY GEN-3 ALPHA async image-to-video adapter (correct 2024-11-06
// Developer API contract). SEPARATE from the legacy blocking generateVideo() above
// (which app/api/jobs/[id] still imports). These are the functions the film cascade
// uses: a fast CREATE that returns a task id (non-blocking, so the film's async poll
// owns completion) + a POLL. Every function is FAIL-OPEN and NEVER throws → on any
// miss the caller falls through to the Replicate/Kling cascade.
//
// INERT until a key is set: gated on RUNWAY_API_KEY (the client's provisioned var) or
// the official RUNWAYML_API_SECRET. Contract confidence is only medium and it cannot be
// E2E-tested here, so fail-open is load-bearing — a wrong detail degrades to Replicate,
// never a broken render.
//
// MODEL: defaults to `gen3a_turbo` (the mandated "Gen-3 Alpha"), but that model is
// DEPRECATED (Runway EOL ~2026-07-08). Set RUNWAY_VIDEO_MODEL=gen4_turbo to move to the
// current production model when ready — the adapter is otherwise identical.
// ─────────────────────────────────────────────────────────────────────────────

const RUNWAY_BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06'; // load-bearing: this version requires resolution-string ratios
const RUNWAY_CREATE_TIMEOUT_MS = 25_000;
const RUNWAY_POLL_TIMEOUT_MS = 20_000;

function runwayKey(): string {
  return String(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET || '').trim();
}

/** True when a Runway key is provisioned. The film cascade only tries Runway when this is true. */
export function hasRunwayProvider(): boolean {
  return runwayKey().length > 0;
}

/** The active Runway video model (env-overridable; default honours the mandated Gen-3 Alpha turbo). */
export function runwayModel(): string {
  return String(process.env.RUNWAY_VIDEO_MODEL || 'gen3a_turbo').trim();
}

/**
 * Map an aspect/orientation hint → a Runway RESOLUTION ratio string. The 2024-11-06 API REJECTS the
 * old "16:9"/"9:16" forms, so we emit resolution strings only. Env-overridable per orientation for a
 * model (e.g. gen4_turbo) that wants "1280:720"/"720:1280". Pure → unit-testable.
 */
export function mapRunwayRatio(aspect?: string): string {
  const a = String(aspect || '').toLowerCase();
  const portrait = /9:16|768:1280|720:1280|portrait|vertical/.test(a);
  // MODEL-AWARE default so switching RUNWAY_VIDEO_MODEL to gen4_turbo Just Works: gen4 uses the
  // 720-family resolutions, gen3a the 768-family. An explicit RUNWAY_RATIO_* env override always wins.
  const gen4 = /gen-?4/.test(runwayModel());
  if (portrait) return (process.env.RUNWAY_RATIO_PORTRAIT || (gen4 ? '720:1280' : '768:1280')).trim();
  return (process.env.RUNWAY_RATIO_LANDSCAPE || (gen4 ? '1280:720' : '1280:768')).trim();
}

/** Clamp a requested duration to Runway's only legal values (5 or 10s). Pure. */
export function mapRunwayDuration(sec?: number): 5 | 10 {
  return Number.isFinite(sec) && (sec as number) >= 8 ? 10 : 5;
}

export interface RunwayCreateArgs {
  promptImage: string;
  promptText?: string;
  aspect?: string;
  durationSec?: number;
  seed?: number;
  fetchImpl?: typeof fetch;
}

/**
 * CREATE a Runway image-to-video task and return its id (fast, non-blocking). Returns null when no
 * key, no start image, or ANY create failure (401/429/quota/timeout/throw) so the caller fails over.
 * NEVER throws.
 */
export async function createRunwayI2V(args: RunwayCreateArgs): Promise<{ id: string } | null> {
  const key = runwayKey();
  if (!key || !args.promptImage || !/^https?:\/\/|^data:image\//i.test(args.promptImage)) return null;
  const doFetch = args.fetchImpl ?? fetch;
  try {
    const body: Record<string, unknown> = {
      model: runwayModel(),
      promptImage: args.promptImage,
      ratio: mapRunwayRatio(args.aspect),
      duration: mapRunwayDuration(args.durationSec),
    };
    if (args.promptText && args.promptText.trim()) body.promptText = args.promptText.trim().slice(0, 512);
    if (Number.isFinite(args.seed) && (args.seed as number) >= 0) body.seed = Math.floor(args.seed as number);
    const res = await doFetch(`${RUNWAY_BASE}/image_to_video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_VERSION,
      },
      cache: 'no-store',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RUNWAY_CREATE_TIMEOUT_MS),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[runway] create failed http_${res.status} → falling back to Replicate`);
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as { id?: unknown };
    return typeof j.id === 'string' && j.id ? { id: j.id } : null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[runway] create threw → falling back to Replicate:', e instanceof Error ? e.message : e);
    return null;
  }
}

export type RunwayPollResult = { status: 'succeeded' | 'failed' | 'processing'; url: string | null };

/**
 * POLL one Runway task ONCE. Maps Runway's status vocabulary (PENDING/RUNNING/THROTTLED/SUCCEEDED/
 * FAILED) → our tri-state, extracting output[0] on success. Returns 'processing' on any transient/
 * unknown outcome so the poll loop keeps waiting rather than dropping a good render. NEVER throws.
 */
export async function pollRunwayTask(taskId: string, fetchImpl?: typeof fetch): Promise<RunwayPollResult> {
  const key = runwayKey();
  if (!key || !taskId) return { status: 'failed', url: null };
  const doFetch = fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${RUNWAY_BASE}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}`, 'X-Runway-Version': RUNWAY_VERSION },
      cache: 'no-store',
      signal: AbortSignal.timeout(RUNWAY_POLL_TIMEOUT_MS),
    });
    if (!res.ok) return { status: 'processing', url: null }; // transient (incl. 429) → keep polling
    const j = (await res.json().catch(() => ({}))) as { status?: string; output?: unknown };
    const status = String(j.status || '').toUpperCase();
    if (status === 'SUCCEEDED') {
      const url = Array.isArray(j.output) && typeof j.output[0] === 'string' ? (j.output[0] as string) : null;
      return url ? { status: 'succeeded', url } : { status: 'failed', url: null };
    }
    if (status === 'FAILED') return { status: 'failed', url: null };
    return { status: 'processing', url: null }; // PENDING / RUNNING / THROTTLED / unknown
  } catch {
    return { status: 'processing', url: null }; // network/timeout → keep polling (fail-open)
  }
}
