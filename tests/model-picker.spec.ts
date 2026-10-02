import { test, expect, type Page, type Route } from '@playwright/test';
import { MODELS, publicModel } from '@/lib/providers/registry';

/**
 * The studio's ModelPicker in a real browser (components/studio/ui/ModelPicker), on a 390 × 844 phone and a 1280 × 800 desktop:
 *
 *   image   the prompt card's "Model … ▾" opens the sheet; Google first (Auto · Nano Banana V2 · Pro, Auto the default), then
 *           the Higgsfield image models — Soul 2 open (this mocked deployment runs it), the rest dimmed "not enabled"; no price
 *           in the list; a Google pick changes the row, survives a reload, and the Generate request CARRIES THE MODEL ID
 *           (`model`) — the id the server validates and quotes.
 *   higgs   a Higgsfield pick swaps Generate for the saga's: the server's estimate on the button, and the tap sends
 *           POST /api/generate { modelId, params, confirmedGel } — the model id and the price the user saw.
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

/** Studio β's saga for this deployment: its model list (Soul 2 enabled), an estimate, a start and a finished job. */
async function mockStudioSaga(page: Page): Promise<Array<Record<string, unknown>>> {
  const starts: Array<Record<string, unknown>> = [];
  const price = { credits: 13, gel: 1.3, display: '1.30 ₾' };
  const job = {
    id: '11111111-1111-4111-8111-111111111111', status: 'queued', service: 'image', modelId: 'hf/soul-2', priceGel: 1.3, credits: 13,
    refunded: false, errorCode: null, promptOriginal: null, promptSent: null, outputUrls: [], createdAt: '2026-10-02T10:00:00Z', completedAt: null,
  };
  await page.route('**/api/studio/models**', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ models: MODELS.filter((m) => m.id === 'hf/soul-2').map(publicModel) }),
  }));
  await page.route('**/api/estimate', (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelId: 'hf/soul-2', price }) }));
  await page.route('**/api/generate', async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [] }) });
    starts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job, price }) });
  });
  await page.route('**/api/generate/*', (route: Route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ job: { ...job, status: 'completed', outputUrls: [new URL('/templates/image/product.jpg', page.url()).toString()] } }),
  }));
  return starts;
}

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
      await expect(rows.first()).toHaveAttribute('data-model', 'nb/auto'); // Google first, and the default
      await expect(sheet.locator('[data-model="nb/auto"]')).toHaveAttribute('aria-checked', 'true');
      await expect(sheet.locator('[data-model="hf/soul-2"]')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(sheet.locator('[data-model="hf/soul"]')).toHaveAttribute('aria-disabled', 'true');
      await expect(sheet.locator('[data-model="hf/soul"]')).toContainText('Not enabled yet');
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

    test('Higgsfield: a pick swaps Generate for the saga\'s — the server\'s price on the button, and the tap sends the model id and that price', async ({ page }) => {
      await mockCatalogue(page);
      const starts = await mockStudioSaga(page);
      await openTool(page, 'image', 'image-create-panel');
      await pretendSignedIn(page);
      const panel = page.getByTestId('image-create-panel').filter({ visible: true }).first();
      await panel.getByTestId('model-row').click();
      await page.getByRole('dialog', { name: 'Model' }).locator('[data-model="hf/soul-2"]').click();
      await expect(panel.getByTestId('model-row')).toContainText('Soul 2');
      await expect(panel.getByTestId('hf-generate')).toHaveAttribute('data-model', 'hf/soul-2');
      await panel.getByTestId('create-prompt').fill('An editorial portrait in soft daylight');
      const go = panel.getByTestId('create-generate');
      await expect(go).toHaveAttribute('data-price', '13', { timeout: 15_000 }); // the server's estimate, not a client number
      await expect(panel.getByTestId('hf-summary')).toContainText('Soul 2');
      expect(await noSideways(page)).toBe(0);
      await shot(page, `${phone ? 'phone' : 'desktop'}-higgsfield-priced`);
      await go.click();
      await expect.poll(() => starts.length).toBe(1);
      expect(starts[0]).toMatchObject({
        modelId: 'hf/soul-2',
        params: { prompt: 'An editorial portrait in soft daylight', aspect_ratio: '1:1', resolution: '1080p' },
        confirmedGel: 1.3,
      });
      await expect(panel.getByTestId('hf-job')).toHaveAttribute('data-status', 'completed', { timeout: 20_000 });
      await shot(page, `${phone ? 'phone' : 'desktop'}-higgsfield-done`);
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
