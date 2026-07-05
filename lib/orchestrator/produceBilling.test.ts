/** @jest-environment node */
jest.mock('server-only', () => ({}));

const mockDeduct = jest.fn();
const mockRefund = jest.fn();
jest.mock('./ledger', () => ({
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
}));

import { reserveProduce, refundProduce, produceRef } from './produceBilling';

beforeEach(() => {
  mockDeduct.mockReset();
  mockRefund.mockReset().mockResolvedValue({ ok: true });
});

describe('reserveProduce', () => {
  it('ok → proceed + charged (debited up front)', async () => {
    mockDeduct.mockResolvedValue({ ok: true, balance: 90 });
    expect(await reserveProduce('u', 10, 'image:p1')).toEqual({ proceed: true, charged: true, reason: 'ok', balance: 90 });
    expect(mockDeduct).toHaveBeenCalledWith('u', 10, 'image:p1');
  });

  it('insufficient → do NOT proceed (fail-fast, no compute), not charged', async () => {
    mockDeduct.mockResolvedValue({ ok: false, reason: 'insufficient', balance: 3 });
    expect(await reserveProduce('u', 10, 'r')).toEqual({ proceed: false, charged: false, reason: 'insufficient', balance: 3 });
  });

  it('error → do NOT proceed (abort rather than render for free)', async () => {
    mockDeduct.mockResolvedValue({ ok: false, reason: 'error' });
    const r = await reserveProduce('u', 10, 'r');
    expect(r.proceed).toBe(false);
    expect(r.charged).toBe(false);
  });

  it('skipped (RPC not provisioned) → proceed, not charged (fail-open, zero regression)', async () => {
    mockDeduct.mockResolvedValue({ ok: false, reason: 'skipped' });
    expect(await reserveProduce('u', 10, 'r')).toEqual({ proceed: true, charged: false, reason: 'skipped' });
  });
});

describe('refundProduce', () => {
  it('refunds ONLY when credits were charged, with a `:refund` ref', async () => {
    await refundProduce('u', 10, 'image:p1', true);
    expect(mockRefund).toHaveBeenCalledWith('u', 10, 'image:p1:refund');
  });

  it('is a no-op when nothing was charged (free slot / skipped)', async () => {
    await refundProduce('u', 10, 'image:p1', false);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('never throws even if the refund RPC rejects', async () => {
    mockRefund.mockRejectedValue(new Error('db down'));
    await expect(refundProduce('u', 10, 'r', true)).resolves.toBeUndefined();
  });
});

describe('produceRef', () => {
  it('composes kind:key', () => {
    expect(produceRef('image', 'p1')).toBe('image:p1');
  });
});
