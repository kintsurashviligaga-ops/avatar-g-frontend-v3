/** @jest-environment node */
/**
 * Phase 7.5 — IMAGE_MULTI_REF (GG 2026-11-13, decision 4). Off: `referenceImages` is ignored and the engine gets exactly
 * today's one reference. On: up to 14 references in all, each hosted like the first, the price unchanged, a lost one refused
 * and refunded. Harness copied from studio.test.ts.
 *
 * (studio.test.ts:) POST /api/nanobanana/image — the Interior designer and the Photographer ride this route (lib/studio/shootContext).
 *
 * Pinned at what every engine receives and at the ledger: the style, room and camera arrive as IDs and become server text;
 * the room / the subject is kept by the lead; ONE reference per render is hosted and handed to Google's image model (the
 * route's one engine, MASTER TASK v3.1); a photo that cannot be hosted is refused and REFUNDED rather than rendered as a
 * different room; the charge is creditCostFor('image') per render whatever the body claims. The engine, storage, the
 * ledger and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({
  generateGeminiImage: jest.fn(async () => null),
  geminiFrameModel: jest.fn(() => 'gemini-3.1-flash-image'),
}));
jest.mock('../../../../lib/services/billing/budgetCheck', () => ({ platformBudgetRefusal: jest.fn(async () => null) }));
jest.mock('../../../../lib/services/billing/guardedCall', () => {
  class BudgetExceededError extends Error {}
  return { BudgetExceededError, guardedCall: jest.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()) };
});
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://signed.example/ref.jpg') }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => true),
  releaseIdempotencyKey: jest.fn(async () => undefined),
  hashPayload: jest.fn(async () => 'hash'),
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  debitExistsForRef: jest.fn(async () => false),
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundCredits: jest.fn(async () => ({ ok: true })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { hashPayload } from '../../../../lib/orchestrator/idempotency';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { creditCostFor } from '../../../../lib/credits/pricing';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ';

beforeEach(() => {
  jest.clearAllMocks();
  (generateGeminiImage as jest.Mock).mockResolvedValue({ base64: 'aGk=', mimeType: 'image/jpeg' });
  // The reference photo and the finished render are both stored; the render goes under omni/.
  (uploadAndSign as jest.Mock).mockImplementation(async (_bucket: string, path: string) => (path.startsWith('omni/') ? 'https://signed.example/out.jpg' : 'https://signed.example/ref.jpg'));
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  (refundCredits as jest.Mock).mockResolvedValue({ ok: true });
  // The render is stored from its own bytes, so nothing is fetched; any fetch is refused.
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const engineArgs = () => (generateGeminiImage as jest.Mock).mock.calls[0][0] as { prompt: string; referenceImages: string[]; requireReferences?: boolean; aspectRatio?: string; style?: string };


const P2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg';
const BASE = { prompt: 'a cat and a dog on a sofa', quality: 'high', aspectRatio: '1:1', jobId: 'tile-1', batchTile: 0, referenceImage: PHOTO };
const prev = process.env.IMAGE_MULTI_REF;
afterEach(() => { if (prev === undefined) delete process.env.IMAGE_MULTI_REF; else process.env.IMAGE_MULTI_REF = prev; });

describe('IMAGE_MULTI_REF off (today)', () => {
  test('referenceImages is ignored: one reference, the default cap, today\'s idempotency payload', async () => {
    delete process.env.IMAGE_MULTI_REF;
    const res = await POST(post({ ...BASE, referenceImages: [P2, 'https://cdn.example/x.png'] }));
    expect(res.status).toBe(200);
    const a = engineArgs() as ReturnType<typeof engineArgs> & { maxReferences?: number };
    expect(a.referenceImages).toEqual(['https://signed.example/ref.jpg']);
    expect(a.maxReferences).toBeUndefined();
    expect((hashPayload as jest.Mock).mock.calls[0][0]).not.toHaveProperty('rx');
  });
});

describe('IMAGE_MULTI_REF on', () => {
  beforeEach(() => { process.env.IMAGE_MULTI_REF = '1'; });

  test('extra pictures are hosted like the first and all reach the engine, with the cap raised to 14; the price is per image', async () => {
    const res = await POST(post({ ...BASE, referenceImages: [P2, 'https://cdn.example/x.png', 42, PHOTO] }));
    expect(res.status).toBe(200);
    const a = engineArgs() as ReturnType<typeof engineArgs> & { maxReferences?: number };
    expect(a.referenceImages).toEqual(['https://signed.example/ref.jpg', 'https://signed.example/ref.jpg', 'https://cdn.example/x.png']);
    expect(a.maxReferences).toBe(14);
    expect(a.requireReferences).toBe(true);
    expect((deductCredits as jest.Mock).mock.calls[0][1]).toBe(creditCostFor('image'));
    expect((hashPayload as jest.Mock).mock.calls[0][0]).toHaveProperty('rx');
  });

  test('never more than 14 in all', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://cdn.example/${i}.png`);
    await POST(post({ ...BASE, referenceImages: many }));
    expect(engineArgs().referenceImages).toHaveLength(14);
  });

  test('an extra picture that cannot be hosted refuses the render and refunds it', async () => {
    let n = 0;
    (uploadAndSign as jest.Mock).mockImplementation(async (_b: string, path: string) => { if (path.startsWith('omni/')) return 'https://signed.example/out.jpg'; n += 1; return n === 1 ? 'https://signed.example/ref.jpg' : null; });
    const res = await POST(post({ ...BASE, referenceImages: [P2] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'reference_unavailable', refunded: true });
    expect(generateGeminiImage).not.toHaveBeenCalled();
    expect(refundCredits).toHaveBeenCalled();
  });
});
