import { test, expect } from '@playwright/test';
import {
  openStudio, openVideoTool, waitForBoard, cancelStoryboard, say, attachClipsAndTrack, shot, recordFinding, pinSignedIn, taskView,
  MASTER_URL, QUOTE, QC_REJECTED, MUSIC_UNREADABLE, ROUTE_CHECK_MS,
} from './_shared';

/**
 * THE CARDS TELL THE TRUTH — the Video Core v1.0 round-3 job-card checks, in a real browser on a desktop and on a phone,
 * every route mocked (the task route hands the page one view per read, as a worker would move the job):
 *
 *   · a running montage shows the STAGE the server named (the active step on the card); when the server sends no percent
 *     (pct null) the card prints no "%" — no estimate dressed as a measurement; Stop is offered while it runs;
 *   · after a reload the running job is in the job tray exactly once (GET /api/tasks?active=1), with no card in the fresh
 *     chat — and the tray row must not print a percent the server never sent (asserted; see the test.fail() reason);
 *   · the error states: a montage whose result failed its check (task error qc_failed) says so and shows nothing; its
 *     Retry re-quotes exactly once. The film path's /api/video/assemble answering 502 qc_rejected or 422 music_unreadable
 *     is shown as the server's own reason on an error card with Try again (which plans the storyboard again, never
 *     re-sends the render) and Dismiss (which removes the card);
 *   · a finished 9:16 montage is shown in a vertical frame.
 */

const CUT = 'cut these to the music';
const PROMPT = 'A quiet harbour at dawn, three fishing boats';

async function montageRunning(page: import('@playwright/test').Page): Promise<void> {
  await attachClipsAndTrack(page);
  await say(page, CUT);
  await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
  await page.getByTestId('agent-montage-start').click();
  await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
}

async function filmToAssemble(page: import('@playwright/test').Page, isMobile: boolean): Promise<void> {
  await openVideoTool(page, isMobile);
  await page.getByTestId('video-prompt-input').fill(PROMPT);
  await page.getByTestId('video-generate').click();
  await waitForBoard(page, 'en', 3);
  await page.getByTestId('storyboard-generate').click();
}

