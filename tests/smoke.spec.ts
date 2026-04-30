import { test, expect } from '@playwright/test';

const DASHBOARD_SERVICE_TITLES = [
  'Avatar',
  'Video',
  'Image',
  'Music',
  'Game Creation',
  'Interior Design',
  'Prompt Builder',
  'Terminal & Coding',
];

const SERVICE_ALIAS_REDIRECTS: Array<{ alias: string; canonical: string }> = [
  { alias: 'prompt-builder', canonical: 'prompt' },
  { alias: 'game-creation', canonical: 'game' },
  { alias: 'interior-design', canonical: 'interior' },
  { alias: 'terminal-coding', canonical: 'software' },
];

const DASHBOARD_SERVICE_ROUTE_RESOLUTION: Array<{ title: string; alias: string; canonical: string }> = [
  { title: 'Avatar', alias: 'avatar', canonical: 'avatar' },
  { title: 'Video', alias: 'video', canonical: 'video' },
  { title: 'Image', alias: 'image', canonical: 'image' },
  { title: 'Music', alias: 'music', canonical: 'music' },
  { title: 'Game Creation', alias: 'game-creation', canonical: 'game' },
  { title: 'Interior Design', alias: 'interior-design', canonical: 'interior' },
  { title: 'Prompt Builder', alias: 'prompt-builder', canonical: 'prompt' },
  { title: 'Terminal & Coding', alias: 'terminal-coding', canonical: 'software' },
];

// ─── Dashboard-first routing ──────────────────────────────────────

test('bare root redirects to /ka/dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
  await expect(page.getByText('გამარჯობა გიორგი, რით შემიძლია დაგეხმარო?', { exact: false }).first()).toBeVisible({ timeout: 15000 });
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

test('service alias routes redirect to canonical service pages', async ({ page }) => {
  for (const { alias, canonical } of SERVICE_ALIAS_REDIRECTS) {
    await page.goto(`/en/services/${alias}`);

    await expect(page).toHaveURL(new RegExp(`/en/services/${canonical}/?$`));
    await expect(
      page.getByRole('heading', {
        name: /Service not found|სერვისი ვერ მოიძებნა|Сервис не найден/i,
      }),
    ).toHaveCount(0);
  }
});

test('dashboard service hub selections resolve to canonical service routes', async ({ page }) => {
  const serviceSelectorButton = page
    .getByRole('button', { name: /Service hub|სერვისების ჰაბი|Хаб сервисов|Open service hub|სერვის-ჰაბის გახსნა/i })
    .first();

  for (const service of DASHBOARD_SERVICE_ROUTE_RESOLUTION) {
    await page.goto('/en/dashboard');

    await expect(serviceSelectorButton).toBeVisible({ timeout: 15000 });
    await serviceSelectorButton.click();
    await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: service.title }).first().click();

    await expect(page.getByText(service.title, { exact: false }).first()).toBeVisible();

    await page.goto(`/en/services/${service.alias}`);
    await expect(page).toHaveURL(new RegExp(`/en/services/${service.canonical}/?$`));
    await expect(
      page.getByRole('heading', {
        name: /Service not found|სერვისი ვერ მოიძებნა|Сервис не найден/i,
      }),
    ).toHaveCount(0);
  }
});

// ─── One-window dashboard ─────────────────────────────────────────

test('dashboard switcher exposes current 8-service contract', async ({ page }) => {
  await page.goto('/en/dashboard');

  const serviceSelectorButton = page
    .getByRole('button', { name: /Service hub|სერვისების ჰაბი|Хаб сервисов|Open service hub|სერვის-ჰაბის გახსნა/i })
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
    .getByRole('button', { name: /Service hub|სერვისების ჰაბი|Хаб сервисов|Open service hub|სერვის-ჰაბის გახსნა/i })
    .first();

  await expect(serviceSelectorButton).toBeVisible({ timeout: 15000 });
  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Video' }).first().click();

  await expect(page.getByText('Video', { exact: false }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/en\/dashboard\/?$/);

  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Prompt Builder' }).first().click();
  await expect(page.getByText('Prompt Builder', { exact: false }).first()).toBeVisible();

  await serviceSelectorButton.click();
  await page.locator('#omni-service-switcher [role="option"]').filter({ hasText: 'Terminal & Coding' }).first().click();
  await expect(page.getByText('Terminal & Coding', { exact: false }).first()).toBeVisible();
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
