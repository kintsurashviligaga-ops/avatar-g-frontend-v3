import { test, expect } from '@playwright/test';

const DASHBOARD_SERVICE_TITLES = [
  'Agent G Core',
  'Business Strategy',
  'Executive Ops',
  'Avatar Studio',
  'Image Generator',
  'Video Generator',
  'Voice Synth',
  'Music Lab',
  'Copy Engine',
  'Workflow Automation',
  'Analytics Hub',
  'Commerce Pilot',
  'Fulfillment HQ',
];

// ─── Dashboard-first routing ──────────────────────────────────────

test('bare root redirects to /ka/dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
  await expect(page.getByText('რით შემიძლია დაგეხმარო?', { exact: false }).first()).toBeVisible({ timeout: 15000 });
});

test('locale root redirects to localized dashboard', async ({ page }) => {
  await page.goto('/ka');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
});

test('non-locale dashboard path redirects to default locale dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
});

// ─── One-window dashboard ─────────────────────────────────────────

test('dashboard switcher exposes current 13-service contract', async ({ page }) => {
  await page.goto('/en/dashboard');

  const serviceSelectorButton = page
    .getByRole('button', { name: /Services|სერვისების სია|Сервисы/i })
    .first();

  await expect(serviceSelectorButton).toBeVisible({ timeout: 15000 });
  await serviceSelectorButton.click();

  const serviceSelector = page.locator('#omni-service-switcher');
  await expect(serviceSelector).toBeVisible();

  const options = serviceSelector.locator('[role="option"]');
  await expect(options).toHaveCount(DASHBOARD_SERVICE_TITLES.length);

  for (const title of DASHBOARD_SERVICE_TITLES) {
    await expect(options.filter({ hasText: title }).first()).toBeVisible();
  }
});

test('service switching updates active service in one-window dashboard', async ({ page }) => {
  await page.goto('/en/dashboard');

  const serviceSelectorButton = page
    .getByRole('button', { name: /Services|სერვისების სია|Сервисы/i })
    .first();

  await expect(serviceSelectorButton).toBeVisible({ timeout: 15000 });
  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Video Generator' }).first().click();

  await expect(page.getByText('Video Generator', { exact: false }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/en\/dashboard\/?$/);

  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Business Strategy' }).first().click();
  await expect(page.getByText('Business Strategy', { exact: false }).first()).toBeVisible();

  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Executive Ops' }).first().click();
  await expect(page.getByText('Executive Ops', { exact: false }).first()).toBeVisible();
});

test('agent g panel renders as a dedicated dashboard route', async ({ page }) => {
  await page.goto('/en/dashboard/agent-g');

  await expect(page.getByRole('heading', { name: /^Agent G$/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('textarea').last()).toBeVisible();
});

// ─── Auth pages ────────────────────────────────────────────────────

test('login page renders an auth input', async ({ page }) => {
  await page.goto('/en/login');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});

test('signup page renders an auth input', async ({ page }) => {
  await page.goto('/en/signup');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});
