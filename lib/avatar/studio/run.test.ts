import { buildStudioPlan, OMNI_PRESENTERS } from './index';
import { LiveTakeRecorder, liveTakeSetup, liveTakeTurn, LIVE_FIRST_WORD_MS } from './liveTake';
import { debitRef, ownsStudioPath, pollScene, publicJob, sceneToMake, startScene, type SceneDeps, type SceneJob } from './sceneRun';
import { parseSceneStart, parseStudioRequest } from './request';
import { studioBook } from './book';
import { presenterById, voiceById } from './catalog';
import type { TakeResult } from './liveTake';
import { clampVoiceAdjust, voiceAdjustFilter } from './voiceAdjust';

const KA = 'გამარჯობა, მე ვარ თქვენი ვირტუალური წამყვანი. დღეს გაჩვენებთ, როგორ ქმნის მაიავატარი პრეზენტაციას რამდენიმე წუთში. ეს მარტივია და სწრაფი.';

const FULL = `${KA} ${KA} ${KA}`;
/** An fMP4 init piece (ftyp box) and a media piece (moof box), base64. */
const box = (type: string) => { const b = Buffer.alloc(16); b.writeUInt32BE(16, 0); b.write(type, 4, 'latin1'); return b.toString('base64'); };
const INIT = box('ftyp');
const MEDIA = box('moof');

function mockDeps(over: Partial<SceneDeps> = {}): SceneDeps & { calls: Record<string, unknown[][]>; jobs: Map<string, SceneJob> } {
  const calls: Record<string, unknown[][]> = {};
  const jobs = new Map<string, SceneJob>();
  const rec = <A extends unknown[], R>(name: string, fn: (...a: A) => R) => (...a: A): R => { (calls[name] ??= []).push(a); return fn(...a); };
  let n = 0;
  const take: TakeResult = { bytes: new Uint8Array([1, 2, 3]), mime: 'video/mp4', trimStart: 0.4, trimEnd: 11, chunks: [{ text: KA, atSec: 0.1 }], heard: KA };
  const deps = {
    hold: rec('hold', async () => true),
    charge: rec('charge', async () => true),
    refund: rec('refund', async () => undefined),
    liveTake: rec('liveTake', async (_s: Record<string, unknown>, turn: Record<string, unknown>) => {
      const said = JSON.stringify(turn).match(/SCRIPT:\\n(.*)\\nEND/)?.[1] ?? '';
      return { ...take, chunks: [{ text: said, atSec: 0.1 }], heard: said };
    }),
    finishLive: rec('finishLive', async () => ({ bytes: Buffer.from('mp4'), durationSec: 10.6 })),
    omniSubmit: rec('omniSubmit', async () => ({ ok: true as const, id: `int-${++n}`, model: 'gemini-omni-1.2-flash' })),
    omniPoll: rec('omniPoll', async () => ({ state: 'ready' as const, url: 'https://storage.example/clip.mp4' })),
    fetchBytes: rec('fetchBytes', async () => Buffer.from('clip')),
    measure: rec('measure', async () => 10.2),
    dub: rec('dub', async () => Buffer.from('dubbed')),
    words: rec('words', async () => ({ words: FULL.split(' ').map((w, i) => ({ word: w, start: i * 0.5, end: i * 0.5 + 0.4 })), heard: FULL })),
    save: rec('save', async (_u: string, path: string) => `https://storage.example/${path}`),
    saveJob: rec('saveJob', async (_u: string, j: SceneJob) => { jobs.set(j.id, JSON.parse(JSON.stringify(j))); }),
    loadJob: async (_u: string, id: string) => jobs.get(id) ?? null,
    newId: () => 'job-1',
    now: () => new Date('2026-11-15T12:00:00Z'),
    ...over,
  };
  return Object.assign(deps, { calls, jobs });
}

const planFor = (presenterId: string, extra: Record<string, unknown> = {}) => {
  const r = buildStudioPlan({ script: `${KA} ${KA} ${KA}`, presenterId, ...extra }, { book: 'v8' });
  if (!r.ok) throw new Error(r.detail);
  return r.plan;
};
const startInput = (plan: ReturnType<typeof planFor>) => {
  const s = sceneToMake(plan, 0, 'v8');
  if (!s.ok) throw new Error(s.reason);
  return { projectId: 'proj-123456', sceneIndex: 0, take: 0, plan, scene: s, credits: s.credits, backgroundUrl: null };
};

