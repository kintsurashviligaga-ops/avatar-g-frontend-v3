import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  openStudio, openSidebar, openVideoTool, waitForBoard, say, attachClipsAndTrack, shot, recordFinding, taskView, wav,
  CLIP, JOB_ID, MASTER_URL, QUOTE, QC_REJECTED, ROUTE_CHECK_MS,
} from './_shared';

/**
 * THE REST OF A USER'S DAY WITH VIDEO CORE — round-3 final browser flows, desktop and iPhone 13 (Chromium), every route
 * mocked (tests/video-core/_shared.ts). The contract, per flow:
 *
 *   a · UPLOAD — files picked through the real attach control (the paperclip → the OS file chooser) go up AT ONCE:
 *       POST /api/upload/sign → PUT to the signed storage URL → POST /api/upload/verify, once per file; each chip says
 *       Ready; the montage quote carries exactly the stored paths the sign route handed out. A verify that refuses
 *       (422) or breaks (503) marks the chip Failed with a Retry, says why, and Send refuses to go on: nothing reaches
 *       the quote route or the chat model.
 *   b · STOP — Start → running → Stop (the card's own, or the composer's red Stop) sends exactly ONE cancel to the task
 *       route (POST /api/tasks {action:'cancel', id}); the card ends „stopped" and says the held credits came back;
 *       nothing is re-run, re-quoted or re-cancelled afterwards.
 *   c · DOWNLOAD — a finished montage, and the film's final video, offer Download: it fetches the master and hands the
 *       browser a file. The film's result also offers „Save to library", which posts exactly once.
 *   d · LIBRARY — the sidebar's Library row opens /library, which lists what GET /api/studio/library returns (here: the
 *       finished montage); the montage result itself has no „Save to library" (the job is filed server-side).
 *   e · PHONE — Start, Stop and Retry by touch; a job already running elsewhere (in the tray) must not cover the new
 *       card's Start.
 *   f · KEYBOARD — Tab reaches the composer; Start and Stop are named buttons that work from the keyboard; the error
 *       card's Try again is reachable by Tab and works with Enter.
 */

const FILM_URL = 'https://e2e-media.supabase.co/films/final-master.mp4';
const press = async (el: Locator, isMobile: boolean): Promise<void> => { if (isMobile) await el.tap(); else await el.click(); };

/** The paperclip → the OS file chooser → these files (what a user does; no hidden-input shortcut). */
async function chooseFiles(page: Page, isMobile: boolean, files: Array<{ name: string; mimeType: string; buffer: Buffer }>): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await press(page.getByTestId('composer-attach'), isMobile);
  await (await chooser).setFiles(files);
}
const VIDEO_AND_TRACK = () => [
  { name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP },
  { name: 'song.wav', mimeType: 'audio/wav', buffer: wav() },
];

async function quoted(page: Page): Promise<void> {
  await attachClipsAndTrack(page);
  await say(page, 'cut these to the music');
  await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
}

