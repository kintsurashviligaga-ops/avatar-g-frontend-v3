/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures build raw glTF JSON */
import {
  studio3dAudience, studio3dAllowed, validateStudio3d, isOwnStorageUrl, clampStlMm,
  quote3d, journeyQuote, grossMargin, fullCostUsd, creditsForCost,
  referencePrompt, retexturePrompt, parseSafetyAnswer, photoCheckPrompt, parsePhotoAnswer,
  newJob, advance, admit, etaSeconds, chargeRef, refundRef, referenceRef,
  parseStudio3dIntent, stepLabel, t,
  engineConfig, buildSpec, encodeSpec, decodeSpec, cloudRunEngine, executionState, parseManifest,
  type Studio3dJob, type Studio3dEvent,
} from '..';

const IMG = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/uploads/u1/photo.png?token=x';
const GLB = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/studio3d/u1/model.glb?token=y';

describe('flag STUDIO_3D_V2', () => {
  it('is off unless admin or everyone is written out', () => {
    expect(studio3dAudience({})).toBe('off');
    expect(studio3dAudience({ STUDIO_3D_V2: '1' })).toBe('off');
    expect(studio3dAudience({ STUDIO_3D_V2: 'true' })).toBe('off');
    expect(studio3dAudience({ STUDIO_3D_V2: ' Admin ' })).toBe('admin');
    expect(studio3dAllowed(false, { STUDIO_3D_V2: 'admin' })).toBe(false);
    expect(studio3dAllowed(true, { STUDIO_3D_V2: 'admin' })).toBe(true);
    expect(studio3dAllowed(false, { STUDIO_3D_V2: 'everyone' })).toBe(true);
  });
});

describe('request validation', () => {
  it('accepts only our own Supabase storage', () => {
    expect(isOwnStorageUrl(IMG)).toBe(true);
    expect(isOwnStorageUrl('http://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/a.png')).toBe(false);
    expect(isOwnStorageUrl('https://evil.example/storage/v1/object/a.png')).toBe(false);
    expect(isOwnStorageUrl('https://zwksnayknzggdcenqqxy.supabase.co.evil.io/storage/v1/object/a.png')).toBe(false);
    expect(isOwnStorageUrl('https://zwksnayknzggdcenqqxy.supabase.co/rest/v1/x')).toBe(false);
  });
  it('validates each mode', () => {
    expect(validateStudio3d({ mode: 'text', prompt: '  a   red  chair ' })).toEqual({
      ok: true, request: { mode: 'text', prompt: 'a red chair', detail: 'standard', faces: 'medium' },
    });
    expect(validateStudio3d({ mode: 'text', prompt: 'ab' }).ok).toBe(false);
    expect(validateStudio3d({ mode: 'image' }).ok).toBe(false);
    expect(validateStudio3d({ mode: 'image', imageUrl: IMG, detail: 'high' })).toMatchObject({ ok: true, request: { detail: 'high', imageUrl: IMG } });
    expect(validateStudio3d({ mode: 'image', imageUrl: GLB }).ok).toBe(false);
    expect(validateStudio3d({ mode: 'retexture', prompt: 'gold', meshUrl: IMG }).ok).toBe(false);
    expect(validateStudio3d({ mode: 'retexture', prompt: 'gold metal', meshUrl: GLB, detail: 'high' })).toMatchObject({
      ok: true, request: { detail: 'standard', meshUrl: GLB },
    });
    expect(validateStudio3d({ mode: 'text', prompt: 'x'.repeat(601) }).ok).toBe(false);
    expect(validateStudio3d(null).ok).toBe(false);
  });
  it('clamps the STL height', () => {
    expect(clampStlMm(undefined)).toBe(100);
    expect(clampStlMm('abc')).toBe(100);
    expect(clampStlMm(2)).toBe(10);
    expect(clampStlMm(9999)).toBe(500);
    expect(clampStlMm('150.4')).toBe(150);
  });
});

