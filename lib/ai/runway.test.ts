/** @jest-environment node */
import {
  hasRunwayProvider,
  runwayModel,
  mapRunwayRatio,
  mapRunwayDuration,
  createRunwayI2V,
  pollRunwayTask,
} from './runway';

const OK = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const ERR = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe('runway adapter — pure mappers', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('mapRunwayRatio emits RESOLUTION strings (never the version-broken 16:9/9:16)', () => {
    expect(mapRunwayRatio('9:16')).toBe('768:1280');
    expect(mapRunwayRatio('vertical')).toBe('768:1280');
    expect(mapRunwayRatio('768:1280')).toBe('768:1280');
    expect(mapRunwayRatio('16:9')).toBe('1280:768');
    expect(mapRunwayRatio('landscape')).toBe('1280:768');
    expect(mapRunwayRatio(undefined)).toBe('1280:768');
    // never emits the deprecated aspect forms that the 2024-11-06 API rejects
    expect(['768:1280', '1280:768']).toContain(mapRunwayRatio('9:16'));
  });

  test('mapRunwayRatio honours per-orientation env overrides (e.g. gen4_turbo ratios)', () => {
    process.env.RUNWAY_RATIO_LANDSCAPE = '1280:720';
    process.env.RUNWAY_RATIO_PORTRAIT = '720:1280';
    expect(mapRunwayRatio('16:9')).toBe('1280:720');
    expect(mapRunwayRatio('9:16')).toBe('720:1280');
  });

  test('mapRunwayRatio is MODEL-AWARE — switching to gen4_turbo auto-selects 720-family (no env foot-gun)', () => {
    delete process.env.RUNWAY_RATIO_LANDSCAPE; delete process.env.RUNWAY_RATIO_PORTRAIT;
    process.env.RUNWAY_VIDEO_MODEL = 'gen3a_turbo';
    expect(mapRunwayRatio('16:9')).toBe('1280:768'); // gen3a family
    expect(mapRunwayRatio('9:16')).toBe('768:1280');
    process.env.RUNWAY_VIDEO_MODEL = 'gen4_turbo';
    expect(mapRunwayRatio('16:9')).toBe('1280:720'); // gen4 family — switching the model alone Just Works
    expect(mapRunwayRatio('9:16')).toBe('720:1280');
  });

  test('mapRunwayDuration clamps to Runway’s only legal values (5 or 10)', () => {
    expect(mapRunwayDuration(5)).toBe(5);
    expect(mapRunwayDuration(6)).toBe(5);
    expect(mapRunwayDuration(8)).toBe(10);
    expect(mapRunwayDuration(30)).toBe(10);
    expect(mapRunwayDuration(undefined)).toBe(5);
  });

  test('runwayModel defaults to the mandated gen3a_turbo, env-overridable', () => {
    delete process.env.RUNWAY_VIDEO_MODEL;
    expect(runwayModel()).toBe('gen3a_turbo');
    process.env.RUNWAY_VIDEO_MODEL = 'gen4_turbo';
    expect(runwayModel()).toBe('gen4_turbo');
  });
});

