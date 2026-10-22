/**
 * lib/image/lifecycle.ts — which image model ids Google has retired, so a new image never asks for one (MASTER TASK
 * v3.1, Phase 1 PR 8). Pure: no I/O, safe in the browser.
 *
 * Photo renders on `gemini-3.1-flash-image` (GG, 2026-10-22: the Imagen 3 replacement, as the codebase structures it).
 * Imagen 3 is lifecycle-blocked: the Vertex AI release notes (24 Mar 2026) list its endpoints as discontinued and v3.1
 * records 30 June 2026, Google naming `gemini-2.5-flash-image` as the migration. Nothing in the code names an Imagen 3
 * id; this is the answer for one that arrives anyway (a request body, GEMINI_IMAGEN_MODEL, GEMINI_FRAME_MODEL): an
 * explicit `lifecycle_blocked` before any quote, reserve or call, instead of a request that can only fail upstream.
 */

/** What new images render on instead (GG's decision). */
export const IMAGE_LIFECYCLE_REPLACEMENT = 'gemini-3.1-flash-image';

/** Every Imagen 3 id: imagen-3.0-generate-001/-002, imagen-3.0-fast-generate-001, imagen-3.0-capability-001, … */
const IMAGEN_3 = /^(?:models\/)?imagen-3(?:\.\d+)?-/i;

/** Why `modelId` may not start a new image, or null. Says nothing about whether another id is configured or verified. */
export function imageLifecycleRefusal(modelId: unknown): string | null {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!IMAGEN_3.test(id)) return null;
  return `${id} is Imagen 3, which Google has discontinued on Vertex AI (30 June 2026); new images use ${IMAGE_LIFECYCLE_REPLACEMENT}`;
}