describe('request parsing', () => {
  it('accepts a full request and refuses junk', () => {
    expect(parseStudioRequest({ script: KA, presenterId: 'live-ben', tone: 'calm', pace: 'faster', format: '16:9', background: { kind: 'green' } })).toMatchObject({ ok: true });
    expect(parseStudioRequest({ script: KA, presenterId: 'live-ben', tone: 'angry' })).toMatchObject({ ok: false });
    expect(parseStudioRequest({ script: KA, presenterId: 'live-ben', background: { kind: 'url', url: 'http://x' } })).toMatchObject({ ok: false });
    expect(parseSceneStart({ projectId: 'proj-123456', request: { script: KA, presenterId: 'live-ben' }, sceneIndex: 0, expectedCredits: 12 })).toMatchObject({ ok: true, value: { take: 0 } });
    expect(parseSceneStart({ projectId: '../x', request: { script: KA, presenterId: 'live-ben' }, sceneIndex: 0, expectedCredits: 12 })).toMatchObject({ ok: false });
  });

  it('reads the price book switch', () => {
    expect(studioBook('on')).toBe('v8');
    expect(studioBook(undefined)).toBe('today');
  });

  it('guards storage paths', () => {
    expect(ownsStudioPath('avatar-studio/u1/proj/scene-0-take-0.mp4', 'u1')).toBe(true);
    expect(ownsStudioPath('avatar-studio/u2/proj/scene-0.mp4', 'u1')).toBe(false);
    expect(ownsStudioPath('avatar-studio/u1/../u2/x.mp4', 'u1')).toBe(false);
  });
});

describe('Live take recorder (mocked relay frames)', () => {
  const setup = liveTakeSetup(presenterById('live-kira')!, voiceById('Kore')!, { tone: 'calm', pace: 'natural', lang: 'ka' });

  it('opens with the avatar, the named voice and transcription on', () => {
    expect(setup).toMatchObject({
      model: 'models/gemini-3.8-live',
      avatarConfig: { avatarName: 'Kira' },
      generationConfig: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
      outputAudioTranscription: {},
    });
    expect(JSON.stringify(liveTakeTurn('გამარჯობა'))).toContain('SCRIPT:\\nგამარჯობა');
  });

  it('records from the init segment, times the transcript, ends on turnComplete', () => {
    const r = new LiveTakeRecorder();
    r.onEvent({ kind: 'video', data: MEDIA, mimeType: 'video/mp4' }, 0); // before init: dropped
    r.onEvent({ kind: 'setupComplete' }, 100);
    expect(r.readyToSend).toBe(true);
    r.sent(150);
    r.onEvent({ kind: 'video', data: INIT, mimeType: 'video/mp4; codecs="avc1"' }, 1000);
    r.onEvent({ kind: 'video', data: MEDIA, mimeType: 'video/mp4' }, 1200);
    r.onEvent({ kind: 'outputTranscript', text: 'გამარჯობა, ' }, 2000);
    r.onEvent({ kind: 'video', data: MEDIA, mimeType: 'video/mp4' }, 2500);
    r.onEvent({ kind: 'outputTranscript', text: 'მე ვარ.' }, 3000);
    r.onEvent({ kind: 'turnComplete' }, 4000);
    const out = r.result()!;
    expect(r.state).toBe('done');
    expect(out.bytes.length).toBe(48);
    expect(out.trimStart).toBe(0.7);
    expect(out.trimEnd).toBe(3.6);
    expect(out.chunks).toEqual([{ text: 'გამარჯობა, ', atSec: 0.3 }, { text: 'მე ვარ.', atSec: 1.3 }]);
    expect(out.heard).toBe('გამარჯობა, მე ვარ.');
  });

  it('fails a take that never speaks or is interrupted', () => {
    const r = new LiveTakeRecorder();
    r.onEvent({ kind: 'setupComplete' }, 0);
    r.sent(0);
    r.tick(LIVE_FIRST_WORD_MS + 1, 0);
    expect(r.state).toBe('failed');
    expect(r.result()).toBeNull();
    const s = new LiveTakeRecorder();
    s.onEvent({ kind: 'interrupted' }, 0);
    expect(s.failure).toBe('interrupted');
  });
});

