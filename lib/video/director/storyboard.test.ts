/** @jest-environment node */
/**
 * storyboard.ts — the rules a storyboard must meet before approval locks it, and the lock itself (V2, V4, V6):
 * validateStoryboard reports every problem; freeze refuses an unapproved or invalid storyboard and returns a deep-frozen,
 * independent copy that nothing can mutate; isFrozen recognises only what freeze produced; an edit is a new draft.
 */
import { draftFromFrozen, freeze, isFrozen, restoreFrozen, shotsInOrder, StoryboardValidationError, validateStoryboard } from './storyboard';
import { HERO_REF, makeShot, makeStoryboard, threeShots } from './testing/fixtures';
import type { FrozenStoryboard, Shot, Storyboard } from './types';

const CLOCK = () => new Date('2026-10-08T12:00:00.000Z');

function problemsOf(sb: unknown): string[] {
  const v = validateStoryboard(sb);
  return v.ok ? [] : v.problems;
}

describe('validateStoryboard', () => {
  it('accepts a valid storyboard', () => {
    expect(validateStoryboard(makeStoryboard(threeShots()))).toEqual({ ok: true });
  });

  it.each<[string, (s: Storyboard) => Storyboard, RegExp]>([
    ['duplicate orders', (s) => ({ ...s, shots: [s.shots[0]!, { ...s.shots[1]!, order: 1 }, s.shots[2]!] }), /orders must be unique/],
    ['a gap in the orders', (s) => ({ ...s, shots: [s.shots[0]!, s.shots[1]!, { ...s.shots[2]!, order: 5 }] }), /contiguous/],
    ['a fractional order', (s) => ({ ...s, shots: [{ ...s.shots[0]!, order: 1.5 }, ...s.shots.slice(1)] }), /order must be a non-negative whole number/],
    ['duplicate ids', (s) => ({ ...s, shots: [s.shots[0]!, { ...s.shots[1]!, id: 'a' }, s.shots[2]!] }), /ids must be unique/],
    ['a 5 s shot', (s) => ({ ...s, totalDurationSeconds: 21, shots: [{ ...s.shots[0]!, durationSeconds: 5 }, ...s.shots.slice(1)] }), /durationSeconds must be 4, 6, 8/],
    ['a 1:1 shot', (s) => ({ ...s, shots: [{ ...s.shots[0]!, aspectRatio: '1:1' }, ...s.shots.slice(1)] }), /aspectRatio must be 16:9 or 9:16/],
    ['two aspect ratios', (s) => ({ ...s, shots: [{ ...s.shots[0]!, aspectRatio: '9:16' }, ...s.shots.slice(1)] }), /differs from the locked/],
    ['an unknown quality', (s) => ({ ...s, shots: [{ ...s.shots[0]!, quality: 'ultra' }, ...s.shots.slice(1)] }), /quality must be/],
    ['enforceAcrossShots false', (s) => ({ ...s, consistencyLock: { ...s.consistencyLock, enforceAcrossShots: false } }), /enforceAcrossShots must be true/],
    ['a 1:1 lock', (s) => ({ ...s, consistencyLock: { ...s.consistencyLock, aspectRatio: '1:1' } }), /consistencyLock.aspectRatio/],
    ['a negative seed', (s) => ({ ...s, consistencyLock: { ...s.consistencyLock, seed: -1 } }), /seed must be a whole number/],
    ['a fractional shot seed', (s) => ({ ...s, shots: [{ ...s.shots[0]!, seed: 1.5 }, ...s.shots.slice(1)] }), /seed must be a whole number/],
    ['an empty prompt', (s) => ({ ...s, shots: [{ ...s.shots[0]!, prompt: '  \n ' }, ...s.shots.slice(1)] }), /prompt must not be empty/],
    ['a blank negative prompt', (s) => ({ ...s, shots: [{ ...s.shots[0]!, negativePrompt: ' ' }, ...s.shots.slice(1)] }), /negativePrompt/],
    ['an http reference', (s) => ({ ...s, consistencyLock: { ...s.consistencyLock, characterReference: 'http://cdn.example.com/a.png' } }), /characterReference/],
    ['a reference on a 6 s shot', (s) => ({ ...s, totalDurationSeconds: 22, consistencyLock: { ...s.consistencyLock, characterReference: HERO_REF }, shots: [{ ...s.shots[0]!, durationSeconds: 6 }, ...s.shots.slice(1)] }), /only in an 8 s clip/],
    ['a reference on lite', (s) => ({ ...s, shots: [{ ...s.shots[0]!, quality: 'lite', referenceImage: HERO_REF }, ...s.shots.slice(1)] }), /lite tier does not accept reference images/],
    ['a wrong total', (s) => ({ ...s, totalDurationSeconds: 99 }), /totalDurationSeconds must equal/],
    ['no shots', (s) => ({ ...s, shots: [] }), /at least one shot/],
  ])('refuses %s', (_label, mutate, expected) => {
    const problems = problemsOf(mutate(makeStoryboard(threeShots())));
    expect(problems.join('\n')).toMatch(expected);
  });

  it('reports every problem, not just the first', () => {
    const sb = makeStoryboard([makeShot({ id: 'a', order: 1, durationSeconds: 5, aspectRatio: '1:1' })], { enforceAcrossShots: false });
    expect(problemsOf(sb).length).toBeGreaterThanOrEqual(3);
  });

  it('never repairs what it checks (the prompt is left byte-for-byte)', () => {
    const prompt = '  \n ჩიტი მიფრინავს ზღვის თავზე \t\n';
    const sb = makeStoryboard([makeShot({ id: 'a', order: 1, prompt })]);
    expect(validateStoryboard(sb)).toEqual({ ok: true });
    expect(sb.shots[0]!.prompt).toBe(prompt);
  });
});

