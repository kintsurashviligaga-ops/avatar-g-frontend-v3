export type ImageErrorCode =
  | 'validation_failed' | 'unsupported_capability' | 'not_configured' | 'invalid_reference'
  | 'reference_changed' | 'not_found' | 'quote_invalid' | 'quote_expired' | 'quote_changed'
  | 'confirmation_required' | 'insufficient_credits' | 'billing_unavailable' | 'jobs_unavailable'
  | 'prompt_safety' | 'provider_rate_limit' | 'provider_timeout' | 'provider_failed'
  | 'provider_outcome_unknown' | 'storage_error' | 'qc_failed' | 'cancelled' | 'not_running'
  | 'queue_full' | 'quote_used' | 'unknown_error';

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode, message: string, readonly status = 422) {
    super(message);
    this.name = 'ImageError';
  }
}
export function imageError(e: unknown): ImageError {
  return e instanceof ImageError ? e : new ImageError('unknown_error', 'The image operation could not finish.', 500);
}
