/** @jest-environment node */
/**
 * stripeReversal — the refund / dispute credit claw-back core, with every dependency injected.
 */
import { reverseCreditsForPayment, reversalRef, type ReversalDeps, type ReversalRequest } from './stripeReversal';
import { RetryableWebhookError } from './subscriptionAllowance';

const USER = 'u1';
function deps(over: Partial<ReversalDeps> = {}): ReversalDeps & { debits: Array<{ amount: number; ref: string }> } {
  const debits: Array<{ amount: number; ref: string }> = [];
  let balance = 1_000;
  return {
    debits,
    grantRefForPayment: jest.fn(async () => 'stripe:cs_1'),
    grantedForRef: jest.fn(async () => ({ ok: true as const, grant: { userId: USER, credits: 300 } })),
    debitExistsForRef: jest.fn(async (_u: string, ref: string) => debits.some((d) => d.ref === ref)),
    debitedUnderPrefix: jest.fn(async (_u: string, p: string) => debits.filter((d) => d.ref.startsWith(p)).reduce((s, d) => s + d.amount, 0)),
    deduct: jest.fn(async (_u: string, amount: number, ref: string) => {
      if (balance < amount) return { ok: false, reason: 'insufficient' };
      balance -= amount;
      debits.push({ amount, ref });
      return { ok: true, balance };
    }),
    balanceOf: jest.fn(async () => balance),
    report: jest.fn(),
    ...over,
  };
}
const refund = (over: Partial<ReversalRequest> = {}): ReversalRequest => ({
  kind: 'refund', chargeId: 'ch_1', paymentIntentId: 'pi_1', chargeAmount: 3000, reversedAmount: 3000, ...over,
});

test('reversalRef: per-charge refs, refund keyed on the running refunded total, dispute on its id', () => {
  expect(reversalRef({ kind: 'refund', chargeId: 'ch_1', reversedAmount: 1500 })).toBe('reversal:ch_1:refund:1500');
  expect(reversalRef({ kind: 'dispute', chargeId: 'ch_1', reversedAmount: 3000, disputeId: 'dp_1' })).toBe('reversal:ch_1:dispute:dp_1');
});

test('a full refund debits the whole grant under the reversal ref', async () => {
  const d = deps();
  expect(await reverseCreditsForPayment(refund(), d)).toEqual({ status: 'reversed', userId: USER, grantRef: 'stripe:cs_1', ref: 'reversal:ch_1:refund:3000', credits: 300, shortfall: 0 });
  expect(d.grantRefForPayment).toHaveBeenCalledWith('pi_1');
});

test('nothing to do: no payment intent, nothing refunded, or a payment that bought no credits', async () => {
  const d = deps();
  expect(await reverseCreditsForPayment(refund({ paymentIntentId: null }), d)).toEqual({ status: 'skipped', reason: 'no_payment_intent' });
  expect(await reverseCreditsForPayment(refund({ reversedAmount: 0 }), d)).toEqual({ status: 'skipped', reason: 'nothing_reversed' });
  expect(await reverseCreditsForPayment(refund(), deps({ grantRefForPayment: async () => null }))).toEqual({ status: 'skipped', reason: 'not_a_credit_purchase' });
  expect(await reverseCreditsForPayment(refund(), deps({ grantedForRef: async () => ({ ok: true, grant: null }) }))).toEqual({ status: 'skipped', reason: 'not_a_credit_purchase' });
  expect(d.deduct).not.toHaveBeenCalled();
});

test('the same event twice moves credits once', async () => {
  const d = deps();
  await reverseCreditsForPayment(refund(), d);
  expect(await reverseCreditsForPayment(refund(), d)).toEqual({ status: 'skipped', reason: 'already_reversed' });
  expect(d.debits).toHaveLength(1);
});

test('rounding never pushes the total above the grant', async () => {
  const d = deps({ grantedForRef: async () => ({ ok: true, grant: { userId: USER, credits: 7 } }) });
  await reverseCreditsForPayment(refund({ reversedAmount: 1500 }), d); // round(3.5) = 4
  await reverseCreditsForPayment(refund({ reversedAmount: 3000 }), d); // 7 − 4 = 3
  await reverseCreditsForPayment({ ...refund(), kind: 'dispute', disputeId: 'dp_1' }, d); // nothing left
  expect(d.debits.map((x) => x.amount)).toEqual([4, 3]);
});

test('an unreadable ledger, a Stripe error or a failed debit is retryable', async () => {
  await expect(reverseCreditsForPayment(refund(), deps({ grantRefForPayment: async () => { throw new Error('timeout'); } }))).rejects.toBeInstanceOf(RetryableWebhookError);
  await expect(reverseCreditsForPayment(refund(), deps({ grantedForRef: async () => ({ ok: false }) }))).rejects.toBeInstanceOf(RetryableWebhookError);
  await expect(reverseCreditsForPayment(refund(), deps({ debitExistsForRef: async () => null }))).rejects.toBeInstanceOf(RetryableWebhookError);
  await expect(reverseCreditsForPayment(refund(), deps({ debitedUnderPrefix: async () => null }))).rejects.toBeInstanceOf(RetryableWebhookError);
  await expect(reverseCreditsForPayment(refund(), deps({ deduct: async () => ({ ok: false, reason: 'skipped' }) }))).rejects.toBeInstanceOf(RetryableWebhookError);
});

test('spent credits: takes the remaining balance and reports the shortfall', async () => {
  const d = deps({ balanceOf: async () => 120 });
  const first = d.deduct as jest.Mock;
  first.mockImplementationOnce(async () => ({ ok: false, reason: 'insufficient' }));
  const out = await reverseCreditsForPayment(refund(), d);
  expect(out).toMatchObject({ status: 'reversed', credits: 120, shortfall: 180 });
  expect(d.debits).toEqual([{ amount: 120, ref: 'reversal:ch_1:refund:3000' }]);
  expect(d.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ stage: 'refund-reversal-shortfall', shortfall: 180 }));
});

test('an empty balance reverses nothing but still alerts', async () => {
  const d = deps({ balanceOf: async () => 0 });
  (d.deduct as jest.Mock).mockImplementationOnce(async () => ({ ok: false, reason: 'insufficient' }));
  expect(await reverseCreditsForPayment(refund(), d)).toMatchObject({ status: 'reversed', credits: 0, shortfall: 300 });
  expect(d.report).toHaveBeenCalledTimes(1);
});
