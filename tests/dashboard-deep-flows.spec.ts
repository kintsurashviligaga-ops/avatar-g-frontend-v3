import { expect, test, type Page } from '@playwright/test';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z6mQAAAAASUVORK5CYII=';

async function openDashboardWithActiveService(page: Page, serviceId: string) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('myavatar.one-window.active-service', value);
  }, serviceId);

  await page.goto('/en/dashboard');
  await page.waitForURL(/\/en\/dashboard$/);
}

test('workflow template run completes inside one-window dashboard', async ({ page }) => {
  test.slow();

  await openDashboardWithActiveService(page, 'workflow');

  await expect(page.getByText('Pipeline Builder', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: /Brand Video/i }).click();
  await expect(page.getByText('Generate Avatar', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: /Run Pipeline/i }).click();
  await expect(page.getByText(/Pipeline complete!/i)).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('photo workspace accepts upload and renders mocked output preview', async ({ page }) => {
  await page.route('**/api/replicate/photo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'succeeded',
        output: `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`,
      }),
    });
  });

  await openDashboardWithActiveService(page, 'photo');

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
  });

  await page.getByRole('button', { name: /Enhance Photo/i }).click();

  await expect(page.locator('img[src^="data:image/png;base64,"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Download latest output/i })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('business workspace submits and renders a mocked report', async ({ page }) => {
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          response: 'Executive summary: grow B2B channel by 22% in 90 days.',
        },
      }),
    });
  });

  await openDashboardWithActiveService(page, 'business');

  await page
    .getByPlaceholder('What business insight do you need?')
    .fill('Create a go-to-market plan for a Georgian SaaS product.');

  await page.getByRole('button', { name: /Generate Report/i }).click();

  await expect(page.getByText('Executive summary: grow B2B channel by 22% in 90 days.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});