describe('scene run — Live', () => {
  it('charges once by ref, records, saves, and times the karaoke from the transcript', async () => {
    const deps = mockDeps();
    const plan = planFor('live-ben');
    const job = await startScene(deps, 'u1', startInput(plan));
    expect(job.state).toBe('ready');
    expect(deps.calls.charge).toEqual([['u1', job.credits, debitRef('proj-123456', 0, 0)]]);
    expect(deps.calls.liveTake).toHaveLength(1);
    expect(job.url).toBe('https://storage.example/avatar-studio/u1/proj-123456/scene-0-take-0.mp4');
    expect(job.timingSource).toBe('live');
    expect(job.timings!.length).toBeGreaterThan(10);
    expect(deps.calls.refund).toBeUndefined();
    expect(publicJob(job)).not.toHaveProperty('ref');
  });

  it('retakes once free when the presenter did not read the script, then delivers with a warning', async () => {
    const bad: TakeResult = { bytes: new Uint8Array([1]), mime: 'video/mp4', trimStart: 0, trimEnd: 3, chunks: [{ text: 'გამარჯობა, მადლობა', atSec: 0 }], heard: 'გამარჯობა, მადლობა' };
    const deps = mockDeps({ liveTake: async () => bad });
    const job = await startScene(deps, 'u1', startInput(planFor('live-ben')));
    expect(job.retaken).toBe(true);
    expect(job.warnings).toContain('not_verbatim');
    expect(deps.calls.charge).toHaveLength(1);
  });

  it('refunds when no take came back, and never charges without the balance', async () => {
    const deps = mockDeps({ liveTake: async () => null });
    await expect(startScene(deps, 'u1', startInput(planFor('live-ben')))).rejects.toMatchObject({ code: 'provider_unavailable' });
    expect(deps.calls.refund).toEqual([['u1', expect.any(Number), `${debitRef('proj-123456', 0, 0)}:refund`]]);
    const poor = mockDeps({ hold: async () => false });
    await expect(startScene(poor, 'u1', startInput(planFor('live-ben')))).rejects.toMatchObject({ code: 'insufficient_credits' });
    expect(poor.calls.charge).toBeUndefined();
  });
});

describe('scene run — Omni (mocked interactions)', () => {
  const omni = OMNI_PRESENTERS[0]!.id;

  it('chains turns as continuations, then aligns Chirp words and saves', async () => {
    const deps = mockDeps();
    const plan = planFor(omni);
    let job = await startScene(deps, 'u1', startInput(plan));
    expect(job.state).toBe('processing');
    const turns = job.turns.length;
    expect(turns).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < turns; i++) job = await pollScene(deps, 'u1', job);
    expect(job.state).toBe('ready');
    const submits = deps.calls.omniSubmit!.map((c) => c[0] as { previous?: { id: string }; prompt: string; face: string });
    expect(submits).toHaveLength(turns);
    expect(submits[0]!.previous).toBeUndefined();
    expect(submits[1]!.previous).toEqual({ id: 'int-1', model: 'gemini-omni-1.2-flash' });
    expect(submits.every((s) => s.face === OMNI_PRESENTERS[0]!.face)).toBe(true);
    expect(submits[1]!.prompt).toContain('Continue the same shot');
    expect(job.timingSource).toBe('chirp');
    expect(job.timings![0]!.measured).toBe(true);
    expect(deps.calls.refund).toBeUndefined();
  });

  it('refunds a failed turn once and stops', async () => {
    const deps = mockDeps({ omniPoll: async () => ({ state: 'failed' as const, reason: 'filtered' }) });
    let job = await startScene(deps, 'u1', startInput(planFor(omni)));
    job = await pollScene(deps, 'u1', job);
    expect(job).toMatchObject({ state: 'failed', reason: 'filtered' });
    job = await pollScene(deps, 'u1', job);
    expect(deps.calls.refund).toHaveLength(1);
  });

  it('keeps polling while Omni works', async () => {
    const deps = mockDeps({ omniPoll: async () => ({ state: 'processing' as const }) });
    const job = await pollScene(deps, 'u1', await startScene(deps, 'u1', startInput(planFor(omni))));
    expect(job.state).toBe('processing');
    expect(deps.calls.omniSubmit).toHaveLength(1);
  });

  it('a named voice on Omni is dubbed (Studio voice): the voice, speed and pitch go to the dub, words timed on the dub', async () => {
    const deps = mockDeps();
    const plan = planFor(omni, { voiceId: 'Algieba', voiceSpeed: 1.1, voicePitch: -2 });
    expect(plan.dub).toBe(true);
    expect(plan.warnings).toContain('studio_voice_lips_approximate');
    let job = await startScene(deps, 'u1', startInput(plan));
    expect(job).toMatchObject({ dub: true, voiceAdjust: { speed: 1.1, pitch: -2 } });
    expect(job.dubCredits).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < job.turns.length; i++) job = await pollScene(deps, 'u1', job);
    expect(job.state).toBe('ready');
    const dubArgs = deps.calls.dub![0]![0] as { voiceId: string; adjust: unknown; text: string; durationSec: number };
    expect(dubArgs).toMatchObject({ voiceId: 'Algieba', adjust: { speed: 1.1, pitch: -2 }, text: job.text, durationSec: 10.2 });
    expect((deps.calls.words![0]![0] as Buffer).toString()).toBe('dubbed');
    expect((deps.calls.save!.at(-1)![2] as Buffer).toString()).toBe('dubbed');
    expect(publicJob(job).dub).toBe(true);
    expect(deps.calls.refund).toBeUndefined();
  });

  it('a dub that misses keeps the picture in Omni\'s voice and refunds only the dub', async () => {
    const deps = mockDeps({ dub: async () => null });
    let job = await startScene(deps, 'u1', startInput(planFor(omni, { voiceId: 'Kore' })));
    for (let i = 0; i < job.turns.length; i++) job = await pollScene(deps, 'u1', job);
    expect(job.state).toBe('ready');
    expect(job.warnings).toContain('dub_failed');
    expect(job.voiceId).toBeNull();
    expect(deps.calls.refund).toEqual([['u1', job.dubCredits, `${job.ref}:dub-refund`]]);
  });

  it('a dubbed scene is never retaken (the Studio voice reads every word)', async () => {
    const deps = mockDeps({ words: async () => ({ words: [{ word: 'x', start: 0, end: 1 }], heard: 'something else entirely' }) });
    let job = await startScene(deps, 'u1', startInput(planFor(omni, { voiceId: 'Kore' })));
    for (let i = 0; i < job.turns.length; i++) job = await pollScene(deps, 'u1', job);
    expect(job.state).toBe('ready');
    expect(job.retaken).toBe(false);
  });

  it('speed and pitch are ignored without a dub (Live keeps its pace chips)', () => {
    expect(planFor('live-kira', { voiceSpeed: 1.2, voicePitch: 3 }).voiceAdjust).toEqual({ speed: 1, pitch: 0 });
    expect(planFor(omni, { voiceSpeed: 1.2 }).voiceAdjust).toEqual({ speed: 1, pitch: 0 });
  });
});

