import { test, expect, type Page } from '@playwright/test';

/**
 * ONE STUDIO, NOTHING BESIDE IT (the owner, 2026-10-09 18:25Z: the „Choose a service" hub and the old „Music Video" page
 * „should not exist at all", /studio „Studio Beta" and „Connectors & plugins" are confusing, and music-video making could
 * not be found in the Video service). In a real browser:
 *   · the retired addresses land in the studio's own tools: /studio → home, #film → Video, #lipsync → Avatar, #hub → chat;
 *   · the sidebar has no Studio Beta row and no Connectors & plugins row;
 *   · the music video is removed entirely (GG 2026-10-25 16:10Z: the video service is one clip, „like Gemini's Veo"): no
 *     sidebar row, no Film | Music video switch on the panel, an old `?mode=musicvideo` link opens the one-clip panel, and
 *     a music-video brief is one clip's card, never a storyboard.
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
    // No three-card hub, no film director: the studio's composer is the page (in Video its description is on the panel,
    // and the composer's own box steps aside while that panel is open — GG, 2026-10-18).
    await expect(page.getByText('Choose a service')).toHaveCount(0);
    await expect(page.locator('textarea').filter({ visible: true }).first()).toBeVisible();
  }
});

test('the sidebar has no Studio Beta, no Connectors & plugins and no Music video row', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);
  await page.goto('/en/dashboard');
  // The open sidebar's first row is Chat (its service rows live in „+" since the unified composer).
  const chat = page.getByTestId('sidebar-chat').filter({ visible: true }).first();
  await expect(chat).toBeVisible({ timeout: 45_000 });

  const sidebar = page.locator('aside, nav').filter({ has: chat }).first();
  await expect(sidebar.getByText(/Studio\s*Beta/i)).toHaveCount(0);
  await expect(sidebar.getByText(/Connectors|Plugins/i)).toHaveCount(0);
  await expect(page.getByTestId('sidebar-service-video.music-video')).toHaveCount(0);
  await expect(sidebar.getByText(/Music video/i)).toHaveCount(0);
});

test('the Video panel is one clip: no Film | Music video switch, and an old music-video link opens the same panel', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);
  for (const path of ['/en/dashboard?tool=video', '/en/dashboard?tool=video&mode=musicvideo']) {
    await page.goto(path);
    await expect.poll(() => tool(page), { timeout: 45_000 }).toBe('video');
    const panel = page.getByTestId('clip-create-panel').filter({ visible: true }).first();
    if (!(await panel.isVisible().catch(() => false))) await page.getByTestId('options-toggle').click();
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('video-mode-choice')).toHaveCount(0);
    await expect(page.getByTestId('video-mode-musicvideo')).toHaveCount(0);
    await expect(page.getByTestId('video-lipsync')).toHaveCount(0);
    // Lengths of one clip, 8 s picked.
    await expect(panel.getByTestId('clip-panel-len-8')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByTestId('clip-panel-len-10')).toBeVisible();
  }
});

test('a music-video brief in the Video tool is one clip\'s card, never a storyboard', async ({ page }) => {
  test.setTimeout(240_000);
  await quiet(page);
  const briefs: string[] = [];
  await page.route('**/api/film/storyboard**', async (route) => {
    briefs.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/en/dashboard?tool=video');
  await expect.poll(() => tool(page), { timeout: 45_000 }).toBe('video');
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  // The dummy-Supabase dev server has no session; pin "signed in" so Send is not a sign-in wall.
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
  const done = page.getByTestId('video-settings-done');
  if (await done.isVisible().catch(() => false)) await done.click();
  const words = 'A music video: a singer on a rooftop at dusk, soulful blues, golden-hour sunlight';
  await page.getByTestId('composer-input').fill(words);
  await page.getByTestId('run-button').click();
  const card = page.getByTestId('clip-card').last();
  await expect(card).toHaveAttribute('data-phase', 'ask', { timeout: 20_000 });
  await expect(card.getByTestId('clip-prompt')).toHaveText(`„${words}“`);
  await expect(card).toHaveAttribute('data-seconds', '8');
  await expect(page.getByTestId('storyboard-generate')).toHaveCount(0);
  expect(briefs).toEqual([]);
});
