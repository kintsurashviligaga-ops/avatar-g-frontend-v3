import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * The studio's ModelPicker in a real browser (components/studio/ui/ModelPicker), on a 390 × 844 phone and a 1280 × 800 desktop:
 *
 *   image   the prompt card's "Model … ▾" opens the sheet; Auto · Nano Banana V2 · Pro can be picked, Soul 2 is listed dimmed
 *           with where it runs; no price in the list; a pick changes the row, survives a reload, and the Generate request
 *           CARRIES THE MODEL ID (`model`) — the id the server validates and quotes.
 *   video   the Model row opens the same sheet with the mode switch on top; a Veo pick changes the film's model (the hero)
 *           and survives a reload.
 *
 * Nothing leaves the machine: the image route and the catalogue status are fulfilled by mocks, and the studio is told it is
 * signed in (the dummy-Supabase dev server has no session). Screenshots: set MODEL_PICKER_SHOTS_DIR (never committed).
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const SHOTS = process.env.MODEL_PICKER_SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Cookie banner, first-run tour and welcome are one-offs that would sit on top of the screen under test. */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
}

/** What this deployment can run, as GET /api/studio/catalogue would answer with STUDIO_V2 on and only Soul 2 enabled. */
async function mockCatalogue(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/api/studio/catalogue**', async (route: Route) => {
    asked.push(new URL(route.request().url()).searchParams.get('service') ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [
        { id: 'nb/auto', available: true, reason: null },
        { id: 'nb/v2', available: true, reason: null },
        { id: 'nb/pro', available: true, reason: null },
        { id: 'hf/soul-2', available: true, reason: null },
        { id: 'google/veo-3.1-lite', available: true, reason: null },
        { id: 'google/veo-3.1-fast', available: true, reason: null },
        { id: 'google/veo-3.1', available: true, reason: null },
        { id: 'hf/kling-3-std-t2v', available: false, reason: 'not_enabled' },
      ] }),
    });
  });
  return asked;
}

interface ImageRequest { prompt?: string; quality?: string; model?: string; aspectRatio?: string }

async function mockImageRoute(page: Page, calls: ImageRequest[]): Promise<void> {
  await page.route('**/api/nanobanana/image', async (route: Route) => {
    calls.push(route.request().postDataJSON() as ImageRequest);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }),
    });
  });
}

/** Chooses a tool the way the sidebar does (`omni:set-tool`) — see tests/ui-image.spec.ts for why not `?tool=`. */
async function openTool(page: Page, tool: 'image' | 'video', panelTestId: string): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: t })), tool);
  await expect(page.getByTestId(panelTestId).first()).toBeVisible({ timeout: 15_000 });
}

async function pretendSignedIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const [name, viewport, phone] of [['phone 390×844', PHONE, true], ['desktop 1280×800', DESKTOP, false]] as const) {
  test.describe(name, () => {
    test.use(phone ? { viewport, hasTouch: true, isMobile: true } : { viewport });
    test.beforeEach(async ({ page }) => { await seed(page); });

    test('image: change the model → the Generate request carries its id; no price in the list; the pick survives a reload', async ({ page }) => {
      const calls: ImageRequest[] = [];
      await mockImageRoute(page, calls);
      const asked = await mockCatalogue(page);
      await openTool(page, 'image', 'image-create-panel');
      await pretendSignedIn(page);
      const panel = page.getByTestId('image-create-panel').filter({ visible: true }).first();
      await expect(panel.getByTestId('model-row')).toContainText('Auto');

      await panel.getByTestId('model-row').click();
      const sheet = page.getByRole('dialog', { name: 'Model' });
      await expect(sheet).toBeVisible();
      await expect.poll(() => asked).toContain('image'); // the status is asked only now, for this service
      const rows = sheet.getByRole('radio');
      await expect(rows).toHaveCount(4);
      await expect(sheet.locator('[data-model="nb/auto"]')).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.locator('[data-model="hf/soul-2"]')).toHaveAttribute('aria-disabled', 'true');
      await expect(sheet.locator('[data-model="hf/soul-2"]')).toContainText('In Studio β');
      await expect(sheet).not.toContainText(/credit/i);
      for (const box of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
      expect(await noSideways(page)).toBe(0);
      await shot(page, `${phone ? 'phone' : 'desktop'}-image-models`);

      await sheet.locator('[data-model="nb/pro"]').click();
      await expect(sheet).toBeHidden();
      await expect(panel.getByTestId('model-row')).toContainText('Nano Banana Pro');
      await expect(panel.getByTestId('chip-quality')).toHaveText('2K');

      await panel.getByTestId('create-prompt').fill('A lighthouse on a cliff at sunset');
      await panel.getByTestId('create-generate').click();
      await expect.poll(() => calls.length).toBe(1);
      expect(calls[0]).toMatchObject({ prompt: 'A lighthouse on a cliff at sunset', quality: 'high', model: 'nb/pro' });

      // Remembered in this browser: a reload opens on the same model, and the next request names it again.
      await openTool(page, 'image', 'image-create-panel');
      await pretendSignedIn(page);
      const again = page.getByTestId('image-create-panel').filter({ visible: true }).first();
      await expect(again.getByTestId('model-row')).toContainText('Nano Banana Pro');
      await again.getByTestId('model-row').click();
      await page.getByRole('dialog', { name: 'Model' }).locator('[data-model="nb/v2"]').click();
      await again.getByTestId('chip-quality').click();
      await page.getByRole('dialog', { name: 'Quality' }).getByRole('radio', { name: /4K/ }).click();
      await again.getByTestId('create-prompt').fill('The same lighthouse, at dawn');
      await again.getByTestId('create-generate').click();
      await expect.poll(() => calls.length).toBe(2);
      expect(calls[1]).toMatchObject({ quality: 'ultra', model: 'nb/v2' });
    });

    test('video: the Model row opens the same picker (mode on top); a Veo pick changes the film\'s model and survives a reload', async ({ page }) => {
      await mockCatalogue(page);
      await openTool(page, 'video', 'video-create-panel');
      const panel = page.getByTestId('video-create-panel').filter({ visible: true }).first();
      await expect(panel.getByTestId('video-hero-title')).toHaveText('VEO 3.1 FAST');

      await panel.getByTestId('video-model-row').click();
      const sheet = page.getByRole('dialog', { name: 'Model' });
      await expect(sheet.getByTestId('video-mode-choice')).toBeVisible();
      await expect(sheet.locator('[data-model="google/veo-3.1-fast"]')).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.locator('[data-model="hf/kling-3-std-t2v"]')).toContainText('Not enabled yet');
      await expect(sheet).not.toContainText(/credit|✦/i);
      expect(await noSideways(page)).toBe(0);
      await shot(page, `${phone ? 'phone' : 'desktop'}-video-models`);

      await sheet.locator('[data-model="google/veo-3.1-lite"]').click();
      await expect(sheet).toBeHidden();
      await expect(panel.getByTestId('video-hero-title')).toHaveText('VEO 3.1 LITE');
      await expect(panel.getByTestId('video-model-row')).toContainText('Veo 3.1 Lite');

      await openTool(page, 'video', 'video-create-panel');
      await expect(page.getByTestId('video-create-panel').filter({ visible: true }).first().getByTestId('video-hero-title')).toHaveText('VEO 3.1 LITE');
    });
  });
}
