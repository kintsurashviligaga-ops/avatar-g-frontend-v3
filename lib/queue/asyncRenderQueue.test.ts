import {
  createJob, markSubmitted, markSubmitError, applyResolution, markTimedOut,
  isTerminal, isTimedOut, pollDue, nextAction, summarize, allTerminal,
  DEFAULT_CONFIG, type RenderJob, type QueueConfig,
} from './asyncRenderQueue';
import { runRenderQueue } from './runRenderQueue';
import { mockAdapter, verifyReplicateWebhook, extractUrl } from './renderProviders';
import { buildCommercialJobs, slotPathFor, routeCompletedAsset, runCommercialRender } from './runCommercialRender';
import { createHmac } from 'node:crypto';

const CFG: QueueConfig = { maxSubmitAttempts: 3, pollIntervalMs: 5_000, jobTimeoutMs: 60_000 };
const job0 = () => createJob('j1', 'music', 'music', { prompt: 'trap-folk' }, 0);

describe('asyncRenderQueue — pure lifecycle', () => {
  test('createJob starts queued, no task id, zeroed counters', () => {
    const j = job0();
    expect(j).toMatchObject({ status: 'queued', providerTaskId: null, assetUrl: null, attempts: 0, polls: 0, createdAt: 0 });
  });

  test('markSubmitted → processing with the provider task id', () => {
    const j = markSubmitted(job0(), 'task_abc', 1000);
    expect(j).toMatchObject({ status: 'processing', providerTaskId: 'task_abc', attempts: 1, submittedAt: 1000 });
  });

  test('markSubmitError retries under the cap, fails at the cap', () => {
    let j = markSubmitError(job0(), 'boom', 10, CFG);           // attempt 1
    expect(j.status).toBe('queued');
    j = markSubmitError(j, 'boom', 20, CFG);                     // attempt 2
    expect(j.status).toBe('queued');
    j = markSubmitError(j, 'boom', 30, CFG);                     // attempt 3 == cap
    expect(j).toMatchObject({ status: 'failed', attempts: 3, error: 'boom' });
  });

  test('applyResolution: completed needs a url; failed carries the error; processing bumps polls', () => {
    const p = markSubmitted(job0(), 't', 0);
    expect(applyResolution(p, { status: 'completed', url: 'https://x/a.mp4' }, 5).status).toBe('completed');
    expect(applyResolution(p, { status: 'completed' }, 5).status).toBe('processing'); // no url → not complete
    expect(applyResolution(p, { status: 'failed', error: 'nope' }, 5)).toMatchObject({ status: 'failed', error: 'nope' });
    expect(applyResolution(p, { status: 'processing' }, 5).polls).toBe(1);
  });

  test('applyResolution ignores a late/duplicate resolution on a terminal job (no double-complete)', () => {
    const done = applyResolution(markSubmitted(job0(), 't', 0), { status: 'completed', url: 'https://x/a.mp4' }, 5);
    expect(applyResolution(done, { status: 'failed', error: 'late' }, 9)).toBe(done); // unchanged
  });

  test('isTimedOut / markTimedOut past the job ceiling', () => {
    const p = markSubmitted(job0(), 't', 0);
    expect(isTimedOut(p, CFG.jobTimeoutMs - 1, CFG)).toBe(false);
    expect(isTimedOut(p, CFG.jobTimeoutMs + 1, CFG)).toBe(true);
    expect(markTimedOut(p, CFG.jobTimeoutMs + 1).status).toBe('failed');
  });

  test('pollDue respects the interval and only applies to processing jobs', () => {
    const p = markSubmitted(job0(), 't', 1_000);
    expect(pollDue(p, 1_000 + CFG.pollIntervalMs - 1, CFG)).toBe(false);
    expect(pollDue(p, 1_000 + CFG.pollIntervalMs, CFG)).toBe(true);
    expect(pollDue(job0(), 999_999, CFG)).toBe(false); // queued, not processing
  });

  test('nextAction covers every branch', () => {
    expect(nextAction(job0(), 0, CFG)).toBe('submit');
    const p = markSubmitted(job0(), 't', 0);
    expect(nextAction(p, 1, CFG)).toBe('wait');                      // just submitted, poll not due
    expect(nextAction(p, CFG.pollIntervalMs, CFG)).toBe('poll');     // interval elapsed
    expect(nextAction(p, CFG.jobTimeoutMs + 1, CFG)).toBe('timeout');// past ceiling
    const done = applyResolution(p, { status: 'completed', url: 'https://x/a.mp4' }, 5);
    expect(nextAction(done, 9, CFG)).toBe('done');
  });

  test('summarize + allTerminal', () => {
    const a = job0();
    const b = markSubmitted(createJob('j2', 'video', 'S10', {}, 0), 't', 0);
    const c = applyResolution(markSubmitted(createJob('j3', 'voiceover', 'vo', {}, 0), 't', 0), { status: 'completed', url: 'https://x/a.wav' }, 1);
    expect(summarize([a, b, c])).toEqual({ total: 3, queued: 1, processing: 1, completed: 1, failed: 0 });
    expect(allTerminal([a, b, c])).toBe(false);
    expect(allTerminal([c])).toBe(true);
  });
});

