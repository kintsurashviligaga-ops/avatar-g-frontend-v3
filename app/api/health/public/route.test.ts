/** @jest-environment node */
/**
 * GET /api/health/public asks the engines that serve each category, and the voice's PLAN. 2026-10-17 09:31Z: the
 * approved avatar test was refused by ElevenLabs (`401 subscription_required / ivc_not_permitted`) while this route said
 * "6/6 ok" — it pinged Replicate for image / video / music, HeyGen for avatar, and only the ElevenLabs key for voice.
 */
jest.mock('server-only', () => ({}));
// The route keeps a 60 s cache per instance, so each test imports it afresh; the mocks read these, which survive that.
const mockCheckGoogleTransport = jest.fn();
const mockCheckVertexAuth = jest.fn();
jest.mock('../../../../lib/ai/google/transportCheck', () => ({ checkGoogleTransport: (...a: unknown[]) => mockCheckGoogleTransport(...a) }));
jest.mock('../../../../lib/veo/authCheck', () => ({ checkVertexAuth: (...a: unknown[]) => mockCheckVertexAuth(...a) }));

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

const USER_OK = { subscription: { tier: 'starter', character_count: 100, character_limit: 30000, can_use_instant_voice_cloning: true } };
const USER_NO_CLONING = { subscription: { tier: 'free', character_count: 0, character_limit: 10000, can_use_instant_voice_cloning: false } };

async function snapshot() {
  jest.resetModules();
  const { GET } = await import('./route');
  return (await GET()).json();
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  mockCheckGoogleTransport.mockResolvedValue({ transport: 'vertex', configured: true, ok: true, steps: [{ model: 'chat', ok: true }, { model: 'image', ok: true }] });
  mockCheckVertexAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] });
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(USER_OK), { status: 200 }));
});
afterEach(() => { fetchSpy.mockRestore(); process.env = { ...ENV }; });

test('all six ok when Google answers and the voice plan can speak the cloned Georgian voices', async () => {
  const s = await snapshot();
  expect(s.categories).toEqual({ chat: 'ok', image: 'ok', video: 'ok', music: 'ok', voice: 'ok', avatar: 'ok' });
  expect(s.online).toBe(true);
  // Only ElevenLabs is fetched here; Replicate and HeyGen are never asked.
  const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
  expect(urls).toEqual(['https://api.elevenlabs.io/v1/user']);
});

test('a plan without cloned voices is a degraded voice and a degraded avatar — not "ok" (Production, 2026-10-17)', async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify(USER_NO_CLONING), { status: 200 }));
  const s = await snapshot();
  expect(s.categories.voice).toBe('degraded');
  expect(s.categories.avatar).toBe('degraded');
  expect(s.categories.video).toBe('ok');
  expect(s.online).toBe(true); // the rest of the studio still works
});

test('a key ElevenLabs refuses is a voice that is down', async () => {
  fetchSpy.mockImplementation(async () => new Response('{}', { status: 401 }));
  const s = await snapshot();
  expect(s.categories.voice).toBe('down');
  expect(s.categories.avatar).toBe('degraded');
});

test('no Veo means no video and no avatar', async () => {
  mockCheckVertexAuth.mockResolvedValue({ ok: false, steps: ['mode:wif', 'token:failed HTTP 400'] });
  const s = await snapshot();
  expect(s.categories.video).toBe('down');
  expect(s.categories.avatar).toBe('down');
  expect(s.online).toBe(false);
});

test('the Google transport failing the image model is image down; a missing setup reads unconfigured', async () => {
  mockCheckGoogleTransport.mockResolvedValue({ transport: 'vertex', configured: true, ok: false, steps: [{ model: 'chat', ok: true }, { model: 'image', ok: false }] });
  let s = await snapshot();
  expect(s.categories).toMatchObject({ chat: 'ok', image: 'down', music: 'down' });
  mockCheckGoogleTransport.mockResolvedValue({ transport: 'vertex', configured: false, ok: false, missing: ['GOOGLE_CLOUD_PROJECT'], steps: [] });
  mockCheckVertexAuth.mockResolvedValue({ ok: false, steps: ['config:missing'] });
  delete process.env.ELEVENLABS_API_KEY;
  s = await snapshot();
  expect(s.categories).toEqual({ chat: 'unconfigured', image: 'unconfigured', video: 'unconfigured', music: 'unconfigured', voice: 'unconfigured', avatar: 'unconfigured' });
});

test('names no provider, key or error text', async () => {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify(USER_NO_CLONING), { status: 200 }));
  const body = JSON.stringify(await snapshot());
  expect(body).not.toMatch(/elevenlabs|google|vertex|veo|el-test-key|free|cloning/i);
});

test('a check that never answers reads down, and the snapshot still comes back in time', async () => {
  jest.useFakeTimers();
  try {
    mockCheckVertexAuth.mockReturnValue(new Promise(() => {}));
    const pending = snapshot();
    await jest.advanceTimersByTimeAsync(10_000);
    const s = await pending;
    expect(s.categories.video).toBe('down');
    expect(s.categories.avatar).toBe('down');
    expect(s.categories.chat).toBe('ok');
  } finally {
    jest.useRealTimers();
  }
});