describe('prices (65 % margin)', () => {
  it('matches the plan doc', () => {
    expect(quote3d('model').credits).toBe(14);
    expect(quote3d('model_high').credits).toBe(20);
    expect(quote3d('retexture').credits).toBe(13);
    expect(quote3d('reference').credits).toBe(8);
    expect(journeyQuote('text').map((q) => q.credits)).toEqual([8, 14]);
    expect(journeyQuote('image', true).map((q) => q.credits)).toEqual([20]);
    expect(journeyQuote('retexture').map((q) => q.credits)).toEqual([8, 13]);
  });
  it('every action keeps at least 65 % gross margin at the 0.08 ₾ floor credit', () => {
    for (const a of ['reference', 'model', 'model_high', 'retexture'] as const) {
      const q = quote3d(a);
      expect(grossMargin(q.credits, q.costUsd)).toBeGreaterThanOrEqual(0.65);
    }
  });
  it('a margin gate may only raise the price', () => {
    const gate = (c: number) => ({ credits: c + 3, raised: true });
    expect(quote3d('model', gate).credits).toBe(17);
  });
  it('ceil is not fooled by float noise', () => {
    expect(creditsForCost(1 / 104.38)).toBe(1);
    expect(fullCostUsd('model')).toBeCloseTo(0.1321, 3);
  });
});

describe('prompts', () => {
  it('reference asks for one whole object on a plain background', () => {
    const p = referencePrompt('  wooden   toy  train ');
    expect(p).toContain('A single wooden toy train');
    expect(p).toMatch(/plain light grey/);
    expect(p).toMatch(/no text/);
  });
  it('retexture keeps the silhouette', () => {
    expect(retexturePrompt('marble')).toMatch(/silhouette.*EXACTLY/);
  });
  it('safety check fails closed', () => {
    expect(parseSafetyAnswer('ALLOW')).toBe('allow');
    expect(parseSafetyAnswer(' allow.')).toBe('allow');
    expect(parseSafetyAnswer('BLOCK')).toBe('block');
    expect(parseSafetyAnswer('')).toBe('block');
    expect(parseSafetyAnswer('I think ALLOW')).toBe('block');
  });
  it('D4 photo check: objects pass, selfies need the tick, other people and minors never pass, anything odd is refused', () => {
    expect(photoCheckPrompt()).toMatch(/MINOR[\s\S]*SELF[\s\S]*PERSON[\s\S]*OBJECT/);
    expect(parsePhotoAnswer('OBJECT', false)).toEqual({ verdict: 'allow' });
    expect(parsePhotoAnswer(' object.', false)).toEqual({ verdict: 'allow' });
    expect(parsePhotoAnswer('SELF', true)).toEqual({ verdict: 'allow' });
    expect(parsePhotoAnswer('SELF', false)).toEqual({ verdict: 'block', reason: 'confirm_self' });
    expect(parsePhotoAnswer('PERSON', true)).toEqual({ verdict: 'block', reason: 'blocked_person' });
    expect(parsePhotoAnswer('MINOR', true)).toEqual({ verdict: 'block', reason: 'blocked_minor' });
    expect(parsePhotoAnswer('UNSAFE', true)).toEqual({ verdict: 'block', reason: 'blocked' });
    expect(parsePhotoAnswer('', true)).toEqual({ verdict: 'block', reason: 'blocked' });
    expect(parsePhotoAnswer('I see an OBJECT', true)).toEqual({ verdict: 'block', reason: 'blocked' });
  });
  it('the selfie tick is kept for image mode only and only when exactly true', () => {
    expect(validateStudio3d({ mode: 'image', imageUrl: IMG, selfie: true })).toMatchObject({ ok: true, request: { selfie: true } });
    expect((validateStudio3d({ mode: 'image', imageUrl: IMG, selfie: 'yes' }) as any).request.selfie).toBeUndefined();
    expect((validateStudio3d({ mode: 'text', prompt: 'a lamp', selfie: true }) as any).request.selfie).toBeUndefined();
  });
  it('a refusal reason from the photo check becomes the job error; junk reasons fall back to "blocked"', () => {
    const j = newJob('00000000-0000-4000-8000-000000000001', 'image', 14, 8);
    expect(advance(j, { type: 'safety', verdict: 'block', reason: 'blocked_minor' }).job).toMatchObject({ step: 'failed', error: 'blocked_minor' });
    expect(advance(j, { type: 'safety', verdict: 'block', reason: '<script>' }).job).toMatchObject({ step: 'failed', error: 'blocked' });
  });
});

