import { test, expect } from '@playwright/test';

// ─── Core Pages Render ─────────────────────────────────────────────

test('homepage renders with main heading', async ({ page }) => {
  await page.goto('/ka');
  await expect(page).toHaveTitle(/Avatar G/i);
  await expect(page.locator('body')).toBeVisible();
});

test('dashboard renders command bar', async ({ page }) => {
  await page.goto('/ka/dashboard');
  await expect(page.getByTestId('command-bar-input')).toBeVisible();
});

test('login page renders auth screen', async ({ page }) => {
  await page.goto('/ka/login');
  await expect(page.locator('body')).toBeVisible();
  // Auth screen should have an email input or login button
  const hasInput = await page.locator('input[type="email"], input[type="text"]').count();
  expect(hasInput).toBeGreaterThanOrEqual(1);
});

test('signup page renders auth screen', async ({ page }) => {
  await page.goto('/ka/signup');
  await expect(page.locator('body')).toBeVisible();
  const hasInput = await page.locator('input[type="email"], input[type="text"]').count();
  expect(hasInput).toBeGreaterThanOrEqual(1);
});

// ─── Language Switch ────────────────────────────────────────────────

test('language switch navigates to correct locale path', async ({ page }) => {
  await page.goto('/ka/dashboard');
  // Attempt to switch to English if the navbar language selector exists
  const enButton = page.locator('button:has-text("ENG"), [data-locale="en"]');
  if (await enButton.count() > 0) {
    await enButton.first().click();
    await page.waitForURL(/\/en\//);
    expect(page.url()).toContain('/en/');
  }
});

// ─── Command Bar Interaction ────────────────────────────────────────

test('command bar accepts input', async ({ page }) => {
  await page.goto('/ka/dashboard');
  const input = page.getByTestId('command-bar-input');
  await input.fill('generate avatar');
  await expect(input).toHaveValue('generate avatar');
});

// ─── Service Grid ───────────────────────────────────────────────────

test('dashboard shows service cards', async ({ page }) => {
  await page.goto('/ka/dashboard');
  const cards = page.getByTestId('service-card');
  // Should have at least some service cards rendered
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(4);
});

// ─── Agent G Page ───────────────────────────────────────────────────

test('agent-g page renders', async ({ page }) => {
  await page.goto('/ka/services/agent-g');
  await expect(page.locator('body')).toBeVisible();
});

// ─── Locale Redirect ────────────────────────────────────────────────

test('bare root redirects to /ka', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/ka/);
  expect(page.url()).toContain('/ka');
});

test('non-locale path redirects to default locale', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/ka\/dashboard/);
  expect(page.url()).toContain('/ka/dashboard');
});
