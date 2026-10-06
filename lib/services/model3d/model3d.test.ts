/** @jest-environment node */
import {
  validateModel3dRequest,
  mapReplicateStatus,
  isTerminal,
  pickGlbUrl,
  pollDelayMs,
  QUALITY_STEPS,
  type Model3dRequest,
} from './model3dPlan';
import { submitReconstruction, pollReconstruction, fetchGlbBuffer, hasReplicate3dProvider } from './replicate3dClient';

const OLD_ENV = { ...process.env };
afterEach(() => { process.env = { ...OLD_ENV }; });

const req = (over: Partial<Model3dRequest> = {}): Model3dRequest => ({
  mode: 'text',
  prompt: 'a ceramic teapot',
  quality: 'draft',
  removeBackground: true,
  ...over,
});

const res = (init: { ok?: boolean; status?: number; body?: unknown; headers?: Record<string, string> }) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => (typeof init.body === 'string' ? init.body : JSON.stringify(init.body ?? {})),
    json: async () => init.body ?? {},
    // Buffer.prototype.buffer is Node's shared pool — slice to this view's own window.
    arrayBuffer: async () => {
      const b = init.body instanceof Buffer ? init.body : Buffer.from('glb');
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    headers: { get: (k: string) => init.headers?.[k.toLowerCase()] ?? null },
  }) as unknown as Response;

describe('validation', () => {
  it('accepts a text request and applies defaults', () => {
    const r = validateModel3dRequest({ prompt: 'a ceramic teapot' });
    expect(r.ok).toBe(true);
    expect(r.request).toMatchObject({ mode: 'text', quality: 'draft', removeBackground: true });
  });

  it('requires a usable image url in image mode', () => {
    expect(validateModel3dRequest({ mode: 'image', imageUrl: 'https://x.dev/a.png' }).ok).toBe(true);
    expect(validateModel3dRequest({ mode: 'image', imageUrl: 'file:///etc/passwd' }).ok).toBe(false);
    expect(validateModel3dRequest({ mode: 'image' }).ok).toBe(false);
  });

  it('rejects an empty or oversized prompt in text mode', () => {
    expect(validateModel3dRequest({ prompt: 'a' }).ok).toBe(false);
    expect(validateModel3dRequest({ prompt: 'x'.repeat(5000) }).ok).toBe(false);
  });

  it('spends more sampling on the standard tier than the draft', () => {
    expect(QUALITY_STEPS.standard).toBeGreaterThan(QUALITY_STEPS.draft);
  });
});

describe('status mapping — an unknown state must never abandon a paid job', () => {
  it('recognises the terminal states', () => {
    expect(mapReplicateStatus('succeeded')).toBe('succeeded');
    expect(mapReplicateStatus('failed')).toBe('failed');
    expect(mapReplicateStatus('canceled')).toBe('failed');
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('processing')).toBe(false);
  });

  it('treats anything unrecognised as still processing', () => {
    expect(mapReplicateStatus('some_new_state')).toBe('processing');
    expect(mapReplicateStatus(undefined)).toBe('processing');
  });

  it('backs off so a multi-minute job does not hammer the API', () => {
    expect(pollDelayMs(0)).toBe(3_000);
    expect(pollDelayMs(50)).toBe(15_000);
  });
});

describe('GLB extraction — deliberately shape-agnostic, because the exact output shape is unverified', () => {
  it('finds a bare url', () => {
    expect(pickGlbUrl('https://replicate.delivery/x/model.glb')).toBe('https://replicate.delivery/x/model.glb');
  });

  it('finds one inside an array', () => {
    expect(pickGlbUrl(['https://x.dev/preview.png', 'https://x.dev/model.glb'])).toBe('https://x.dev/model.glb');
  });

  it('prefers the conventional mesh key over an incidental one', () => {
    const out = { color_video: 'https://x.dev/v.mp4', model_file: 'https://x.dev/mesh.glb' };
    expect(pickGlbUrl(out)).toBe('https://x.dev/mesh.glb');
  });

  it('accepts a signed url with a query string', () => {
    expect(pickGlbUrl('https://x.dev/model.glb?token=abc')).toBe('https://x.dev/model.glb?token=abc');
  });

  it('ignores formats the viewer cannot load', () => {
    expect(pickGlbUrl({ mesh: 'https://x.dev/model.ply', other: 'https://x.dev/model.obj' })).toBeNull();
  });

  it('is total on junk and cannot spin on a deep payload', () => {
    expect(pickGlbUrl(null)).toBeNull();
    expect(pickGlbUrl(42)).toBeNull();
    let deep: unknown = 'https://x.dev/model.glb';
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    expect(pickGlbUrl(deep)).toBeNull(); // depth-bounded, by design
  });
});

describe('retired 3D provider', () => {
  it('cannot activate or submit/poll when a legacy token exists', async () => {
    process.env.REPLICATE_API_TOKEN = 'legacy-token';
    const fetchImpl = jest.fn();
    expect(hasReplicate3dProvider()).toBe(false);
    await expect(submitReconstruction('https://example.com/a.png', req(), fetchImpl)).rejects.toMatchObject({ code: 'provider_deprecated' });
    await expect(pollReconstruction('https://api.replicate.com/v1/predictions/p1', fetchImpl)).rejects.toMatchObject({ code: 'provider_deprecated' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('client — download', () => {
  it('refuses an oversized model rather than OOMing the lambda', async () => {
    const r = await fetchGlbBuffer('https://replicate.delivery/x/m.glb', async () =>
      res({ headers: { 'content-length': String(500 * 1024 * 1024) } }));
    expect(r).toBeNull();
  });

  it('rejects a non-http url outright', async () => {
    expect(await fetchGlbBuffer('file:///etc/passwd')).toBeNull();
  });

  it('returns the bytes on success', async () => {
    const r = await fetchGlbBuffer('https://replicate.delivery/x/m.glb', async () => res({ body: Buffer.from('glTF-bytes') }));
    expect(r?.toString()).toBe('glTF-bytes');
  });
});