test.describe('Video Core — upload, stop, download, library, phone, keyboard', () => {
  // ── a · UPLOAD ────────────────────────────────────────────────────────────────────────────────────────────────────
  test('upload: the paperclip → file chooser → sign · PUT · verify per file → chips Ready → the quote carries those paths', async ({ page, isMobile }) => {
    const calls = await openStudio(page);
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await chooseFiles(page, isMobile, VIDEO_AND_TRACK());
    const chips = page.getByTestId('composer-attachment');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    await expect(chips.nth(1)).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    await expect(page.getByTitle(/beach\.webm/).first()).toBeVisible();
    await expect(page.getByTitle(/song\.wav/).first()).toBeVisible();

    expect(calls.sign).toHaveLength(2);
    expect(calls.sign.map((b) => [b.name, b.contentType])).toEqual(expect.arrayContaining([['beach.webm', 'video/webm'], ['song.wav', 'audio/wav']]));
    for (const b of calls.sign) expect(Number(b.size)).toBeGreaterThan(0);
    expect(calls.put).toHaveLength(2); // the bytes went to the signed storage URL, once per file
    expect(calls.verify).toHaveLength(2);
    const verified = Object.fromEntries(calls.verify.map((v) => [v.kind, v.path]));
    expect(Object.keys(verified).sort()).toEqual(['audio', 'video']);

    await say(page, 'cut these to the music');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toHaveLength(1);
    const q = calls.quote[0]!;
    expect(q.names).toEqual(['beach.webm', 'song.wav']);
    expect(q.files).toEqual([verified.video, verified.audio]); // exactly the stored, verified paths, in the user's order
    expect(calls.sign).toHaveLength(2); // the quote re-uploaded nothing
    expect(calls.chat).toHaveLength(0);
  });

  for (const fail of [
    { status: 422, body: { ok: false, error: 'content' }, says: "The file's contents do not match its type" },
    { status: 503, body: { ok: false, error: 'unavailable' }, says: 'File could not be uploaded' },
  ]) {
    test(`upload: a verify that answers ${fail.status} marks the chips Failed with Retry, says why, and nothing is sent`, async ({ page, isMobile }, info) => {
      const calls = await openStudio(page, { verifyFails: { status: fail.status, body: fail.body } });
      await page.waitForTimeout(ROUTE_CHECK_MS);
      await chooseFiles(page, isMobile, VIDEO_AND_TRACK());
      const chips = page.getByTestId('composer-attachment');
      await expect(chips.nth(0)).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
      await expect(chips.nth(1)).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Retry — beach.webm' })).toBeVisible();
      await expect(page.getByText(fail.says).first()).toBeVisible();
      expect(calls.verify).toHaveLength(2);
      if (fail.status === 422 && info.project.name === 'desktop') await shot(page, 'upload-verify-failed');

      await say(page, 'cut these to the music');
      await expect(page.getByText('did not upload — tap Retry on it, or remove it, then send.').first()).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(1_500);
      expect(calls.quote).toHaveLength(0); // nothing reached the quote route
      expect(calls.run).toHaveLength(0);
      expect(calls.chat).toHaveLength(0); // nor the chat model
      await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
      await expect(page.getByTestId('composer-input')).toHaveValue('cut these to the music'); // the words stay
    });
  }

  // ── b · STOP ──────────────────────────────────────────────────────────────────────────────────────────────────────
  for (const where of ['card', 'composer'] as const) {
    test(`stop from the ${where}: one cancel to /api/tasks, the card ends stopped and says the credits came back, nothing re-runs`, async ({ page, isMobile }, info) => {
      const calls = await openStudio(page, {
        quote: { ...QUOTE, credits: 12 },
        taskViews: [taskView({ status: 'running', stage: 'stitch', pct: 40, attempt: 1, cancellable: true })],
      });
      await page.waitForTimeout(ROUTE_CHECK_MS);
      await quoted(page);
      const card = page.getByTestId('agent-montage-card');
      await press(page.getByTestId('agent-montage-start'), isMobile);
      await expect(card).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
      await expect(page.getByTestId('agent-montage-credits')).toHaveText('✦ 12 held, charged only for the result');

      const stop = where === 'card' ? page.getByTestId('agent-montage-stop') : page.getByTestId('composer-stop-job');
      await expect(stop).toBeEnabled({ timeout: 5_000 });
      await press(stop, isMobile);
      await expect.poll(() => calls.cancel.length, { timeout: 10_000 }).toBe(1);
      expect(calls.cancel[0]).toEqual({ action: 'cancel', id: JOB_ID });

      await expect(card).toHaveAttribute('data-phase', 'cancelled', { timeout: 15_000 });
      await expect(page.getByText('Edit stopped.').first()).toBeVisible();
      await expect(page.getByTestId('agent-montage-credits')).toHaveText('Nothing spent: ✦ 12 paid back');
      await expect(page.getByTestId('composer-stop-job')).toHaveCount(0);
      await page.waitForTimeout(2_500);
      expect(calls.cancel).toHaveLength(1); // exactly one cancel
      expect(calls.run).toHaveLength(1); // nothing re-run
      expect(calls.quote).toHaveLength(1); // nothing re-quoted on its own
      if (where === 'card' && info.project.name === 'mobile') await shot(page, 'stopped-paid-back-mobile');
    });
  }

  // ── c · DOWNLOAD ──────────────────────────────────────────────────────────────────────────────────────────────────
  test('download: a finished montage\'s Download fetches the master and hands the browser a file', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page);
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await quoted(page);
    await press(page.getByTestId('agent-montage-start'), isMobile);
    const result = page.getByTestId('agent-montage-result');
    await expect(result.locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });
    const before = calls.media.filter((u) => u.startsWith(MASTER_URL)).length;
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await press(result.getByRole('button', { name: 'Download', exact: true }), isMobile);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^myavatar-montage-\d+\.(mp4|webm)$/);
    expect(calls.media.filter((u) => u.startsWith(MASTER_URL)).length).toBeGreaterThan(before); // the master was fetched for it
    info.annotations.push({ type: 'observed', description: `download name ${file.suggestedFilename()}` });
    await expect(result.getByRole('button', { name: /library/i })).toHaveCount(0);
    expect(calls.librarySaves).toHaveLength(0);
    recordFinding(info, 'montage-no-save-to-library', `The montage result offers Download, Share and Edit but no "Save to library" — by design (components/studio/OmniStudio.tsx ~9686: "the montage job is already a Library item"); the client posts nothing to /api/studio/library (0 saves). The server-side filing itself cannot be seen with mocks. Download file name: ${file.suggestedFilename()}.`);
  });

  test('download + library: the film\'s final video offers Download and Save to library (one POST, then Saved)', async ({ page, isMobile }, info) => {
    const calls = await openStudio(page, { assemble: { status: 200, body: { url: FILM_URL, qa: null } } });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await openVideoTool(page, isMobile);
    await page.getByTestId('video-prompt-input').fill('A quiet harbour at dawn, three fishing boats');
    await page.getByTestId('video-generate').click();
    await waitForBoard(page, 'en', 3);
    await page.getByTestId('storyboard-generate').click();
    await expect.poll(() => calls.assemble.length, { timeout: 30_000 }).toBe(1);
    const video = page.locator(`video[src^="${FILM_URL}"]`).first();
    await expect(video).toBeAttached({ timeout: 30_000 });
    if (!isMobile) await page.keyboard.press('Escape').catch(() => undefined);
    else if (await page.getByTestId('options-sheet').isVisible().catch(() => false)) await page.keyboard.press('Escape');
    const box = page.locator('div', { has: video }).filter({ has: page.getByRole('button', { name: 'Download', exact: true }) }).last();
    const download = page.waitForEvent('download', { timeout: 15_000 });
    await press(box.getByRole('button', { name: 'Download', exact: true }), isMobile);
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^myavatar-video-\d+\.(mp4|webm)$/);
    const save = box.getByRole('button', { name: 'Save to library', exact: true });
    await press(save, isMobile);
    await expect(box.getByRole('button', { name: 'Saved to library', exact: true })).toBeDisabled({ timeout: 10_000 });
    expect(calls.librarySaves).toHaveLength(1);
    expect(calls.librarySaves[0]).toMatchObject({ url: FILM_URL, kind: 'film' });
    await page.waitForTimeout(1_000);
    expect(calls.librarySaves).toHaveLength(1); // once
    if (info.project.name === 'desktop') await shot(page, 'film-final-download-save');
  });

  // ── d · LIBRARY ───────────────────────────────────────────────────────────────────────────────────────────────────
  test('library: the sidebar Library row opens /library and lists the finished montage from GET /api/studio/library', async ({ page, isMobile }, info) => {
    const item = { id: JOB_ID, kind: 'film', url: MASTER_URL, prompt: 'cut these to the music', orientation: 'landscape', createdAt: new Date().toISOString() };
    const calls = await openStudio(page, { library: [item] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await quoted(page);
    await press(page.getByTestId('agent-montage-start'), isMobile);
    await expect(page.getByTestId('agent-montage-result').locator(`video[src^="${MASTER_URL}"]`)).toBeAttached({ timeout: 25_000 });

    await openSidebar(page, isMobile);
    await press(page.getByRole('button', { name: 'Library', exact: true }).first(), isMobile);
    await expect(page).toHaveURL(/\/en\/library/, { timeout: 60_000 });
    await expect.poll(() => calls.libraryReads.some((u) => /kind=film/.test(u)), { timeout: 30_000 }).toBe(true);
    const listed = page.locator(`video[src^="${MASTER_URL}"]`);
    await expect(listed.first()).toBeAttached({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible();
    expect(calls.librarySaves).toHaveLength(0);
    if (info.project.name === 'desktop') await shot(page, 'library-lists-montage');
  });

  // ── e · PHONE ─────────────────────────────────────────────────────────────────────────────────────────────────────
  test('[phone] Start, Stop and Retry by touch; Retry plans again exactly once and runs nothing', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch flow: the iPhone 13 project');
    const calls = await openStudio(page, { taskViews: [taskView({ status: 'running', stage: 'stitch', pct: 40, attempt: 1, cancellable: true })] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await quoted(page);
    const cards = page.getByTestId('agent-montage-card');
    await page.getByTestId('agent-montage-start').tap();
    await expect(cards.first()).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
    await expect(page.getByTestId('agent-montage-stop')).toBeEnabled({ timeout: 5_000 });
    await page.getByTestId('agent-montage-stop').tap();
    await expect(cards.first()).toHaveAttribute('data-phase', 'cancelled', { timeout: 15_000 });
    expect(calls.cancel).toHaveLength(1);
    await page.getByTestId('agent-montage-retry').tap();
    await expect.poll(() => calls.quote.length, { timeout: 15_000 }).toBe(2);
    await expect(cards.last()).toHaveAttribute('data-phase', 'quoted', { timeout: 10_000 });
    await page.waitForTimeout(1_000);
    expect(calls.quote).toHaveLength(2);
    expect(calls.run).toHaveLength(1);
    expect(calls.cancel).toHaveLength(1);
  });

  test('[phone] a job already running elsewhere (in the tray) does not cover the new card\'s Start', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the tray floats over the thread only on a phone-width layout');
    // Round-3 browser defect 7, fixed: the tray publishes --job-tray-h and the thread ends with a spacer of that height
    // (components/studio/JobTray.tsx, OmniStudio job-tray-spacer), so the newest card's Start scrolls clear of the tray.
    const other = { ...taskView({ status: 'running', stage: 'stitch', pct: null, attempt: 1, cancellable: true }), id: '99999999-2222-4333-8444-555555555555' };
    const calls = await openStudio(page, { others: [other] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await expect(page.getByTestId('job-tray')).toBeVisible({ timeout: 20_000 });
    await quoted(page);
    const start = page.getByTestId('agent-montage-start');
    // Scroll the thread as far as it goes so the Start sits as high as it can (the newest card cannot rise further).
    await start.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    // Is the Start's centre the Start, or something drawn over it?
    const hit = await start.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { own: !!top && (top === el || el.contains(top)), over: top?.closest('[data-testid]')?.getAttribute('data-testid') ?? top?.tagName ?? null };
    });
    if (!hit.own) await shot(page, 'phone-tray-covers-start');
    expect(hit, `the Start button's centre is covered by ${hit.over}`).toMatchObject({ own: true });
    await start.tap({ timeout: 10_000 });
    await expect.poll(() => calls.run.length, { timeout: 10_000 }).toBe(1);
  });

  // ── f · KEYBOARD ──────────────────────────────────────────────────────────────────────────────────────────────────
  test('keyboard: Tab reaches the composer; Start and Stop are named buttons that work with Enter', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard navigation: the desktop project');
    const calls = await openStudio(page, { taskViews: [taskView({ status: 'running', stage: 'stitch', pct: 40, attempt: 1, cancellable: true })] });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let reached = false;
    for (let i = 0; i < 60 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'composer-input');
    }
    expect(reached, 'Tab reaches the composer within 60 presses').toBe(true);

    await quoted(page);
    const start = page.getByRole('button', { name: 'Start — Free', exact: true });
    await expect(start).toBeVisible();
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'running', { timeout: 10_000 });
    expect(calls.run).toHaveLength(1);
    const stop = page.getByTestId('agent-montage-card').getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Stop the task', exact: true })).toBeVisible(); // the composer's Stop, named
    await stop.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => calls.cancel.length, { timeout: 10_000 }).toBe(1);
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'cancelled', { timeout: 15_000 });
  });

  test('keyboard: the film error card\'s Try again is reachable by Tab and plans again with Enter', async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'keyboard navigation: the desktop project');
    const calls = await openStudio(page, { assemble: QC_REJECTED });
    await page.waitForTimeout(ROUTE_CHECK_MS);
    await openVideoTool(page, false);
    await page.getByTestId('video-prompt-input').fill('A quiet harbour at dawn, three fishing boats');
    await page.getByTestId('video-generate').click();
    await waitForBoard(page, 'en', 3);
    await page.getByTestId('storyboard-generate').click();
    const card = page.locator('[data-testid="result-card"][data-state="error"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('The master failed its quality check');
    // From the composer, walk backwards with Shift+Tab until the card's Try again has the focus.
    await page.getByTestId('composer-input').focus();
    let onRetry = false;
    for (let i = 0; i < 80 && !onRetry; i += 1) {
      await page.keyboard.press('Shift+Tab');
      onRetry = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return !!el && !!el.closest('[data-testid="result-card"]') && /Try again/.test(el.textContent ?? '');
      });
    }
    expect(onRetry, 'Shift+Tab from the composer reaches the error card\'s Try again').toBe(true);
    if (info.project.name === 'desktop') await shot(page, 'keyboard-focus-try-again');
    const plans = calls.storyboard.filter((b) => b.planOnly).length;
    await page.keyboard.press('Enter');
    await waitForBoard(page, 'en', 3);
    expect(calls.storyboard.filter((b) => b.planOnly)).toHaveLength(plans + 1);
    expect(calls.orchestrate).toHaveLength(1);
    expect(calls.assemble).toHaveLength(1);
  });
});