// ── the whole background worker, end-to-end, deterministic (fake clock, mock provider) ──────────
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe('runRenderQueue — end-to-end async lifecycle (proves the mechanism, no network)', () => {
  test('a multi-minute job completes: submit → many polls → real asset URL', async () => {
    const clock = fakeClock();
    const jobs: RenderJob[] = [createJob('m', 'music', 'music', { prompt: 'trap-folk' }, 0)];
    const out = await runRenderQueue(jobs, {
      adapters: { music: mockAdapter({ kind: 'music', completeAfterPolls: 8 }) }, // ~8 polls ≈ 40s simulated
      now: clock.now, sleep: clock.sleep, maxTicks: 100,
    }, CFG);
    expect(out[0]!.status).toBe('completed');
    expect(out[0]!.assetUrl).toMatch(/^https:\/\/mock\.local\//);
    expect(out[0]!.polls).toBeGreaterThanOrEqual(8);
    expect(clock.now()).toBeGreaterThan(30_000); // the loop genuinely spanned a "multi-minute" simulated window
  });

  test('a batch of mixed kinds all resolve; a failing provider fails cleanly, never hangs', async () => {
    const clock = fakeClock();
    const jobs = [
      createJob('m', 'music', 'music', {}, 0),
      createJob('v', 'video', 'S10', {}, 0),
      createJob('x', 'voiceover', 'vo', {}, 0),
    ];
    const updates: string[] = [];
    const out = await runRenderQueue(jobs, {
      adapters: {
        music: mockAdapter({ kind: 'music', completeAfterPolls: 3 }),
        video: mockAdapter({ kind: 'video', completeAfterPolls: 5 }),
        voiceover: mockAdapter({ kind: 'voiceover', failAfterPolls: 2 }),
      },
      now: clock.now, sleep: clock.sleep, maxTicks: 200,
      onUpdate: (j) => updates.push(`${j.id}:${j.status}`),
    }, CFG);
    expect(summarize(out)).toEqual({ total: 3, queued: 0, processing: 0, completed: 2, failed: 1 });
    expect(out.find((j) => j.id === 'x')!.status).toBe('failed');
    expect(updates.length).toBeGreaterThan(0);
  });

  test('an unconfigured provider kind fails its job instead of hanging forever', async () => {
    const clock = fakeClock();
    const out = await runRenderQueue([createJob('v', 'video', 'S10', {}, 0)], {
      adapters: {}, now: clock.now, sleep: clock.sleep, maxTicks: 20,
    }, CFG);
    expect(out[0]!.status).toBe('failed');
    expect(out[0]!.error).toMatch(/no video provider/);
  });

  test('a provider that never completes trips the job timeout (no infinite loop)', async () => {
    const clock = fakeClock();
    const out = await runRenderQueue([createJob('m', 'music', 'music', {}, 0)], {
      adapters: { music: mockAdapter({ kind: 'music', completeAfterPolls: 100_000 }) },
      now: clock.now, sleep: clock.sleep, maxTicks: 1000,
    }, { ...CFG, jobTimeoutMs: 30_000 });
    expect(out[0]!.status).toBe('failed');
    expect(out[0]!.error).toMatch(/timed out/);
  });
});

describe('renderProviders — url extraction + safe webhook verification', () => {
  test('extractUrl finds the first http(s) url in string/array/object outputs', () => {
    expect(extractUrl('https://x/a.mp4')).toBe('https://x/a.mp4');
    expect(extractUrl(['not', 'https://x/b.wav'])).toBe('https://x/b.wav');
    expect(extractUrl({ audio: { url: 'https://x/c.mp3' } })).toBe('https://x/c.mp3');
    expect(extractUrl({ nope: 1 })).toBeNull();
  });

  test('verifyReplicateWebhook accepts a correctly-signed payload and rejects forgery', () => {
    const secret = 'whsec_' + Buffer.from('supersecretkey0123456789').toString('base64');
    const id = 'msg_1', ts = '1700000000';
    const body = JSON.stringify({ id: 'pred_9', status: 'succeeded', output: 'https://x/final.mp4' });
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const sig = 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');

    const ok = verifyReplicateWebhook(body, { id, timestamp: ts, signature: sig }, secret);
    expect(ok).not.toBeNull();
    expect(ok!.taskId).toBe('pred_9');
    expect(ok!.resolution).toEqual({ status: 'completed', url: 'https://x/final.mp4' });

    // forged signature → null (never ingested)
    expect(verifyReplicateWebhook(body, { id, timestamp: ts, signature: 'v1,forged' }, secret)).toBeNull();
    // missing headers → null
    expect(verifyReplicateWebhook(body, {}, secret)).toBeNull();
  });
});

describe('runCommercialRender — core system integration (build → run → route)', () => {
  test('buildCommercialJobs models exactly the paid assets with the blueprint params', () => {
    const jobs = buildCommercialJobs(0, '9:16');
    expect(jobs.map((j) => j.id)).toEqual(['music', 'vo', 'S01', 'S10', 'S15']);
    expect(jobs.find((j) => j.kind === 'music')!.params.prompt).toMatch(/trap-folk/);
    expect(jobs.find((j) => j.kind === 'voiceover')!.params.text).toMatch(/[Ⴀ-ჿ]/); // Georgian VO script
    expect(jobs.filter((j) => j.kind === 'video').every((j) => j.params.aspect === '9:16')).toBe(true);
  });

  test('slotPathFor routes each kind to the right commercial slot', () => {
    const [music, vo, s01] = buildCommercialJobs(0);
    expect(slotPathFor(music!)).toMatch(/02_audio\/score/);
    expect(slotPathFor(vo!)).toMatch(/02_audio\/vo/);
    expect(slotPathFor(s01!)).toMatch(/01_source\/ai_gen\/S01/);
  });

  test('routeCompletedAsset downloads a completed asset and writes it to its slot', async () => {
    const written: Array<{ path: string; bytes: number }> = [];
    const done = { ...buildCommercialJobs(0)[0]!, status: 'completed' as const, assetUrl: 'https://x/track.wav' };
    const path = await routeCompletedAsset(done, {
      fetch: (async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })) as unknown as typeof fetch,
      writeFile: (async (p: string, b: Buffer) => { written.push({ path: String(p), bytes: b.length }); }) as unknown as typeof import('node:fs/promises').writeFile,
      mkdir: (async () => undefined) as unknown as typeof import('node:fs/promises').mkdir,
    });
    expect(path).toMatch(/generated_track\.wav/);
    expect(written[0]!.bytes).toBe(3);
  });

  test('end-to-end: build → mock-provider run → all 5 assets routed', async () => {
    const clock = fakeClock();
    const routed: string[] = [];
    const out = await runCommercialRender({
      now: clock.now, sleep: clock.sleep,
      adapters: {
        music: mockAdapter({ kind: 'music', completeAfterPolls: 2 }),
        voiceover: mockAdapter({ kind: 'voiceover', completeAfterPolls: 2 }),
        video: mockAdapter({ kind: 'video', completeAfterPolls: 4 }),
      },
      route: {
        fetch: (async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer })) as unknown as typeof fetch,
        writeFile: (async (p: string) => { routed.push(String(p)); }) as unknown as typeof import('node:fs/promises').writeFile,
        mkdir: (async () => undefined) as unknown as typeof import('node:fs/promises').mkdir,
      },
    });
    expect(summarize(out)).toEqual({ total: 5, queued: 0, processing: 0, completed: 5, failed: 0 });
    expect(routed).toHaveLength(5); // every completed asset routed to a slot exactly once
  });
});
