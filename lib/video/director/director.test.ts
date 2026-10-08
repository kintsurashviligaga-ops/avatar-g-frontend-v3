/** @jest-environment node */
/**
 * director.ts end to end over GoogleVeoProvider and a scripted fake engine — no network, no spend, no LLM. Rules
 * under test: V1 (only GoogleVeoProvider is accepted), V2/V6 (a frozen 3-shot storyboard runs exactly 3 submits, in
 * `order`, each with its own prompt and the lock's seed / reference unless the shot overrides them; nothing added,
 * skipped or reordered), V5 (the first ShotError halts in waiting_for_shot_decision; the next shot is never submitted;
 * retry resumes at the failed shot; cancel and edit), refusal of anything not frozen, cancellation, progress events,
 * and planStoryboard producing only an unapproved draft.
 */
// The default planner (./server) calls lib/ai/llmText. It must never load, let alone run, in these tests.
jest.mock('../../ai/llmText', () => ({
  llmText: jest.fn(() => {
    throw new Error('the default Gemini planner must never be called in tests');
  }),
}));

import { llmText } from '../../ai/llmText';
import { createVideoDirector, ProviderNotAllowedError, RunDecisionError, SHOT_DECISIONS, type GoogleVideoDirector } from './director';
import { GoogleVeoProvider } from './googleVeoProvider';
import { StoryboardNotFrozenError } from './storyboard';
import { createFakeVeoEngine, type FakeVeoEngineOptions } from './testing/fakeVeoEngine';
import { HERO_REF, makeShot, makeStoryboard, threeShots, VILLAIN_REF } from './testing/fixtures';
import type { FrozenStoryboard, ShotProgressEvent, Storyboard, StoryboardPlanner } from './types';

const CLOCK = () => new Date('2026-10-08T12:00:00.000Z');
const noPlanner: StoryboardPlanner = async () => {
  throw new Error('no planner in this test');
};

function setup(opts: FakeVeoEngineOptions = {}, planner: StoryboardPlanner = noPlanner) {
  const engine = createFakeVeoEngine(opts);
  const director = createVideoDirector({ provider: new GoogleVeoProvider({ engine, maxWaitMs: 30_000 }), planner, clock: CLOCK });
  const events: ShotProgressEvent[] = [];
  const onProgress = (e: ShotProgressEvent) => events.push(e);
  return { engine, director, events, onProgress };
}

/** The V2/V6 storyboard: lock seed + character reference; shot b overrides the seed, shot c the reference; the array is shuffled. */
function lockedThreeShotBoard(director: GoogleVideoDirector): FrozenStoryboard {
  const shots = [
    makeShot({ id: 'b', order: 2, prompt: 'Shot two: the keeper lights the lamp.', seed: 7 }),
    makeShot({ id: 'c', order: 3, prompt: 'Shot three: a stranger at the door.', referenceImage: VILLAIN_REF }),
    makeShot({ id: 'a', order: 1, prompt: 'Shot one: the keeper climbs the stairs.' }),
  ];
  return director.freeze(makeStoryboard(shots, { seed: 42, characterReference: HERO_REF }));
}

afterAll(() => {
  expect(llmText).not.toHaveBeenCalled();
});

describe('V1 — only GoogleVeoProvider', () => {
  it('accepts GoogleVeoProvider ("google_veo")', () => {
    const { director } = setup();
    expect(director.provider.providerName).toBe('google_veo');
  });

  it('refuses any other provider, and a lookalike that merely claims "google_veo"', () => {
    const generateShot = jest.fn();
    const runway = { providerName: 'runway', generateShot } as unknown as GoogleVeoProvider;
    const lookalike = { providerName: 'google_veo', generateShot } as unknown as GoogleVeoProvider;
    expect(() => createVideoDirector({ provider: runway, planner: noPlanner })).toThrow(ProviderNotAllowedError);
    expect(() => createVideoDirector({ provider: lookalike, planner: noPlanner })).toThrow(ProviderNotAllowedError);
    expect(generateShot).not.toHaveBeenCalled();
  });
});

