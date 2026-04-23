import { test, expect } from '@playwright/test';

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

// ─── Dashboard-first routing ──────────────────────────────────────

test('bare root redirects to /ka/dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
  await expect(page.getByText('One Window Dashboard', { exact: false }).first()).toBeVisible();
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

test('dashboard shows the 13-service sidebar', async ({ page }) => {
  await page.goto('/ka/dashboard');

  const sidebar = page.locator('aside').first();
  const sidebarText = await sidebar.textContent();
  const presentServices = DASHBOARD_SERVICES.filter((label) => sidebarText?.includes(label));

  expect(presentServices).toHaveLength(DASHBOARD_SERVICES.length);
  await expect(sidebar.getByText('Agent G', { exact: false }).first()).toBeVisible();
});

test('service switching stays on /ka/dashboard', async ({ page }) => {
  await page.goto('/ka/dashboard');

  const sidebar = page.locator('aside').first();
  await sidebar.getByRole('button', { name: /Video Studio/i }).first().click();

  await expect(page).toHaveURL(/\/ka\/dashboard$/);
  await expect(page.getByText('Video Studio', { exact: false }).first()).toBeVisible();
});

test('agent g panel renders inside the dashboard', async ({ page }) => {
  await page.goto('/ka/dashboard');

  await expect(page.locator('textarea').last()).toBeVisible();
  await expect(page.getByText('Agent G', { exact: false }).first()).toBeVisible();
});

// ─── Locale Switch ─────────────────────────────────────────────────

test('language switch navigates to correct locale path', async ({ page }) => {
  await page.goto('/ka/dashboard');
  await page.getByRole('button', { name: 'EN' }).last().click();
  await page.waitForURL(/\/en\/dashboard$/);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
});

// ─── Auth pages ────────────────────────────────────────────────────

test('login page renders an auth input', async ({ page }) => {
  await page.goto('/ka/login');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});

test('signup page renders an auth input', async ({ page }) => {
  await page.goto('/ka/signup');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});
