import { test, expect } from '@playwright/test';

/**
 * Production smoke (runs via playwright.smoke.config.ts against the LIVE site).
 *
 * Verifies the deployed app actually RENDERS its core surfaces for a guest — no
 * generation, no cost, no provider flake. This catches the "the page is broken"
 * class of regression that a stale cached client used to mask. Resilient by
 * design: it asserts the shell mounted, the crash fallback is NOT showing, and
 * the studio composer exists — never brittle marketing copy.
 */

const ERROR_FALLBACK = 'System Interruption'; // ClientErrorBoundary fallback heading

test.describe('myavatar.ge production smoke', () => {
  test('landing renders (not the crash fallback)', async ({ page }) => {
    const res = await page.goto('/ka', { waitUntil: 'domcontentloaded' });
    expect(res?.ok(), 'landing should return a 2xx').toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText(ERROR_FALLBACK)).toHaveCount(0);
  });

  test('film studio mounts a composer for a guest', async ({ page }) => {
    await page.goto('/ka/studio', { waitUntil: 'domcontentloaded' });
    // The composer textarea is the heart of the studio; a guest can reach it.
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ERROR_FALLBACK)).toHaveCount(0);
  });

  test('service worker serves a current, versioned build', async ({ page }) => {
    const res = await page.goto('/sw.js', { waitUntil: 'domcontentloaded' });
    expect(res?.ok(), 'sw.js should be served').toBeTruthy();
    const body = await res!.text();
    expect(body, 'versioned cache name present').toContain('avatar-g-shell-v');
  });

  test('Library API responds (RLS-scoped, unauth → empty)', async ({ request }) => {
    const res = await request.get('/api/studio/library');
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { items?: unknown };
    expect(Array.isArray(json.items)).toBeTruthy();
  });
});
