/** @jest-environment node */
/**
 * api.ts — the routes' shapes. Rules under test: the create body is validated for SHAPE with every reason reported
 * (client text capped, not cut; reference images https + public only; a seed in range); the Director runs under ONE
 * deadline (no call starts after it, each call is capped at what is left and aborted at it, a hung provider cannot
 * hold the route past it); and the status view exposes progress and freshly signed URLs — never ledger refs,
 * operation names, provider error text or storage paths.
 */
import {
  DIRECTOR_DEADLINE_MS,
  isLongformJobId,
  LONGFORM_BRIEF_MAX,
  longformStatusView,
  parseLongformCreateBody,
  runDirectorWithDeadline,
} from './api';
import type { DirectorCallOptions, DirectorGenerate } from './director';
import { fakeGenerator, filmReplies } from './testing/directorFakes';

describe('parseLongformCreateBody', () => {
  test('a minimal body gets the documented defaults', () => {
    expect(parseLongformCreateBody({ prompt: '  A road trip  ', seconds: 24 })).toEqual({
      ok: true,
      value: {
        prompt: 'A road trip', seconds: 24, tier: 'fast', resolution: '1080p', format: '16:9', generateAudio: true,
        language: null, mode: null, dialogue: null, negativePrompt: null, referenceImageUrls: [], seed: null,
      },
    });
  });

  test('a full body', () => {
    const r = parseLongformCreateBody({
      prompt: 'p', seconds: '240', tier: 'standard', resolution: '720p', format: '9:16', generateAudio: false, language: 'ka',
      mode: 'music_video', dialogue: 'Hello.', negativePrompt: 'crowds', referenceImageUrls: ['https://abc.supabase.co/storage/v1/object/sign/u/a.jpg?t=1'], seed: 42,
    });
    expect(r).toMatchObject({ ok: true, value: { seconds: 240, tier: 'standard', resolution: '720p', format: '9:16', generateAudio: false, language: 'ka', mode: 'music_video', seed: 42 } });
  });

  test('every shape problem is reported at once; over-long text is refused, not silently cut', () => {
    const r = parseLongformCreateBody({
      prompt: 'x'.repeat(LONGFORM_BRIEF_MAX + 1), seconds: 'soon', tier: 'ultra', resolution: '8k', format: '3:2', generateAudio: 'yes',
      language: 'Georgian!', mode: 'Film Noir', dialogue: 'd'.repeat(1001), negativePrompt: 7, seed: -1,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.map((x) => x.code).sort()).toEqual([
      'invalid_dialogue', 'invalid_duration', 'invalid_format', 'invalid_generateAudio', 'invalid_language', 'invalid_mode',
      'invalid_negativePrompt', 'invalid_prompt', 'invalid_resolution', 'invalid_seed', 'invalid_tier',
    ]);
    expect(parseLongformCreateBody(null)).toEqual({ ok: false, reasons: [{ code: 'invalid_body', message: expect.any(String) }] });
    expect(parseLongformCreateBody({ seconds: 8 })).toMatchObject({ ok: false, reasons: [{ code: 'invalid_prompt' }] });
  });

  test('reference images: ≤ 3, https and public only (never a private-range host fetched on a caller\'s behalf)', () => {
    for (const urls of [
      ['http://cdn.example.com/a.jpg'],
      ['https://127.0.0.1/a.jpg'],
      ['https://169.254.169.254/latest/meta-data'],
      ['https://10.0.0.5/x.jpg'],
      ['javascript:alert(1)'],
      [42],
      ['https://a.example.com/1.jpg', 'https://a.example.com/2.jpg', 'https://a.example.com/3.jpg', 'https://a.example.com/4.jpg'],
      'https://a.example.com/1.jpg',
    ]) {
      expect(parseLongformCreateBody({ prompt: 'p', seconds: 8, referenceImageUrls: urls })).toMatchObject({ ok: false, reasons: [{ code: 'invalid_referenceImageUrls' }] });
    }
    expect(parseLongformCreateBody({ prompt: 'p', seconds: 8, referenceImageUrls: ['https://a.example.com/1.jpg'] })).toMatchObject({ ok: true, value: { referenceImageUrls: ['https://a.example.com/1.jpg'] } });
  });
});

describe('runDirectorWithDeadline', () => {
  test('a storyboard inside the deadline is returned as the Director wrote it; each call carries the time left', async () => {
    const { generate, calls } = fakeGenerator(filmReplies(104));
    let t = 1_000;
    const r = await runDirectorWithDeadline({ brief: 'x', seconds: 104 }, generate, { now: () => (t += 1_000) });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(3); // bible + 2 acts
    for (const c of calls) {
      expect(c.opts.timeoutMs).toBeGreaterThan(200_000);
      expect(c.opts.timeoutMs).toBeLessThanOrEqual(DIRECTOR_DEADLINE_MS);
      expect(c.opts.signal).toBeInstanceOf(AbortSignal);
    }
  });

  test('a Director failure (not the clock) passes through with its reason', async () => {
    const { generate } = fakeGenerator(['not json', 'still not json']);
    expect(await runDirectorWithDeadline({ brief: 'x', seconds: 8 }, generate)).toMatchObject({ ok: false, error: 'bible_unparseable' });
  });

  test('no call STARTS once the deadline has passed (or with < 5 s left), and that is reported as a timeout', async () => {
    const replies = filmReplies(104);
    const seen: DirectorCallOptions[] = [];
    let t = 0;
    const generate: DirectorGenerate = async (_p, o) => {
      seen.push(o);
      t += 150_000; // each call takes 150 s of the 240 s
      return JSON.stringify(replies.shift());
    };
    const r = await runDirectorWithDeadline({ brief: 'x', seconds: 104 }, generate, { now: () => t });
    expect(r).toMatchObject({ ok: false, error: 'director_timeout', calls: 2 });
    expect(seen).toHaveLength(2); // the bible (0 → 150 s) and act 1 (150 → 300 s); act 2 never started
    expect(seen[1]!.timeoutMs).toBe(90_000); // capped at what was left
  });

  test('a provider that never answers cannot hold the route past the deadline; its call is aborted', async () => {
    let signal: AbortSignal | undefined;
    const hung: DirectorGenerate = (_p, o) => {
      signal = o.signal;
      return new Promise(() => undefined);
    };
    jest.useFakeTimers();
    try {
      const pending = runDirectorWithDeadline({ brief: 'x', seconds: 8 }, hung);
      await jest.advanceTimersByTimeAsync(DIRECTOR_DEADLINE_MS + 1);
      expect(await pending).toMatchObject({ ok: false, error: 'director_timeout' });
      expect(signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('longformStatusView', () => {
  const job = {
    id: '11111111-2222-4333-8444-555555555555', user_id: 'u1', status: 'rendering', cancel_requested: false,
    hold_until: '2027-01-15T08:30:00.000Z', hold_reason: 'platform_budget', stitch_attempts: 0, deadline_at: '2027-01-16T08:00:00.000Z',
    error_code: null, output_url: 'https://old/film.mp4', output_path: 'longform/x/film.mp4', output_bytes: 123, scene_count: 3, act_count: 1,
    tier: 'fast', format: '16:9', resolution: '1080p', generate_audio: true, bible: { title: 'The Long Way Home', arc: [{ summary: 's' }] },
    seed: 1, credits_per_scene: 39, refunds_pending: false, created_at: '2027-01-15T08:00:00.000Z', completed_at: null,
  };
  const scenes = [
    { ordinal: 2, act: 0, status: 'queued', output_path: null, charge_ref: 'longform:x:act:0', operation_name: 'models/op/2', error_detail: 'provider said: secret' },
    { ordinal: 0, act: 0, status: 'delivered', output_path: 'longform/x/s00.mp4', output_url: 'https://old/0.mp4' },
    { ordinal: 1, act: 0, status: 'failed', error_detail: 'filtered: the provider\'s own words' },
  ];

  test('progress, hold, credits, freshly signed clips while rendering — and none of the internals', () => {
    const v = longformStatusView(job, scenes, { clips: new Map([[0, 'https://signed/0.mp4']]) });
    expect(v).toMatchObject({
      id: job.id, status: 'rendering', terminal: false, seconds: 24, sceneCount: 3, tier: 'fast', title: 'The Long Way Home',
      progress: { total: 3, delivered: 1, failed: 1, inFlight: 0, queued: 1 },
      hold: { reason: 'platform_budget', until: '2027-01-15T08:30:00.000Z' }, film: null, credits: { perScene: 39, total: 117 },
      createdAt: '2027-01-15T08:00:00.000Z', completedAt: null,
    });
    expect(v.scenes).toEqual([
      { ordinal: 0, act: 0, status: 'delivered', url: 'https://signed/0.mp4' },
      { ordinal: 1, act: 0, status: 'failed', url: null },
      { ordinal: 2, act: 0, status: 'queued', url: null },
    ]);
    const wire = JSON.stringify(v);
    for (const secret of ['longform:x:act:0', 'models/op/2', 'provider said', 'provider\'s own words', 'longform/x/', 'https://old/', 'user_id', 'u1']) {
      expect(wire).not.toContain(secret);
    }
  });

  test('done: only the signed film; the clips are gone', () => {
    const v = longformStatusView({ ...job, status: 'done', completed_at: '2027-01-15T09:00:00.000Z' }, scenes, { film: 'https://signed/film.mp4', clips: new Map([[0, 'https://signed/0.mp4']]) });
    expect(v).toMatchObject({ status: 'done', terminal: true, film: { url: 'https://signed/film.mp4', bytes: 123 }, completedAt: '2027-01-15T09:00:00.000Z' });
    expect(v.scenes.every((s) => s.url === null)).toBe(true);
    // A film that could not be signed is absent, never the stale stored URL.
    expect(longformStatusView({ ...job, status: 'done' }, scenes, {}).film).toBeNull();
  });

  test('isLongformJobId', () => {
    expect(isLongformJobId('11111111-2222-4333-8444-555555555555')).toBe(true);
    for (const v of ['', 'j1', '../../etc', '11111111-2222-4333-8444-55555555555g', 42, null]) expect(isLongformJobId(v)).toBe(false);
  });
});
