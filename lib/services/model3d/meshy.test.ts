/** @jest-environment node */
import {
  validateModel3dRequest,
  mapMeshyStatus,
  isTerminal,
  pickGlbUrl,
  pollDelayMs,
  QUALITY_MODEL,
  MAX_POLYCOUNT,
  MIN_POLYCOUNT,
  DEFAULT_POLYCOUNT,
  type Model3dRequest,
} from './meshyPlan';
import { submitMeshyTask, pollMeshyTask, fetchGlbBuffer, hasMeshyProvider, meshyModelFor } from './meshyClient';

const OLD_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...OLD_ENV };
});

const req = (over: Partial<Model3dRequest> = {}): Model3dRequest => ({
  mode: 'text',
  prompt: 'a ceramic teapot',
  quality: 'draft',
  artStyle: 'realistic',
  topology: 'triangle',
  targetPolycount: DEFAULT_POLYCOUNT,
  ...over,
});

/** Minimal Response stand-in — enough for the client's happy and unhappy paths. */
const res = (init: { ok?: boolean; status?: number; body?: unknown; headers?: Record<string, string> }) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => (typeof init.body === 'string' ? init.body : JSON.stringify(init.body ?? {})),
    json: async () => init.body ?? {},
    // Buffer.prototype.buffer is a view into Node's shared 8KB pool — returning it raw would hand back
    // the whole pool, not these bytes. Slice to the view's own window.
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
    expect(r.request).toMatchObject({ mode: 'text', quality: 'draft', topology: 'triangle', targetPolycount: DEFAULT_POLYCOUNT });
  });

  it('requires a usable image url in image mode, and rejects a non-http one', () => {
    expect(validateModel3dRequest({ mode: 'image', imageUrl: 'https://x.dev/a.png' }).ok).toBe(true);
    expect(validateModel3dRequest({ mode: 'image', imageUrl: 'file:///etc/passwd' }).ok).toBe(false);
    expect(validateModel3dRequest({ mode: 'image' }).ok).toBe(false);
  });

  it('rejects an empty or oversized prompt in text mode', () => {
    expect(validateModel3dRequest({ prompt: 'a' }).ok).toBe(false);
    expect(validateModel3dRequest({ prompt: 'x'.repeat(5000) }).ok).toBe(false);
  });

  it('CLAMPS the polycount rather than letting Meshy 400 on it', () => {
    expect(validateModel3dRequest({ prompt: 'teapot', targetPolycount: 9_000_000 }).request?.targetPolycount).toBe(MAX_POLYCOUNT);
    expect(validateModel3dRequest({ prompt: 'teapot', targetPolycount: 1 }).request?.targetPolycount).toBe(MIN_POLYCOUNT);
    expect(validateModel3dRequest({ prompt: 'teapot', targetPolycount: 'x' }).request?.targetPolycount).toBe(DEFAULT_POLYCOUNT);
  });

  it('maps quality onto the model ids the budget ladder actually selects', () => {
    expect(meshyModelFor(req({ quality: 'draft' }))).toBe(QUALITY_MODEL.draft);
    expect(meshyModelFor(req({ quality: 'standard' }))).toBe(QUALITY_MODEL.standard);
  });
});

describe('status mapping — an unknown state must never abandon a paid job', () => {
  it('recognises the terminal states', () => {
    expect(mapMeshyStatus('SUCCEEDED')).toBe('succeeded');
    expect(mapMeshyStatus('FAILED')).toBe('failed');
    expect(mapMeshyStatus('CANCELED')).toBe('failed');
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('processing')).toBe(false);
  });

  it('treats anything unrecognised as still processing, NOT failed', () => {
    // A vendor adding a new intermediate state must not make the client give up on a running job.
    expect(mapMeshyStatus('SOME_NEW_STATE')).toBe('processing');
    expect(mapMeshyStatus(undefined)).toBe('processing');
    expect(mapMeshyStatus(42)).toBe('processing');
  });

  it('backs off so a multi-minute job does not hammer the API', () => {
    expect(pollDelayMs(0)).toBe(3_000);
    expect(pollDelayMs(50)).toBe(15_000);
    expect(pollDelayMs(-1)).toBe(3_000);
  });
});

