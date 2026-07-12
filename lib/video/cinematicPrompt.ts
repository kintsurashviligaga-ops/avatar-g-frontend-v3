/**
 * lib/video/cinematicPrompt.ts
 * ============================
 * Hidden, server-side cinematic prompt-expansion. Before a user's RAW idea is sent to the target video
 * engine, it is invisibly enriched with concrete cinematographic properties — shot type, camera motion,
 * framing/composition, lens, dramatic lighting, and mood — so a bare "a lion in the desert" becomes a
 * directed shot instead of a flat generation.
 *
 * The LLM call is INJECTED (pass lib/ai/llmText's llmText, which runs the DeepSeek → Gemini → Anthropic-haiku
 * quality chain and returns null when every provider misses). That keeps THIS module pure + `server-only`-free
 * so the enrichment + the deterministic fallback are unit-testable without a network or a live key. When the
 * LLM is unavailable (returns null / throws / empty), a clean DETERMINISTIC cinematic string is used instead —
 * the engine always receives an enriched prompt, never a hang.
 */
export type LlmFn = (o: {
  system?: string; user: string; maxTokens?: number; temperature?: number; timeoutMs?: number; signal?: AbortSignal;
}) => Promise<string | null>;

export const CINEMATIC_SYSTEM =
  "You are a cinematographer's prompt engineer for an AI video model. Rewrite the user's raw idea into ONE " +
  'vivid single-paragraph video prompt (max ~80 words). Enrich it with concrete cinematic properties: shot ' +
  'type (wide / medium / close-up), camera motion (dolly, crane, handheld, static, push-in), framing and ' +
  'composition, lens character (anamorphic, 35mm, shallow depth of field), dramatic motivated lighting ' +
  '(golden hour, chiaroscuro, rim light), and mood. When a person is present, also direct their emotional ' +
  'performance — natural, believable facial expression, gaze and body language true to the moment. Preserve ' +
  "the user's subject and intent EXACTLY — never introduce new characters or change what is happening. Output " +
  'ONLY the enriched prompt: no preamble, no quotes, no markdown, no explanation.';

/** A curated, deterministic cinematic enrichment — the guaranteed fallback when no LLM is reachable. */
export function deterministicCinematicPrompt(raw: string): string {
  const base = (raw ?? '').trim();
  if (!base) return base;
  if (looksEnriched(base)) return base; // already cinematic — do not double-dress
  const suffix =
    'cinematic wide-to-medium shot, slow dolly push-in, anamorphic lens with shallow depth of field, ' +
    'dramatic motivated lighting, rich filmic color grade, volumetric atmosphere, evocative mood, ' +
    'natural believable performance with lifelike expression and body language';
  const sep = /[.,;]\s*$/.test(base) ? ' ' : ', ';
  return `${base}${sep}${suffix}`.slice(0, 900);
}

/** Heuristic: is this text already cinematically dressed? Prevents double-enrichment when wired twice. */
export function looksEnriched(text: string): boolean {
  const t = (text ?? '').toLowerCase();
  return /\bcinematic\b/.test(t) && (/\blens\b|\bdolly\b|\banamorphic\b|\bdepth of field\b|\blighting\b/.test(t));
}

/** Clean an LLM enrichment: drop preamble/quotes/markdown, collapse whitespace, bound length. */
export function sanitizeCinematicOutput(out: string | null | undefined): string {
  let s = (out ?? '').trim();
  if (!s) return '';
  // Iteratively peel a leading "Here is …:" / "Prompt:" preamble AND surrounding quotes/backticks/markdown-bold
  // in whatever order the model emitted them (e.g. `**Prompt:** "…"`), until the head is stable.
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^\s*["'`*]+\s*/, ''); // leading quotes / backticks / bold stars
    s = s.replace(/^\s*(?:here(?:'s| is)[^:\n]*|enriched prompt|prompt|output)\s*:\s*/i, ''); // a "Label:" prefix
  }
  s = s.replace(/["'`*\s]+$/, '');   // trailing quotes/backticks/bold + whitespace
  s = s.replace(/\s+/g, ' ').trim(); // collapse internal whitespace/newlines
  return s.slice(0, 900);
}

export interface CinematicOpts { timeoutMs?: number; maxTokens?: number; signal?: AbortSignal }

/**
 * Enrich `raw` into a cinematic engine prompt. Tries the injected LLM once (bounded); on any miss (null /
 * throw / non-substantive output) returns the deterministic cinematic string. Empty input passes through.
 * Idempotent: an already-enriched prompt is returned unchanged.
 */
export async function expandCinematicPrompt(raw: string, llm: LlmFn, opts: CinematicOpts = {}): Promise<string> {
  const base = (raw ?? '').trim();
  if (!base) return base;
  if (looksEnriched(base)) return base;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  let out: string | null = null;
  // HARD wall-clock bound: race the LLM against a timeout that resolves to null. This is what actually keeps
  // the (blocking, pre-submit) enrichment from ever stalling the render path — the underlying provider chain
  // may not honor timeoutMs on every leg, so we never trust it alone. We also abort via a signal for any leg
  // that DOES observe it. On timeout / error / abort we fall through to the deterministic string.
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => { try { controller.abort(); } catch { /* noop */ } resolve(null); }, timeoutMs); });
    out = await Promise.race([
      llm({ system: CINEMATIC_SYSTEM, user: base, maxTokens: opts.maxTokens ?? 240, temperature: 0.7, timeoutMs, signal }).catch(() => null),
      deadline,
    ]);
  } catch {
    out = null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const cleaned = sanitizeCinematicOutput(out);
  // Accept a real enrichment. Guard against the 900-char slice rejecting a good enrichment of a LONG raw
  // prompt: require the enrichment to be at least as long as the input OR a substantial ~600+ chars.
  if (cleaned && cleaned.length >= Math.min(base.length, 600)) return cleaned;
  return deterministicCinematicPrompt(base);
}
