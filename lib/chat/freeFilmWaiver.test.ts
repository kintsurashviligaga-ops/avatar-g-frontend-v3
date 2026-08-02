/** @jest-environment node */
/**
 * The free-video slot must be SPENT when it is used, and it must cover exactly one film.
 *
 * ⚠️ WHAT THIS PINS. filmComposite used to only PEEK `free_films_remaining` — read it, waive every clip,
 * and never decrement. The counter was spent only by /api/video/assemble, which the CLIENT calls
 * afterwards. So anyone who ran the film pipeline and never assembled kept the slot forever and got the
 * expensive half free every time: the clips ARE the cost ($0.96 of Veo each, up to 12 a film) while the
 * stitch is 20 credits. A quota that is never consumed is not a quota.
 *
 * These tests cover the waiver RECORD — the server-side marker that lets one spent slot cover both the
 * clips and the stitch. The marker deliberately does not travel in the client-held `film:` token.
 */
import { mergeMaster, type FilmStatusRecord } from './filmStatusStore';

/** The exact predicate app/api/video/assemble/route.ts uses to decide "already paid for". */
function assembleWouldWaive(prior: FilmStatusRecord | null, uid: string | null): boolean {
  const paidUpstream = !!prior?.masterUrl || prior?.freeFilmWaived === true;
  return paidUpstream && prior?.payerUid === uid && prior?.billingConsumed !== true;
}

const base = (over: Partial<FilmStatusRecord> = {}): FilmStatusRecord => ({
  tokenId: 'tok', phase: 'rendering', clips: [], audioReady: false, masterUrl: null,
  updatedAt: 1, error: null, ...over,
});

describe('a free-film waiver covers the stitch too', () => {
  it('waives when the slot was spent on the clips by the SAME user', () => {
    expect(assembleWouldWaive(base({ freeFilmWaived: true, payerUid: 'u1' }), 'u1')).toBe(true);
  });

  // ⚠️ OWNER-BINDING. Without it, one user's free film would waive anyone's assemble — the token id is
  // derivable from data the client already holds.
  it('does NOT waive for a different user', () => {
    expect(assembleWouldWaive(base({ freeFilmWaived: true, payerUid: 'u1' }), 'u2')).toBe(false);
  });

  it('does NOT waive for an anonymous caller', () => {
    expect(assembleWouldWaive(base({ freeFilmWaived: true, payerUid: 'u1' }), null)).toBe(false);
  });

  // ⚠️ SINGLE USE. One spent slot = one stitch. Otherwise a replayed assemble re-waives forever, which
  // is the same unbounded-reuse bug one level down.
  it('does NOT waive twice — billingConsumed closes it', () => {
    expect(assembleWouldWaive(base({ freeFilmWaived: true, payerUid: 'u1', billingConsumed: true }), 'u1')).toBe(false);
  });

  it('does NOT waive when no slot was spent — the default must be to bill', () => {
    expect(assembleWouldWaive(base({ payerUid: 'u1' }), 'u1')).toBe(false);
    expect(assembleWouldWaive(null, 'u1')).toBe(false);
  });

  it('still waives the pre-existing paid-master case, unchanged', () => {
    expect(assembleWouldWaive(base({ masterUrl: 'https://x/m.mp4', payerUid: 'u1' }), 'u1')).toBe(true);
  });

  // A film that was NOT free must never be waived just because a master exists for someone else.
  it('a paid master belonging to another user does not waive', () => {
    expect(assembleWouldWaive(base({ masterUrl: 'https://x/m.mp4', payerUid: 'u1' }), 'u2')).toBe(false);
  });
});

describe('mergeMaster keeps the waiver honest', () => {
  it('preserves billingConsumed so recording a master cannot re-open a spent waiver', () => {
    const spent = base({ freeFilmWaived: true, payerUid: 'u1', billingConsumed: true });
    const merged = mergeMaster(spent, 'tok', 'https://x/m.mp4', null, 2, 'u1');
    expect(merged.billingConsumed).toBe(true);
    expect(assembleWouldWaive(merged, 'u1')).toBe(false);
  });
});
