import { test, expect } from '@playwright/test';
import { fingerprintBoard, isFingerprint, renderScriptsFor, type BoardLike } from '@/lib/video/storyboard/revision';
import { openStudio, openVideoTool, waitForBoard, cancelStoryboard, shot, recordFinding, revisionMismatch, REVISION_MISMATCH_MESSAGE, SB_TITLE, ROUTE_CHECK_MS } from './_shared';

/**
 * THE RENDER IS APPROVED FROM A REVISION — Video Core v1.0 §5, in a real browser, every route mocked:
 *
 *   · the Video tool plans a storyboard (POST /api/film/storyboard planOnly, then a frame per scene); the user edits a
 *     scene's text on the board; Generate sends ONE dispatch whose `storyboardApproval` carries the revision number, a
 *     16-hex fingerprint and the board slice — and that fingerprint equals `fingerprintBoard(board)` recomputed here from
 *     the posted board (lib/video/storyboard/revision), with the edited scene in it, and `sceneScripts` is exactly
 *     `renderScriptsFor(board)`: what is sent is what is checked;
 *   · a server that answers 400 `revision_mismatch` (reason board_changed) is shown as its message with a Retry, and
 *     NOTHING is assembled or dispatched afterwards (zero /api/video/assemble, zero director runs);
 *   · the director path (GET /api/video/director → enabled) posts the same approval to /api/video/director/runs; its
 *     refusal is shown with the message and „Edit storyboard" (no Retry on that path — recorded), the board comes back.
 */

const PROMPT = 'A quiet harbour at dawn, three fishing boats, the first light on the water';
const EDITED = 'Scene 2: the harbour master waves from the end of the pier';

test.describe('Video Core — storyboard approval and revision_mismatch', () => {
  test('Generate sends the approval of the board on screen (fingerprint recomputed here); a revision_mismatch is refused with Retry and nothing runs after it', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page, { orchestrate: () => revisionMismatch() });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await openVideoTool(page, isMobile);
    await page.getByTestId('video-prompt-input').fill(PROMPT);
    await page.getByTestId('video-generate').click();
    await waitForBoard(page, 'en', 3);
    expect(calls.storyboard.filter((b) => b.planOnly)).toHaveLength(1);
    expect(calls.storyboard.filter((b) => b.sceneOrdinal)).toHaveLength(3); // one frame per scene, no retries

    // Edit scene 2 on the board.
    const scene2 = page.getByLabel('Scene 2', { exact: true });
    await scene2.fill(EDITED);
    await scene2.press('Tab');
    await expect(scene2).toHaveValue(EDITED);
    if (!isMobile) await shot(page, 'storyboard-approval');

    // Approve / Render.
    await page.getByTestId('storyboard-generate').click();
    await expect.poll(() => calls.orchestrate.length, { timeout: 20_000 }).toBe(1);
    const dispatch = calls.orchestrate[0]!;
    const approval = dispatch.storyboardApproval as { revision: number; fingerprint: string; board: BoardLike } | undefined;
    expect(approval, 'the dispatch carries storyboardApproval').toBeTruthy();
    expect(isFingerprint(approval!.fingerprint)).toBe(true);
    expect(fingerprintBoard(approval!.board)).toBe(approval!.fingerprint);
    expect(approval!.revision).toBeGreaterThanOrEqual(1);
    const scenes = [...approval!.board.scenes];
    expect(scenes).toHaveLength(3);
    expect(scenes[1]!.prompt).toBe(EDITED);
    expect(scenes[1]!.edited).toBe(true);
    expect(dispatch.sceneScripts).toEqual(renderScriptsFor(approval!.board));
    expect(dispatch.sceneCount).toBe(3);
    info.annotations.push({ type: 'observed', description: `storyboardApproval revision ${approval!.revision} · fingerprint ${approval!.fingerprint} (= fingerprintBoard(board))` });

    // The refusal, with its message and a Retry; nothing after it.
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('the storyboard changed after it was approved');
    const retry = card.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeVisible();
    await page.waitForTimeout(1_500);
    expect(calls.orchestrate).toHaveLength(1); // no second dispatch
    expect(calls.assemble).toHaveLength(0); // nothing assembled
    expect(calls.directorRuns).toHaveLength(0);
    expect(calls.statusReads).toHaveLength(0);
    if (!isMobile) await shot(page, 'revision-mismatch-refusal');

    // Retry plans the storyboard again (free): a new board to approve, not a render.
    const plans = calls.storyboard.filter((b) => b.planOnly).length;
    await retry.click();
    await waitForBoard(page, 'en', 3);
    expect(calls.storyboard.filter((b) => b.planOnly)).toHaveLength(plans + 1);
    expect(calls.orchestrate).toHaveLength(1);
    expect(calls.assemble).toHaveLength(0);
    await cancelStoryboard(page);
    recordFinding(info, 'storyboard-mismatch-retry', `After a revision_mismatch the error card's Retry plans a NEW storyboard (POST /api/film/storyboard planOnly) for the user to approve again; the refused dispatch is never re-sent (orchestrate stayed at 1, assemble at 0). Message shown: "${REVISION_MISMATCH_MESSAGE.slice(0, 60)}…".`);
  });

  test('the director path posts the same approval; its revision_mismatch is shown with the message and Edit storyboard, nothing is dispatched', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page, { director: true });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await openVideoTool(page, isMobile);
    await page.getByTestId('video-prompt-input').fill(PROMPT);
    await page.getByTestId('video-generate').click();
    await waitForBoard(page, 'en', 3);
    const scene2 = page.getByLabel('Scene 2', { exact: true });
    await scene2.fill(EDITED);
    await scene2.press('Tab');
    await page.getByTestId('storyboard-generate').click();

    await expect.poll(() => calls.directorRuns.length, { timeout: 20_000 }).toBe(1);
    const run = calls.directorRuns[0]!;
    const approval = run.storyboardApproval as { revision: number; fingerprint: string; board: BoardLike } | undefined;
    expect(approval, 'the director run carries storyboardApproval').toBeTruthy();
    expect(isFingerprint(approval!.fingerprint)).toBe(true);
    expect(fingerprintBoard(approval!.board)).toBe(approval!.fingerprint);
    const scenes = [...approval!.board.scenes];
    expect(scenes[1]!.prompt).toBe(EDITED);
    expect(scenes[1]!.edited).toBe(true);

    // The refusal: the server's message, the problems, and the way back to the board.
    await expect(page.getByText(REVISION_MISMATCH_MESSAGE)).toBeVisible({ timeout: 15_000 });
    const edit = page.getByRole('button', { name: 'Edit storyboard' });
    await expect(edit).toBeVisible();
    const retry = page.getByRole('button', { name: /^(Try again|Retry)$/ });
    recordFinding(info, 'director-mismatch-no-retry', `The director path's revision_mismatch is shown with the server message and "Edit storyboard" / Close — ${(await retry.count()) ? 'and a Retry' : 'no Retry button (components/studio/video/DirectorRunOverlay.tsx refused state); the way back is the board itself'}.`);
    await page.waitForTimeout(1_000);
    expect(calls.directorRuns).toHaveLength(1);
    expect(calls.orchestrate).toHaveLength(0);
    expect(calls.assemble).toHaveLength(0);

    // Back to the board: the edit is still there; nothing was posted again.
    await edit.click();
    await expect(page.getByRole('heading', { name: SB_TITLE.en })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Scene 2', { exact: true })).toHaveValue(EDITED);
    expect(calls.directorRuns).toHaveLength(1);
    expect(calls.storyboard.filter((b) => b.planOnly)).toHaveLength(1);
    await cancelStoryboard(page);
  });
});
