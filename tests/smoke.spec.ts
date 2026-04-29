import { test, expect } from '@playwright/test';

const DASHBOARD_NAV_LINKS = [
  { label: 'Agent G', href: '/en/dashboard/agent-g' },
  { label: 'Business Agent', href: '/en/dashboard/business-agent' },
  { label: 'Avatar Studio', href: '/en/dashboard/avatar' },
  { label: 'Image Generation', href: '/en/dashboard/image' },
  { label: 'Video Generation', href: '/en/dashboard/video' },
  { label: 'Music Production', href: '/en/dashboard/music' },
  { label: 'Text & Copy', href: '/en/dashboard/copy' },
  { label: 'Workflow Builder', href: '/en/dashboard/workflows' },
  { label: 'Executive Agent', href: '/en/dashboard/executive-agent' },
  { label: 'Analytics', href: '/en/dashboard/analytics' },
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

test('dashboard shows the current nav contract including new agents', async ({ page }) => {
  await page.goto('/en/dashboard');

  const sidebar = page.locator('aside').first();
  for (const link of DASHBOARD_NAV_LINKS) {
    await expect(sidebar.locator(`a[href="${link.href}"]`).first()).toBeVisible();
  }
  await expect(sidebar.getByText('Agent G', { exact: false }).first()).toBeVisible();
});

test('service switching opens target routes from sidebar links', async ({ page }) => {
  await page.goto('/en/dashboard');

  const sidebar = page.locator('aside').first();
  await sidebar.locator('a[href="/en/dashboard/video"]').first().click();

  await expect(page).toHaveURL(/\/en\/dashboard\/video$/);
  await expect(page.getByRole('heading', { name: /Video Generation/i }).first()).toBeVisible();

  await sidebar.locator('a[href="/en/dashboard/business-agent"]').first().click();
  await expect(page).toHaveURL(/\/en\/dashboard\/business-agent$/);
  await expect(page.getByRole('heading', { name: /Business Hub/i }).first()).toBeVisible();

  await sidebar.locator('a[href="/en/dashboard/executive-agent"]').first().click();
  await expect(page).toHaveURL(/\/en\/dashboard\/executive-agent$/);
  await expect(page.getByRole('heading', { name: /Agent G Executive/i }).first()).toBeVisible();
});

test('agent g panel renders as a dedicated dashboard route', async ({ page }) => {
  await page.goto('/en/dashboard/agent-g');

  await expect(page.getByRole('heading', { name: /^Agent G$/ }).first()).toBeVisible();
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
