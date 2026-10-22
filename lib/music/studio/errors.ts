/** lib/music/studio/errors.ts — the one error type of Music Studio v1: a stable code, a safe message, an HTTP status. */
export type MusicErrorCode =
  | 'not_enabled' | 'not_configured' | 'unsupported' | 'validation_failed' | 'confirmation_required'
  | 'quote_invalid' | 'quote_changed' | 'quote_expired' | 'quote_used'
  | 'insufficient_credits' | 'billing_unavailable' | 'budget_exhausted' | 'queue_full' | 'jobs_unavailable'
  | 'not_found' | 'not_running' | 'cancel_busy' | 'cancelled'
  | 'provider_failed' | 'provider_timeout' | 'provider_outcome_unknown' | 'quality_failed' | 'storage_failed'
  | 'edit_failed' | 'unknown_error';

export class MusicError extends Error {
  constructor(readonly code: MusicErrorCode, message: string, readonly status = 400) {
    super(message);
    this.name = 'MusicError';
  }
}

/** Anything thrown, as a MusicError. Provider text never becomes the message a user sees. */
export function musicError(e: unknown): MusicError {
  if (e instanceof MusicError) return e;
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return new MusicError('provider_timeout', 'The music engine did not answer in time.', 504);
  return new MusicError('unknown_error', 'Music generation failed.', 500);
}
