import { test, expect } from '@playwright/test';

/**
 * §2 — E2E coverage for the 30-second Film Studio composer
 * (ConversationalFilmStudio), which is the default dashboard surface for a guest.
 *
 * Guards the checklist's "verify internal links + state persistence" item at the
 * composer level, plus the §1 live per-prompt cost indicator:
 *   • the director-script textarea renders (no auth required),
 *   • typing a prompt reveals the live ₾ cost line (only shown once text exists),
 *   • the typed script survives a blur/refocus round-trip (state persistence),
 *   • the composer is correctly localized on the Georgian dashboard.
 *
 * Deterministic + auth-free so it runs reliably in CI without a live render.
 */

const EN_PLACEHOLDER = 'Type your director script…';
const KA_PLACEHOLDER = 'ჩაწერე რეჟისორული სცენარი…';

test.describe('Film Studio composer (dashboard home)', () => {
  test('composer renders with the director-script textarea', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page.getByPlaceholder(EN_PLACEHOLDER)).toBeVisible({ timeout: 20000 });
  });

  test('typing a prompt reveals the live cost indicator and the text persists', async ({ page }) => {
    await page.goto('/en/dashboard');
    const textarea = page.getByPlaceholder(EN_PLACEHOLDER);
    await expect(textarea).toBeVisible({ timeout: 20000 });

    // No cost line before any prompt is typed.
    await expect(page.getByText(/Video cost/i)).toHaveCount(0);

    await textarea.fill('A neon-lit cyberpunk chase through Tbilisi at night');

    // §1 — the per-prompt cost indicator appears only once a prompt exists.
    await expect(page.getByText(/Video cost/i).first()).toBeVisible();

    // State persistence — the script survives a blur (Tab away) and stays put.
    await page.keyboard.press('Tab');
    await expect(textarea).toHaveValue(/cyberpunk chase/);
  });

  test('composer is localized on the Georgian dashboard', async ({ page }) => {
    await page.goto('/ka/dashboard');
    await expect(page.getByPlaceholder(KA_PLACEHOLDER)).toBeVisible({ timeout: 20000 });
  });
});
