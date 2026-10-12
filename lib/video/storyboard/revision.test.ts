/** @jest-environment node */
/**
 * Video Core v1.0 §5 — the storyboard as a revision: numbered, fingerprinted, approved by number + fingerprint, so a render
 * can be traced to the board the user saw and refused when the board changed under it. Pure module; the persistence is a
 * proposal (docs/handoffs/video-core/proposals/20261012a_storyboard_revisions.sql), not applied.
 */
import {
  REVISION_ORIGINS, approvalMatches, approveRevision, canonicalBoard, diffRevisions, fingerprintBoard, isFingerprint, snapshotRevision,
  type BoardLike,
} from './revision';

const scene = (ordinal: number, prompt: string, frameUrl: string | null = `https://cdn/f${ordinal}.jpg`, extra: Record<string, unknown> = {}) =>
  ({ uid: `sc${ordinal}`, ordinal, beat: `beat ${ordinal}`, prompt, frameUrl, ...extra });

const board = (over: Partial<BoardLike> = {}): BoardLike => ({
  seed: 4242,
  clipSec: 8,
  scenes: [scene(1, 'the sea at dawn'), scene(2, 'a boat leaves'), scene(3, 'the harbour at night')],
  sceneScripts: ['Wide shot, dawn.', 'The boat.', 'Night harbour.'],
  ...over,
});

const T0 = Date.UTC(2026, 9, 12, 6, 0, 0);

describe('the first snapshot is revision 1 of the board the render reads', () => {
  test('3 × 8 s scenes → nativeSec 24, a 16-hex fingerprint, parent none', () => {
    const r1 = snapshotRevision(board(), 'plan', null, T0);
    expect(r1).toMatchObject({ revision: 1, parentRevision: null, origin: 'plan', seed: 4242, clipSec: 8, sceneCount: 3, nativeSec: 24, createdAt: '2026-10-12T06:00:00.000Z' });
    expect(isFingerprint(r1.fingerprint)).toBe(true);
    expect(r1.scenes[0]).toEqual({ ordinal: 1, beat: 'beat 1', prompt: 'the sea at dawn', frameUrl: 'https://cdn/f1.jpg', edited: false, anchored: false });
    expect(r1.sceneScripts).toEqual(['Wide shot, dawn.', 'The boat.', 'Night harbour.']);
  });
  test('no clipSec on the board → the 8 s scene grid; a 6 s board is 6 s', () => {
    expect(snapshotRevision(board({ clipSec: undefined }), 'plan', null, T0)).toMatchObject({ clipSec: 8, nativeSec: 24 });
    expect(snapshotRevision(board({ clipSec: 6 }), 'plan', null, T0)).toMatchObject({ clipSec: 6, nativeSec: 18 });
  });
  test('every origin the board can change by is named', () => {
    expect(REVISION_ORIGINS).toEqual(expect.arrayContaining(['plan', 'enrich', 'frames', 'edit_caption', 'reroll_frame', 'reorder', 'add_scene', 'delete_scene', 'base_image', 'regenerate']));
  });
});

describe('the fingerprint is of the content, not of the object', () => {
  test('React keys, pending frames list, base images and frame prompts are not in it; key order is not in it', () => {
    const a = board();
    const b: BoardLike = {
      sceneScripts: [...a.sceneScripts!],
      scenes: a.scenes.map((s) => ({ frameUrl: s.frameUrl, prompt: s.prompt, beat: s.beat, ordinal: s.ordinal, uid: 'other', baseImage: 'data:…' })) as BoardLike['scenes'],
      clipSec: 8,
      seed: 4242,
    };
    expect(fingerprintBoard(b)).toBe(fingerprintBoard(a));
    expect(canonicalBoard(b)).toBe(canonicalBoard(a));
  });
  test('scene order in the array does not matter, the ordinals do', () => {
    const a = board();
    const shuffled = board({ scenes: [a.scenes[2], a.scenes[0], a.scenes[1]] });
    expect(fingerprintBoard(shuffled)).toBe(fingerprintBoard(a));
  });
  test('a caption, a frame, a script, the seed, the clip length each change it', () => {
    const base = fingerprintBoard(board());
    expect(fingerprintBoard(board({ scenes: [scene(1, 'the sea at DUSK'), scene(2, 'a boat leaves'), scene(3, 'the harbour at night')] }))).not.toBe(base);
    expect(fingerprintBoard(board({ scenes: [scene(1, 'the sea at dawn', 'https://cdn/other.jpg'), scene(2, 'a boat leaves'), scene(3, 'the harbour at night')] }))).not.toBe(base);
    expect(fingerprintBoard(board({ sceneScripts: ['Wide shot, dawn.', 'The boat, closer.', 'Night harbour.'] }))).not.toBe(base);
    expect(fingerprintBoard(board({ seed: 7 }))).not.toBe(base);
    expect(fingerprintBoard(board({ clipSec: 6 }))).not.toBe(base);
  });
  test('a frame still pending (null) and a frame that landed are different boards', () => {
    expect(fingerprintBoard(board({ scenes: [scene(1, 'the sea at dawn', null), scene(2, 'a boat leaves'), scene(3, 'the harbour at night')] }))).not.toBe(fingerprintBoard(board()));
  });
});

