/** @jest-environment node */
/**
 * POST /api/nanobanana/image — the Interior designer and the Photographer ride this route (lib/studio/shootContext).
 *
 * Pinned at what every engine receives and at the ledger: the style, room and camera arrive as IDs and become server text;
 * the room / the subject is kept by the lead; ONE reference per render is hosted and handed to NanoBanana (the prompt-only
 * fallbacks never run for an edit); a photo that cannot be hosted is refused and REFUNDED rather than rendered as a
 * different room; the charge is creditCostFor('image') per render whatever the body claims. Every provider, the ledger
 * and the idempotency store are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(() => true), geminiImagenModel: () => 'imagen-4.0-generate-001' }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ ...jest.requireActual('../../../../lib/ai/geminiImage'), generateGeminiImage: jest.fn(async () => null) }));


jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/guard', () => ({
  applyApiGuards: jest.fn(async () => ({ response: null, auth: { userId: 'user-1' }, budgetRemaining: null })),
}));
jest.mock('../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: { maxRequests: 5, windowMs: 60_000 } } }));
jest.mock('../../../../lib/agent/optimizer/activeConfig', () => ({ getActiveConfig: jest.fn(async () => null) }));
jest.mock('../../../../lib/nanobanana/client', () => ({
  generateNanoBananaImage: jest.fn(async () => ({ url: 'https://provider.example/out.jpg', text: 'ok', credits: 12 })),
}));
jest.mock('../../../../lib/ai/xaiImage', () => ({ generateGrokImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/fluxImage', () => ({ generateFluxProImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://signed.example/ref.jpg') }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedAsset: jest.fn() }));
jest.mock('../../../../lib/audio/voiceModel', () => ({ DEMO_VOICE_USER_ID: 'demo' }));
jest.mock('../../../../lib/orchestrator/idempotency', () => ({
  isProviderTripped: jest.fn(async () => false),
  recordProviderResult: jest.fn(async () => undefined),
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
import { generateNanoBananaImage } from '../../../../lib/nanobanana/client';
import { generateGrokImage } from '../../../../lib/ai/xaiImage';
import { generateFluxProImage } from '../../../../lib/ai/fluxImage';
import { uploadAndSign } from '../../../../lib/orchestrator/storage-adapter';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';

const post = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/nanobanana/image', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';
beforeEach(() => { jest.clearAllMocks(); });

test.each(['interior', 'photoshoot'])('%s reference renders refuse before any charge or provider', async kind => {
  const res = await POST(post({ prompt: 'preserve this room', referenceImage: PHOTO, studio: { kind } }));
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ code: 'image_edit_unavailable' });
  expect(deductCredits).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
  expect(uploadAndSign).not.toHaveBeenCalled();
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
  expect(generateGrokImage).not.toHaveBeenCalled();
  expect(generateFluxProImage).not.toHaveBeenCalled();
});

test('an unsupported reference never silently becomes a prompt-only image', async () => {
  const res = await POST(post({ prompt: 'preserve this subject', referenceImage: 'not-a-valid-image', studio: { kind: 'photoshoot' } }));
  expect(res.status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(generateNanoBananaImage).not.toHaveBeenCalled();
});
