/** @jest-environment node */
/**
 * POST /api/genjutsu/quote — the number the panel puts on the Generate button. For `scene` it is lib/genjutsu/pricing (the
 * function /generate charges with); for the Higgsfield ops it is the studio saga's LIVE quote, never a local guess.
 * Every answer also says how many photos the engine really receives, so "Using 3 of 12" is known before anyone pays.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn() }));
jest.mock('../../../../lib/platform/redis', () => ({ getRedisClient: () => null }));
jest.mock('../../../../lib/genjutsu/capabilities', () => ({
  opStatuses: jest.fn(),
  SWAP_MODEL_ID: 'hf/genjutsu-swap',
  motionModelId: (q?: string) => (q === 'pro' ? 'hf/kling-3-motion-pro' : 'hf/kling-3-motion-std'),
}));
jest.mock('../../../../lib/genjutsu/serverCommon', () => ({
  ...jest.requireActual('../../../../lib/genjutsu/serverCommon'),
  signOwnedPaths: jest.fn(),
}));
jest.mock('../../../../lib/studio/http', () => ({ ...jest.requireActual('../../../../lib/studio/http'), withinEstimateBudget: jest.fn(async () => true) }));
jest.mock('../../../../lib/studio/runtime', () => ({ getStudioRuntime: jest.fn() }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { opStatuses } from '../../../../lib/genjutsu/capabilities';
import { signOwnedPaths } from '../../../../lib/genjutsu/serverCommon';
import { withinEstimateBudget } from '../../../../lib/studio/http';
import { getStudioRuntime } from '../../../../lib/studio/runtime';

const UID = '11111111-2222-4333-8444-555555555555';
const mine = (n: string) => `omni-uploads/${UID}/${n}`;
const OPEN = { op: 'x', open: true, reason: 'ok' };
const SHUT = { op: 'x', open: false, reason: 'flag_off' };
const post = (body: unknown) => new NextRequest('https://myavatar.ge/api/genjutsu/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (opStatuses as jest.Mock).mockReturnValue({ scene: OPEN, motion: OPEN, swap: SHUT });
  (withinEstimateBudget as jest.Mock).mockResolvedValue(true);
  (signOwnedPaths as jest.Mock).mockImplementation(async (_u: string, paths: string[]) => ({ ok: true, urls: paths.map((p) => `https://signed.example/${p}`) }));
});

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ ref: mine(`p${i}.jpg`), role: (['character', 'product', 'wardrobe'] as const)[i % 3] }));

test('a guest gets 401; a spent estimate window gets 429', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: null });
  expect((await POST(post({ op: 'scene', preset: 'fire' }))).status).toBe(401);
  (authedClientFromRequest as jest.Mock).mockResolvedValue({ user: { id: UID } });
  (withinEstimateBudget as jest.Mock).mockResolvedValue(false);
  expect((await POST(post({ op: 'scene', preset: 'fire' }))).status).toBe(429);
});

test('scene: the price is lib/genjutsu/pricing — Fast 25, Standard 83 — with the photo count the engine really takes', async () => {
  const fast = await (await POST(post({ op: 'scene', preset: 'fire', references: photos(12), referencesTotal: 12 }))).json();
  expect(fast).toMatchObject({ success: true, op: 'scene', credits: 25, source: 'local', refsUsed: 3, refsTotal: 12, cap: 3 });
  const std = await (await POST(post({ op: 'scene', preset: 'fire', quality: 'standard' }))).json();
  expect(std).toMatchObject({ credits: 83, refsUsed: 0, refsTotal: 0 });
  expect(getStudioRuntime).not.toHaveBeenCalled(); // a local price never calls the provider
});

test('a locked op is 423, an invalid body 400', async () => {
  (opStatuses as jest.Mock).mockReturnValue({ scene: SHUT, motion: SHUT, swap: SHUT });
  expect((await POST(post({ op: 'scene', preset: 'fire' }))).status).toBe(423);
  expect((await POST(post({ op: 'scene' }))).status).toBe(400);
});

const VIDEO = { path: mine('v.mp4'), durationSec: 12, sizeBytes: 9_000_000 };
const MOTION = { op: 'motion', preset: 'fire', video: VIDEO, references: photos(4), referencesTotal: 4 };

test('motion: the price is the saga\'s LIVE quote — one character image goes to the model, never a local number', async () => {
  const quote = jest.fn(async () => ({ ok: true, price: { credits: 72, gel: 7.2, usd: 2 } }));
  (getStudioRuntime as jest.Mock).mockReturnValue({ saga: { quote } });
  const j = await (await POST(post(MOTION))).json();
  expect(j).toMatchObject({ success: true, op: 'motion', credits: 72, gel: 7.2, display: '7.20 ₾', source: 'provider-quote', refsUsed: 1, refsTotal: 4, cap: 1 });
  // The provider's own USD cost (our margin) is never on the wire.
  expect(JSON.stringify(j)).not.toContain('usd');
  const [modelId, input] = quote.mock.calls[0] as unknown as [string, Record<string, unknown>];
  expect(modelId).toBe('hf/kling-3-motion-std');
  expect(input.image_url).toBe(`https://signed.example/${mine('p0.jpg')}`);
  expect(input.video_url).toBe(`https://signed.example/${VIDEO.path}`);
});

test('motion: the saga\'s refusals keep their codes; someone else\'s upload is 422 not_owner and is never signed', async () => {
  (getStudioRuntime as jest.Mock).mockReturnValue({ saga: { quote: jest.fn(async () => ({ ok: false, code: 'model_unavailable' })) } });
  const res = await POST(post(MOTION));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe('model_unavailable');

  (signOwnedPaths as jest.Mock).mockClear();
  const res2 = await POST(post({ ...MOTION, references: [{ ref: 'omni-uploads/someone-else/x.jpg', role: 'character' }] }));
  expect(res2.status).toBe(422);
  expect(signOwnedPaths).not.toHaveBeenCalled();
});

test('motion without a studio runtime is 503 not_configured', async () => {
  (getStudioRuntime as jest.Mock).mockReturnValue(null);
  expect((await POST(post(MOTION))).status).toBe(503);
});