describe('V2 / V6 — strict storyboard execution', () => {
  it('runs exactly 3 submits, in order, each with its own prompt and the lock\'s seed / reference unless overridden', async () => {
    const { engine, director, onProgress } = setup();
    const frozen = lockedThreeShotBoard(director);
    const run = await director.executeStoryboard(frozen, onProgress);

    expect(run.state).toBe('completed');
    expect(engine.calls).toHaveLength(3);
    const sent = engine.calls.map((c) => c.request);
    expect(sent.map((r) => r.prompt)).toEqual([
      'Shot one: the keeper climbs the stairs.',
      'Shot two: the keeper lights the lamp.',
      'Shot three: a stranger at the door.',
    ]);
    expect(engine.calls.map((c) => c.ordinal)).toEqual([1, 2, 3]);
    expect(sent.map((r) => r.seed)).toEqual([42, 7, 42]);
    expect(sent.map((r) => r.referenceImages)).toEqual([
      [{ kind: 'url', url: HERO_REF }],
      [{ kind: 'url', url: HERO_REF }],
      [{ kind: 'url', url: VILLAIN_REF }],
    ]);
    for (const r of sent) {
      expect(r).toMatchObject({ aspect: '16:9', durationSec: 8, tier: 'fast', enhancePrompt: false });
      // Nothing added: exactly the frozen shot's fields, mapped.
      expect(Object.keys(r).sort()).toEqual(['aspect', 'durationSec', 'enhancePrompt', 'prompt', 'referenceImages', 'seed', 'tier']);
    }

    expect(run.clips.map((c) => c.shotId)).toEqual(['a', 'b', 'c']);
    expect(run.clips.map((c) => c.metadata.seedSource)).toEqual(['consistency_lock', 'shot', 'consistency_lock']);
    expect(run.clips.map((c) => c.metadata.referenceImageSource)).toEqual(['consistency_lock', 'consistency_lock', 'shot']);
    expect(run.errors).toEqual([]);
    expect(run).toMatchObject({ storyboardId: 'sb-1', completedAt: '2026-10-08T12:00:00.000Z' });
    expect(run.pendingDecision).toBeUndefined();

    // The storyboard that ran is the frozen one, unchanged.
    expect(run.storyboard).toBe(frozen);
    expect(frozen.shots.map((s) => s.prompt)).toEqual([
      'Shot two: the keeper lights the lamp.',
      'Shot three: a stranger at the door.',
      'Shot one: the keeper climbs the stairs.',
    ]);
  });

  it('runs one shot at a time: each submit starts only after the previous clip is delivered', async () => {
    const order: string[] = [];
    const { director, onProgress } = setup({
      onCreate: (input) => order.push(`submit ${input.ordinal}`),
      onDeliver: (ctx) => order.push(`deliver ${ctx.order}`),
    });
    await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    expect(order).toEqual(['submit 1', 'deliver 1', 'submit 2', 'deliver 2', 'submit 3', 'deliver 3']);
  });

  it('emits queued for every shot, then generating → finalizing → done per shot', async () => {
    const { director, events, onProgress } = setup();
    await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    expect(events.map((e) => `${e.shotId}:${e.stage}:${e.progress}`)).toEqual([
      'a:queued:0', 'b:queued:0', 'c:queued:0',
      'a:generating:0.1', 'a:finalizing:0.9', 'a:done:1',
      'b:generating:0.1', 'b:finalizing:0.9', 'b:done:1',
      'c:generating:0.1', 'c:finalizing:0.9', 'c:done:1',
    ]);
    expect(events.every((e) => e.storyboardId === 'sb-1' && e.totalShots === 3)).toBe(true);
    expect(events.filter((e) => e.stage === 'done').map((e) => e.shotIndex)).toEqual([0, 1, 2]);
  });

  it('keeps running when a progress listener throws (UI faults never stop a paid run)', async () => {
    const { engine, director } = setup();
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), () => {
      throw new Error('listener bug');
    });
    expect(run.state).toBe('completed');
    expect(engine.calls).toHaveLength(3);
  });
});

describe('only a frozen storyboard executes', () => {
  it('refuses an approved but unfrozen storyboard, and a forged brand, without submitting anything', async () => {
    const { engine, director, onProgress } = setup();
    const approved = makeStoryboard(threeShots());
    await expect(director.executeStoryboard(approved as unknown as FrozenStoryboard, onProgress)).rejects.toBeInstanceOf(StoryboardNotFrozenError);
    const forged = { ...approved, __frozen: true as const, frozenAt: '2026-10-08T12:00:00.000Z' };
    await expect(director.executeStoryboard(forged, onProgress)).rejects.toBeInstanceOf(StoryboardNotFrozenError);
    await expect(director.executeStoryboard(Object.freeze(forged), onProgress)).rejects.toBeInstanceOf(StoryboardNotFrozenError);
    expect(engine.calls).toHaveLength(0);
  });

  it('freeze refuses an unapproved or invalid storyboard', () => {
    const { director } = setup();
    expect(() => director.freeze(makeStoryboard(threeShots(), {}, { approvedByUser: false }))).toThrow(/not approved/);
    expect(() => director.freeze(makeStoryboard(threeShots({ durationSeconds: 5 })))).toThrow(/durationSeconds/);
  });
});