describe('GLB selection', () => {
  it('takes the glb and ignores other formats', () => {
    expect(pickGlbUrl({ glb: 'https://cdn.meshy.ai/a.glb', fbx: 'https://cdn.meshy.ai/a.fbx' })).toBe('https://cdn.meshy.ai/a.glb');
  });

  it('returns null for junk rather than handing a bad url to the viewer', () => {
    expect(pickGlbUrl({ fbx: 'https://x/a.fbx' })).toBeNull();
    expect(pickGlbUrl({ glb: 'not-a-url' })).toBeNull();
    expect(pickGlbUrl(null)).toBeNull();
  });
});

describe('client — submit', () => {
  it('reports missing configuration instead of calling out', async () => {
    delete process.env.MESHY_API_KEY;
    expect(hasMeshyProvider()).toBe(false);
    const r = await submitMeshyTask(req(), (() => { throw new Error('must not be called'); }) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, retryable: false });
  });

  it('returns the task id from either response shape', async () => {
    process.env.MESHY_API_KEY = 'k';
    const a = await submitMeshyTask(req(), async () => res({ body: { result: 'task-1' } }));
    expect(a).toEqual({ ok: true, taskId: 'task-1' });
    const b = await submitMeshyTask(req(), async () => res({ body: { id: 'task-2' } }));
    expect(b).toEqual({ ok: true, taskId: 'task-2' });
  });

  it('marks auth and funding failures NON-retryable, and 5xx/429 retryable', async () => {
    process.env.MESHY_API_KEY = 'k';
    const unauth = await submitMeshyTask(req(), async () => res({ ok: false, status: 401, body: 'nope' }));
    expect(unauth).toMatchObject({ ok: false, retryable: false });
    const paid = await submitMeshyTask(req(), async () => res({ ok: false, status: 402, body: 'no credit' }));
    expect(paid).toMatchObject({ ok: false, retryable: false });
    const boom = await submitMeshyTask(req(), async () => res({ ok: false, status: 503, body: 'later' }));
    expect(boom).toMatchObject({ ok: false, retryable: true });
    const rate = await submitMeshyTask(req(), async () => res({ ok: false, status: 429, body: 'slow' }));
    expect(rate).toMatchObject({ ok: false, retryable: true });
  });

  it('never throws when the network does', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await submitMeshyTask(req(), async () => { throw new Error('ECONNRESET'); });
    expect(r.ok).toBe(false);
  });

  it('sends the image endpoint payload in image mode', async () => {
    process.env.MESHY_API_KEY = 'k';
    let seenUrl = '';
    await submitMeshyTask(req({ mode: 'image', imageUrl: 'https://x.dev/a.png' }), async (url) => {
      seenUrl = String(url);
      return res({ body: { result: 't' } });
    });
    expect(seenUrl).toContain('image-to-3d');
  });
});

describe('client — poll', () => {
  it('reports a transient poll error as PROCESSING, not failed', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await pollMeshyTask('t', 'text', async () => res({ ok: false, status: 500 }));
    expect(r.status).toBe('processing');
  });

  it('does not fail a running job when the network blips', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await pollMeshyTask('t', 'text', async () => { throw new Error('ETIMEDOUT'); });
    expect(r.status).toBe('processing');
  });

  it('surfaces the glb and progress on success', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await pollMeshyTask('t', 'text', async () =>
      res({ body: { status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'https://cdn.meshy.ai/a.glb' }, thumbnail_url: 'https://cdn.meshy.ai/t.png' } }));
    expect(r).toMatchObject({ status: 'succeeded', glbUrl: 'https://cdn.meshy.ai/a.glb', progress: 100 });
  });

  it('carries the vendor error message through on failure', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await pollMeshyTask('t', 'text', async () => res({ body: { status: 'FAILED', task_error: { message: 'prompt rejected' } } }));
    expect(r).toMatchObject({ status: 'failed', error: 'prompt rejected' });
  });
});

describe('client — download', () => {
  it('refuses an oversized model rather than OOMing the lambda', async () => {
    process.env.MESHY_API_KEY = 'k';
    const r = await fetchGlbBuffer('https://cdn.meshy.ai/a.glb', async () =>
      res({ headers: { 'content-length': String(500 * 1024 * 1024) } }));
    expect(r).toBeNull();
  });

  it('rejects a non-http url outright', async () => {
    expect(await fetchGlbBuffer('file:///etc/passwd')).toBeNull();
  });

  it('returns the bytes on success', async () => {
    const r = await fetchGlbBuffer('https://cdn.meshy.ai/a.glb', async () => res({ body: Buffer.from('glTF-bytes') }));
    expect(r?.toString()).toBe('glTF-bytes');
  });
});
