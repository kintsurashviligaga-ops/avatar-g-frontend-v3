/** @jest-environment node */
/**
 * guardedCall — the sequence every provider call runs through. The properties that matter are about what
 * happens when things go WRONG: a refused budget must stop the call, a broken guard must not.
 */

const canProceed = jest.fn();
const recordUsage = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('./BillingGuard', () => ({
  canProceed: (...a: unknown[]) => canProceed(...a),
  recordUsage: (...a: unknown[]) => recordUsage(...a),
}));

// eslint-disable-next-line import/first
import { guardedCall, BudgetExceededError } from './guardedCall';

const allow = () => canProceed.mockResolvedValue({ allowed: true, reason: 'ok', mode: 'normal', projectedDaily: 0, projectedMonthly: 0, degraded: false });
const refuse = (reason = 'daily_limit') => canProceed.mockResolvedValue({ allowed: false, reason, mode: 'normal', projectedDaily: 99, projectedMonthly: 99, degraded: false });

beforeEach(() => { canProceed.mockReset(); recordUsage.mockReset().mockResolvedValue(undefined); });

describe('guardedCall', () => {
  it('runs the call and books the estimate when the budget allows it', async () => {
    allow();
    const fn = jest.fn().mockResolvedValue('rendered');
    await expect(guardedCall({ service: 'image', model: 'imagen-4', units: 2 }, fn)).resolves.toBe('rendered');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(recordUsage).toHaveBeenCalledTimes(1);
    expect(recordUsage.mock.calls[0]![0]).toMatchObject({ service: 'image', estimatedCost: 0.06 });
  });

  it('REFUSES the call when the budget says no — the provider is never touched', async () => {
    refuse('monthly_limit');
    const fn = jest.fn();
    await expect(guardedCall({ service: 'video', model: 'veo-3.1', units: 8 }, fn)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(fn).not.toHaveBeenCalled();   // the whole point: no spend
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('carries the reason so the caller can explain WHY', async () => {
    refuse('full_stop');
    await expect(guardedCall({ service: 'music', model: 'lyria-3' }, jest.fn()))
      .rejects.toMatchObject({ reason: 'full_stop', service: 'music' });
  });

  it('FAILS OPEN when the guard itself throws — a bookkeeping fault must not take the product down', async () => {
    canProceed.mockRejectedValue(new Error('supabase unreachable'));
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(guardedCall({ service: 'chat', model: 'gemini', inputTokens: 100 }, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT book a failed provider call — a broken provider must not starve the budget', async () => {
    allow();
    const boom = new Error('provider 500');
    await expect(guardedCall({ service: 'video', model: 'veo-3.1', units: 8 }, () => Promise.reject(boom))).rejects.toBe(boom);
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('books the ACTUAL cost when the provider reports real usage', async () => {
    allow();
    await guardedCall(
      { service: 'chat', model: 'gemini', inputTokens: 1000, outputTokens: 500, actualCost: () => 0.0123 },
      () => Promise.resolve('done'),
    );
    expect(recordUsage.mock.calls[0]![0]).toMatchObject({ estimatedCost: 0.0123 });
  });

  it('ignores a broken actualCost recompute and books the estimate instead', async () => {
    allow();
    await guardedCall(
      { service: 'image', model: 'imagen-4', units: 1, actualCost: () => { throw new Error('bad'); } },
      () => Promise.resolve('done'),
    );
    expect(recordUsage.mock.calls[0]![0]).toMatchObject({ estimatedCost: 0.03 });
  });

  it('still returns the result when BOOKING fails — the artefact was already delivered', async () => {
    allow();
    recordUsage.mockRejectedValue(new Error('ledger down'));
    await expect(guardedCall({ service: 'image', model: 'imagen-4' }, () => Promise.resolve('img')))
      .resolves.toBe('img');
  });
});