describe('V5 — a shot error halts the run for the user\'s decision', () => {
  const failSecondShotOnce = { script: (i: number) => (i === 1 ? { submit: { ok: false as const, reason: 'safety' as const, retryable: false, status: 400, detail: 'HTTP 400: The prompt violates usage guidelines. Support codes: 29310472' } } : undefined) };

  it('stops at shot 2: shot 3 is never submitted, the state is waiting_for_shot_decision with the mapped error', async () => {
    const { engine, director, events, onProgress } = setup(failSecondShotOnce);
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);

    expect(run.state).toBe('waiting_for_shot_decision');
    expect(engine.calls.map((c) => c.ordinal)).toEqual([1, 2]);
    expect(run.clips.map((c) => c.shotId)).toEqual(['a']);
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toMatchObject({ shotId: 'b', reason: 'prompt_safety', retryable: false });
    expect(run.pendingDecision).toMatchObject({ shotId: 'b', shotIndex: 1, error: run.errors[0], options: ['retry', 'edit', 'cancel'] });
    expect(SHOT_DECISIONS).not.toContain('skip');

    const failed = events.find((e) => e.stage === 'failed');
    expect(failed).toMatchObject({ shotId: 'b', shotIndex: 1, error: { reason: 'prompt_safety' } });
    // Shot c was queued and never started.
    expect(events.filter((e) => e.shotId === 'c').map((e) => e.stage)).toEqual(['queued']);
  });

  it('retry resumes at the failed shot (the same frozen shot), then finishes the rest in order', async () => {
    const { engine, director, onProgress } = setup(failSecondShotOnce);
    const halted = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    const run = await director.retryFailedShot(halted, onProgress);

    expect(run.state).toBe('completed');
    expect(engine.calls.map((c) => c.ordinal)).toEqual([1, 2, 2, 3]);
    expect(engine.calls[1]!.request).toEqual(engine.calls[2]!.request);
    expect(run.clips.map((c) => c.shotId)).toEqual(['a', 'b', 'c']);
    // The history keeps the error the retry overcame.
    expect(run.errors.map((e) => e.shotId)).toEqual(['b']);
    expect(run.pendingDecision).toBeUndefined();
  });

  it('a retry that fails again halts again at the same shot', async () => {
    const { engine, director, onProgress } = setup({ script: (i) => (i >= 1 ? { polls: [{ state: 'failed', reason: 'RESOURCE_EXHAUSTED', code: 8 }] } : undefined) });
    const halted = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    const again = await director.retryFailedShot(halted, onProgress);
    expect(again.state).toBe('waiting_for_shot_decision');
    expect(again.pendingDecision).toMatchObject({ shotId: 'b', error: { reason: 'rate_limit', retryable: true } });
    expect(again.errors).toHaveLength(2);
    expect(engine.calls.map((c) => c.ordinal)).toEqual([1, 2, 2]);
  });

  it('cancel ends the run with the clips it has; nothing more is submitted', async () => {
    const { engine, director, onProgress } = setup(failSecondShotOnce);
    const halted = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    const cancelled = director.cancelRun(halted);
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.clips.map((c) => c.shotId)).toEqual(['a']);
    expect(cancelled.pendingDecision).toBeUndefined();
    expect(engine.calls).toHaveLength(2);
    expect(() => director.cancelRun(cancelled)).toThrow(RunDecisionError);
    await expect(director.retryFailedShot(cancelled, onProgress)).rejects.toBeInstanceOf(RunDecisionError);
  });

  it('edit is a new draft to approve and freeze — the frozen storyboard is never changed', async () => {
    const { engine, director, onProgress } = setup(failSecondShotOnce);
    const frozen = lockedThreeShotBoard(director);
    const halted = await director.executeStoryboard(frozen, onProgress);

    const draft = director.editStoryboard(halted);
    expect(draft.approvedByUser).toBe(false);
    draft.shots.find((s) => s.id === 'b')!.prompt = 'Shot two: the keeper lights the lamp at dusk.';
    expect(() => director.freeze(draft)).toThrow(/not approved/);
    const refrozen = director.freeze({ ...draft, approvedByUser: true });
    const run = await director.executeStoryboard(refrozen, onProgress);

    expect(run.state).toBe('completed');
    expect(engine.calls.slice(2).map((c) => c.request.prompt)).toEqual([
      'Shot one: the keeper climbs the stairs.',
      'Shot two: the keeper lights the lamp at dusk.',
      'Shot three: a stranger at the door.',
    ]);
    expect(frozen.shots.find((s) => s.id === 'b')!.prompt).toBe('Shot two: the keeper lights the lamp.');
  });

  it('turns an unexpected provider throw into a halt, never a skip', async () => {
    const { engine, director, onProgress } = setup({ createThrows: (i) => (i === 0 ? new Error('engine exploded') : undefined) });
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress);
    expect(run.state).toBe('waiting_for_shot_decision');
    expect(run.pendingDecision).toMatchObject({ shotId: 'a', error: { reason: 'unknown' } });
    expect(engine.calls).toHaveLength(1);
  });
});

