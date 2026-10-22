/** @jest-environment node */
/**
 * guardedCall — the sequence every provider call runs through. The properties that matter are about what
 * happens when things go WRONG: a refused budget stops the call, and so does a broken guard (MASTER TASK v3.1).
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

  it('FAILS CLOSED when the guard itself throws: refused as guard_unavailable, the provider is never called', async () => {
    canProceed.mockRejectedValue(new Error('supabase unreachable'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(guardedCall({ service: 'chat', model: 'gemini', inputTokens: 100 }, fn))
      .rejects.toMatchObject({ name: 'BudgetExceededError', reason: 'guard_unavailable', message: 'budget_exceeded:guard_unavailable' });
    expect(fn).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('[guardedCall] budget check threw → refusing the call:', 'supabase unreachable');
    err.mockRestore();
  });

  it('an unreadable ledger (the guard\'s own guard_unavailable) is a refusal too', async () => {
    canProceed.mockResolvedValue({ allowed: false, reason: 'guard_unavailable', mode: 'normal', projectedDaily: 0, projectedMonthly: 0, degraded: true });
    const fn = jest.fn();
    await expect(guardedCall({ service: 'video', model: 'veo-3.1', units: 8 }, fn)).rejects.toMatchObject({ reason: 'guard_unavailable' });
    expect(fn).not.toHaveBeenCalled();
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
