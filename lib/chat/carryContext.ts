/**
 * lib/chat/carryContext.ts
 * ========================
 * Smart Adaptive Context Memory (PHASE 38 §1a).
 *
 * When the user pivots to a different creative agent mid-conversation
 * (e.g. `@Interior` → `@Film`, or `@Image` → `@Avatar`), the next engine should
 * inherit the prior creative direction — palette, aesthetic, core concept —
 * WITHOUT the user re-typing it. This pure helper scans recent history for the
 * most recent *completed* creative output whose mode differs from the
 * now-active mode and returns its originating prompt as a compact carry-forward
 * hint, which the client folds into the orchestrate request as a tolerant
 * `carryContext` field (the backend may use or ignore it).
 *
 * Returns '' when there is nothing to carry:
 *   • no prior creative output exists, or
 *   • the most recent creative output is the *same* agent the user is still on
 *     (the normal history window already covers that continuity).
 *
 * Kept framework-free (structural `string` typing, no React/ServiceMode import)
 * so it is trivially unit-testable and reusable.
 */

/** Hard cap on the carried seed — keeps the request body lean and focused. */
export const CARRY_CONTEXT_MAX_CHARS = 280;

/**
 * Modes whose outputs carry transferable visual/aesthetic intent. `global`
 * (plain chat) and `voice` (TTS of literal text) are deliberately excluded —
 * their prompts don't describe a reusable creative direction.
 */
export const CARRY_CONTEXT_MODES: ReadonlySet<string> = new Set([
  'image',
  'video',
  'avatar',
  'interior',
  'music',
]);

/** Minimal structural shape — a superset-tolerant view of a chat message. */
export interface CarryContextMessage {
  role: string;
  mode?: string | null;
  sourcePrompt?: string | null;
  assetUrl?: string | null;
}

/**
 * Derive the carry-forward creative seed for the next generation.
 *
 * @param messages    Conversation history (oldest → newest).
 * @param currentMode The now-active service mode the user is about to send to.
 * @returns A trimmed prompt seed to carry forward, or '' when nothing applies.
 */
export function deriveCarryContext(
  messages: readonly CarryContextMessage[] | null | undefined,
  currentMode: string,
): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'assistant') continue;
    if (!m.assetUrl) continue;

    const mode = (m.mode ?? '').trim();
    if (!CARRY_CONTEXT_MODES.has(mode)) continue;

    // The most recent creative output belongs to the agent the user is still
    // on → no carry needed (the backend already has continuity via history).
    if (mode === currentMode) return '';

    const seed = (m.sourcePrompt ?? '').trim();
    if (!seed) return '';

    return seed.length > CARRY_CONTEXT_MAX_CHARS
      ? `${seed.slice(0, CARRY_CONTEXT_MAX_CHARS).trimEnd()}…`
      : seed;
  }

  return '';
}
