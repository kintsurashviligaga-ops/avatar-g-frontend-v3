/**
 * filmDispatchSignal — the "is this a FILM render?" routing predicate, kept in a DEPENDENCY-FREE module so it
 * can be unit-tested in isolation (providerRouter itself pulls in heavy provider SDKs that break under jest).
 * Mirrors the specialistRouting.ts pattern.
 */

/**
 * True when a render carries STRUCTURAL film-pipeline signals — approved per-scene frames, per-scene scripts,
 * or a pinned scene count. These are produced ONLY by the Video Studio's storyboard dispatch
 * (driveFilmStudio), so they unambiguously mean "render this as a multi-scene film", regardless of how the
 * user phrased the brief.
 *
 * REGRESSION GUARD (found by a live end-to-end test on myavatar.ge): the router previously reached the film
 * pipeline ONLY via the conservative isThirtySecondFilm() keyword gate. A normal brief — "Create a cinematic
 * video of a calm ocean wave at sunset" — failed that gate, fell through to a generic SINGLE-CLIP (LTX)
 * render, and silently DISCARDED the 3 approved storyboard scenes the user had just reviewed.
 */
export function hasFilmDispatchSignal(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  const frames = metadata.sceneFrames;
  const scripts = metadata.sceneScripts;
  const count = metadata.sceneCount;
  return (
    (Array.isArray(frames) && frames.length > 0) ||
    (Array.isArray(scripts) && scripts.length > 0) ||
    (typeof count === 'number' && Number.isFinite(count) && count >= 1)
  );
}
