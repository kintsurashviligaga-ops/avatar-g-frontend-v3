import { test, expect, type Page } from '@playwright/test';

/**
 * THE IMAGE TOOL ON A PHONE IS ONE PANEL — in a real browser, with the image routes mocked (nothing is generated or charged).
 *
 * GG's iPhone, 2026-10-16 19:36Z and 19:55Z: „ჯერ მარცხენა იხსნება და მერე ზემოდან ის მარჯვენა და იჭედება ვეღარ ვთიშავ…
 * უნდა იყოს ერთი და ლამაზი და მარტივად გამოსაყენებელი". Choosing Image opened its Create sheet, and about a second later —
 * when the admin's Image Studio access answered — a second, different form covered it, with no chat, no composer and a
 * close button nobody read as one. The contract:
 *
 *   · choosing Image shows the Create sheet, and only it, for as long as it is open; its ✕ closes it and the chat is back;
 *   · the Image tool offers no second panel; the studio opens only from its own link, fits a 390 px screen, and its
 *     „დახურვა" leaves the Create sheet.
 */

const model = { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (Gemini 3.1 Flash Image)', operations: ['generate', 'edit'],
  aspects: ['1:1', '9:16'], resolutions: ['1K', '2K'] };

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function prepare(page: Page): Promise<{ modelsAsked: () => number }> {
  let asked = 0;
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
  // The admin's access answers late, as it does over a phone's network.
  await page.route('**/api/image/models', async (route) => {
    asked += 1;
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({ json: { userId: 'phone-admin', models: [model] } });
  });
  await page.route('**/api/image/jobs/**', (route) => route.fulfill({ status: 404, json: { ok: false, error: 'not_found' } }));
  return { modelsAsked: () => asked };
}

const shown = (page: Page, id: string) => page.evaluate((testId) => [...document.querySelectorAll(`[data-testid="${testId}"]`)]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length, id);

test('Image keeps the composer until settings opens its Create sheet; ✕ returns to the composer', async ({ page }) => {
  const { modelsAsked } = await prepare(page);
  await page.goto('/ka/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'image' })));
  const settings = page.getByTestId('options-toggle');
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('composer-input')).toBeVisible();
  await settings.click();
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('image-create-panel')).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 30; i++) {
    expect(await shown(page, 'image-create-panel'), `Create sheet at sample ${i}`).toBe(1);
    expect(await shown(page, 'image-workspace'), `second panel at sample ${i}`).toBe(0);
    await page.waitForTimeout(100);
  }
  await page.getByTestId('advanced-toggle').click();
  await expect(page.getByTestId('create-negative')).toBeVisible();
  expect(await page.getByTestId('image-studio-open').count()).toBe(0); // no way to a second panel from the tool
  expect(modelsAsked()).toBe(0); // the tool never waits on the studio's access
  await page.screenshot({ path: 'test-results/image-studio-phone-1-one-panel.png' });

  await page.getByTestId('create-close').click();
  await expect(page.getByTestId('image-create-panel')).toBeHidden();
  await expect(page.getByTestId('composer-bar')).toBeVisible();
});

test('the studio opens only from its own link, fits a 390 px screen, and „დახურვა" leaves the Create sheet', async ({ page }) => {
  await prepare(page);
  await page.goto('/ka/dashboard?tool=image&imageStudio=1', { waitUntil: 'load' });
  const studio = page.getByTestId('image-workspace');
  await expect(studio).toBeVisible({ timeout: 45_000 });
  expect(await shown(page, 'image-create-panel')).toBe(0);
  const box = (await studio.boundingBox())!;
  const rights = await studio.locator('select, textarea, button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
  expect(rights.length).toBeGreaterThan(5);
  for (const right of rights) expect(right).toBeLessThanOrEqual(Math.min(390, box.x + box.width) + 0.5);
  await page.screenshot({ path: 'test-results/image-studio-phone-2-studio.png' });

  await studio.getByRole('button', { name: 'დახურვა', exact: true }).click();
  await expect(studio).toHaveCount(0);
  await expect(page.getByTestId('image-create-panel')).toBeVisible();
});