describe('freeze', () => {
  it('refuses a storyboard the user has not approved', () => {
    const sb = makeStoryboard(threeShots(), {}, { approvedByUser: false });
    expect(() => freeze(sb)).toThrow(StoryboardValidationError);
    expect(() => freeze(sb)).toThrow(/not approved/);
  });

  it('refuses an invalid storyboard and names the problems', () => {
    const sb = makeStoryboard([makeShot({ id: 'a', order: 1 }), makeShot({ id: 'b', order: 3 })]);
    let caught: unknown;
    try {
      freeze(sb);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StoryboardValidationError);
    expect((caught as StoryboardValidationError).problems.join(' ')).toMatch(/contiguous/);
  });

  it('returns a branded, timestamped copy', () => {
    const sb = makeStoryboard(threeShots());
    const frozen = freeze(sb, CLOCK);
    expect(frozen.__frozen).toBe(true);
    expect(frozen.frozenAt).toBe('2026-10-08T12:00:00.000Z');
    expect(frozen).not.toBe(sb);
    expect(frozen.shots).not.toBe(sb.shots);
    expect(isFrozen(frozen)).toBe(true);
    // The draft is left as it was.
    expect('__frozen' in sb).toBe(false);
  });

  it('deep-freezes: no shot, prompt, order, lock or list can be changed afterwards (V2, V6)', () => {
    const frozen = freeze(makeStoryboard(threeShots(), { seed: 42, characterReference: HERO_REF }), CLOCK);
    const snapshot = JSON.stringify(frozen);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.shots)).toBe(true);
    expect(Object.isFrozen(frozen.consistencyLock)).toBe(true);
    frozen.shots.forEach((s) => expect(Object.isFrozen(s)).toBe(true));

    const attempts: Array<() => void> = [
      () => {
        (frozen.shots[0] as Shot).prompt = 'an improved prompt';
      },
      () => {
        (frozen.shots[1] as Shot).order = 9;
      },
      () => {
        (frozen.shots[2] as Shot).seed = 1;
      },
      () => {
        (frozen.consistencyLock as { seed?: number }).seed = 7;
      },
      () => {
        (frozen as Storyboard).approvedByUser = false;
      },
      () => {
        (frozen as { frozenAt: string }).frozenAt = 'later';
      },
      () => {
        frozen.shots.push(makeShot({ id: 'extra', order: 4 }));
      },
      () => {
        frozen.shots.splice(1, 1);
      },
      () => {
        frozen.shots.reverse();
      },
    ];
    let thrown = 0;
    for (const attempt of attempts) {
      // Strict mode (ES modules) throws a TypeError; sloppy mode ignores the write. Either way nothing may change.
      try {
        attempt();
      } catch (err) {
        expect(err).toBeInstanceOf(TypeError);
        thrown += 1;
      }
    }
    expect(JSON.stringify(frozen)).toBe(snapshot);
    // This test module is strict, so here every attempt is refused loudly.
    expect(thrown).toBe(attempts.length);
  });

  it('is independent of the draft it came from', () => {
    const sb = makeStoryboard(threeShots());
    const frozen = freeze(sb, CLOCK);
    sb.shots[0]!.prompt = 'edited after approval';
    sb.shots.push(makeShot({ id: 'd', order: 4 }));
    expect(frozen.shots[0]!.prompt).toBe('A lighthouse keeper climbs the stairs, shot 1.');
    expect(frozen.shots).toHaveLength(3);
  });

  it('carries only the contract fields (nothing a planner attached rides along)', () => {
    const sb = { ...makeStoryboard(threeShots()), injected: 'x' } as Storyboard;
    expect('injected' in freeze(sb)).toBe(false);
  });
});