describe('runway adapter — provider gating (INERT until a key is set)', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  test('hasRunwayProvider is false with no key, true with either accepted var', () => {
    delete process.env.RUNWAY_API_KEY; delete process.env.RUNWAYML_API_SECRET;
    expect(hasRunwayProvider()).toBe(false);
    process.env.RUNWAY_API_KEY = 'k';
    expect(hasRunwayProvider()).toBe(true);
    delete process.env.RUNWAY_API_KEY; process.env.RUNWAYML_API_SECRET = 's';
    expect(hasRunwayProvider()).toBe(true);
  });

  test('createRunwayI2V returns null (no network) when no key is configured', async () => {
    delete process.env.RUNWAY_API_KEY; delete process.env.RUNWAYML_API_SECRET;
    const fetchImpl = jest.fn();
    const r = await createRunwayI2V({ promptImage: 'https://x/f.jpg', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('runway adapter — createRunwayI2V (fail-open create)', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.RUNWAY_API_KEY = 'test-key'; });
  afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks(); });

  test('returns {id} on a 200 with an id + sends the 2024-11-06 contract', async () => {
    const fetchImpl = jest.fn(async () => OK({ id: 'task_123' }));
    const r = await createRunwayI2V({ promptImage: 'https://x/f.jpg', promptText: 'a hero', aspect: '9:16', durationSec: 5, seed: 7, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ id: 'task_123' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1/image_to_video');
    expect((init.headers as Record<string, string>)['X-Runway-Version']).toBe('2024-11-06');
    const body = JSON.parse(init.body as string);
    expect(body.ratio).toBe('768:1280'); // resolution string, not 9:16
    expect(body.promptImage).toBe('https://x/f.jpg');
    expect(body.duration).toBe(5);
  });

  test('returns null on a 429/quota/4xx (→ caller falls back to Replicate)', async () => {
    const r = await createRunwayI2V({ promptImage: 'https://x/f.jpg', fetchImpl: (async () => ERR(429)) as unknown as typeof fetch });
    expect(r).toBeNull();
  });

  test('PHASE 28: on a 403 it logs the EXACT error body + classifies AUTH/SCOPE (token-scope diagnosis)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const body = 'You do not have permission to use gen3a_turbo';
    const res = { ok: false, status: 403, text: async () => body, json: async () => ({}) } as unknown as Response;
    const r = await createRunwayI2V({ promptImage: 'https://x/f.jpg', fetchImpl: (async () => res) as unknown as typeof fetch });
    expect(r).toBeNull();
    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/AUTH\/SCOPE/);
    expect(logged).toMatch(/http_403/);
    expect(logged).toContain(body); // the exact Runway error body is surfaced, not just the status
  });

  test('NEVER throws when fetch rejects — returns null', async () => {
    const r = await createRunwayI2V({ promptImage: 'https://x/f.jpg', fetchImpl: (async () => { throw new Error('network down'); }) as unknown as typeof fetch });
    expect(r).toBeNull();
  });

  test('rejects a non-http/non-data promptImage without a network call', async () => {
    const fetchImpl = jest.fn();
    const r = await createRunwayI2V({ promptImage: 'runway-internal-path', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('runway adapter — pollRunwayTask (status mapping, fail-open)', () => {
  const saved = { ...process.env };
  beforeEach(() => { process.env.RUNWAY_API_KEY = 'test-key'; });
  afterEach(() => { process.env = { ...saved }; });

  test('SUCCEEDED with output[0] → succeeded + url', async () => {
    const r = await pollRunwayTask('t1', (async () => OK({ status: 'SUCCEEDED', output: ['https://cdn/out.mp4'] })) as unknown as typeof fetch);
    expect(r).toEqual({ status: 'succeeded', url: 'https://cdn/out.mp4' });
  });

  test('SUCCEEDED with an empty output → failed (no usable URL)', async () => {
    const r = await pollRunwayTask('t1', (async () => OK({ status: 'SUCCEEDED', output: [] })) as unknown as typeof fetch);
    expect(r).toEqual({ status: 'failed', url: null });
  });

  test('FAILED → failed', async () => {
    const r = await pollRunwayTask('t1', (async () => OK({ status: 'FAILED' })) as unknown as typeof fetch);
    expect(r.status).toBe('failed');
  });

  test('PENDING / RUNNING / THROTTLED → processing (keep polling)', async () => {
    for (const s of ['PENDING', 'RUNNING', 'THROTTLED', 'something-new']) {
      const r = await pollRunwayTask('t1', (async () => OK({ status: s })) as unknown as typeof fetch);
      expect(r.status).toBe('processing');
    }
  });

  test('a transient non-ok (incl 429) → processing, and a throw → processing (fail-open, never drop a good render)', async () => {
    expect((await pollRunwayTask('t1', (async () => ERR(429)) as unknown as typeof fetch)).status).toBe('processing');
    expect((await pollRunwayTask('t1', (async () => { throw new Error('blip'); }) as unknown as typeof fetch)).status).toBe('processing');
  });

  test('no key or no task id → failed (nothing to poll)', async () => {
    delete process.env.RUNWAY_API_KEY;
    expect((await pollRunwayTask('t1')).status).toBe('failed');
  });
});
