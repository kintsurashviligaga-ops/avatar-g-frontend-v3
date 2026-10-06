/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../../lib/orchestrator/rate-limit', () => ({ checkProduceRate: jest.fn(async () => ({ ok: true })), rateLimitedResponse: jest.fn(), PRODUCE_COST: { image: 10 } }));
jest.mock('../../../../../lib/orchestrator/produceBilling', () => ({
  reserveProduce: jest.fn(async () => ({ proceed: true, charged: true })), refundProduce: jest.fn(), idemRef: () => 'image-ref',
}));
jest.mock('../../../../../lib/orchestrator/jobs', () => ({ createJob: jest.fn(), recordJobEvent: jest.fn(), recordJobReservation: jest.fn() }));
jest.mock('../../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../../lib/ai/geminiImagen', () => ({ hasGeminiImagenProvider: jest.fn(() => true), generateImagenImages: jest.fn() }));
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({ uploadBufferAndSign: jest.fn(async () => 'https://test.supabase.co/image.png') }));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { generateImagenImages, hasGeminiImagenProvider } from '../../../../../lib/ai/geminiImagen';
import { reserveProduce, refundProduce } from '../../../../../lib/orchestrator/produceBilling';
import { uploadBufferAndSign } from '../../../../../lib/orchestrator/storage-adapter';
import { llmText } from '../../../../../lib/ai/llmText';
import { authedClientFromRequest } from '../../../../../lib/supabase/server';

const req = () => new NextRequest('https://myavatar.ge/api/orchestrator/image/produce', {
  method: 'POST', body: JSON.stringify({ prompt: 'A lighthouse at dusk' }), headers: { 'content-type': 'application/json' },
});
beforeEach(() => {
  jest.clearAllMocks();
  (generateImagenImages as jest.Mock).mockResolvedValue([{ buffer: Buffer.from('image'), mimeType: 'image/png' }]);
  (hasGeminiImagenProvider as jest.Mock).mockReturnValue(true);
  (reserveProduce as jest.Mock).mockResolvedValue({ proceed: true, charged: true });
  (uploadBufferAndSign as jest.Mock).mockResolvedValue('https://test.supabase.co/image.png');
});

test('uses Google directly inside one existing credit reservation and delivers the hosted image', async () => {
  const res = await POST(req());
  const stream = await res.text();
  expect(res.status).toBe(200);
  expect(stream).toContain('"stage":"completed"');
  expect(stream).toContain('https://test.supabase.co/image.png');
  expect(generateImagenImages).toHaveBeenCalledTimes(1);
  expect(llmText).toHaveBeenCalledTimes(1);
  expect(reserveProduce).toHaveBeenCalledTimes(1);
  expect(refundProduce).not.toHaveBeenCalled();
});
test('unavailable Imagen refuses before creating a reservation or using Gemini', async () => {
  (hasGeminiImagenProvider as jest.Mock).mockReturnValue(false);
  expect((await POST(req())).status).toBe(503);
  expect(reserveProduce).not.toHaveBeenCalled();
  expect(llmText).not.toHaveBeenCalled();
  expect(generateImagenImages).not.toHaveBeenCalled();
});
test.each(['generation', 'storage'])('%s failure refunds the existing reservation exactly once', async failure => {
  if (failure === 'generation') (generateImagenImages as jest.Mock).mockResolvedValue(null);
  else (uploadBufferAndSign as jest.Mock).mockResolvedValue(null);
  expect(await (await POST(req())).text()).toContain('"stage":"failed"');
  expect(refundProduce).toHaveBeenCalledTimes(1);
  expect(refundProduce).toHaveBeenCalledWith('user-1', 10, 'image-ref', true);
});
test('a denied reserve never reaches a provider', async () => {
  (reserveProduce as jest.Mock).mockResolvedValue({ proceed: false, charged: false, reason: 'insufficient' });
  expect(await (await POST(req())).text()).toContain('insufficient_credits');
  expect(generateImagenImages).not.toHaveBeenCalled();
  expect(llmText).not.toHaveBeenCalled();
});
test('authentication still precedes generation', async () => {
  (authedClientFromRequest as jest.Mock).mockResolvedValueOnce({ user: null });
  expect((await POST(req())).status).toBe(401);
  expect(reserveProduce).not.toHaveBeenCalled();
});
