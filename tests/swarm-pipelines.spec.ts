import { test, expect } from '@playwright/test';

/**
 * Swarm pipeline recon e2e (#8).
 *
 * Verifies the cost-guardrail security boundary + the One-Window shell without
 * triggering any real (paid) generation: an EMPTY body short-circuits to a 4xx
 * before any vendor call.
 *   • Production (baseURL is a deployed host) → produce routes must enforce 401.
 *   • Local `next dev` (baseURL is localhost) → auth is bypassed, so the route
 *     reaches body-validation and returns a 4xx that is NOT 401. This proves the
 *     dev-bypass works AND that the bypass is dev-only (prod still 401s).
 *
 * The prod/dev distinction is derived from the resolved `baseURL` so it stays
 * consistent with playwright.config.ts (PLAYWRIGHT_BASE_URL) — no extra env var.
 */
const PRODUCE_ROUTES = ['produce', 'avatar/produce', 'interior/produce', 'image/produce', 'music/produce', 'voice/produce'];

const isLocal = (base: string | undefined): boolean => /localhost|127\.0\.0\.1|\[::1\]/.test(base ?? 'localhost');

test.describe('swarm recon', () => {
  test('one-window chat shell renders', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/(ka|en|ru)(\/|$)/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('produce routes are auth-gated (prod 401) / dev-bypassed (dev 4xx, not 401)', async ({ request, baseURL }) => {
    const prod = !isLocal(baseURL);
    for (const r of PRODUCE_ROUTES) {
      const res = await request.post(`${baseURL}/api/orchestrator/${r}`, { data: {} });
      if (prod) {
        expect(res.status(), `${r} must enforce auth in production`).toBe(401);
      } else {
        expect(res.status(), `${r} dev path should validate, not 401`).toBeGreaterThanOrEqual(400);
        expect(res.status(), `${r} dev bypass active`).not.toBe(401);
      }
    }
  });

  test('unauthenticated direct chat generator stays reachable', async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/chat/gemini`, { data: { messages: [{ role: 'user', content: 'ping' }] } });
    expect([200, 400, 429, 503]).toContain(res.status());
  });
});
