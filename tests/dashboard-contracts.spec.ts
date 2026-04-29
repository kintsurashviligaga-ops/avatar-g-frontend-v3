import { expect, test } from '@playwright/test';

const DASHBOARD_NAV_LINKS = [
  '/en/dashboard/agent-g',
  '/en/dashboard/business-agent',
  '/en/dashboard/avatar',
  '/en/dashboard/image',
  '/en/dashboard/video',
  '/en/dashboard/music',
  '/en/dashboard/copy',
  '/en/dashboard/workflows',
  '/en/dashboard/executive-agent',
  '/en/dashboard/analytics',
];

test('one-window dashboard keeps the route nav contract', async ({ page }) => {
  await page.goto('/en/dashboard');

  const sidebar = page.locator('aside').first();
  await expect(page.getByText('One Window Dashboard', { exact: false }).first()).toBeVisible();
  for (const href of DASHBOARD_NAV_LINKS) {
    await expect(sidebar.locator(`a[href="${href}"]`).first()).toBeVisible();
  }

  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

test('agent g shows a graceful error message when chat API fails', async ({ page }) => {
  await page.route('**/api/agent-g/chat', async (route) => {
    await route.abort();
  });

  await page.goto('/ka/dashboard/agent-g');

  const input = page.getByPlaceholder('დაწერე შეტყობინება Agent G-ს...').first();
  await expect(input).toBeVisible();

  await input.fill('გამარჯობა');
  await input.press('Enter');

  await expect(page.getByText('კავშირის შეცდომა. სცადეთ კვლავ.').first()).toBeVisible();
});