describe('pipeline orchestration', () => {
  const run = (job: Studio3dJob, events: Studio3dEvent[]) => {
    const effects: unknown[] = [];
    for (const e of events) {
      const r = advance(job, e);
      job = r.job;
      effects.push(...r.effects);
    }
    return { job, effects };
  };

  it('text → reference → approve → GPU → delivered: reference charged on delivery, model held then charged once', () => {
    const { job, effects } = run(newJob('j1', 'text', 14, 8), [
      { type: 'safety', verdict: 'allow' },
      { type: 'reference_ready' },
      { type: 'reference_ready' }, // duplicate: ignored
      { type: 'approve' },
      { type: 'admitted' },
      { type: 'started', execution: 'projects/p/locations/europe-west4/jobs/studio3d/executions/e1' },
      { type: 'progress', step: 'texture' },
      { type: 'progress', step: 'shape' }, // backwards: ignored
      { type: 'progress', step: 'export' },
      { type: 'delivered', outputs: { glb: 'u1/j1/model.glb' } },
      { type: 'delivered', outputs: { glb: 'u1/j1/model.glb' } }, // duplicate: ignored
    ]);
    expect(job.step).toBe('done');
    const money = effects.filter((e: any) => ['charge', 'hold', 'release'].includes(e.kind));
    expect(money).toEqual([
      { kind: 'charge', ref: referenceRef('j1'), credits: 8 },
      { kind: 'hold', ref: chargeRef('j1'), credits: 14 },
      { kind: 'charge', ref: chargeRef('j1'), credits: 14 },
    ]);
    expect(effects).toContainEqual({ kind: 'make_reference' });
    expect(effects).toContainEqual({ kind: 'start_worker' });
  });

  it('image mode skips the reference and charges nothing for it', () => {
    const { job, effects } = run(newJob('j2', 'image', 20, 8), [{ type: 'safety', verdict: 'allow' }]);
    expect(job.step).toBe('queued');
    expect(job.referenceCredits).toBe(0);
    expect(effects).toEqual([{ kind: 'hold', ref: chargeRef('j2'), credits: 20 }, { kind: 'notify', step: 'queued' }]);
  });

  it('a worker failure refunds the hold exactly once', () => {
    const { job, effects } = run(newJob('j3', 'image', 14, 0), [
      { type: 'safety', verdict: 'allow' },
      { type: 'admitted' },
      { type: 'started', execution: 'x' },
      { type: 'fail', error: 'CUDA out of memory' },
      { type: 'fail', error: 'again' },
    ]);
    expect(job).toMatchObject({ step: 'failed', refunded: true, charged: false, error: 'CUDA out of memory' });
    expect(effects.filter((e: any) => e.kind === 'release')).toEqual([{ kind: 'release', ref: refundRef('j3'), credits: 14 }]);
  });

  it('blocked by the safety check costs nothing', () => {
    const { job, effects } = run(newJob('j4', 'text', 14, 8), [{ type: 'safety', verdict: 'block' }]);
    expect(job.step).toBe('failed');
    expect(effects.some((e: any) => ['charge', 'hold'].includes(e.kind))).toBe(false);
  });

  it('cancel works before the GPU starts, not after', () => {
    const queued = run(newJob('j5', 'image', 14, 0), [{ type: 'safety', verdict: 'allow' }]).job;
    expect(advance(queued, { type: 'cancel' }).job).toMatchObject({ step: 'failed', refunded: true });
    const running = run(queued, [{ type: 'admitted' }, { type: 'started', execution: 'x' }]).job;
    expect(advance(running, { type: 'cancel' }).applied).toBe(false);
  });

  it('a delivery without a GLB is a failure with refund', () => {
    const running = run(newJob('j6', 'image', 14, 0), [{ type: 'safety', verdict: 'allow' }, { type: 'admitted' }, { type: 'started', execution: 'x' }]).job;
    const r = advance(running, { type: 'delivered', outputs: { glb: '' } });
    expect(r.job.step).toBe('failed');
    expect(r.effects[0]).toMatchObject({ kind: 'release' });
  });

  it('admission: 3 GPUs, one job per user, daily cap', () => {
    expect(admit({ running: 0, queued: 0, todayTotal: 0, userActive: 0 })).toEqual({ ok: true, position: 0 });
    expect(admit({ running: 3, queued: 0, todayTotal: 5, userActive: 0 })).toEqual({ ok: true, position: 1 });
    expect(admit({ running: 1, queued: 2, todayTotal: 5, userActive: 0 })).toEqual({ ok: true, position: 3 });
    expect(admit({ running: 0, queued: 0, todayTotal: 5, userActive: 1 })).toEqual({ ok: false, reason: 'user_busy' });
    expect(admit({ running: 0, queued: 0, todayTotal: 200, userActive: 0 })).toEqual({ ok: false, reason: 'daily_cap' });
    expect(etaSeconds(0)).toBe(130);
    expect(etaSeconds(4)).toBe(130 + 2 * 130);
  });
});

