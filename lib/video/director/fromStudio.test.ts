/** @jest-environment node */
/**
 * fromStudio.ts — the studio board as a director storyboard: one shot per scene in board order, the scene text exactly
 * as the studio would render it (V3), the board's frame / length / tier, the first photo and the seed as the lock (V4);
 * and nothing reshaped (V6): a square board or a reference on a short clip stays as it is, for the rules to refuse.
 */
import { approvalForRender, snapshotRevision, type BoardLike } from '@/lib/video/storyboard/revision';
import { freeze, validateStoryboard } from './storyboard';
import { checkStoryboardApproval, studioToDirectorStoryboard, type StudioBoard } from './fromStudio';

const NOW = new Date('2026-10-08T15:00:00.000Z');

function board(over: Partial<StudioBoard> = {}): StudioBoard {
  return {
    filmPrompt: 'A lighthouse keeper',
    refs: [],
    orientation: 'landscape',
    scenes: [
      { ordinal: 1, beat: 'Climb', prompt: 'scene one' },
      { ordinal: 2, beat: 'Lamp', prompt: '  ლამპა  ', edited: true },
      { ordinal: 3, beat: 'Door', prompt: 'scene three' },
    ],
    sceneScripts: ['Script one.', 'Script two.', null],
    ...over,
  };
}

describe('studioToDirectorStoryboard', () => {
  it('maps every scene to a shot in board order with the text the studio would render, untouched', () => {
    const sb = studioToDirectorStoryboard(board(), { id: 'sb-1', quality: 'fast', clipSec: 8, now: NOW });
    expect(sb.shots.map((s) => [s.order, s.prompt])).toEqual([[1, 'Script one.'], [2, '  ლამპა  '], [3, 'scene three']]);
    expect(sb.totalDurationSeconds).toBe(24);
    expect(sb.approvedByUser).toBe(true);
    expect(validateStoryboard(sb)).toEqual({ ok: true });
    expect(() => freeze(sb)).not.toThrow();
  });

  it('locks the frame, the first photo and the seed', () => {
    const sb = studioToDirectorStoryboard(board({ orientation: 'vertical', refs: ['https://cdn.example.com/me.png'] }), { id: 'sb-1', quality: 'standard', clipSec: 8, seed: 42 });
    expect(sb.consistencyLock).toEqual({ aspectRatio: '9:16', enforceAcrossShots: true, seed: 42, characterReference: 'https://cdn.example.com/me.png' });
    expect(sb.shots.every((s) => s.aspectRatio === '9:16' && s.quality === 'standard')).toBe(true);
  });

  it('reshapes nothing the director cannot render: a square board and a reference on a 6 s clip are refused by the rules', () => {
    const square = studioToDirectorStoryboard(board({ orientation: 'square' }), { id: 'sb-1', quality: 'fast', clipSec: 8 });
    expect(square.consistencyLock.aspectRatio).toBe('1:1');
    expect(validateStoryboard(square).ok).toBe(false);
    const short = studioToDirectorStoryboard(board({ clipSec: 6, refs: ['https://cdn.example.com/me.png'] }), { id: 'sb-1', quality: 'fast', clipSec: 8 });
    expect(short.shots[0]?.durationSeconds).toBe(6);
    expect(validateStoryboard(short).ok).toBe(false);
  });
});