describe('isFrozen', () => {
  it('refuses a plain storyboard, a forged brand and a shallow freeze', () => {
    const sb = makeStoryboard(threeShots());
    expect(isFrozen(sb)).toBe(false);
    const forged = { ...sb, __frozen: true, frozenAt: '2026-10-08T12:00:00.000Z' };
    expect(isFrozen(forged)).toBe(false);
    expect(isFrozen(Object.freeze({ ...forged }))).toBe(false);
    expect(isFrozen(null)).toBe(false);
    expect(isFrozen('frozen')).toBe(false);
  });
});

describe('draftFromFrozen', () => {
  it('gives a new, unapproved, mutable draft and leaves the frozen storyboard untouched', () => {
    const frozen: FrozenStoryboard = freeze(makeStoryboard(threeShots()), CLOCK);
    const draft = draftFromFrozen(frozen);
    expect(draft.approvedByUser).toBe(false);
    expect('__frozen' in draft).toBe(false);
    expect('frozenAt' in draft).toBe(false);
    draft.shots[1]!.prompt = 'a better second shot';
    expect(frozen.shots[1]!.prompt).toBe('A lighthouse keeper climbs the stairs, shot 2.');
    expect(() => freeze(draft)).toThrow(/not approved/);
    const refrozen = freeze({ ...draft, approvedByUser: true }, () => new Date('2026-10-08T13:00:00.000Z'));
    expect(refrozen.shots[1]!.prompt).toBe('a better second shot');
    expect(refrozen.frozenAt).not.toBe(frozen.frozenAt);
  });
});

describe('shotsInOrder', () => {
  it('orders by `order`, not by array position, without touching the array', () => {
    const shots = [makeShot({ id: 'b', order: 2 }), makeShot({ id: 'c', order: 3 }), makeShot({ id: 'a', order: 1 })];
    const frozen = freeze(makeStoryboard(shots));
    expect(shotsInOrder(frozen).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(frozen.shots.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('restoreFrozen', () => {
  it('turns a stored copy of freeze() output back into a frozen storyboard with its original frozenAt', () => {
    const frozen = freeze(makeStoryboard(threeShots({ prompt: '  verbatim, spaces kept  ' })), CLOCK);
    const restored = restoreFrozen(JSON.parse(JSON.stringify(frozen)));
    expect(isFrozen(restored)).toBe(true);
    expect(restored.frozenAt).toBe(frozen.frozenAt);
    expect(restored.shots.map((s) => s.prompt)).toEqual(frozen.shots.map((s) => s.prompt));
  });

  it('refuses anything freeze() did not approve, or that no longer passes the rules', () => {
    const frozen = JSON.parse(JSON.stringify(freeze(makeStoryboard(threeShots()), CLOCK))) as Record<string, unknown>;
    expect(() => restoreFrozen(makeStoryboard(threeShots()))).toThrow(StoryboardValidationError);
    expect(() => restoreFrozen({ ...frozen, approvedByUser: false })).toThrow(/not approved/);
    expect(() => restoreFrozen({ ...frozen, totalDurationSeconds: 99 })).toThrow(StoryboardValidationError);
    expect(() => restoreFrozen(null)).toThrow(StoryboardValidationError);
  });
});
