/**
 * The provider layer's contract (brief §4, decision D4).
 *
 * The studio UI and Agent G talk to OUR model registry (lib/providers/registry.ts) and to these types —
 * never to a provider's SDK, endpoint or vocabulary directly — so a model, or a whole provider, can be
 * swapped without touching a screen. Everything provider-specific lives behind ProviderAdapter.
 */

/** The studio services a registered model can serve. */
export type StudioService = 'image' | 'video' | 'avatar' | 'motion' | 'remix';

/** Speed/quality band shown next to a model in the picker. */
export type ModelTier = 'fast' | 'standard' | 'pro';

export type ProviderId = 'higgsfield';

/** What a completed request hands back. */
export type OutputKind = 'images' | 'video';

/**
 * One provider request's lifecycle, in the provider's own words (Higgsfield: docs/concepts/requests).
 * `queued` may still be canceled; `in_progress` may not.
 */
export type ProviderStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled';

export const TERMINAL_PROVIDER_STATUSES: ReadonlySet<ProviderStatus> = new Set<ProviderStatus>([
  'completed',
  'failed',
  'nsfw',
  'canceled',
]);

export function isProviderStatus(v: unknown): v is ProviderStatus {
  return v === 'queued' || v === 'in_progress' || v === 'completed' || v === 'failed' || v === 'nsfw' || v === 'canceled';
}

/** A pre-generation price quote in the provider's own units. */
export interface ProviderEstimate {
  /** The provider's credits (Higgsfield returns them as a decimal string). */
  providerCredits: number;
  usd: number;
  correlationId: string | null;
}

/** The provider accepted a request. */
export interface ProviderSubmission {
  requestId: string;
  status: ProviderStatus;
  correlationId: string | null;
}

/** The state of a request, from a status poll or a webhook. */
export interface ProviderResult {
  requestId: string;
  status: ProviderStatus;
  /** Output media URLs on the PROVIDER's storage (kept ≥ 7 days) — copied to ours before a user sees them. */
  outputUrls: string[];
  /** The provider's own failure text. Internal only: never shown to a user. */
  error: string | null;
  correlationId: string | null;
}

export interface ProviderUpload {
  uploadUrl: string;
  publicUrl: string;
  /** Every header the presigned PUT must carry. Provider credentials must NEVER be sent with it. */
  headers: Record<string, string>;
}

/**
 * Why a provider call failed, in terms the billing saga acts on:
 *   auth / credits_exhausted → OUR outage (admin alert), the user is refunded and told to retry later;
 *   model_unavailable        → try a registry fallback;
 *   concurrency              → keep the reservation, queue locally, submit when a slot frees;
 *   validation / bad_request → the input was wrong — refund, tell the user;
 *   timeout / network on a SUBMIT → AMBIGUOUS: the request may exist. Never re-POST (no idempotency key).
 */
export type ProviderErrorCode =
  | 'not_configured'
  | 'auth'
  | 'credits_exhausted'
  | 'model_unavailable'
  | 'validation'
  | 'concurrency'
  | 'bad_request'
  | 'not_found'
  | 'cannot_cancel'
  | 'server'
  | 'network'
  | 'timeout'
  | 'bad_response';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly httpStatus: number | null;
  readonly correlationId: string | null;
  /** True when a SUBMIT may have reached the provider (timeout / dropped connection). */
  readonly ambiguous: boolean;
  /** The provider's raw text. Non-enumerable, so a JSON.stringify / spread never carries it to a client. */
  declare readonly detail: string;

  constructor(
    code: ProviderErrorCode,
    opts: { httpStatus?: number | null; correlationId?: string | null; ambiguous?: boolean; detail?: string } = {},
  ) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
    this.httpStatus = opts.httpStatus ?? null;
    this.correlationId = opts.correlationId ?? null;
    this.ambiguous = opts.ambiguous ?? false;
    Object.defineProperty(this, 'detail', { value: (opts.detail ?? '').slice(0, 2000), enumerable: false });
  }
}

/** Everything the saga needs from a provider. One implementation per provider. */
export interface ProviderAdapter {
  readonly id: ProviderId;
  estimate(endpoint: string, input: Record<string, unknown>): Promise<ProviderEstimate>;
  /** Exactly ONE POST. Never retried by the adapter — see ProviderErrorCode. */
  submit(endpoint: string, input: Record<string, unknown>, opts?: { webhookUrl?: string | null }): Promise<ProviderSubmission>;
  status(requestId: string): Promise<ProviderResult>;
  /** true = canceled (refundable); false = already started. */
  cancel(requestId: string): Promise<boolean>;
  createUpload(contentType: string): Promise<ProviderUpload>;
}
