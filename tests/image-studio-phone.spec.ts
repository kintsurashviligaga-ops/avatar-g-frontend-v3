import { test, expect, type Page } from '@playwright/test';

/**
 * THE IMAGE TOOL ON A PHONE IS ONE SCREEN — in a real browser, with the image routes mocked (nothing is generated or charged).
 *
 * GG's iPhone, 2026-10-16 19:36Z: „სურათის სერვის ორმაგად აჩენს ეკრანზე და შემდეგ ეს იჭედება და არ ვარგა შესახედად ეს
 * პანელი". Choosing Image opened its Create sheet, and about a second later — when the admin's Image Studio access answered —
 * the sheet was swapped for a second, different form with no chat and no composer; its model picker ran past the screen.
 * The contract:
 *
 *   · choosing Image shows the Create sheet, and it stays: the studio's access arriving later changes nothing on screen;
 *   · the studio opens only from its row under „დამატებით", fits a 390 px screen, and Close returns to the Create sheet.
 */

const model = { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (Gemini 3.1 Flash Image)', operations: ['generate', 'edit'],
  aspects: ['1:1', '9:16'], resolutions: ['1K', '2K'] };

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function openImage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
  // The admin's access answers late, as it does over a phone's network.
  await page.route('**/api/image/models', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    await route.fulfill({ json: { userId: 'phone-admin', models: [model] } });
  });
  await page.route('**/api/image/jobs/**', (route) => route.fulfill({ status: 404, json: { ok: false, error: 'not_found' } }));
  await page.goto('/ka/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'image' })));
}

const shown = (page: Page, id: string) => page.evaluate((testId) => [...document.querySelectorAll(`[data-testid="${testId}"]`)]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length, id);

test('choosing Image shows its Create sheet, and it stays when the studio\'s access arrives', async ({ page }) => {
  let modelsAnswered = false;
  page.on('requestfinished', (req) => { if (req.url().endsWith('/api/image/models')) modelsAnswered = true; });
  await openImage(page);
  await expect(page.getByTestId('image-create-panel')).toBeVisible({ timeout: 10_000 });
  for (let i = 0; i < 30; i++) {
    expect(await shown(page, 'image-create-panel'), `Create sheet at sample ${i}`).toBe(1);
    expect(await shown(page, 'image-workspace'), `studio at sample ${i}`).toBe(0);
    await page.waitForTimeout(100);
  }
  expect(modelsAnswered).toBe(true); // the late answer did arrive within the window — and changed nothing
  await page.screenshot({ path: 'test-results/image-studio-phone-1-one-screen.png' });
});

test('the studio opens only from its row, fits a 390 px screen, and Close returns to the Create sheet', async ({ page }) => {
  await openImage(page);
  await expect(page.getByTestId('image-create-panel')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('advanced-toggle').click();
  await page.getByTestId('image-studio-open').click();

  const studio = page.getByTestId('image-workspace');
  await expect(studio).toBeVisible();
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
