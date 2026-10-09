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

  // /studio (the „Studio Beta" second studio) is retired: it goes home, to the one studio, whose composer a guest reaches.
  test('/studio goes to the studio and mounts a composer for a guest', async ({ page }) => {
    await page.goto('/ka/studio', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/ka\/dashboard/);
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

  test('One Window: embedded legal page renders content + strips app chrome', async ({ page }) => {
    await page.goto('/ka/privacy?embed=1', { waitUntil: 'networkidle' });
    // The legal content itself renders (a heading is present)…
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(ERROR_FALLBACK)).toHaveCount(0);
    // …and the app-shell chrome is stripped (no global nav landmark) so it sits
    // cleanly inside the studio slide-over rather than rendering a page-in-a-page.
    await expect(page.locator('nav')).toHaveCount(0);
  });

  test('lipsync wiring is live + points at the configured model', async ({ request }) => {
    const res = await request.get('/api/video/lipsync');
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { ready?: boolean; model?: string };
    expect(typeof json.ready).toBe('boolean');
    expect(json.model).toBe('devxpy/cog-wav2lip');
  });

  test('dashboard lands directly on the unified chatbox (no card gate)', async ({ page }) => {
    await page.goto('/ka/dashboard', { waitUntil: 'domcontentloaded' });
    // One-window default: the assistant chatbox IS the landing — its composer
    // textarea is present immediately, with no card-selection step in between.
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ERROR_FALLBACK)).toHaveCount(0);
  });

  // The „Choose a service" grid (#hub) and the old Film Studio (#film) are retired (2026-10-09): an old link opens the
  // studio itself, on the tool that does that job — never the card grid again.
  test('an old #hub / #film link opens the studio, not the retired pages', async ({ page }) => {
    await page.goto('/ka/dashboard#hub', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('აირჩიე სერვისი')).toHaveCount(0);
    await page.goto('/ka/dashboard#film', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('html')).toHaveAttribute('data-tool', 'video', { timeout: 20_000 });
    expect(page.url()).not.toContain('#film');
  });

  test('upload route (Card B/C) is auth-gated', async ({ request }) => {
    const res = await request.post('/api/upload', { data: { dataUrl: 'data:text/plain;base64,aGk=' } });
    expect(res.status()).toBe(401);
  });

  // Script enrichment spends the platform's Gemini key, so a guest is refused (401 + authRequired) before any
  // model call — the smoke runs signed-out, so it asserts the gate rather than the enrichment itself.
  test('Card A: script-context refuses a guest before spending Gemini', async ({ request }) => {
    const script = Buffer.from(
      'SCENE: A lone fisherman rows through morning fog toward a red lighthouse. Mood: melancholic, hopeful. Style: muted teal, 35mm.',
    ).toString('base64');
    const res = await request.post('/api/orchestrator/script-context', {
      data: { prompt: 'make it cinematic', documents: [{ dataUrl: `data:text/plain;base64,${script}`, type: 'text/plain', name: 'script.txt' }] },
      timeout: 45_000,
    });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { authRequired?: boolean }).authRequired).toBe(true);
  });

  // The product chat is sign-in only (lib/auth/generationGate.ts · mustSignInToChat): a signed-out turn gets a 401
  // + authRequired BEFORE the model is called, so an anonymous caller can't spend the platform's Gemini key.
  test('Card B: gemini multimodal route refuses a guest turn', async ({ request }) => {
    const res = await request.post('/api/chat/gemini', {
      data: { messages: [{ role: 'user', content: 'reply with one word' }], protocol: 2 },
      timeout: 30_000,
    });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { authRequired?: boolean }).authRequired).toBe(true);
  });

  // Mobile / Apple-HIG: the studio (the chat and the Video tool) must fit every standard iPhone
  // viewport with NO horizontal overflow (no clipped/unreachable zones).
  for (const vp of [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
  ]) {
    test(`mobile: the studio fits ${vp.name} with no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of ['/ka/dashboard', '/ka/dashboard?tool=video']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} horizontal overflow (px)`).toBeLessThanOrEqual(1);
      }
    });
  }
});
