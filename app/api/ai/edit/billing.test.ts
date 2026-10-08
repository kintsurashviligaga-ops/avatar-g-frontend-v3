/** @jest-environment node */
/**
 * POST /api/ai/edit (inpaint) — the generative object-removal ran on Replicate, which MyAvatar v32 retired
 * (lib/providers/policy). Until a Google (Imagen) inpaint adapter exists the action is refused 503
 * `capability_unavailable` BEFORE the guard, the ledger or a provider: nothing is charged, nothing is sent — whatever the
 * ledger would have said, and even with the legacy Replicate variables still set.
 * Every provider, ffmpeg op and the ledger are mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/api/generationGuard', () => ({
  guardGeneration: jest.fn(async () => ({ ok: true, userId: 'user-1', locale: 'ru' })),
  insufficientCreditsMessage: () => 'Недостаточно кредитов',
}));
jest.mock('../../../../lib/orchestrator/ledger', () => ({ deductCredits: jest.fn(), refundCredits: jest.fn(async () => ({ ok: true })) }));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: jest.fn(async (u: string) => u),
  createSignedAssetUrl: jest.fn(async () => 'https://proj.supabase.co/storage/v1/object/sign/uploads/p.png?token=t'),
  parseSupabaseObjectUrl: jest.fn(() => null),
  uploadBufferAndSign: jest.fn(async () => null),
}));
jest.mock('../../../../lib/video/trimClip', () => ({ trimClip: jest.fn() }));
jest.mock('../../../../lib/video/surgicalOps', () => ({
  cropClip: jest.fn(), gradeClip: jest.fn(), detachAudio: jest.fn(), fadeClip: jest.fn(),
  renderVideoDraft: jest.fn(), renderPhotoDraft: jest.fn(), renderConcat: jest.fn(),
}));
jest.mock('../../../../lib/replicate/client', () => ({
  createPrediction: jest.fn(async () => ({ id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/out.png' })),
  pollUntilDone: jest.fn(),
}));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/services/montage/montagePlan', () => ({ maxrateForTarget: jest.fn() }));
jest.mock('../../../../lib/orchestrator/saveEditorOutput', () => ({ saveEditorOutput: jest.fn(async () => undefined) }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { guardGeneration } from '../../../../lib/api/generationGuard';
import { deductCredits, refundCredits } from '../../../../lib/orchestrator/ledger';
import { createPrediction } from '../../../../lib/replicate/client';

const ENV = { ...process.env };
const post = () => POST(new NextRequest('https://myavatar.ge/api/ai/edit', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'inpaint', mediaUrl: 'user-1/photo.png', maskUrl: 'data:image/png;base64,AAAA', prompt: 'remove the cup' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, REPLICATE_API_TOKEN: 'test-token', REPLICATE_INPAINT_MODEL: 'owner/inpaint' };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => { process.env = ENV; });

test.each(['error', 'skipped'] as const)('a ledger that would answer %s is never reached: 503 capability_unavailable, nothing charged, Replicate never runs', async (reason) => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason });
  const res = await post();
  expect(res.status).toBe(503);
  expect(await res.json()).toMatchObject({ url: null, error: 'capability_unavailable' });
  expect(guardGeneration).not.toHaveBeenCalled();
  expect(deductCredits).not.toHaveBeenCalled();
  expect(refundCredits).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
});

test('a ledger that would have charged changes nothing: the inpaint is still refused before any debit', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: true });
  const res = await post();
  expect(res.status).toBe(503);
  expect(deductCredits).not.toHaveBeenCalled();
  expect(createPrediction).not.toHaveBeenCalled();
});
