/**
 * lib/billing/subscriptionAllowance.ts — invoice.paid → the tier's monthly credits, exactly once per invoice.
 *
 * Pure decision + injected effects, so the money logic is testable without Stripe or Supabase:
 *   planInvoiceAllowance(invoice, env)   pure: grant (tier, credits, ref, period…) or skip (reason)
 *   applyInvoiceAllowance(invoice, deps) resolves the user, calls deps.grant (the service-role RPC
 *                                        grant_subscription_allowance), throws RetryableWebhookError when Stripe
 *                                        must redeliver
 * The webhook (app/api/stripe/webhook) wires the real deps from lib/billing/wallet-ledger.
 *
 * ⚠️ INERT UNTIL CONFIGURED. Nothing is granted unless an invoice line's price id equals one STRIPE_PRICE_<TIER>
 * env var — with none set, every invoice is 'no_tier' and this does no I/O at all. Order of activation matters:
 * apply migration 20261001a FIRST (it defines the RPC), THEN set the env (docs/billing/TIERS.md).
 *
 * ⚠️ IDEMPOTENT THREE TIMES OVER, BECAUSE STRIPE DELIVERS AT LEAST ONCE. The ref is `sub:<invoice id>`;
 * subscription_allowance_grants has invoice_id as its PRIMARY KEY; credit_ledger has a unique (user_id, ref) index on
 * positive rows. A redelivered or concurrently-delivered invoice.paid grants nothing the second time.
 */
import {
  monthlyAllowanceCredits,
  tierFromStripePriceId,
  type PaidTierId,
  type TierEnv,
} from './tiers';

/**
 * Thrown when the event must be redelivered — the webhook answers 5xx for this class ONLY, so Stripe retries
 * (for up to three days). Every other handler error keeps the route's existing "log and 200" behaviour.
 * Safe to retry because every effect here is idempotent on the invoice.
 */
export class RetryableWebhookError extends Error {
  readonly retryable = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'RetryableWebhookError';
  }
}

/** Only these invoices carry a fresh month. 'subscription_update' (proration on a plan change) does NOT — an
 *  upgrade gets its new allowance on the next cycle rather than a second full month mid-period. */
export const ALLOWANCE_BILLING_REASONS: ReadonlySet<string> = new Set(['subscription_create', 'subscription_cycle']);

type IdOrObject = string | { id?: string | null } | null | undefined;

interface InvoiceLineLike {
  amount?: number | null;
  period?: { start?: number | null; end?: number | null } | null;
  /** API ≥ 2025-03-31 (basil / clover — this repo pins 2026-02-25.clover). */
  pricing?: { price_details?: { price?: IdOrObject } | null } | null;
  /** Older API versions. */
  price?: IdOrObject;
}

/** The parts of a Stripe Invoice this reads — both the clover shape and the pre-basil one. */
export interface InvoiceLike {
  id?: string | null;
  customer?: IdOrObject;
  status?: string | null;
  amount_paid?: number | null;
  billing_reason?: string | null;
  period_start?: number | null;
  period_end?: number | null;
  /** clover: the subscription lives under parent.subscription_details. */
  parent?: { subscription_details?: { subscription?: IdOrObject; metadata?: Record<string, string> | null } | null } | null;
  /** pre-basil */
  subscription?: IdOrObject;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
  lines?: { data?: InvoiceLineLike[] | null } | null;
}

export type AllowanceSkipReason =
  | 'no_invoice_id'
  | 'not_subscription'
  | 'no_tier'
  | 'ambiguous_tier'
  | 'not_paid'
  | 'zero_amount'
  | 'billing_reason'
  | 'no_allowance';

export interface AllowanceGrantPlan {
  action: 'grant';
  invoiceId: string;
  /** `sub:<invoice id>` — the credit_ledger idempotency ref. */
  ref: string;
  tier: PaidTierId;
  credits: number;
  subscriptionId: string;
  customerId: string | null;
  priceId: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** user_id from the subscription's metadata (set by /api/billing/subscribe), when present and well-formed. */
  metadataUserId: string | null;
}

export type AllowancePlan = AllowanceGrantPlan | { action: 'skip'; reason: AllowanceSkipReason };

/** Skips that are simply "not a tier invoice" — the webhook stays quiet about these. */
export const SILENT_SKIPS: ReadonlySet<AllowanceSkipReason> = new Set(['no_invoice_id', 'not_subscription', 'no_tier']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(v: IdOrObject): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object' && typeof v.id === 'string') return v.id.trim() || null;
  return null;
}

function isoFromUnix(sec: number | null | undefined): string | null {
  return typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000).toISOString() : null;
}

function linePriceId(line: InvoiceLineLike): string | null {
  return idOf(line.pricing?.price_details?.price) ?? idOf(line.price);
}

