/** @jest-environment node */
/**
 * POST /api/replicate/generate — the paid create is RESERVED (it was never charged at all), a failed create or a
 * failed prediction is refunded through the ledger, and only the payer the signed token names collects the refund.
 * Replicate and the ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'en' })),
  insufficientCreditsMessage: () => 'Insufficient Credits',
}));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 25 })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { guardGeneration } from '../../../../lib/api/generationGuard';
import { createPrediction, pollPrediction } from '../../../../lib/replicate/client';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';

const ENV = { ...process.env };
const post = (body: unknown) => POST(new NextRequest('https://myavatar.ge/api/replicate/generate', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
const VIDEO = { service: 'video', prompt: 'waves crashing on a rocky shore at dusk' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_CHARGE_SECRET: 'test-replicate-charge-secret' };
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (createPrediction as jest.Mock).mockResolvedValue({ id: 'pred-9', status: 'starting', output: null });
});
afterAll(() => { process.env = ENV; });

test('the service’s price is reserved BEFORE the paid create (it used to render free)', async () => {
  const res = await post(VIDEO);
  expect(res.status).toBe(200);
  expect(deductCredits).toHaveBeenCalledWith('user-1', 25, expect.stringMatching(/^replicate:gen:video:[0-9a-f-]{36}:user-1$/));
  expect((deductCredits as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((createPrediction as jest.Mock).mock.invocationCallOrder[0]!);
  // The id the client polls carries the charge token.
  expect((await res.json()).id).toMatch(/^pred-9~rg1\./);
});

test.each([
  ['insufficient', 402],
  ['error', 503],
])('a %s debit → %i and NO create', async (reason, status) => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason });
  expect((await post(VIDEO)).status).toBe(status);
  expect(createPrediction).not.toHaveBeenCalled();
});

test('a create that throws refunds the reservation', async () => {
  (createPrediction as jest.Mock).mockRejectedValue(new Error('Replicate API 500'));
  const j = await (await post(VIDEO)).json();
  const ref = (deductCredits as jest.Mock).mock.calls[0][2];
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', ref);
  expect(j.refunded).toBe(true);
});

test('a poll of a FAILED paid prediction refunds the payer (once per ref, ledger-capped) and says so', async () => {
  const { id } = await (await post(VIDEO)).json();
  const ref = (deductCredits as jest.Mock).mock.calls[0][2];
  (pollPrediction as jest.Mock).mockResolvedValue({ id: 'pred-9', status: 'failed', output: null, error: 'NSFW' });
  const j = await (await post({ predictionId: id })).json();
  expect(pollPrediction).toHaveBeenCalledWith('pred-9'); // the bare prediction, token stripped
  expect(refundDebitByRef).toHaveBeenCalledWith('user-1', ref);
  expect(j).toMatchObject({ status: 'failed', refunded: true });
});

test('a poll by ANOTHER user, a forged token, or a succeeded prediction refunds nothing', async () => {
  const { id } = await (await post(VIDEO)).json();
  (pollPrediction as jest.Mock).mockResolvedValue({ id: 'pred-9', status: 'failed', output: null });
  (guardGeneration as jest.Mock).mockResolvedValueOnce({ ok: true, userId: 'someone-else', locale: 'en' });
  await post({ predictionId: id });
  await post({ predictionId: 'pred-9~rg1.e30.forged' });
  (pollPrediction as jest.Mock).mockResolvedValue({ id: 'pred-9', status: 'succeeded', output: ['https://replicate.delivery/v.mp4'] });
  await post({ predictionId: id });
  expect(refundDebitByRef).not.toHaveBeenCalled();
});
