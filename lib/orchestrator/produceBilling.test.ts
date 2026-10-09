/** @jest-environment node */
jest.mock('server-only', () => ({}));

const mockDeduct = jest.fn();
const mockRefund = jest.fn();
jest.mock('./ledger', () => ({
  deductCredits: (...a: unknown[]) => mockDeduct(...a),
  refundCredits: (...a: unknown[]) => mockRefund(...a),
}));

const mockReportError = jest.fn();
jest.mock('../observability/report-error', () => ({ reportError: (...a: unknown[]) => mockReportError(...a) }));

import { reserveProduce, refundProduce, produceRef, reservationErrorCode, unbilledRenderAllowed } from './produceBilling';

beforeEach(() => {
  mockReportError.mockReset();
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

  it('skipped (RPC not provisioned) outside production → proceed, not charged (the dev/test bypass)', async () => {
    mockDeduct.mockResolvedValue({ ok: false, reason: 'skipped' });
    expect(await reserveProduce('u', 10, 'r')).toEqual({ proceed: true, charged: false, reason: 'skipped' });
    expect(mockReportError).not.toHaveBeenCalled();
  });
});

describe('a ledger that cannot charge in PRODUCTION refuses the render (no fail-open)', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = env.NODE_ENV;
  afterEach(() => { env.NODE_ENV = saved; });

  it('production + skipped → billing_unavailable: not proceeded, not charged, alerted', async () => {
    env.NODE_ENV = 'production';
    mockDeduct.mockResolvedValue({ ok: false, reason: 'skipped' });
    expect(await reserveProduce('u', 10, 'image:p1')).toEqual({ proceed: false, charged: false, reason: 'billing_unavailable' });
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError.mock.calls[0][1]).toMatchObject({ fn: 'reserveProduce', userId: 'u', amount: 10, ref: 'image:p1' });
  });

  it('development (`next dev`) + skipped → still renders uncharged', async () => {
    env.NODE_ENV = 'development';
    mockDeduct.mockResolvedValue({ ok: false, reason: 'skipped' });
    expect(await reserveProduce('u', 10, 'r')).toEqual({ proceed: true, charged: false, reason: 'skipped' });
  });

  it('production does not change a successful charge or a real shortfall', async () => {
    env.NODE_ENV = 'production';
    mockDeduct.mockResolvedValueOnce({ ok: true, balance: 5 }).mockResolvedValueOnce({ ok: false, reason: 'insufficient', balance: 1 });
    expect(await reserveProduce('u', 10, 'a')).toEqual({ proceed: true, charged: true, reason: 'ok', balance: 5 });
    expect(await reserveProduce('u', 10, 'b')).toEqual({ proceed: false, charged: false, reason: 'insufficient', balance: 1 });
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('unbilledRenderAllowed is false only for production', () => {
    expect(unbilledRenderAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(unbilledRenderAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(unbilledRenderAllowed({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('reservationErrorCode — only a real shortfall is reported as insufficient credits', () => {
  it.each([
    ['insufficient', 'insufficient_credits'],
    ['error', 'billing_unavailable'],
    ['billing_unavailable', 'billing_unavailable'],
    ['skipped', 'billing_unavailable'],
  ] as const)('%s → %s', (reason, code) => {
    expect(reservationErrorCode({ reason })).toBe(code);
  });
});

test('every /api/orchestrator/*/produce route reports the refusal via reservationErrorCode', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const path = jest.requireActual('path') as typeof import('path');
  const root = path.join(__dirname, '..', '..', 'app', 'api', 'orchestrator');
  const routes = ['produce', 'voice/produce', 'image/produce', 'avatar/produce', 'music/produce', 'interior/produce'];
  for (const r of routes) {
    const src = fs.readFileSync(path.join(root, r, 'route.ts'), 'utf8');
    expect(src).toContain("error: reservationErrorCode(reservation)");
    expect(src).not.toContain("error: 'insufficient_credits', reason: reservation.reason");
  }
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
