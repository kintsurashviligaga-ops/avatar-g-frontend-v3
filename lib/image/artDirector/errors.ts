/** lib/image/artDirector/errors.ts — the codes the Art Director routes answer with. Pure. */
export type ArtErrorCode =
  | 'feature_off' | 'sign_in' | 'invalid_request' | 'size_not_sold' | 'not_found' | 'invalid_reference'
  | 'empty_mask' | 'insufficient_credits' | 'budget_refused' | 'provider_unavailable' | 'no_image' | 'not_configured';

export class ArtError extends Error {
  constructor(readonly code: ArtErrorCode, message: string, readonly status = 400) { super(message); this.name = 'ArtError'; }
}
