/**
 * lib/avatar/renderAttempts.ts — when the avatar composer may start ANOTHER paid render after one did not deliver.
 *
 * ⚠️ EVERY START IS PAID UP FRONT. /api/video/lipsync and /api/heygen/presenter reserve the avatar price at POST, and
 * only a poll that sees a TERMINAL verdict settles it (delivery on success, a refund on failure). The composer's
 * fallbacks were written when a render cost nothing until it succeeded, so a poll budget running out was treated
 * like a failure: start the next engine. With reserve-at-POST that meant
 *   · a second reservation for one video while the first job was still rendering (charged twice), and
 *   · for a user whose balance covers exactly one price, a 402 on the fallback — charged once, nothing delivered,
 *     because the first job, which may still finish, is never polled again.
 * So a poll that ran out WITHOUT a verdict stops the chain. Only a terminal failure (already refunded by the GET) or
 * a start that never produced a job (refunded by the POST) may move on to a fresh paid attempt.
 *
 * Client-safe: no server imports.
 */

/** A SadTalker crash worth one more run on a fresh worker (the Pillow 'ANTIALIAS' build, CUDA/OOM). */
const TRANSIENT_SADTALKER = /antialias|has no attribute|cuda|out of memory|memory|runtimeerror|baseexception|must derive/i;

export interface AttemptOutcome {
  /** The poll saw `done` — the provider gave a terminal verdict (and the server settled the reservation). */
  settled: boolean;
  url: string | null;
  error: string | null;
  /** The job ran on HeyGen (`heygen:` id): its failure is final, never re-run on another engine. */
  usedHeygen: boolean;
}

/**
 * ⚠️ NO ENGINE SWITCH (the owner, 2026-10-09: no silent fallback to another outside provider). A terminal HeyGen failure
 * used to start a SadTalker (Replicate) render of the same video; it now stops, refunded by its GET. The presenter flow
 * lost its SadTalker leg the same day (presenterMayFallBack is gone).
 */
export type NextAttempt =
  /** The video landed. */
  | 'deliver'
  /** SadTalker hit a known transient crash → one more run. */
  | 'retry'
  /** Stop. Either a non-transient failure, or the job is STILL RENDERING (paid) and must not be doubled. */
  | 'stop';

/** The avatar (talking-photo) flow: what follows an attempt whose start returned a job id. */
export function nextAvatarAttempt(o: AttemptOutcome): NextAttempt {
  if (o.url) return 'deliver';
  if (!o.settled) return 'stop';
  if (o.usedHeygen) return 'stop';
  if (o.error && !TRANSIENT_SADTALKER.test(o.error)) return 'stop';
  return 'retry';
}
