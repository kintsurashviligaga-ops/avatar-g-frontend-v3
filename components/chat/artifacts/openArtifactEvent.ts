/**
 * components/chat/artifacts/openArtifactEvent.ts — the `myavatar:open-artifact` window event contract.
 *
 * Anything on the page that is not a chat reply — first of all the Live voice tools — opens the canvas by
 * dispatching this event instead of importing the canvas:
 *
 *   window.dispatchEvent(new CustomEvent('myavatar:open-artifact', {
 *     detail: { title?: string, language: string, code: string },
 *   }));
 *
 * or `dispatchOpenArtifact(detail)` below, which does the same. A mounted `ArtifactCanvas` listens for it.
 *
 * ⚠️ THE DETAIL IS UNTRUSTED INPUT. A Live tool call's arguments are model output, and the model can be steered by
 * whatever it was just shown. So the detail is re-validated here (`validateOpenArtifactDetail` → `toArtifactInput`):
 * a plain object, a language on the allowlist, a non-blank `code` string within 200 KB UTF-8, a title that is one
 * bounded visible line. Anything else is dropped with a warning — no partial open, no exception into the producer.
 * The Preview it may lead to runs in an opaque-origin sandbox with no network either way (previewDocument.ts).
 */

import { toArtifactInput, type ArtifactInput } from './artifactSpec';

export const OPEN_ARTIFACT_EVENT = 'myavatar:open-artifact';

export interface OpenArtifactDetail {
  title?: string;
  language: string;
  code: string;
}

/** The event's `detail` → a validated artifact, or null. Never throws, whatever `detail` is (getters included). */
export function validateOpenArtifactDetail(detail: unknown): ArtifactInput | null {
  if (detail === null || typeof detail !== 'object') return null;
  try {
    // Inside the try: Array.isArray itself throws on a revoked Proxy.
    if (Array.isArray(detail)) return null;
    // Read each field ONCE: a getter returning a different value on the second read must not slip past the check.
    const { title, language, code } = detail as { title?: unknown; language?: unknown; code?: unknown };
    return toArtifactInput({ title, language, code });
  } catch {
    return null; // a throwing getter / a revoked Proxy
  }
}

/** For producers: opens the canvas (when one is mounted). Returns false when the detail would be rejected. */
export function dispatchOpenArtifact(detail: OpenArtifactDetail): boolean {
  if (typeof window === 'undefined' || !validateOpenArtifactDetail(detail)) return false;
  window.dispatchEvent(new CustomEvent<OpenArtifactDetail>(OPEN_ARTIFACT_EVENT, { detail }));
  return true;
}
