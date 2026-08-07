/**
 * ⚠️ STALE — THESE ASSERT A UI THAT NO LONGER EXISTS, AND THEY HAVE BEEN RED FOR A LONG TIME.
 *
 * They look for a "Service hub" button (the service picker moved into the chat-input popup), a
 * hardcoded greeting with the owner's name, and "One Window Dashboard" — a string that appears ZERO
 * times in the source today. Nothing here is a product defect; the product moved and the tests did not.
 *
 * Marked `fixme` rather than deleted so the intent is not lost, and rather than left failing because a
 * permanently-red suite is worse than no suite: it teaches everyone to ignore failures. That is not
 * hypothetical here — a genuinely broken delete shipped and hid among these, and was only caught once a
 * NEW spec ran green beside them. Each of these needs rewriting against the current dashboard.
 */
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

test.fixme('one-window dashboard keeps the route nav contract', async ({ page }) => {
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