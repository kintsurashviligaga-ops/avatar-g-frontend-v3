/**
 * v5.1 Phase 9: UI tests for the Live Agent Workspace preview (/{lang}/admin/agent-workspace), MOCKED. The page replays
 * two invented runs (lib/agent/liveWorkspace/mock): a research plan that waits for one spend tap, and a Browser Agent
 * run that stops at a card field for an explicit tap. Nothing runs and nothing is spent. Matrix: docs/v5.1-phase9
 * /00-mocked-e2e.md, UI-01…UI-08.
 */
import { expect, test, type Page } from '@playwright/test';

const PLAN = '[data-approval="apr_plan_wine"]';
const PAY = '[data-approval="apr_pay_train"]';
const WINE = '[data-testid="run-timeline"][data-run="run_wine"]';
const TRAIN = '[data-testid="run-timeline"][data-run="run_train"]';

async function open(page: Page, lang = 'ka') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${lang}/admin/agent-workspace`, { waitUntil: 'load' });
  await expect(page.getByTestId('live-workspace')).toBeVisible({ timeout: 60_000 });
  return errors;
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1360, height: 1400 } });

  test('UI-01 the mock banner says nothing runs; both runs wait for a tap before anything is spent', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('mock-banner')).toContainText('სადემონსტრაციო მონაცემები');
    await expect(page.locator(PLAN)).toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
    await expect(page.locator(PAY)).toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
    await expect(page.locator(PLAN)).toHaveAttribute('data-kind', 'spend');
    await expect(page.locator(PAY)).toHaveAttribute('data-kind', 'sensitive');
    await expect(page.getByTestId('approval-count')).toHaveText('2');
    // held: the searches have not started without the yes
    await page.waitForTimeout(1500);
    await expect(page.locator(`${WINE} li[data-step="s1"]`)).not.toHaveAttribute('data-state', 'active');
    await expect(page.locator(`${WINE} [data-testid="run-credits"]`)).toContainText('0');
    expect(errors).toEqual([]);
  });

  test('UI-02 a yes to the plan runs the two searches side by side, then the run is delivered', async ({ page }) => {
    await open(page);
    await page.locator(`${PLAN} [data-testid="approval-approve"]`).click({ timeout: 15_000 });
    await expect(page.locator(PLAN)).toHaveAttribute('data-state', 'approved');
    await expect(page.locator(`${WINE} li[data-step="s1"]`)).toHaveAttribute('data-state', 'active', { timeout: 5_000 });
    await expect(page.locator(`${WINE} li[data-step="s2"]`)).toHaveAttribute('data-state', 'active');
    await expect(page.locator(`${WINE} [data-testid="parallel-mark"]`).first()).toBeVisible();
    await expect(page.locator(WINE)).toHaveAttribute('data-state', /delivered|settled/, { timeout: 20_000 });
    await expect(page.locator(`${WINE} li[data-step="lib"]`)).toHaveAttribute('data-state', 'done');
  });

  test('UI-03 a decline on the card-field step ends that run honestly and skips the held step', async ({ page }) => {
    await open(page);
    await page.locator(`${PAY} [data-testid="approval-decline"]`).click({ timeout: 20_000 });
    await expect(page.locator(PAY)).toHaveAttribute('data-state', 'declined');
    await expect(page.locator(TRAIN)).toHaveAttribute('data-state', 'cancelled');
    await expect(page.locator(`${TRAIN} li[data-step="pay"]`)).toHaveAttribute('data-state', 'skipped');
    await expect(page.locator(`${TRAIN} [data-testid="run-pause"]`)).toHaveCount(0);
  });

  test('UI-04 pause holds a running run where it is; resume carries on', async ({ page }) => {
    await open(page);
    await page.locator(`${PLAN} [data-testid="approval-approve"]`).click({ timeout: 15_000 });
    await expect(page.locator(WINE)).toHaveAttribute('data-state', 'running');
    await page.locator(`${WINE} [data-testid="run-pause"]`).click();
    await expect(page.locator(WINE)).toHaveAttribute('data-state', 'paused');
    const frozen = await page.locator(`${WINE} li[data-step]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-state')).join(','));
    await page.waitForTimeout(2500);
    expect(await page.locator(`${WINE} li[data-step]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-state')).join(','))).toBe(frozen);
    await page.locator(`${WINE} [data-testid="run-resume"]`).click();
    await expect(page.locator(WINE)).toHaveAttribute('data-state', /running|delivered|settled/);
    await expect(page.locator(WINE)).toHaveAttribute('data-state', /delivered|settled/, { timeout: 25_000 });
  });

  test('UI-05 cancel ends a run; its pending approval no longer waits', async ({ page }) => {
    await open(page);
    await expect(page.locator(PLAN)).toHaveAttribute('data-state', 'pending', { timeout: 15_000 });
    await page.locator(`${WINE} [data-testid="run-cancel"]`).click();
    await expect(page.locator(WINE)).toHaveAttribute('data-state', 'cancelled');
    await expect(page.locator(`${PLAN} [data-testid="approval-approve"]`)).toHaveCount(0);
    await expect(page.locator(`${WINE} li[data-state="active"]`)).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('UI-06 two tabs; the Approvals tab carries the pending count; no sideways scroll', async ({ page }) => {
    const errors = await open(page);
    await expect(page.getByTestId('tab-runs')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('approval-center')).toBeHidden();
    await expect(page.getByTestId('approval-count')).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId('tab-approvals').click();
    await expect(page.getByTestId('tab-approvals')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('approval-center')).toBeVisible();
    await expect(page.locator(PAY)).toBeVisible({ timeout: 15_000 });
    const box = await page.locator(`${PAY} [data-testid="approval-approve"]`).boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(36); // a thumb-sized button
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('languages', () => {
  test.use({ viewport: { width: 1360, height: 1000 } });
  for (const [lang, banner, approvals] of [
    ['en', 'Demo data', 'Approvals'],
    ['ru', 'Демо-данные', 'Подтверждения'],
  ] as const) {
    test(`UI-07 ${lang}: the banner and the approval center speak ${lang}`, async ({ page }) => {
      await open(page, lang);
      await expect(page.getByTestId('mock-banner')).toContainText(banner);
      await expect(page.getByTestId('approval-center')).toHaveAttribute('aria-label', approvals);
    });
  }

  test('UI-08 progress is shown as step dots and a percent, not a drawn bar', async ({ page }) => {
    await open(page);
    await expect(page.locator(`${WINE} [data-testid="run-dots"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`${WINE} [data-testid="run-dots"] > li`)).toHaveCount(7);
    // no element styled as a filling bar (width set by percent)
    expect(await page.locator('[data-testid="live-workspace"] [style*="width:"]').count()).toBe(0);
  });
});
