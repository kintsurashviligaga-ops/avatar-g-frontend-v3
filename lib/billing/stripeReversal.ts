/**
 * stripeReversal — take back the credits a Stripe payment bought when that payment is refunded or disputed.
 *
 * Before this, `charge.refunded` only reversed an affiliate commission and `charge.dispute.*` was not handled at
 * all: a user could buy credits, get a refund or file a chargeback, and keep every credit.
 *
 * WHAT IS REVERSED. Every Stripe credit purchase writes positive credit_ledger rows under one payment ref:
 *   tier pack / wallet top-up → `stripe:<checkout session id>`;  subscription month → `sub:<invoice id>`.
 * The charge's payment intent leads back to that ref (Stripe lookup injected by the webhook); the ledger says who
 * was granted how many credits. The reversal is proportional to the money returned:
 *   refund  → round(granted × amount_refunded / amount), amount_refunded being Stripe's running total;
 *   dispute → round(granted × dispute.amount / amount).
 * Total reversals for one charge never exceed what was granted.
 *
 * IDEMPOTENT. Debits go through the existing `deduct_credits` RPC, which dedupes on (user, ref) forever:
 *   refund  → `reversal:<charge id>:refund:<amount_refunded>` (a later, larger partial refund is a new ref and
 *             takes only the difference: the credits already reversed for this charge's refunds are subtracted);
 *   dispute → `reversal:<charge id>:dispute:<dispute id>`.
 * A redelivered event finds its ref already debited and does nothing.
 *
 * SPENT CREDITS. deduct_credits refuses to overdraw. When the user has already spent part of the purchase, the
 * reversal takes what is left (same ref) and REPORTS the shortfall — an alert for a human, not a silent pass.
 *
 * FAILURES. A Stripe lookup error, an unreadable ledger, or a ledger that cannot debit throws
 * RetryableWebhookError, so the webhook answers 500 and Stripe redelivers.
 *
 * Not handled here: a dispute the merchant WINS does not restore the credits automatically.
 */
import { RetryableWebhookError } from './subscriptionAllowance';

export type ReversalKind = 'refund' | 'dispute';

export interface ReversalRequest {
  kind: ReversalKind;
  chargeId: string;
  paymentIntentId: string | null;
  /** The charge amount, minor units. */
  chargeAmount: number;
  /** refund: the charge's running amount_refunded; dispute: the disputed amount. Minor units. */
  reversedAmount: number;
  /** dispute only. */
  disputeId?: string;
}

interface LedgerResultLike { ok: boolean; reason?: string; balance?: number }

export interface ReversalDeps {
  /** The payment ref (`stripe:<session>` / `sub:<invoice>`) a payment intent paid for; null when none. Throws on a Stripe error. */
  grantRefForPayment(paymentIntentId: string): Promise<string | null>;
  grantedForRef(ref: string): Promise<{ ok: true; grant: { userId: string; credits: number } | null } | { ok: false }>;
  debitedUnderPrefix(userId: string, prefix: string): Promise<number | null>;
  debitExistsForRef(userId: string, ref: string): Promise<boolean | null>;
  deduct(userId: string, amount: number, ref: string): Promise<LedgerResultLike>;
  balanceOf(userId: string): Promise<number | null>;
  report(error: unknown, context: Record<string, unknown>): void;
}

export type ReversalOutcome =
  | { status: 'skipped'; reason: 'no_payment_intent' | 'nothing_reversed' | 'not_a_credit_purchase' | 'already_reversed' }
  | { status: 'reversed'; userId: string; grantRef: string; ref: string; credits: number; shortfall: number };

export function reversalRef(req: Pick<ReversalRequest, 'kind' | 'chargeId' | 'reversedAmount' | 'disputeId'>): string {
  return req.kind === 'refund'
    ? `reversal:${req.chargeId}:refund:${Math.trunc(req.reversedAmount)}`
    : `reversal:${req.chargeId}:dispute:${req.disputeId ?? 'unknown'}`;
}

export async function reverseCreditsForPayment(req: ReversalRequest, deps: ReversalDeps): Promise<ReversalOutcome> {
  if (!req.paymentIntentId) return { status: 'skipped', reason: 'no_payment_intent' };
  if (!(req.chargeAmount > 0) || !(req.reversedAmount > 0)) return { status: 'skipped', reason: 'nothing_reversed' };

  let grantRef: string | null;
  try {
    grantRef = await deps.grantRefForPayment(req.paymentIntentId);
  } catch (e) {
    throw new RetryableWebhookError(`${req.kind} reversal: payment lookup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!grantRef) return { status: 'skipped', reason: 'not_a_credit_purchase' };

  const granted = await deps.grantedForRef(grantRef);
  if (!granted.ok) throw new RetryableWebhookError(`${req.kind} reversal: ledger unreadable for ${grantRef}`);
  if (!granted.grant) return { status: 'skipped', reason: 'not_a_credit_purchase' };
  const { userId, credits } = granted.grant;

  const ref = reversalRef(req);
  const exists = await deps.debitExistsForRef(userId, ref);
  if (exists === null) throw new RetryableWebhookError(`${req.kind} reversal: ledger unreadable for ${ref}`);
  if (exists) return { status: 'skipped', reason: 'already_reversed' };

  const chargePrefix = `reversal:${req.chargeId}:`;
  const reversedForCharge = await deps.debitedUnderPrefix(userId, chargePrefix);
  if (reversedForCharge === null) throw new RetryableWebhookError(`${req.kind} reversal: ledger unreadable for ${chargePrefix}`);

  const target = Math.round(credits * Math.min(1, req.reversedAmount / req.chargeAmount));
  let alreadyForThisKind = 0;
  if (req.kind === 'refund') {
    const r = await deps.debitedUnderPrefix(userId, `${chargePrefix}refund:`);
    if (r === null) throw new RetryableWebhookError(`refund reversal: ledger unreadable for ${chargePrefix}refund:`);
    alreadyForThisKind = r;
  }
  const amount = Math.min(target - alreadyForThisKind, credits - reversedForCharge);
  if (!(amount > 0)) return { status: 'skipped', reason: 'already_reversed' };

  const first = await deps.deduct(userId, amount, ref);
  if (first.ok) return { status: 'reversed', userId, grantRef, ref, credits: amount, shortfall: 0 };
  if (first.reason !== 'insufficient') {
    throw new RetryableWebhookError(`${req.kind} reversal: ledger could not debit ${ref} (${first.reason ?? 'error'})`);
  }

  // The user already spent part of what they bought: take what is left and raise the rest with a human.
  const balance = await deps.balanceOf(userId);
  if (balance === null) throw new RetryableWebhookError(`${req.kind} reversal: balance unreadable for ${ref}`);
  const take = Math.max(0, Math.min(amount, Math.floor(balance)));
  if (take > 0) {
    const second = await deps.deduct(userId, take, ref);
    if (!second.ok) throw new RetryableWebhookError(`${req.kind} reversal: ledger could not debit ${ref} (${second.reason ?? 'error'})`);
  }
  const shortfall = amount - take;
  deps.report(new Error(`Stripe ${req.kind}: ${shortfall} purchased credits were already spent and could not be reversed`), {
    route: 'stripe.webhook', stage: `${req.kind}-reversal-shortfall`, userId, grantRef, ref,
    chargeId: req.chargeId, disputeId: req.disputeId ?? null, reversed: take, shortfall,
  });
  return { status: 'reversed', userId, grantRef, ref, credits: take, shortfall };
}
