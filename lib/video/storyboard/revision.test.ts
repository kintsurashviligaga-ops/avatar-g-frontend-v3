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

// ── The approval on the wire and its check (code level, Video Core v1.0 §5) ──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wire = require('./revision') as typeof import('./revision');

describe('renderScriptsFor — the one derivation of the scene texts the render reads', () => {
  test('an edited scene speaks in its own words, the rest keep their script', () => {
    const b = board({ scenes: [scene(1, 'the sea at dawn'), scene(2, 'MY OWN WORDS', 'https://cdn/f2.jpg', { edited: true }), scene(3, 'the harbour at night')] });
    expect(wire.renderScriptsFor(b)).toEqual(['Wide shot, dawn.', 'MY OWN WORDS', 'Night harbour.']);
  });
  test('no scripts and nothing edited → null (the render writes its own); no scripts but an edit → prompts, the edit in its words', () => {
    expect(wire.renderScriptsFor(board({ sceneScripts: null }))).toBeNull();
    const b = board({ sceneScripts: null, scenes: [scene(1, 'a'), scene(2, 'b', null, { edited: true })] });
    expect(wire.renderScriptsFor(b)).toEqual(['a', 'b']);
  });
  test('a missing (null) script falls back to the scene prompt', () => {
    expect(wire.renderScriptsFor(board({ sceneScripts: ['Wide shot, dawn.', null, 'Night harbour.'] }))).toEqual(['Wide shot, dawn.', 'a boat leaves', 'Night harbour.']);
  });
});

describe('inferOrigin — the origin of a change, read off the diff', () => {
  const b0 = board();
  test.each<[string, BoardLike | null, BoardLike, string]>([
    ['first snapshot', null, b0, 'plan'],
    ['a scene added', b0, board({ scenes: [...b0.scenes, scene(4, 'a new scene')] }), 'add_scene'],
    ['a scene deleted', b0, board({ scenes: b0.scenes.slice(0, 2) }), 'delete_scene'],
    ['a reorder', b0, board({ scenes: [b0.scenes[1]!, b0.scenes[0]!, b0.scenes[2]!].map((s, i) => ({ ...s, ordinal: i + 1 })) }), 'reorder'],
    ['a caption edited', b0, board({ scenes: [scene(1, 'the sea at NOON'), ...b0.scenes.slice(1)] }), 'edit_caption'],
    ['a frame re-rolled', b0, board({ scenes: [scene(1, 'the sea at dawn', 'https://cdn/f1-v2.jpg'), ...b0.scenes.slice(1)] }), 'reroll_frame'],
    ['the first frames landing', board({ scenes: b0.scenes.map((s) => ({ ...s, frameUrl: null })) }), b0, 'frames'],
    ['scripts enriched', b0, board({ sceneScripts: ['Wide shot, dawn, gulls.', 'The boat.', 'Night harbour.'] }), 'enrich'],
    ['nothing the render reads changed', b0, board(), 'plan'],
  ])('%s → %s', (_n, prev, next, origin) => {
    expect(wire.inferOrigin(prev, next)).toBe(origin);
  });
});

