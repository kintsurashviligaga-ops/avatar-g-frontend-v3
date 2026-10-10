/** @jest-environment node */
// The Interior designer's „3D plan": charged once, refunded when it does not finish, and filed to the Library with the
// caller's own render as its picture.

jest.mock('server-only', () => ({}));

const mockUser = { id: '11111111-1111-4111-8111-111111111111' };
let signedIn = true;
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: signedIn ? mockUser : null })),
  createServiceRoleClient: () => null,
}));
jest.mock('../../../../../lib/orchestrator/rate-limit', () => ({
  checkProduceRate: jest.fn(async () => ({ ok: true })),
  rateLimitedResponse: jest.fn(() => new Response('{}', { status: 429 })),
  PRODUCE_COST: { interior: 40 },
}));
const reserveProduce = jest.fn();
const refundProduce = jest.fn(async () => undefined);
jest.mock('../../../../../lib/orchestrator/produceBilling', () => ({
  reserveProduce: (...a: unknown[]) => reserveProduce(...a),
  refundProduce: (...a: unknown[]) => refundProduce(...a),
  idemRef: (kind: string, id: string) => `${kind}:${id}`,
  reservationErrorCode: (r: { reason: string }) => (r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable'),
}));
const createJob = jest.fn(async () => true);
const recordJobEvent = jest.fn();
const recordJobReservation = jest.fn(async () => undefined);
jest.mock('../../../../../lib/orchestrator/jobs', () => ({
  createJob: (...a: unknown[]) => createJob(...a),
  recordJobEvent: (...a: unknown[]) => recordJobEvent(...a),
  recordJobReservation: (...a: unknown[]) => recordJobReservation(...a),
}));
const llmText = jest.fn();
jest.mock('../../../../../lib/ai/llmText', () => ({ llmText: (...a: unknown[]) => llmText(...a) }));
const generateText = jest.fn();
jest.mock('ai', () => ({ generateText: (...a: unknown[]) => generateText(...a) }));
jest.mock('../../../../../lib/ai/google/provider', () => ({ createGoogleGenerativeAI: () => (model: string) => ({ model }) }));
jest.mock('../../../../../lib/ai/google/transport', () => ({ googleCallAttempts: () => ['k1'] }));
jest.mock('../../../../../lib/ai/google/models', () => ({ geminiTierModel: () => 'gemini-flash' }));
const callerMayRead = jest.fn();
jest.mock('../../../../../lib/security/callerMedia', () => ({ callerMayRead: (...a: unknown[]) => callerMayRead(...a) }));
import { NextRequest } from 'next/server';
import { POST } from './route';

const OUR = 'https://ours.supabase.co';
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQ';
const RENDER = `${OUR}/storage/v1/object/sign/renders/img/room-1.png?token=tok`;
const GEOMETRY = { roomType: 'living room', floor: { widthM: 5, depthM: 4 }, wallHeightM: 2.7, walls: [], openings: [], confidence: 0.8 };
const STYLE = { styleName: 'Japandi', palette: ['#eeeeee', '#cccccc', '#333333'], materials: [], lighting: 'warm' };

const post = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/orchestrator/interior/produce', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  const text = res.body ? await res.text() : '';
  const events = text.split('\n\n').filter((b) => b.startsWith('data:')).map((b) => JSON.parse(b.slice(5).trim()) as Record<string, unknown>);
  return { res, events };
};
const completed = (events: Array<Record<string, unknown>>) => events.find((e) => e.stage === 'completed');

const env = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  signedIn = true;
  process.env = { ...env, NEXT_PUBLIC_SUPABASE_URL: OUR };
  reserveProduce.mockResolvedValue({ proceed: true, charged: true, reason: 'ok', balance: 100 });
  generateText.mockResolvedValue({ text: JSON.stringify(GEOMETRY) });
  llmText.mockResolvedValue(JSON.stringify(STYLE));
  callerMayRead.mockResolvedValue(true);
});
afterAll(() => { process.env = env; });