describe('sceneToMake', () => {
  it('prices the edited text and refuses an edit that no longer fits one scene', () => {
    const plan = planFor('live-leo');
    const same = sceneToMake(plan, 0, 'v8');
    const edited = sceneToMake(plan, 0, 'v8', 'გამარჯობა.');
    expect(same.ok && edited.ok && edited.credits < same.credits).toBe(true);
    expect(sceneToMake(plan, 0, 'v8', `${KA} `.repeat(8))).toMatchObject({ ok: false });
    expect(sceneToMake(plan, 9, 'v8')).toMatchObject({ ok: false, reason: 'scene_missing' });
  });
});

describe('voice adjust (D6 sliders, Studio voice only)', () => {
  it('clamps to the slider ranges and steps', () => {
    expect(clampVoiceAdjust({ speed: 3, pitch: -9 })).toEqual({ speed: 1.25, pitch: -4 });
    expect(clampVoiceAdjust({ speed: 1.033, pitch: 1.3 })).toEqual({ speed: 1.05, pitch: 1.5 });
    expect(clampVoiceAdjust({ speed: 'x', pitch: NaN })).toEqual({ speed: 1, pitch: 0 });
  });
  it('builds no filter for the voice as read', () => {
    expect(voiceAdjustFilter({ speed: 1, pitch: 0 })).toBeNull();
  });
  it('speed alone is one atempo', () => {
    expect(voiceAdjustFilter({ speed: 0.9, pitch: 0 })).toBe('atempo=0.9');
  });
  it('pitch shifts by asetrate and keeps the length with atempo', () => {
    const f = voiceAdjustFilter({ speed: 1, pitch: 12 / 3 })!; // +4 st
    const r = 2 ** (4 / 12);
    expect(f).toContain(`asetrate=${Math.round(24000 * r)}`);
    expect(f).toContain(`atempo=${Number((1 / r).toFixed(4))}`);
    expect(voiceAdjustFilter({ speed: 1.2, pitch: -2 })!.endsWith('atempo=1.2')).toBe(true);
  });
});
