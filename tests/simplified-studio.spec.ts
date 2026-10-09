import { test, expect, type Page } from '@playwright/test';

/**
 * ONE STUDIO, NOTHING BESIDE IT (the owner, 2026-10-09 18:25Z: the „Choose a service" hub and the old „Music Video" page
 * „should not exist at all", /studio „Studio Beta" and „Connectors & plugins" are confusing, and music-video making could
 * not be found in the Video service). In a real browser:
 *   · the retired addresses land in the studio's own tools: /studio → home, #film → Video, #lipsync → Avatar, #hub → chat;
 *   · the sidebar has no Studio Beta row and no Connectors & plugins row;
 *   · „Music video" is a sidebar row of its own under Video, and it opens the Video panel with Music video picked;
 *   · the Video panel shows Film | Music video at its top, and a tap switches it.
 */

test.use({ viewport: { width: 1280, height: 800 } });

async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
}

const tool = (page: Page) => page.locator('html').getAttribute('data-tool');

test('the retired addresses land in the studio\'s own tools', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);

  const res = await page.request.get('/en/studio', { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toMatch(/\/en\/?$/);

  for (const [hash, want] of [['film', 'video'], ['lipsync', 'avatar'], ['hub', 'chat']] as const) {
    await page.goto(`/en/dashboard#${hash}`);
    await expect.poll(() => tool(page), { timeout: 45_000 }).toBe(want);
    expect(new URL(page.url()).hash, `#${hash} is dropped from the address`).toBe('');
    // No three-card hub, no film director: the studio's composer is the page.
    await expect(page.getByText('Choose a service')).toHaveCount(0);
    await expect(page.locator('textarea').first()).toBeVisible();
  }
});

test('the sidebar has no Studio Beta and no Connectors & plugins; Music video has its own row and opens in music-video mode', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);
  await page.goto('/en/dashboard');
  const video = page.locator('[data-tour="tool-video"]').first();
  await expect(video).toBeVisible({ timeout: 45_000 });

  const sidebar = page.locator('aside, nav').filter({ has: video }).first();
  await expect(sidebar.getByText(/Studio\s*Beta/i)).toHaveCount(0);
  await expect(sidebar.getByText(/Connectors|Plugins/i)).toHaveCount(0);

  const row = page.getByTestId('sidebar-service-video.music-video');
  await expect(row).toBeVisible();
  await expect(row).toHaveText(/Music video/);
  await row.click();

  await expect.poll(() => tool(page), { timeout: 30_000 }).toBe('video');
  const panel = page.getByTestId('video-create-panel').filter({ visible: true }).first();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('video-mode-musicvideo')).toHaveAttribute('aria-checked', 'true');
});

test('the Video panel shows Film | Music video at its top, and a tap switches it', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);
  await page.goto('/en/dashboard?tool=video');
  const panel = page.getByTestId('video-create-panel').filter({ visible: true }).first();
  await expect(panel).toBeVisible({ timeout: 45_000 });

  const choice = panel.getByTestId('video-mode-choice');
  await expect(choice).toBeVisible();
  // Above the model card, not hidden in a sheet or a closed disclosure.
  const [c, hero] = await Promise.all([choice.boundingBox(), panel.getByTestId('video-hero').boundingBox()]);
  expect(c!.y).toBeLessThan(hero!.y);

  await expect(panel.getByTestId('video-mode-documentary')).toHaveAttribute('aria-checked', 'true');
  await panel.getByTestId('video-mode-musicvideo').click();
  await expect(panel.getByTestId('video-mode-musicvideo')).toHaveAttribute('aria-checked', 'true');
  // A music video is vertical: the format tile follows.
  await expect(panel.getByTestId('video-tiles')).toContainText('9:16');
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/video-music-mode.png` });
});
