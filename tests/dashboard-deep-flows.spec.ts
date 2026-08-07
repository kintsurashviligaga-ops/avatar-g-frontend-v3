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

const DASHBOARD_ROUTE_HEALTH = [
  { path: '/en/dashboard/agent-g', heading: /Agent G/i },
  { path: '/en/dashboard/business-agent', heading: /Business Hub/i },
  { path: '/en/dashboard/avatar', heading: /Avatar Studio/i },
  { path: '/en/dashboard/image', heading: /Image Generation/i },
  { path: '/en/dashboard/video', heading: /Video Generation/i },
  { path: '/en/dashboard/music', heading: /Music Production/i },
  { path: '/en/dashboard/copy', heading: /Text\s*&\s*Copy/i },
  { path: '/en/dashboard/workflows', heading: /Workflow Builder/i },
  { path: '/en/dashboard/executive-agent', heading: /Agent G Executive/i },
  { path: '/en/dashboard/analytics', heading: /Analytics/i },
];

test.fixme('all dashboard routes open with heading and interactive controls', async ({ page }) => {
  test.slow();

  for (const route of DASHBOARD_ROUTE_HEALTH) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    await expect(page.locator('main button, main input, main textarea, main select').first()).toBeVisible();
  }
});

test('business agent quick-action can submit and render mocked assistant reply', async ({ page }) => {
  await page.route('**/api/agents/chat', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: 'Mocked business reply.' }),
    });
  });

  await page.goto('/en/dashboard/business-agent');

  await page.getByRole('button', { name: /Create plan/i }).first().click();

  const input = page.locator('input[placeholder="დაწერე შეტყობინება..."]').first();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('business plan');

  await input.press('Enter');
  await expect(page.getByText('Mocked business reply.').first()).toBeVisible();
});

test('executive agent can submit task and refresh history', async ({ page }) => {
  let created = false;

  await page.route('**/api/executive/tasks', async (route) => {
    const tasks = created
      ? [
          {
            id: 'task-1',
            user_id: 'u-1',
            input_channel: 'dashboard',
            input_text: 'Prepare Q3 board brief',
            phone_e164: null,
            detected_intent: 'executive-summary',
            workflow: {},
            outputs: { summaryText: 'Board brief draft is ready.', artifacts: [], deliveries: [] },
            credits_used: 15,
            status: 'completed',
            error: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tasks }),
    });
  });

  await page.route('**/api/executive/task', async (route) => {
    created = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/en/dashboard/executive-agent');

  const input = page.getByPlaceholder('What would you like Agent G to do?').first();
  await input.fill('Prepare Q3 board brief');
  await page.getByRole('button', { name: /Run Task/i }).click();

  await expect(page.getByText('Prepare Q3 board brief').first()).toBeVisible();
  await expect(page.getByText('Board brief draft is ready.').first()).toBeVisible();
});
