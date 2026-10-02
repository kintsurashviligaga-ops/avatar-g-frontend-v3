/** @jest-environment node */
/**
 * lib/billing/bogCheckoutClient — the browser calls and, above all, the words a customer reads after the bank.
 */
import {
  cancelBogRenewal,
  fetchBogPlan,
  formatPlanDate,
  paymentReturnMessage,
  pollBogOrder,
  startBogCheckout,
  type BogOrderStatus,
} from './bogCheckoutClient';

const res = (status: number, body?: unknown) =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchOnce = (...r: Response[]) => {
  const fn = jest.fn(async () => r.shift() ?? res(500));
  return fn as unknown as typeof fetch;
};

describe('startBogCheckout', () => {
  test('success → the https payment page + our order id', async () => {
    const f = fetchOnce(res(200, { redirectUrl: 'https://payment.bog.ge/?order_id=1', orderId: 'myavatar-plan-1', autoRenew: true }));
    expect(await startBogCheckout({ kind: 'plan', tierId: 'creator', locale: 'ka' }, f)).toEqual({
      ok: true, redirectUrl: 'https://payment.bog.ge/?order_id=1', orderId: 'myavatar-plan-1', autoRenew: true,
    });
    const [url, init] = (f as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/billing/bog/checkout');
    expect(JSON.parse(init.body)).toEqual({ kind: 'plan', tierId: 'creator', locale: 'ka' });
  });

  test('a non-https redirect is never followed', async () => {
    const f = fetchOnce(res(200, { redirectUrl: 'javascript:alert(1)', orderId: 'x' }));
    expect(await startBogCheckout({ kind: 'topup', amountGel: 10, locale: 'en' }, f)).toEqual({ ok: false, reason: 'error' });
  });

  test('401 → auth, 409 → already subscribed (with the date), 503 → unavailable, network → error', async () => {
    expect(await startBogCheckout({ kind: 'topup', amountGel: 10, locale: 'en' }, fetchOnce(res(401, {})))).toEqual({ ok: false, reason: 'auth' });
    expect(await startBogCheckout({ kind: 'plan', tierId: 'creator', locale: 'en' }, fetchOnce(res(409, { activeUntil: '2026-11-02T00:00:00Z' })))).toEqual({ ok: false, reason: 'already_subscribed', activeUntil: '2026-11-02T00:00:00Z' });
    expect(await startBogCheckout({ kind: 'topup', amountGel: 10, locale: 'en' }, fetchOnce(res(503, {})))).toEqual({ ok: false, reason: 'unavailable' });
    const boom = jest.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await startBogCheckout({ kind: 'topup', amountGel: 10, locale: 'en' }, boom)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('plan + cancel', () => {
  test('fetchBogPlan returns only a real paid tier', async () => {
    const plan = { tier: 'creator', status: 'active', currentPeriodEnd: '2026-11-02T00:00:00Z', autoRenew: true, cardMask: '548888xxxxxx9893', amountGel: 108 };
    expect(await fetchBogPlan(fetchOnce(res(200, { plan })))).toEqual(plan);
    expect(await fetchBogPlan(fetchOnce(res(200, { plan: { ...plan, tier: 'free' } })))).toBeNull();
    expect(await fetchBogPlan(fetchOnce(res(401, {})))).toBeNull();
  });

  test('cancelBogRenewal: true only on a confirmed DELETE', async () => {
    const f = fetchOnce(res(200, { canceled: 1 }));
    expect(await cancelBogRenewal(f)).toBe(true);
    expect((f as unknown as jest.Mock).mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(await cancelBogRenewal(fetchOnce(res(503, {})))).toBe(false);
  });
});

describe('pollBogOrder', () => {
  const st = (status: BogOrderStatus['status']): BogOrderStatus => ({ orderId: 'o', kind: 'topup', status, credits: 100, tier: null, periodEnd: null, autoRenew: null });

  test('asks until the order settles', async () => {
    const f = fetchOnce(res(200, st('pending')), res(200, st('pending')), res(200, st('completed')));
    const out = await pollBogOrder('o', { fetch: f, sleep: async () => undefined });
    expect(out?.status).toBe('completed');
    expect((f as unknown as jest.Mock).mock.calls).toHaveLength(3);
  });

  test('gives up after the attempts with the last answer; null when nothing answered', async () => {
    const f = fetchOnce(res(200, st('pending')), res(200, st('pending')));
    expect((await pollBogOrder('o', { attempts: 2, fetch: f, sleep: async () => undefined }))?.status).toBe('pending');
    expect(await pollBogOrder('o', { attempts: 2, fetch: fetchOnce(res(500), res(500)), sleep: async () => undefined })).toBeNull();
  });
});

describe('paymentReturnMessage', () => {
  const base: BogOrderStatus = { orderId: 'o', kind: 'topup', status: 'completed', credits: 200, tier: null, periodEnd: null, autoRenew: null };

  test('a top-up says how many credits arrived, in each language', () => {
    expect(paymentReturnMessage(base, 'success', 'ka')).toEqual({ ok: true, reopenPricing: false, text: 'გადახდა მიღებულია — დაემატა 200 კრედიტი.' });
    expect(paymentReturnMessage(base, 'success', 'en').text).toBe('Payment received — 200 credits added.');
    expect(paymentReturnMessage(base, 'success', 'ru').text).toBe('Оплата получена — начислено 200 кредитов.');
  });

  test('a plan names itself and says whether it renews', () => {
    const plan: BogOrderStatus = { ...base, kind: 'subscription', credits: 525, tier: 'creator', autoRenew: true, periodEnd: '2026-11-02T10:00:00Z' };
    expect(paymentReturnMessage(plan, 'success', 'en').text).toBe('Creator plan active — +525 credits. Renews monthly.');
    expect(paymentReturnMessage({ ...plan, autoRenew: false }, 'success', 'en').text).toBe('Creator plan active until 2 November — +525 credits.');
    expect(paymentReturnMessage(plan, 'success', 'ka').text).toContain('კრეატორი');
  });

  test('a failure is polite, says nobody was charged, and reopens pricing', () => {
    const out = paymentReturnMessage({ ...base, status: 'failed' }, 'failed', 'ka');
    expect(out).toEqual({ ok: false, reopenPricing: true, text: 'გადახდა ვერ შესრულდა — თანხა არ ჩამოგეჭრათ. სცადეთ თავიდან.' });
    expect(paymentReturnMessage(null, 'failed', 'en').reopenPricing).toBe(true);
    expect(paymentReturnMessage({ ...base, status: 'pending' }, 'failed', 'ru').ok).toBe(false);
  });

  test('still settling → "processing", never a false failure; review and refund have their own words', () => {
    expect(paymentReturnMessage({ ...base, status: 'pending' }, 'success', 'en')).toEqual({ ok: true, reopenPricing: false, text: 'Payment is processing — your credits will appear shortly.' });
    expect(paymentReturnMessage(null, 'success', 'en').ok).toBe(true);
    expect(paymentReturnMessage({ ...base, status: 'review' }, 'success', 'en').text).toMatch(/verifying/);
    expect(paymentReturnMessage({ ...base, status: 'refunded' }, null, 'en').text).toBe('This payment was refunded.');
  });

  test('dates in the user’s language; garbage → empty', () => {
    expect(formatPlanDate('2026-11-02T10:00:00Z', 'en')).toBe('2 November');
    expect(formatPlanDate('nope', 'en')).toBe('');
    expect(formatPlanDate(null, 'ka')).toBe('');
  });
});