/** Decide, without side effects, what one invoice.paid is worth. */
export function planInvoiceAllowance(invoice: InvoiceLike | null | undefined, env: TierEnv): AllowancePlan {
  const skip = (reason: AllowanceSkipReason): AllowancePlan => ({ action: 'skip', reason });
  if (!invoice) return skip('no_invoice_id');
  const invoiceId = typeof invoice.id === 'string' ? invoice.id.trim() : '';
  if (!invoiceId) return skip('no_invoice_id');

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription) ?? idOf(invoice.subscription);
  if (!subscriptionId) return skip('not_subscription');

  // Which tier does this invoice sell? Only lines whose price is a configured STRIPE_PRICE_<TIER>; a negative
  // line (a credit) is never the thing being sold.
  const lines = (invoice.lines?.data ?? []).filter((l): l is InvoiceLineLike => !!l && !(typeof l.amount === 'number' && l.amount < 0));
  const tiered = lines
    .map((line) => ({ line, priceId: linePriceId(line) }))
    .map((x) => ({ ...x, tier: tierFromStripePriceId(x.priceId, env) }))
    .filter((x): x is { line: InvoiceLineLike; priceId: string; tier: PaidTierId } => x.tier !== null && x.priceId !== null);
  const distinct = [...new Set(tiered.map((x) => x.tier))];
  if (distinct.length === 0) return skip('no_tier');
  // ⚠️ TWO TIERS ON ONE INVOICE HAS NO SAFE READING — granting the bigger one pays for a plan nobody bought.
  if (distinct.length > 1) return skip('ambiguous_tier');

  if (invoice.status && invoice.status !== 'paid') return skip('not_paid');
  // ⚠️ NO MONEY, NO ALLOWANCE. A $0 invoice — a free trial, a 100% coupon, a balance-covered renewal — grants
  // nothing. Comps go through profiles.tier (features) and an admin grant (credits), never through a $0 invoice.
  if (!(typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0)) return skip('zero_amount');
  if (!invoice.billing_reason || !ALLOWANCE_BILLING_REASONS.has(invoice.billing_reason)) return skip('billing_reason');

  const { line, priceId, tier } = tiered[0]!;
  const credits = monthlyAllowanceCredits(tier);
  if (!(credits > 0)) return skip('no_allowance');

  const metadata = invoice.parent?.subscription_details?.metadata ?? invoice.subscription_details?.metadata ?? null;
  const rawUser = typeof metadata?.user_id === 'string' ? metadata.user_id.trim() : '';

  return {
    action: 'grant',
    invoiceId,
    ref: `sub:${invoiceId}`,
    tier,
    credits,
    subscriptionId,
    customerId: idOf(invoice.customer),
    priceId,
    // The LINE's period is the month being paid for. invoice.period_* describes the PREVIOUS period on a
    // subscription invoice (a Stripe quirk), so it is only a fallback for the start.
    periodStart: isoFromUnix(line.period?.start) ?? isoFromUnix(invoice.period_start),
    periodEnd: isoFromUnix(line.period?.end),
    metadataUserId: UUID_RE.test(rawUser) ? rawUser : null,
  };
}

export interface AllowanceGrantInput {
  userId: string;
  invoiceId: string;
  tier: PaidTierId;
  credits: number;
  subscriptionId: string;
  customerId: string | null;
  priceId: string;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface AllowanceDeps {
  env: TierEnv;
  /** Fallback user lookup (service role) when the subscription metadata carries no user_id. */
  findUserId: (q: { subscriptionId: string; customerId: string | null }) => Promise<string | null>;
  /** The atomic grant (grant_subscription_allowance). null = failed / unavailable → the event is retried. */
  grant: (input: AllowanceGrantInput) => Promise<{ granted: boolean; balance: number } | null>;
}

export type AllowanceOutcome =
  | { status: 'skipped'; reason: AllowanceSkipReason }
  | {
      status: 'granted' | 'duplicate';
      userId: string;
      invoiceId: string;
      tier: PaidTierId;
      credits: number;
      ref: string;
      balance: number;
    };

/**
 * Grant one invoice's allowance. Returns what happened; THROWS RetryableWebhookError when the money could not be
 * placed (unknown user, RPC failure) so the webhook answers 5xx and Stripe redelivers — a paid month must never
 * end as a log line.
 */
export async function applyInvoiceAllowance(invoice: InvoiceLike | null | undefined, deps: AllowanceDeps): Promise<AllowanceOutcome> {
  const plan = planInvoiceAllowance(invoice, deps.env);
  if (plan.action === 'skip') return { status: 'skipped', reason: plan.reason };

  // ⚠️ METADATA FIRST, NOT THE CUSTOMER MAPPING. Stripe does not order events: the first invoice.paid routinely
  // arrives before checkout.session.completed has stored anything. /api/billing/subscribe stamps user_id on the
  // subscription itself, and Stripe snapshots it onto every invoice.
  let userId = plan.metadataUserId;
  if (!userId) {
    userId = await deps.findUserId({ subscriptionId: plan.subscriptionId, customerId: plan.customerId }).catch(() => null);
  }
  if (!userId) {
    throw new RetryableWebhookError(`subscription allowance: no user for invoice ${plan.invoiceId} (subscription ${plan.subscriptionId})`);
  }

  const result = await deps
    .grant({
      userId,
      invoiceId: plan.invoiceId,
      tier: plan.tier,
      credits: plan.credits,
      subscriptionId: plan.subscriptionId,
      customerId: plan.customerId,
      priceId: plan.priceId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
    })
    .catch(() => null);
  if (!result) {
    throw new RetryableWebhookError(`subscription allowance: grant failed for invoice ${plan.invoiceId}`);
  }

  return {
    status: result.granted ? 'granted' : 'duplicate',
    userId,
    invoiceId: plan.invoiceId,
    tier: plan.tier,
    credits: plan.credits,
    ref: plan.ref,
    balance: result.balance,
  };
}
