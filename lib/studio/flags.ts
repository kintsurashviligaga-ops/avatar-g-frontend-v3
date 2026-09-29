/**
 * STUDIO_V2 (brief §9): the new studio is switched on per deployment — Preview first, then Production.
 * Server-side only: the flag decides whether the routes exist, not merely whether a button shows.
 *
 * The webhook and the sweep cron are deliberately NOT behind it — a job created while the flag was on must
 * still be finished (or refunded) after someone turns it off.
 */
export function studioV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|on)$/i.test((env.STUDIO_V2 ?? '').trim());
}