describe('approvalForRender → validateRenderApproval: the server accepts the approved board and only it', () => {
  const b = board();
  const rev = snapshotRevision(b, 'plan', null, T0);
  const approval = wire.approvalForRender(rev, b, T0 + 60_000);
  const render = { sceneFrames: b.scenes.map((s) => s.frameUrl as string), sceneScripts: wire.renderScriptsFor(b)!, sceneCount: 3, clipSec: 8 };

  test('the wire carries the approval and only the fingerprinted slice of the board', () => {
    expect(approval).toMatchObject({ revision: 1, fingerprint: rev.fingerprint, sceneCount: 3, nativeSec: 24, approvedAt: '2026-10-12T06:01:00.000Z' });
    expect(approval.board).toEqual({ seed: 4242, clipSec: 8, scenes: rev.scenes, sceneScripts: ['Wide shot, dawn.', 'The boat.', 'Night harbour.'] });
    expect(JSON.stringify(approval.board)).not.toMatch(/uid/);
  });

  test('the approved board with its own frames, scripts, count and grid → ok', () => {
    expect(wire.validateRenderApproval(approval, render)).toEqual({ ok: true, revision: 1, fingerprint: rev.fingerprint, sceneCount: 3 });
    expect(wire.validateRenderApproval(approval, {})).toMatchObject({ ok: true }); // a render that pins nothing is checked on the board alone
    expect(wire.validateRenderApproval(JSON.parse(JSON.stringify(approval)), render)).toMatchObject({ ok: true }); // after the wire
  });

  test('the board edited after the approval → board_changed (the approval names another fingerprint)', () => {
    const edited = { ...approval, board: { ...approval.board, scenes: approval.board.scenes.map((s, i) => (i === 1 ? { ...s, prompt: 'a boat SINKS', edited: true } : s)) } };
    const v = wire.validateRenderApproval(edited, render);
    expect(v).toMatchObject({ ok: false, reason: 'board_changed', revision: 1, fingerprint: rev.fingerprint });
    expect((v as { detail: string }).detail).toMatch(/fingerprints to [0-9a-f]{16}, the approval names/);
  });

  test("another board's approval, a forged fingerprint, no board → refused", () => {
    const other = snapshotRevision(board({ seed: 7 }), 'plan', null, T0);
    expect(wire.validateRenderApproval({ ...approval, fingerprint: other.fingerprint }, render)).toMatchObject({ ok: false, reason: 'board_changed' });
    expect(wire.validateRenderApproval({ ...approval, fingerprint: 'not-a-fingerprint' }, render)).toMatchObject({ ok: false, reason: 'bad_fingerprint' });
    expect(wire.validateRenderApproval({ ...approval, board: { ...approval.board, scenes: [] } }, render)).toMatchObject({ ok: false, reason: 'board_changed' });
  });

  test('a render whose inputs are not the approved board: frames, scripts, scene count, clip length', () => {
    expect(wire.validateRenderApproval(approval, { ...render, sceneFrames: ['https://cdn/f1.jpg', 'https://cdn/OTHER.jpg', 'https://cdn/f3.jpg'] })).toMatchObject({ ok: false, reason: 'frames_differ' });
    expect(wire.validateRenderApproval(approval, { ...render, sceneScripts: ['Wide shot, dawn.', 'The boat.', 'A DIFFERENT ENDING.'] })).toMatchObject({ ok: false, reason: 'scripts_differ' });
    expect(wire.validateRenderApproval(approval, { ...render, sceneScripts: ['Wide shot, dawn.'] })).toMatchObject({ ok: false, reason: 'scripts_differ' });
    expect(wire.validateRenderApproval(approval, { ...render, sceneCount: 4 })).toMatchObject({ ok: false, reason: 'scene_count' });
    expect(wire.validateRenderApproval({ ...approval, sceneCount: 2 }, render)).toMatchObject({ ok: false, reason: 'scene_count' });
    expect(wire.validateRenderApproval(approval, { ...render, clipSec: 6 })).toMatchObject({ ok: false, reason: 'clip_sec' });
  });

  test('a board with no scripts and no edit accepts a render that sends no scripts, and refuses one that invents them', () => {
    const bare = board({ sceneScripts: null });
    const r = snapshotRevision(bare, 'plan', null, T0);
    const a = wire.approvalForRender(r, bare, T0);
    expect(wire.validateRenderApproval(a, { sceneCount: 3, clipSec: 8 })).toMatchObject({ ok: true });
    expect(wire.validateRenderApproval(a, { sceneScripts: ['invented', 'texts', 'here'] })).toMatchObject({ ok: false, reason: 'scripts_differ' });
  });

  test('the refusal in the user’s words names what changed, the revision, and that nothing was rendered or charged', () => {
    const v = wire.validateRenderApproval({ ...approval, fingerprint: '0123456789abcdef' }, render) as Extract<ReturnType<typeof wire.validateRenderApproval>, { ok: false }>;
    expect(wire.describeApprovalRefusal(v, 'ka')).toBe('სთორიბორდი დადასტურების შემდეგ შეიცვალა (რევიზია 1 · 0123456789abcdef. არაფერი არ დარენდერდა და არ ჩამოიჭრა — დაადასტურეთ სთორიბორდი თავიდან.)');
    expect(wire.describeApprovalRefusal(v, 'en')).toMatch(/^the storyboard changed after it was approved \(revision 1 · 0123456789abcdef\. Nothing was rendered or charged/);
    expect(wire.describeApprovalRefusal(v, 'ru')).toMatch(/^раскадровка изменилась после подтверждения/);
  });
});
