/** @jest-environment node */
/**
 * GET /api/health/public asks the engines that serve each category. 2026-10-17 09:31Z: the approved avatar test was
 * refused while this route said "6/6 ok" — it pinged Replicate for image / video / music and HeyGen for avatar. The
 * voice is Google Cloud TTS since PR 5d, so voice asks its free voices list; ElevenLabs is never asked (PR 6b).
 */
jest.mock('server-only', () => ({}));
// The route keeps a 60 s cache per instance, so each test imports it afresh; the mocks read these, which survive that.
const mockCheckGoogleTransport = jest.fn();
const mockCheckVertexAuth = jest.fn();
jest.mock('../../../../lib/ai/google/transportCheck', () => ({ checkGoogleTransport: (...a: unknown[]) => mockCheckGoogleTransport(...a) }));
jest.mock('../../../../lib/veo/authCheck', () => ({ checkVertexAuth: (...a: unknown[]) => mockCheckVertexAuth(...a) }));

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

const mockCheckCloudTts = jest.fn();
jest.mock('../../../../lib/audio/google-tts', () => ({ checkCloudTts: (...a: unknown[]) => mockCheckCloudTts(...a) }));

async function snapshot() {
  jest.resetModules();
  const { GET } = await import('./route');
  return (await GET()).json();
}

beforeEach(() => {
  jest.clearAllMocks();
  // An ElevenLabs key is set and must never be used.
  process.env = { ...ENV, ELEVENLABS_API_KEY: 'el-test-key' };
  mockCheckCloudTts.mockResolvedValue({ state: 'ok', detail: 'Cloud TTS answers (4 en-US voices) · Georgian on gemini-2.5-flash-tts' });
  mockCheckGoogleTransport.mockResolvedValue({ transport: 'vertex', configured: true, ok: true, steps: [{ model: 'chat', ok: true }, { model: 'image', ok: true }] });
  mockCheckVertexAuth.mockResolvedValue({ ok: true, steps: ['mode:wif', 'token:ok', 'bucket:ok', 'sign:ok'] });
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
});
afterEach(() => { fetchSpy.mockRestore(); process.env = { ...ENV }; });

test('all six ok when Google answers and the Cloud TTS voices list answers', async () => {
  const s = await snapshot();
  expect(s.categories).toEqual({ chat: 'ok', image: 'ok', video: 'ok', music: 'ok', voice: 'ok', avatar: 'ok' });
  expect(s.online).toBe(true);
  expect(mockCheckCloudTts).toHaveBeenCalledTimes(1);
  // Nothing outside the Google checks is fetched: ElevenLabs, Replicate and HeyGen are never asked.
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('an empty voices list is a degraded voice and a degraded avatar — not "ok"', async () => {
  mockCheckCloudTts.mockResolvedValue({ state: 'degraded', detail: 'the voices list answered with no en-US voice' });
  const s = await snapshot();
  expect(s.categories.voice).toBe('degraded');
  expect(s.categories.avatar).toBe('degraded');
  expect(s.categories.video).toBe('ok');
  expect(s.online).toBe(true); // the rest of the studio still works
});

test('Cloud TTS refused (the API off, or the account not allowed) is a voice that is down', async () => {
  mockCheckCloudTts.mockResolvedValue({ state: 'down', detail: 'voices list HTTP 403' });
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
  mockCheckCloudTts.mockResolvedValue({ state: 'unconfigured', detail: 'Vertex AI config missing' });
  s = await snapshot();
  expect(s.categories).toEqual({ chat: 'unconfigured', image: 'unconfigured', video: 'unconfigured', music: 'unconfigured', voice: 'unconfigured', avatar: 'unconfigured' });
});

test('names no provider, key or error text', async () => {
  mockCheckCloudTts.mockResolvedValue({ state: 'degraded', detail: 'the voices list answered with no en-US voice · ka-GE on gemini-2.5-flash-tts · Chirp3' });
  const body = JSON.stringify(await snapshot());
  expect(body).not.toMatch(/elevenlabs|google|vertex|veo|el-test-key|ka-GE|chirp|tts/i);
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