describe('cancellation', () => {
  it('a cancelled token runs nothing', async () => {
    const { engine, director, onProgress } = setup();
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress, { aborted: true });
    expect(run.state).toBe('cancelled');
    expect(engine.calls).toHaveLength(0);
  });

  it('cancelling while a shot renders stops waiting on it and submits nothing after it', async () => {
    const controller = new AbortController();
    const { engine, director, onProgress } = setup({ onCreate: () => controller.abort(), script: () => ({ polls: [{ state: 'processing' }] }) });
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress, controller.signal);
    expect(run.state).toBe('cancelled');
    expect(run.clips).toEqual([]);
    expect(engine.calls).toHaveLength(1);
  });

  it('cancelling after a shot rendered keeps that clip and stops before the next shot', async () => {
    const controller = new AbortController();
    const { engine, director, onProgress } = setup({ onDeliver: () => controller.abort() });
    const run = await director.executeStoryboard(lockedThreeShotBoard(director), onProgress, controller.signal);
    expect(run.state).toBe('cancelled');
    expect(run.clips.map((c) => c.shotId)).toEqual(['a']);
    expect(engine.calls).toHaveLength(1);
  });
});

describe('planStoryboard — the LLM only drafts', () => {
  it('returns an unapproved agent_planner draft whatever the planner claimed, and it cannot be frozen as is', async () => {
    const sneaky: StoryboardPlanner = async () =>
      ({ ...makeStoryboard(threeShots()), approvedByUser: true, createdBy: 'user', __frozen: true, frozenAt: 'now' }) as Storyboard;
    const { engine, director } = setup({}, sneaky);
    const draft = await director.planStoryboard({ brief: 'A lighthouse keeper at night', aspectRatio: '16:9' });
    expect(draft).toMatchObject({ approvedByUser: false, createdBy: 'agent_planner' });
    expect('__frozen' in draft).toBe(false);
    expect('frozenAt' in draft).toBe(false);
    expect(() => director.freeze(draft)).toThrow(/not approved/);
    expect(engine.calls).toHaveLength(0);
  });

  it('passes the input to the injected planner and rejects a planner that returns nothing', async () => {
    const planner = jest.fn<ReturnType<StoryboardPlanner>, Parameters<StoryboardPlanner>>(async () => null as unknown as Storyboard);
    const { director } = setup({}, planner);
    const input = { brief: 'ზღვის სანაპირო', aspectRatio: '9:16' };
    await expect(director.planStoryboard(input)).rejects.toThrow(/no storyboard/);
    expect(planner).toHaveBeenCalledWith(input);
  });
});

describe('runPipeline', () => {
  it('runs the master\'s VideoPipelineInput envelope with its params', async () => {
    const { engine, director, onProgress } = setup();
    const run = await director.runPipeline({ storyboard: lockedThreeShotBoard(director), params: { sessionId: 'film-77', userId: 'user-1' } }, onProgress);
    expect(run.state).toBe('completed');
    expect(engine.calls.every((c) => c.sessionId === 'film-77')).toBe(true);
    expect(engine.userIds).toEqual(['user-1', 'user-1', 'user-1']);
  });
});