describe('a change that changes nothing is not a revision; a real change is the next one', () => {
  test('the same board after an "edit" keeps revision 1', () => {
    const r1 = snapshotRevision(board(), 'plan', null, T0);
    expect(snapshotRevision(board(), 'edit_caption', r1, T0 + 1000)).toBe(r1);
  });
  test('an edited caption is revision 2 with parent 1; a re-rolled frame is 3 with parent 2', () => {
    const r1 = snapshotRevision(board(), 'plan', null, T0);
    const edited = board({ scenes: [scene(1, 'the sea at dawn'), scene(2, 'a boat leaves the harbour', 'https://cdn/f2.jpg', { edited: true }), scene(3, 'the harbour at night')] });
    const r2 = snapshotRevision(edited, 'edit_caption', r1, T0 + 5000);
    expect(r2).toMatchObject({ revision: 2, parentRevision: 1, origin: 'edit_caption', createdAt: '2026-10-12T06:00:05.000Z' });
    expect(r2.scenes[1]).toMatchObject({ prompt: 'a boat leaves the harbour', edited: true });
    const rerolled = board({ scenes: [edited.scenes[0], edited.scenes[1], scene(3, 'the harbour at night', 'https://cdn/f3-v2.jpg')] });
    const r3 = snapshotRevision(rerolled, 'reroll_frame', r2, T0 + 9000);
    expect(r3).toMatchObject({ revision: 3, parentRevision: 2, origin: 'reroll_frame' });
    expect(new Set([r1.fingerprint, r2.fingerprint, r3.fingerprint]).size).toBe(3);
  });
});

describe('the approval names the revision, and the render matches the board against it', () => {
  test('approved board → matches; a re-roll after the approval → does not', () => {
    const r1 = snapshotRevision(board(), 'frames', null, T0);
    const ok = approveRevision(r1, T0 + 60_000);
    expect(ok).toEqual({ revision: 1, fingerprint: r1.fingerprint, sceneCount: 3, nativeSec: 24, approvedAt: '2026-10-12T06:01:00.000Z' });
    expect(approvalMatches(ok, board())).toBe(true);
    expect(approvalMatches(ok, board({ scenes: [scene(1, 'the sea at dawn', 'https://cdn/f1-v2.jpg'), scene(2, 'a boat leaves'), scene(3, 'the harbour at night')] }))).toBe(false);
    expect(approvalMatches({ fingerprint: 'not a fingerprint' }, board())).toBe(false);
  });
});

describe('the diff says what the user did', () => {
  test('a caption edit', () => {
    const d = diffRevisions(board(), board({ scenes: [scene(1, 'the sea at dawn'), scene(2, 'a boat leaves, slowly'), scene(3, 'the harbour at night')] }));
    expect(d).toMatchObject({ added: [], removed: [], changedCaption: [2], changedFrame: [], reordered: false, scriptsChanged: false, same: false });
  });
  test('a re-rolled frame', () => {
    const d = diffRevisions(board(), board({ scenes: [scene(1, 'the sea at dawn'), scene(2, 'a boat leaves'), scene(3, 'the harbour at night', 'https://cdn/f3-v2.jpg')] }));
    expect(d).toMatchObject({ changedCaption: [], changedFrame: [3], reordered: false });
  });
  test('a reorder is a reorder, not three edits', () => {
    const a = board();
    const moved = board({ scenes: [{ ...a.scenes[1], ordinal: 1 }, { ...a.scenes[0], ordinal: 2 }, { ...a.scenes[2], ordinal: 3 }] });
    expect(diffRevisions(a, moved)).toMatchObject({ added: [], removed: [], changedCaption: [], changedFrame: [], reordered: true, same: false });
  });
  test('an added scene, a deleted scene, a changed script', () => {
    expect(diffRevisions(board(), board({ scenes: [...board().scenes, scene(4, 'credits')] }))).toMatchObject({ added: [4], removed: [], reordered: false });
    expect(diffRevisions(board(), board({ scenes: board().scenes.slice(0, 2) }))).toMatchObject({ added: [], removed: [3], reordered: false });
    expect(diffRevisions(board(), board({ sceneScripts: ['Wide shot, dawn.', 'The boat.', null] }))).toMatchObject({ scriptsChanged: true });
  });
  test('the same board', () => {
    expect(diffRevisions(board(), board())).toMatchObject({ same: true, added: [], removed: [], changedCaption: [], changedFrame: [], reordered: false, scriptsChanged: false });
  });
});
