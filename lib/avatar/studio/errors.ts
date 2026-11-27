/** lib/avatar/studio/errors.ts — the codes the Virtual Studio routes answer with. Pure. */
export type StudioErrorCode =
  | 'feature_off' | 'sign_in' | 'invalid_request' | 'not_found' | 'price_changed' | 'insufficient_credits'
  | 'budget_refused' | 'provider_unavailable' | 'not_configured' | 'not_verbatim' | 'filtered' | 'busy'
  | 'scene_missing' | 'stitch_failed' | 'custom_avatar';

export class StudioError extends Error {
  constructor(readonly code: StudioErrorCode, message: string, readonly status = 400) { super(message); this.name = 'StudioError'; }
}