describe('POST /api/orchestrator/interior/produce', () => {
  it('turns a signed-out caller away before anything runs or is charged', async () => {
    signedIn = false;
    const { res } = await post({ imageUrls: [PHOTO] });
    expect(res.status).toBe(401);
    expect(reserveProduce).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it('a finished plan is charged once, not refunded, and filed with its render as the Library picture', async () => {
    const { events } = await post({ imageUrls: [PHOTO], brief: 'Japandi living room', coverUrl: RENDER });
    expect(reserveProduce).toHaveBeenCalledTimes(1);
    expect(reserveProduce).toHaveBeenCalledWith(mockUser.id, 40, expect.stringMatching(/^interior:intr_/));
    expect(refundProduce).not.toHaveBeenCalled();
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      serviceType: 'interior', userId: mockUser.id,
      params: expect.objectContaining({ prompt: 'Japandi living room', source: 'interior-plan' }),
    }));
    const done = completed(events)!;
    expect(done).toMatchObject({ pct: 100, url: RENDER, style: expect.objectContaining({ styleName: 'Japandi' }) });
    expect(done.geometry).toMatchObject({ floor: { widthM: 5, depthM: 4 } });
    // recordJobEvent files the completed event: its `url` becomes the row's signed_url, the plan its result.
    const filed = recordJobEvent.mock.calls.find(([, ev]) => (ev as { stage?: string }).stage === 'completed');
    expect(filed?.[0]).toMatch(/^intr_/);
    expect(filed?.[1]).toMatchObject({ url: RENDER, geometry: expect.any(Object), style: expect.any(Object) });
    expect(callerMayRead).toHaveBeenCalledWith(RENDER, expect.objectContaining({ bucket: 'renders' }), mockUser.id);
  });

  it("files the plan with no picture when the cover is someone else's object", async () => {
    callerMayRead.mockResolvedValue(false);
    const { events } = await post({ imageUrls: [PHOTO], coverUrl: RENDER });
    const done = completed(events)!;
    expect(done).toBeDefined();
    expect(done).not.toHaveProperty('url');
  });

  it('never files an internal or non-https cover, and never asks storage about another host', async () => {
    for (const coverUrl of ['http://169.254.169.254/latest/meta-data', 'https://localhost/x.png', 'javascript:alert(1)', 42]) {
      const { events } = await post({ imageUrls: [PHOTO], coverUrl });
      expect(completed(events)).not.toHaveProperty('url');
    }
    expect(callerMayRead).not.toHaveBeenCalled();
    const { events } = await post({ imageUrls: [PHOTO], coverUrl: 'https://cdn.example.com/render.png' });
    expect(completed(events)).toMatchObject({ url: 'https://cdn.example.com/render.png' });
  });

  it('drops a room photo on an internal host before Gemini downloads it', async () => {
    const { res } = await post({ imageUrls: ['http://169.254.169.254/latest/meta-data', 'http://localhost:3000/a.png'] });
    expect(res.status).toBe(400);
    expect(reserveProduce).not.toHaveBeenCalled();

    await post({ imageUrls: ['http://10.0.0.5/room.jpg', PHOTO] });
    const content = (generateText.mock.calls[0][0] as { messages: Array<{ content: Array<{ type: string; image?: string }> }> }).messages[0].content;
    expect(content.filter((c) => c.type === 'image').map((c) => c.image)).toEqual([PHOTO]);
  });

  it('a short balance stops the run before any model call, with nothing charged to refund', async () => {
    reserveProduce.mockResolvedValue({ proceed: false, charged: false, reason: 'insufficient', balance: 3 });
    const { events } = await post({ imageUrls: [PHOTO] });
    expect(events).toEqual([expect.objectContaining({ stage: 'failed', error: 'insufficient_credits', balance: 3 })]);
    expect(generateText).not.toHaveBeenCalled();
    expect(refundProduce).toHaveBeenCalledWith(mockUser.id, 40, expect.any(String), false);
  });

  it('a run that breaks after the charge is refunded once and never filed as completed', async () => {
    llmText.mockRejectedValue(new Error('style guide failed'));
    const { events } = await post({ imageUrls: [PHOTO], coverUrl: RENDER });
    expect(completed(events)).toBeUndefined();
    expect(events[events.length - 1]).toMatchObject({ stage: 'failed', error: 'style guide failed' });
    expect(refundProduce).toHaveBeenCalledTimes(1);
    expect(refundProduce).toHaveBeenCalledWith(mockUser.id, 40, expect.stringMatching(/^interior:intr_/), true);
    expect(recordJobReservation).toHaveBeenCalledWith(expect.stringMatching(/^intr_/), expect.objectContaining({ credits: 40 }));
  });

  it('falls back to an estimated layout when Gemini cannot read the room, and still files the plan', async () => {
    generateText.mockRejectedValue(new Error('vision down'));
    const { events } = await post({ imageUrls: [PHOTO], coverUrl: RENDER });
    expect(completed(events)).toMatchObject({ degradedGeometry: true, url: RENDER });
    expect(refundProduce).not.toHaveBeenCalled();
  });
});
