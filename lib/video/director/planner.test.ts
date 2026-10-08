/** @jest-environment node */
/**
 * planner.ts with a fake text generator — never the default Gemini planner, never the network. Rules under test: the
 * draft's structure comes from the user's input (frame, length, tier, lock, ids, orders), the model only writes text,
 * the draft is unapproved and passes validation (so approval can freeze it), and a reply that is not a storyboard
 * is a StoryboardPlanningError.
 */
import { createGeminiStoryboardPlanner, StoryboardPlanningError, type PlannerGenerate } from './planner';
import { freeze, validateStoryboard } from './storyboard';
import { HERO_REF } from './testing/fixtures';

const CLOCK = () => new Date('2026-10-08T12:00:00.000Z');

function plannerReplying(reply: string | null) {
  const generate = jest.fn<ReturnType<PlannerGenerate>, Parameters<PlannerGenerate>>(async () => reply);
  return { generate, planner: createGeminiStoryboardPlanner({ generate, clock: CLOCK, newId: () => 'draft-1' }) };
}

const REPLY = JSON.stringify({
  title: 'შუქურა',
  shots: [
    { description: 'მეშუქურე ადის კიბეზე', prompt: '  Wide shot: an old lighthouse keeper climbs a spiral staircase.\u0007\n', negativePrompt: 'blurry footage', cameraMotion: 'slow tilt up' },
    { description: 'ნათურა ინთება', prompt: 'Close-up: the same old keeper lights the great lamp.' },
    { description: 'სტუმარი კარზე', prompt: 'Medium shot: a stranger knocks at the lighthouse door in the rain.', notes: 'tense' },
    { description: 'ზედმეტი', prompt: 'An extra shot the user did not ask for.' },
  ],
});

describe('createGeminiStoryboardPlanner', () => {
  it('builds an unapproved, valid draft whose structure comes from the input', async () => {
    const { planner, generate } = plannerReplying(REPLY);
    const draft = await planner({ brief: 'მეშუქურე და უცნობი სტუმარი', aspectRatio: '9:16', shotCount: 3, seed: 42, characterReference: HERO_REF, language: 'ka' });

    expect(draft).toMatchObject({ id: 'draft-1', title: 'შუქურა', createdBy: 'agent_planner', approvedByUser: false, createdAt: '2026-10-08T12:00:00.000Z', totalDurationSeconds: 24 });
    expect(draft.consistencyLock).toEqual({ seed: 42, characterReference: HERO_REF, aspectRatio: '9:16', enforceAcrossShots: true });
    expect(draft.shots.map((s) => [s.id, s.order, s.durationSeconds, s.aspectRatio, s.quality])).toEqual([
      ['shot-1', 1, 8, '9:16', 'fast'],
      ['shot-2', 2, 8, '9:16', 'fast'],
      ['shot-3', 3, 8, '9:16', 'fast'],
    ]);
    // Seed and reference live in the lock only; a per-shot override stays the user's own act.
    expect(draft.shots.every((s) => s.seed === undefined && s.referenceImage === undefined)).toBe(true);
    // The model's text is cleaned at draft time (before the user reviews it), never after approval.
    expect(draft.shots[0]!.prompt).toBe('Wide shot: an old lighthouse keeper climbs a spiral staircase.');
    expect(draft.shots[0]).toMatchObject({ negativePrompt: 'blurry footage', cameraMotion: 'slow tilt up' });

    expect(validateStoryboard(draft)).toEqual({ ok: true });
    expect(freeze({ ...draft, approvedByUser: true }).__frozen).toBe(true);

    const [prompt, opts] = generate.mock.calls[0]!;
    expect(prompt).toContain('მეშუქურე და უცნობი სტუმარი');
    expect(prompt).toContain('exactly 3');
    expect(opts).toMatchObject({ json: true });
    expect(opts.system).toMatch(/IDENTICAL wording/);
  });

  it('uses the studio defaults when the input leaves them out', async () => {
    const { planner } = plannerReplying(REPLY);
    const draft = await planner({ brief: 'A lighthouse at night', aspectRatio: '16:9' });
    expect(draft.shots).toHaveLength(3);
    expect(draft.shots.every((s) => s.durationSeconds === 8 && s.quality === 'fast')).toBe(true);
  });

  it.each([
    ['no reply', null],
    ['prose', 'Here is your storyboard: a keeper climbs.'],
    ['JSON without shots', '{"title":"x"}'],
    ['shots without prompts', '{"shots":[{"description":"a"},{"prompt":"   "}]}'],
  ])('refuses %s', async (_label, reply) => {
    const { planner } = plannerReplying(reply);
    await expect(planner({ brief: 'x', aspectRatio: '16:9' })).rejects.toBeInstanceOf(StoryboardPlanningError);
  });

  it('refuses an empty brief without calling the model', async () => {
    const { planner, generate } = plannerReplying(REPLY);
    await expect(planner({ brief: '   ', aspectRatio: '16:9' })).rejects.toBeInstanceOf(StoryboardPlanningError);
    expect(generate).not.toHaveBeenCalled();
  });
});