test.describe('Video Core — job cards', () => {
  test('a running montage shows its stage and no "%" when the server sends no percent; Stop is offered', async ({ page }, info) => {
    await openStudio(page, { taskViews: [taskView({ status: 'running', stage: 'stitch', pct: null, attempt: 1, cancellable: true })] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await montageRunning(page);
    const card = page.getByTestId('agent-montage-card');
    await expect(card.locator('li[aria-current="step"]')).toHaveAttribute('data-step', 'stitch', { timeout: 15_000 });
    await expect(card.locator('li[data-step="stitch"]')).toContainText('Join the shots'); // the step's own label (the tray says "Joining the shots")
    await page.waitForTimeout(2_500); // a few polls later it is still honest
    const text = (await card.textContent()) ?? '';
    expect(text).not.toMatch(/\d+\s*%/);
    await expect(page.getByTestId('composer-stop-job')).toHaveAttribute('data-kind', 'montage');
    const bar = card.getByRole('progressbar');
    const now = await bar.getAttribute('aria-valuenow');
    recordFinding(info, 'card-progressbar-no-pct', `With pct null from the server the running montage card prints no "%" (stage "Joining the shots" on the active step); its progressbar reports aria-valuenow=${now} (seeded 0 by confirmAgentMontage, never advanced without a server pct).`);
  });

  test('after a reload the running job is in the tray exactly once (live), no card in the fresh chat', async ({ page }) => {
    const calls = await openStudio(page, { taskViews: [taskView({ status: 'running', stage: 'stitch', pct: null, attempt: 1, cancellable: true })], live: true });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await montageRunning(page);
    expect(calls.run).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await pinSignedIn(page);
    const tray = page.getByTestId('job-tray');
    await expect(tray).toBeVisible({ timeout: 20_000 });
    await expect(tray.getByText('Agent G · montage')).toHaveCount(1);
    await expect(tray).toContainText('Joining the shots');
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
    await page.waitForTimeout(2_000);
    await expect(tray.getByText('Agent G · montage')).toHaveCount(1); // still once after more polls
    expect(calls.run).toHaveLength(1); // nothing re-sent
  });

  test('the tray row prints no "%" for a job whose server sends no percent', async ({ page }) => {
    // Round-3 browser defect 2, fixed: the tray's server-observed rows print only a measured percent (measuredOnly).
    await openStudio(page, { taskViews: [taskView({ status: 'running', stage: 'stitch', pct: null, attempt: 1, cancellable: true })], live: true });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await montageRunning(page);
    await page.reload();
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
    await pinSignedIn(page);
    const tray = page.getByTestId('job-tray');
    await expect(tray).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3_000);
    const text = (await tray.textContent()) ?? '';
    expect(text).not.toMatch(/\d+\s*%/);
  });

  test('a montage whose result failed its check says so, shows nothing, and Retry re-quotes exactly once', async ({ page }) => {
    const calls = await openStudio(page, { taskViews: [
      taskView({ status: 'running', stage: 'stitch', pct: 40, attempt: 1, cancellable: true }),
      taskView({ status: 'failed', stage: 'qc', pct: 90, error: 'qc_failed' }),
    ] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await montageRunning(page);
    const cards = page.getByTestId('agent-montage-card');
    await expect(cards.first()).toHaveAttribute('data-phase', 'failed', { timeout: 20_000 });
    await expect(page.getByText('The result failed its check, so I am not showing it. Nothing was charged.')).toBeVisible();
    await expect(page.getByTestId('agent-montage-result')).toHaveCount(0);
    expect(calls.quote).toHaveLength(1);
    expect(calls.run).toHaveLength(1);
    const retry = page.getByTestId('agent-montage-retry');
    await expect(retry).toBeVisible();
    await retry.click();
    await expect.poll(() => calls.quote.length, { timeout: 15_000 }).toBe(2);
    await page.waitForTimeout(1_500);
    expect(calls.quote).toHaveLength(2); // exactly once
    expect(calls.run).toHaveLength(1); // a new PLAN, nothing ran
    await expect(cards.last()).toHaveAttribute('data-phase', 'quoted', { timeout: 10_000 });
    await expect(page.getByTestId('agent-montage-start')).toBeVisible();
  });

  test('film: /api/video/assemble 502 qc_rejected → the reason on an error card; Try again plans again (no re-send); Dismiss removes it', async ({ page, isMobile }) => {
    const calls = await openStudio(page, { assemble: QC_REJECTED });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await filmToAssemble(page, isMobile);
    await expect.poll(() => calls.assemble.length, { timeout: 30_000 }).toBe(1);
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('The master failed its quality check');
    await expect(card).toContainText('frame_count_mismatch');
    expect(calls.orchestrate).toHaveLength(1);
    if (!isMobile) await shot(page, 'qc-rejected-card');

    // Try again: the storyboard is planned again, exactly once; the render is not re-sent.
    const plans = calls.storyboard.filter((b) => b.planOnly).length;
    await card.getByRole('button', { name: 'Try again' }).click();
    await waitForBoard(page, 'en', 3);
    expect(calls.storyboard.filter((b) => b.planOnly)).toHaveLength(plans + 1);
    expect(calls.orchestrate).toHaveLength(1);
    expect(calls.assemble).toHaveLength(1);
    await cancelStoryboard(page);

    // Dismiss removes the card.
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.locator('[data-testid="result-card"]')).toHaveCount(0);
  });

  test('film: /api/video/assemble 422 music_unreadable → the reason on an error card, nothing delivered', async ({ page, isMobile }) => {
    const calls = await openStudio(page, { assemble: MUSIC_UNREADABLE });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await filmToAssemble(page, isMobile);
    await expect.poll(() => calls.assemble.length, { timeout: 30_000 }).toBe(1);
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('The soundtrack could not be read as audio');
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    expect(calls.orchestrate).toHaveLength(1);
    expect(calls.assemble).toHaveLength(1);
    if (!isMobile) await shot(page, 'music-unreadable-card');
  });

  test('film: the server\'s reason for a refused assemble is readable ON the error card, not only in its tooltip', async ({ page, isMobile }) => {
    // Round-3 browser defect 3, fixed: the film's error card carries the route's own sentence alone, unclamped (errorFull).
    const calls = await openStudio(page, { assemble: QC_REJECTED });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await filmToAssemble(page, isMobile);
    await expect.poll(() => calls.assemble.length, { timeout: 30_000 }).toBe(1);
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    const p = card.locator('p[title]').first();
    await expect(p).toContainText('frame_count_mismatch');
    const clipped = await p.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped, 'the reason is clipped out of view').toBe(false);
  });

  test('film: Google declines scenes → the card names the scenes, the rule and the code, and hands over the scene that rendered', async ({ page, isMobile }) => {
    // The ad film of 2026-10-15 (Production, parallel cinema ON): scene 1 rendered, scene 2 was declined by Google's
    // likeness filter (support code 15236754) and the card said "the service may be busy" with nothing to show. This
    // runs in both modes: `NEXT_PUBLIC_PARALLEL_CINEMA=1 next dev` takes the queued-job path that painted over the reason.
    const declined = { category: 'celebrity', codes: ['15236754'] };
    const film = {
      sceneCount: 3, clipSec: 8, seed: 4242, storyboard: 'succeeded', stitch: 'failed', audio: 'skipped', audioUrl: null,
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'https://e2e-media.supabase.co/clips/1.mp4' },
        { ordinal: 2, status: 'failed', url: '', declined },
        { ordinal: 3, status: 'failed', url: '', declined },
      ],
      readyToStitch: false, statusTokenId: 'tok-declined',
    };
    const calls = await openStudio(page, {
      orchestrate: (body) => body.predictionId
        ? { status: 200, body: { success: false, predictionId: 'pred-1', predictionStatus: 'failed', message: '⚠️ ვერ აეწყო — ძალიან ცოტა კლიპი დარჩა', metadata: { film } } }
        : { status: 200, body: { success: true, predictionId: 'pred-1', predictionStatus: 'processing', metadata: { film: { ...film, stitch: 'queued' } } } },
    });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await filmToAssemble(page, isMobile);
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Google declined scenes 2, 3');
    await expect(card).toContainText('well-known public figure');
    await expect(card).toContainText('15236754');
    await expect(card).not.toContainText('may be busy');
    // A paid scene that rendered is handed over, not lost with the cut.
    const scenes = page.getByTestId('film-scene-clips');
    await expect(scenes).toBeVisible();
    await expect(scenes.getByRole('link', { name: /Scene 1/ })).toHaveAttribute('href', 'https://e2e-media.supabase.co/clips/1.mp4');
    await expect(scenes.getByRole('link')).toHaveCount(1);
    expect(calls.assemble).toHaveLength(0);
    await page.waitForTimeout(2_000); // the queued job settles after the bubble: it must not repaint it
    await expect(card).toContainText('Google declined scenes 2, 3');
    await expect(card).not.toContainText('may be busy');
    if (!isMobile) await shot(page, 'film-declined-scenes-card');
  });

  test('a finished 9:16 montage is shown in a vertical frame', async ({ page, isMobile }) => {
    const calls = await openStudio(page, {
      quote: { ...QUOTE, aspect: '9:16' },
      taskViews: [
        taskView({ status: 'running', stage: 'stitch', pct: 55, attempt: 1, cancellable: true }),
        taskView({ status: 'completed', pct: 100, result: { url: MASTER_URL, media: 'video', durationSec: 19.97, aspect: '9:16' } }),
      ],
    });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await montageRunning(page);
    const result = page.getByTestId('agent-montage-result');
    await expect(result.locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'done');
    await expect(result.locator('[class*="aspect-[9/16]"]')).toHaveCount(1);
    await expect(result.locator('[class*="aspect-video"]')).toHaveCount(0);
    expect(calls.run).toHaveLength(1);
    if (!isMobile) await shot(page, 'success-9x16-preview');
  });
});
