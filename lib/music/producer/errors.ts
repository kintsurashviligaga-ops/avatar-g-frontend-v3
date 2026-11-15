/** lib/music/producer/errors.ts — the codes the Music Producer routes answer with. Pure. */
export type ProducerErrorCode =
  | 'feature_off' | 'sign_in' | 'invalid_request' | 'not_found' | 'too_long' | 'too_short'
  | 'insufficient_credits' | 'budget_refused' | 'provider_unavailable' | 'not_configured' | 'join_failed';

export class ProducerError extends Error {
  constructor(readonly code: ProducerErrorCode, message: string, readonly status = 400) { super(message); this.name = 'ProducerError'; }
}
