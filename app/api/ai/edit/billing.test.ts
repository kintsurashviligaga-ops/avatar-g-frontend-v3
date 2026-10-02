/** @jest-environment node */
/**
 * POST /api/ai/edit (inpaint) — the generative object-removal is refused (503) when the ledger DEFINITIVELY failed.
 * Before: the code said so itself — "a 'skipped' (RPC absent) or transient 'error' degrades to proceeding" — so a
 * ledger outage made every inpaint free. Every provider, ffmpeg op and the ledger are mocked — no network, no spend.
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
import { deductCredits } from '../../../../lib/orchestrator/ledger';
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

test('a ledger error → 503 billing_unavailable (localized), and the inpaint model never runs', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'error' });
  const res = await post();
  expect(res.status).toBe(503);
  const j = await res.json();
  expect(j).toMatchObject({ url: null, error: 'billing_unavailable' });
  expect(j.message).toMatch(/ничего не списано/);
  expect(createPrediction).not.toHaveBeenCalled();
});

test('a ledger without the RPC (skipped) still proceeds uncharged — the documented degrade', async () => {
  (deductCredits as jest.Mock).mockResolvedValue({ ok: false, reason: 'skipped' });
  await post();
  expect(createPrediction).toHaveBeenCalledTimes(1);
});