describe('intent (ka / en / ru)', () => {
  it('text to 3D', () => {
    expect(parseStudio3dIntent('make a 3D model of a red vintage car')).toMatchObject({ kind: 'create', mode: 'text', subject: 'red vintage car', high: false });
    expect(parseStudio3dIntent('გამიკეთე 3D მოდელი წითელი სავარძელი')).toMatchObject({ kind: 'create', mode: 'text', subject: 'წითელი სავარძელი' });
    expect(parseStudio3dIntent('сделай 3д модель деревянного стула')).toMatchObject({ kind: 'create', mode: 'text' });
    expect(parseStudio3dIntent('create a high detail 3d dragon statue')).toMatchObject({ high: true, subject: 'dragon statue' });
  });
  it('photo to 3D', () => {
    expect(parseStudio3dIntent('ეს 3D-ად გადააქციე', { hasImage: true })).toMatchObject({ kind: 'create', mode: 'image' });
  });
  it('not an order', () => {
    expect(parseStudio3dIntent('what is 3D printing?')).toEqual({ kind: 'none' });
    expect(parseStudio3dIntent('make a picture of a cat')).toEqual({ kind: 'none' });
    expect(parseStudio3dIntent('')).toEqual({ kind: 'none' });
  });
  it('follow-ups on a model in the chat', () => {
    const m = { hasModel: true };
    expect(parseStudio3dIntent('give me the STL', m)).toEqual({ kind: 'export', format: 'stl' });
    expect(parseStudio3dIntent('დასაბეჭდი ფაილი მომეცი', m)).toEqual({ kind: 'export', format: 'stl' });
    expect(parseStudio3dIntent('download as OBJ', m)).toEqual({ kind: 'export', format: 'obj' });
    expect(parseStudio3dIntent('use it in a video', m)).toEqual({ kind: 'video' });
    expect(parseStudio3dIntent('ვიდეოში გამოიყენე', m)).toEqual({ kind: 'video' });
    expect(parseStudio3dIntent('retexture it as gold metal', m)).toMatchObject({ kind: 'retexture', style: 'gold metal' });
    expect(parseStudio3dIntent('перекрась в красный', m)).toMatchObject({ kind: 'retexture' });
  });
});

describe('labels', () => {
  it('Georgian first, English and Russian available', () => {
    expect(stepLabel('shape', undefined)).toBe('ფორმის აგება');
    expect(stepLabel('shape', 'en')).toBe('Building the shape');
    expect(t('wireframe', 'ru')).toBe('Сетка');
  });
});

