/** @jest-environment node */
// The film route's refused reservations. A replayed Idempotency-Key derives the ORIGINAL film's row id, so its refusal
// must reach only the caller's stream: failing the row would strand a film that is still rendering (never filed to
// the Library, the user charged). Any other refusal still fails the new row.

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: mockUser })),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../lib/orchestrator/rate-limit', () => ({
  checkProduceRate: jest.fn(async () => ({ ok: true })),
  rateLimitedResponse: jest.fn(() => new Response('{}', { status: 429 })),
  PRODUCE_COST: { film: 25 },
}));
const reserveProduce = jest.fn();
const refundProduce = jest.fn(async () => undefined);
jest.mock('../../../../lib/orchestrator/produceBilling', () => ({
  reserveProduce: (...a: unknown[]) => reserveProduce(...a),
  refundProduce: (...a: unknown[]) => refundProduce(...a),
  idemRef: (kind: string, id: string) => `${kind}:${id}`,
  reservationErrorCode: (r: { reason: string }) =>
    r.reason === 'replay' ? 'duplicate_request' : r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable',
}));
jest.mock('../../../../lib/billing/wallet-ledger', () => ({
  consumeFreeFilm: jest.fn(async () => -1),
  restoreFreeFilm: jest.fn(async () => undefined),
}));
const createJob = jest.fn(async () => true);
const recordJobEvent = jest.fn();
const recordJobReservation = jest.fn(async () => undefined);
jest.mock('../../../../lib/orchestrator/jobs', () => ({
  createJob: (...a: unknown[]) => createJob(...a),
  recordJobEvent: (...a: unknown[]) => recordJobEvent(...a),
  recordJobReservation: (...a: unknown[]) => recordJobReservation(...a),
}));
const llmText = jest.fn();
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: (...a: unknown[]) => llmText(...a) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn(async () => null) }));
jest.mock('../../../../lib/observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../../../../lib/observability/reliability', () => ({ reportReliability: jest.fn(), opsMarker: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const post = async (key?: string) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key) headers['idempotency-key'] = key;
  const res = await POST(new NextRequest('https://myavatar.ge/api/orchestrator/produce', {
    method: 'POST', headers, body: JSON.stringify({ prompt: 'a lighthouse at dawn', totalDurationSec: 8 }),
  }));
  const text = res.body ? await res.text() : '';
  const events = text.split('\n\n').filter((b) => b.startsWith('data:')).map((b) => JSON.parse(b.slice(5).trim()) as Record<string, unknown>);
  return { res, events };
};

beforeEach(() => { jest.clearAllMocks(); });

describe('POST /api/orchestrator/produce: refused reservations', () => {
  it('a replayed key tells the caller "duplicate_request" and leaves the original row alone', async () => {
    reserveProduce.mockResolvedValue({ proceed: false, charged: false, reason: 'replay', balance: 40 });
    const { events } = await post('film-key-1');
    expect(reserveProduce).toHaveBeenCalledWith(mockUser.id, 25, 'film:prod_film-key-1', { refuseReplay: true });
    expect(events).toEqual([expect.objectContaining({ pipelineId: 'prod_film-key-1', stage: 'failed', error: 'duplicate_request' })]);
    // The row named by the key is the original film's: nothing is written to it.
    expect(recordJobEvent).not.toHaveBeenCalled();
    expect(recordJobReservation).not.toHaveBeenCalled();
    expect(llmText).not.toHaveBeenCalled();
    // Nothing was charged now, so nothing is paid back.
    expect(refundProduce).toHaveBeenCalledWith(mockUser.id, 25, 'film:prod_film-key-1', false);
  });

  it('a shortfall still fails its own new row, so the tray and Library show why', async () => {
    reserveProduce.mockResolvedValue({ proceed: false, charged: false, reason: 'insufficient', balance: 3 });
    const { events } = await post();
    expect(events).toEqual([expect.objectContaining({ stage: 'failed', error: 'insufficient_credits' })]);
    const jobId = createJob.mock.calls[0][0] as { id: string };
    expect(recordJobEvent).toHaveBeenCalledWith(jobId.id, expect.objectContaining({ stage: 'failed', error: 'insufficient_credits' }));
    expect(llmText).not.toHaveBeenCalled();
  });
});