describe('checkStoryboardApproval — the server refuses a run that is not the approved revision (round 3, P1)', () => {
  /** The studio's board as the revision module sees it (frames and seed ride in the fingerprint; the director form has neither). */
  const asBoard = (b: StudioBoard, seed = 7): BoardLike => ({
    seed,
    ...(b.clipSec !== undefined ? { clipSec: b.clipSec } : {}),
    scenes: b.scenes.map((sc) => ({ ...sc, frameUrl: `https://cdn.example.com/f${sc.ordinal}.png` })),
    sceneScripts: b.sceneScripts ?? null,
  });
  const approve = (b: StudioBoard) => {
    const like = asBoard(b);
    return approvalForRender(snapshotRevision(like, 'plan', null, Date.parse('2026-10-12T10:00:00Z')), like, Date.parse('2026-10-12T10:00:01Z'));
  };
  const director = (b: StudioBoard) => studioToDirectorStoryboard(b, { id: 'sb-1', quality: 'fast', clipSec: 8, now: NOW });

  it('passes the director form of the very board that was approved (untouched edited text, scripts, 8 s)', () => {
    const b = board();
    expect(checkStoryboardApproval(director(b), approve(b))).toEqual({ ok: true, revision: 1, fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/), sceneCount: 3 });
    // The director's order rules, not the array position (V2).
    const sb = director(b);
    expect(checkStoryboardApproval({ shots: [sb.shots[2]!, sb.shots[0]!, sb.shots[1]!] }, approve(b)).ok).toBe(true);
  });

  it('refuses a scene edited after the tap, a scene added or removed, a reordered board, another length', () => {
    const b = board();
    const approval = approve(b);
    const edited = director(board({ scenes: b.scenes.map((sc, i) => (i === 2 ? { ...sc, prompt: 'a different door', edited: true } : sc)) }));
    expect(checkStoryboardApproval(edited, approval)).toMatchObject({ ok: false, reason: 'scripts_differ', detail: "shot 3's text is not the approved board's scene 3" });
    const added = director(board({ scenes: [...b.scenes, { ordinal: 4, beat: 'Dawn', prompt: 'scene four' }], sceneScripts: [...(b.sceneScripts ?? []), null] }));
    expect(checkStoryboardApproval(added, approval)).toMatchObject({ ok: false, reason: 'scene_count', detail: 'the run asks 4 shot(s), the approved board has 3 scene(s)' });
    const removed = director(board({ scenes: b.scenes.slice(0, 2), sceneScripts: (b.sceneScripts ?? []).slice(0, 2) }));
    expect(checkStoryboardApproval(removed, approval)).toMatchObject({ ok: false, reason: 'scene_count' });
    const reordered = director(board({ scenes: [b.scenes[1]!, b.scenes[0]!, b.scenes[2]!], sceneScripts: ['Script two.', 'Script one.', null] }));
    expect(checkStoryboardApproval(reordered, approval)).toMatchObject({ ok: false, reason: 'scripts_differ', detail: "shot 1's text is not the approved board's scene 1" });
    const longer = director(board({ clipSec: 6 }));
    expect(checkStoryboardApproval(longer, approval)).toMatchObject({ ok: false, reason: 'clip_sec', detail: 'shot 1 asks 6 s, the approved board is on 8 s' });
  });

  it('refuses an approval that is not its board: a stale fingerprint, a missing board, a wrong scene count', () => {
    const b = board();
    const sb = director(b);
    const approval = approve(b);
    const stale = { ...approval, fingerprint: '0123456789abcdef' };
    expect(checkStoryboardApproval(sb, stale)).toMatchObject({ ok: false, reason: 'board_changed', revision: 1, fingerprint: '0123456789abcdef' });
    expect(checkStoryboardApproval(sb, { ...approval, fingerprint: 'nope' })).toMatchObject({ ok: false, reason: 'bad_fingerprint' });
    expect(checkStoryboardApproval(sb, { ...approval, board: { seed: 7, scenes: [] } })).toMatchObject({ ok: false, reason: 'board_changed', detail: 'the approval carries no board' });
    expect(checkStoryboardApproval(sb, { ...approval, sceneCount: 2 })).toMatchObject({ ok: false, reason: 'scene_count' });
    // A board changed and re-fingerprinted by the caller is still not the approved one: the approval names the old fingerprint.
    const changed = asBoard(board({ scenes: b.scenes.map((sc, i) => (i === 0 ? { ...sc, beat: 'Climb faster' } : sc)) }));
    expect(checkStoryboardApproval(sb, { ...approval, board: changed })).toMatchObject({ ok: false, reason: 'board_changed' });
  });
});
