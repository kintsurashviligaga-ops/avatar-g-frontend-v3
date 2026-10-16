/** @jest-environment node */
import { ownerApprovedPrice, quoteFingerprint, issueServiceQuote, checkServiceConfirmation, wantsToConfirm } from './paidServiceGate';

const env = (v?: string) => ({ OWNER_APPROVED_PRICING: v }) as unknown as NodeJS.ProcessEnv;
const KEY = 'k';
const U = 'user-1';

describe('owner price approval', () => {
  it('is off unless the exact service AND price are listed', () => {
    expect(ownerApprovedPrice('dubbing', 10, env())).toBe(false);
    expect(ownerApprovedPrice('dubbing', 10, env(''))).toBe(false);
    expect(ownerApprovedPrice('dubbing', 10, env('dubbing:10'))).toBe(true);
    expect(ownerApprovedPrice('dubbing', 10, env(' Dubbing:10 , presentation:15 '))).toBe(true);
    expect(ownerApprovedPrice('presentation', 15, env('dubbing:10,presentation:15'))).toBe(true);
    expect(ownerApprovedPrice('dubbing', 12, env('dubbing:10'))).toBe(false); // a repriced service is off again
    expect(ownerApprovedPrice('dubbing', 10, env('dubbing'))).toBe(false);
    expect(ownerApprovedPrice('dubbing', 10, env('dubbing:1O'))).toBe(false);
    expect(ownerApprovedPrice('dubbing', 10, env('dubbing:10:1'))).toBe(false);
    expect(ownerApprovedPrice('dubbing', 10, env('*'))).toBe(false);
    expect(ownerApprovedPrice('dubbing', 0, env('dubbing:0'))).toBe(false);
  });
});

describe('quote fingerprint', () => {
  it('ignores control fields and key order, but binds the service and the bought request', () => {
    const a = quoteFingerprint('dubbing', { sourceVideoUrl: 'x', targetLanguage: 'ka' });
    expect(quoteFingerprint('dubbing', { targetLanguage: 'ka', sourceVideoUrl: 'x', quoteToken: 't', confirm: true, durationSec: 1, clientJobId: 'j' })).toBe(a);
    expect(quoteFingerprint('dubbing', { sourceVideoUrl: 'x', targetLanguage: 'ru' })).not.toBe(a);
    expect(quoteFingerprint('presentation', { sourceVideoUrl: 'x', targetLanguage: 'ka' })).not.toBe(a);
  });
});

describe('quote → confirmation', () => {
  const raw = { topic: 'Tbilisi' };
  const q = issueServiceQuote({ service: 'presentation', userId: U, raw, credits: 15, jobId: 'job-1', now: 1000 }, KEY)!;
  const ok = (over: Partial<{ raw: unknown; credits: number; now: number; userId: string; key: string; service: 'dubbing' | 'presentation' }> = {}) =>
    checkServiceConfirmation({ service: over.service ?? 'presentation', userId: over.userId ?? U, raw: over.raw ?? { ...raw, quoteToken: q.token, confirm: true }, credits: over.credits ?? 15, now: over.now ?? 2000 }, over.key ?? KEY);

  it('accepts the exact quote, confirmed, in time, at the same price', () => {
    expect(ok()).toEqual({ ok: true, claims: expect.objectContaining({ j: 'job-1', c: 15, u: U }) });
  });
  it('refuses everything else', () => {
    expect(ok({ raw: { ...raw, quoteToken: q.token } })).toMatchObject({ ok: false, reason: 'not_confirmed' });
    expect(ok({ raw: { ...raw, quoteToken: q.token, confirm: 'true' } })).toMatchObject({ ok: false, reason: 'not_confirmed' });
    expect(ok({ userId: 'user-2' })).toMatchObject({ ok: false, reason: 'not_yours' });
    expect(ok({ raw: { topic: 'Batumi', quoteToken: q.token, confirm: true } })).toMatchObject({ ok: false, reason: 'changed' });
    expect(ok({ service: 'dubbing' })).toMatchObject({ ok: false, reason: 'changed' });
    expect(ok({ now: q.expiresAt })).toMatchObject({ ok: false, reason: 'expired' });
    expect(ok({ credits: 16 })).toMatchObject({ ok: false, reason: 'price_changed' });
    expect(ok({ key: 'other' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(ok({ key: '' })).toMatchObject({ ok: false, reason: 'invalid' });
  });
  it('no key ⇒ no quote', () => {
    expect(issueServiceQuote({ service: 'presentation', userId: U, raw, credits: 15, jobId: 'j', now: 1 }, '')).toBeNull();
  });
  it('tells a quote request from a confirmation', () => {
    expect(wantsToConfirm({ topic: 'x' })).toBe(false);
    expect(wantsToConfirm({ topic: 'x', confirm: true })).toBe(true);
    expect(wantsToConfirm({ topic: 'x', quoteToken: 't' })).toBe(true);
  });
});
