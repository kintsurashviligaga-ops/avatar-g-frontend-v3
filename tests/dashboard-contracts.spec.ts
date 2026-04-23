import { expect, test } from '@playwright/test';

const DASHBOARD_SERVICES = [
  'Agent G',
  'Business Agent',
  'Avatar Studio',
  'Video Studio',
  'Music Composer',
  'Image Creator',
  'Photo Studio',
  'Game Creator',
  'Text Generator',
  'Text Intelligence',
  'Prompt Builder',
  'Pipeline Builder',
  'Auto Workflows',
];

test('one-window dashboard keeps the 13-service sidebar contract', async ({ page }) => {
  await page.goto('/ka/dashboard');

  const sidebar = page.locator('aside').first();
  const sidebarText = await sidebar.textContent();
  const presentServices = DASHBOARD_SERVICES.filter((label) => sidebarText?.includes(label));

  expect(presentServices).toHaveLength(DASHBOARD_SERVICES.length);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
});

test('agent g shows a friendly localized quota error and hides disabled controls', async ({ page }) => {
  await page.route('**/api/orbit/agent', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: '429 You exceeded your current quota, please check your plan and billing details.',
      }),
    });
  });

  await page.goto('/ka/dashboard');
  const sidebar = page.locator('aside').first();
  await sidebar.getByRole('button', { name: /Agent G/i }).first().click();

  await expect(page.locator('textarea').last()).toBeVisible();
  await expect(page.locator('svg.lucide-paperclip')).toHaveCount(0);
  await expect(page.locator('svg.lucide-mic-2')).toHaveCount(0);

  await page.locator('textarea').last().fill('გამარჯობა');
  await page.getByRole('button', { name: /გაგზავნა|Send|Отправить/i }).last().click();

  await expect(page.getByText('Agent G დროებით მიუწვდომელია, რადგან AI კვოტა ამოიწურა.').first()).toBeVisible();
});