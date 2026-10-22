/** @jest-environment node */
/**
 * POST /api/v2/model3d/create — a 3D reconstruction (TRELLIS on Replicate, with an Imagen reference on the text path).
 *
 * ⚠️ It has no Google engine, so every request is refused with 503 google_only BEFORE the session, the limit, the charge,
 * the reference image, the upload or Replicate, whatever MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). The charge, refund and
 * settle rules it used to pin went with the code; /api/v2/model3d/status stays open and keeps its own tests, so a
 * reconstruction started before the change still finishes and a failed one is still refunded.
 * Every collaborator is mocked so any call is caught — no network, no spend.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../../lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock('../../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } },
}));
jest.mock('../../../../../lib/services/model3d/replicate3dClient', () => ({
  submitReconstruction: jest.fn(async () => ({ ok: true, predictionId: 'pred123' })),
  hasReplicate3dProvider: jest.fn(() => true),
}));
jest.mock('../../../../../lib/ai/geminiImagen', () => ({
  generateImagenImages: jest.fn(async () => [{ buffer: Buffer.from('png'), mimeType: 'image/png' }]),
}));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn() }));
jest.mock('../../../../../lib/services/resolveUpload', () => ({ resolveUploadRef: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(), recordJobSettle: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundDebitByRef: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { createSupabaseServerClient } from '../../../../../lib/supabase/server';
import { checkRateLimit } from '../../../../../lib/api/rate-limit';
import { submitReconstruction } from '../../../../../lib/services/model3d/replicate3dClient';
import { generateImagenImages } from '../../../../../lib/ai/geminiImagen';
import { uploadBufferAndSign } from '../../../../../lib/orchestrator/storage-adapter';
import { resolveUploadRef } from '../../../../../lib/services/resolveUpload';
import { createJob, recordJobSettle } from '../../../../../lib/orchestrator/jobs';
import { deductCredits, refundDebitByRef } from '../../../../../lib/orchestrator/ledger';

const post = (body: unknown, locale?: string) =>
  new NextRequest('https://myavatar.ge/api/v2/model3d/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(locale ? { cookie: `NEXT_LOCALE=${locale}` } : {}) },
    body: JSON.stringify(body),
  });

const TEXT = { mode: 'text', prompt: 'an old clay jug with flowers', quality: 'draft' };
const IMAGE = { mode: 'image', imageUrl: 'user-1/uploads/jug.jpg', quality: 'draft' };
const ENV = { ...process.env };

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => {
  fetchSpy.mockRestore();
  process.env = { ...ENV };
});

describe.each([
  {},
  { MEDIA_GOOGLE_ONLY: '0' },
  { MEDIA_GOOGLE_ONLY: 'false', OUTSIDE_ENGINES_APPROVED: 'owner-2026-10-20-replicate' },
])('env %p', (env) => {
  beforeEach(() => { Object.assign(process.env, env); });

  test.each([['text', TEXT], ['photo', IMAGE], ['no body', null]])('a %s request is refused before anything runs', async (_kind, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, url: null, jobId: null, code: 'google_only', error: 'google_only' });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
    expect(refundDebitByRef).not.toHaveBeenCalled();
    expect(generateImagenImages).not.toHaveBeenCalled();
    expect(resolveUploadRef).not.toHaveBeenCalled();
    expect(uploadBufferAndSign).not.toHaveBeenCalled();
    expect(submitReconstruction).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(recordJobSettle).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

test('the refusal speaks the caller\'s language', async () => {
  expect((await (await POST(post(TEXT, 'ru'))).json()).message).toMatch(/^Этот инструмент/);
  expect((await (await POST(post(TEXT, 'en'))).json()).message).toMatch(/^This tool is paused/);
});
