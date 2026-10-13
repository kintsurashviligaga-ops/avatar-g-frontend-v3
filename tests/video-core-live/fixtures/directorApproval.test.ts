/** @jest-environment node */
// The director-run payload the live E2E posts (tests/video-core-live/recovery.spec.ts): a studio board's storyboard and
// the approval of that board's revision, built with the product's own helpers. The JSON beside this file is what the
// live spec sends (it runs outside Jest and must not import server code); this test keeps the two from drifting.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
jest.mock('server-only', () => ({}));
import { checkStoryboardApproval, studioToDirectorStoryboard, type StudioBoard } from '../../../lib/video/director/fromStudio';
import { approvalForRender, snapshotRevision, type BoardLike } from '../../../lib/video/storyboard/revision';

const FILE = join(__dirname, 'director-approval.json');

function build() {
  const board: StudioBoard = {
    filmPrompt: 'A lighthouse keeper at dusk (Video Core live E2E)',
    refs: [],
    orientation: 'portrait',
    scenes: [
      { ordinal: 1, beat: 'Climb', prompt: 'The keeper climbs the spiral stairs' },
      { ordinal: 2, beat: 'Lamp', prompt: 'ლამპა ინთება' },
    ],
    sceneScripts: ['He climbs.', null],
    clipSec: 8,
  };
  const like: BoardLike = { seed: 7, clipSec: 8, scenes: board.scenes.map((sc) => ({ ...sc, frameUrl: null })), sceneScripts: board.sceneScripts };
  const approval = approvalForRender(snapshotRevision(like, 'plan', null, 1_760_000_000_000), like, 1_760_000_001_000);
  // createdAt is the moment of conversion; pinned so the committed file is stable (the approval does not cover it).
  const storyboard = { ...studioToDirectorStoryboard(board, { id: 'vc-live-board', quality: 'fast', clipSec: 8 }), createdAt: '2026-10-13T00:00:00.000Z' };
  return { storyboard, approval };
}

test('the committed director-approval fixture is the approved revision of its board, and an edited shot is refused', () => {
  const fresh = build();
  if (process.env.WRITE_FIXTURE === '1') writeFileSync(FILE, `${JSON.stringify(fresh, null, 2)}\n`);
  const committed = JSON.parse(readFileSync(FILE, 'utf8')) as ReturnType<typeof build>;
  expect(committed).toEqual(JSON.parse(JSON.stringify(fresh)));
  expect(checkStoryboardApproval(committed.storyboard as never, committed.approval as never).ok).toBe(true);
  const edited = JSON.parse(JSON.stringify(committed.storyboard)) as { shots: Array<{ prompt: string }> };
  edited.shots[1]!.prompt = 'a different lamp';
  expect(checkStoryboardApproval(edited as never, committed.approval as never)).toMatchObject({ ok: false, reason: 'scripts_differ' });
  // The other refusal the live spec sends: the right board under an approval of some other revision of it.
  const stale = { ...committed.approval, fingerprint: '0123456789abcdef' };
  expect(checkStoryboardApproval(committed.storyboard as never, stale as never)).toMatchObject({ ok: false, reason: 'board_changed' });
});