describe('engine (Cloud Run job client, mocked)', () => {
  const cfg = engineConfig({ STUDIO_3D_GCP_PROJECT: 'myavatar-prod', STUDIO_3D_JOB: 'studio3d' })!;
  const uploads = { glb: 'u-glb', turntable: 'u-mp4', preview: 'u-png', manifest: 'u-json' };

  it('config needs project + job, defaults to europe-west4 and a 600 s timeout', () => {
    expect(engineConfig({})).toBeNull();
    expect(cfg).toEqual({ project: 'myavatar-prod', region: 'europe-west4', job: 'studio3d', timeoutSec: 600 });
    expect(engineConfig({ STUDIO_3D_GCP_PROJECT: 'p', STUDIO_3D_JOB: 'j', STUDIO_3D_TIMEOUT_SEC: '99999' })!.timeoutSec).toBe(600);
  });

  it('spec round-trips and picks the grid', () => {
    const s = buildSpec({ jobId: 'j1', mode: 'image', imageUrl: 'r', high: true, faces: 'low', uploads });
    expect(s).toMatchObject({ grid: 1536, faces: 10_000 });
    expect(decodeSpec(encodeSpec(s))).toEqual(s);
    expect(buildSpec({ jobId: 'j', mode: 'retexture', imageUrl: 'r', meshUrl: 'm', high: true, faces: 'medium', uploads }).grid).toBe(1024);
  });

  it('start posts one env override and returns the execution name', async () => {
    const calls: any[] = [];
    const engine = cloudRunEngine(cfg, {
      token: async () => 'tok',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ metadata: { name: 'projects/myavatar-prod/locations/europe-west4/jobs/studio3d/executions/studio3d-abc' } }) };
      },
    });
    const spec = buildSpec({ jobId: 'j1', mode: 'text', imageUrl: 'r', high: false, faces: 'medium', uploads });
    await expect(engine.start(spec)).resolves.toEqual({ execution: 'projects/myavatar-prod/locations/europe-west4/jobs/studio3d/executions/studio3d-abc' });
    expect(calls[0].url).toBe('https://run.googleapis.com/v2/projects/myavatar-prod/locations/europe-west4/jobs/studio3d:run');
    expect(calls[0].init.headers.authorization).toBe('Bearer tok');
    const body = JSON.parse(calls[0].init.body);
    expect(body.overrides.timeout).toBe('600s');
    expect(body.overrides.containerOverrides[0].env).toHaveLength(1);
    expect(decodeSpec(body.overrides.containerOverrides[0].env[0].value)).toEqual(spec);
  });

  it('start refuses an unexpected execution and HTTP errors', async () => {
    const mk = (ok: boolean, name?: string) =>
      cloudRunEngine(cfg, { token: async () => 't', fetch: async () => ({ ok, status: ok ? 200 : 403, json: async () => ({ metadata: { name } }) }) });
    const spec = buildSpec({ jobId: 'j', mode: 'text', imageUrl: 'r', high: false, faces: 'medium', uploads });
    await expect(mk(false).start(spec)).rejects.toThrow('403');
    await expect(mk(true, 'projects/other/locations/us/jobs/x/executions/y').start(spec)).rejects.toThrow('no execution');
  });

  it('status maps Cloud Run counts', async () => {
    expect(executionState({ runningCount: 1 })).toEqual({ state: 'running' });
    expect(executionState({ succeededCount: 1 })).toEqual({ state: 'succeeded' });
    expect(executionState({ failedCount: 1, conditions: [{ state: 'CONDITION_FAILED', message: 'OOM' }] })).toEqual({ state: 'failed', detail: 'OOM' });
    expect(executionState({})).toEqual({ state: 'pending' });
    const engine = cloudRunEngine(cfg, { token: async () => 't', fetch: async () => ({ ok: true, status: 200, json: async () => ({ succeededCount: 1 }) }) });
    await expect(engine.status('projects/p/locations/r/jobs/j/executions/e')).resolves.toEqual({ state: 'succeeded' });
    await expect(engine.status('../../evil')).rejects.toThrow('bad execution');
  });

  it('manifest must belong to this job', () => {
    expect(parseManifest({ v: 1, jobId: 'j1', step: 'done', faces: 49999.6, gpuSeconds: 101 }, 'j1')).toEqual({ v: 1, jobId: 'j1', step: 'done', faces: 50000, gpuSeconds: 101 });
    expect(parseManifest({ v: 1, jobId: 'other', step: 'done' }, 'j1')).toBeNull();
    expect(parseManifest({ v: 1, jobId: 'j1', step: 'hacked' }, 'j1')).toBeNull();
  });
});
