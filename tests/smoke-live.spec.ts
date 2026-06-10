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

  test('Service Hub renders the three product cards', async ({ page }) => {
    await page.goto('/ka/dashboard#hub', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('კინო სტუდია')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('ჭკვიანი ასისტენტი')).toBeVisible();
    await expect(page.getByText('ლიფსინქ სტუდია')).toBeVisible();
    await expect(page.getByText(ERROR_FALLBACK)).toHaveCount(0);
  });

  test('Hub → Card A launches the film studio in-window (composer appears)', async ({ page }) => {
    await page.goto('/ka/dashboard#hub', { waitUntil: 'domcontentloaded' });
    await page.getByText('კინო სტუდია').click();
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toContain('#film'); // stayed in-window, hash-routed
  });

  test('upload route (Card B/C) is auth-gated', async ({ request }) => {
    const res = await request.post('/api/upload', { data: { dataUrl: 'data:text/plain;base64,aGk=' } });
    expect(res.status()).toBe(401);
  });

  test('Card A: launching the studio shows the document/script strip', async ({ page }) => {
    await page.goto('/ka/dashboard#hub', { waitUntil: 'domcontentloaded' });
    await page.getByText('კინო სტუდია').click();
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
    // The reference document strip (Priority 1) is present in default film mode.
    await expect(page.getByText('სცენარი / storyboard')).toBeVisible({ timeout: 10_000 });
  });

  test('Card A: script-context enriches a brief from a reference document', async ({ request }) => {
    const script = Buffer.from(
      'SCENE: A lone fisherman rows through morning fog toward a red lighthouse. Mood: melancholic, hopeful. Style: muted teal, 35mm.',
    ).toString('base64');
    const res = await request.post('/api/orchestrator/script-context', {
      data: { prompt: 'make it cinematic', documents: [{ dataUrl: `data:text/plain;base64,${script}`, type: 'text/plain', name: 'script.txt' }] },
      timeout: 45_000,
    });
    expect(res.ok()).toBeTruthy();
    const j = (await res.json()) as { brief?: string; enriched?: boolean };
    // Deterministic contract: 200 + a non-empty brief, ALWAYS (fail-open returns
    // the raw prompt). Enrichment itself is best-effort — a live Gemini blip can
    // occasionally return empty — so we assert the contract, not the LLM mood.
    expect(typeof j.enriched).toBe('boolean');
    expect((j.brief ?? '').length).toBeGreaterThan(0);
  });

  test('Card B: gemini multimodal route accepts a turn', async ({ request }) => {
    const res = await request.post('/api/chat/gemini', {
      data: { messages: [{ role: 'user', content: 'reply with one word' }] },
      timeout: 30_000,
    });
    expect(res.ok()).toBeTruthy();
  });

  // Mobile / Apple-HIG: the hub + Card A studio must fit every standard iPhone
  // viewport with NO horizontal overflow (no clipped/unreachable zones).
  for (const vp of [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
  ]) {
    test(`mobile: hub + studio fit ${vp.name} with no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/ka/dashboard#hub', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('კინო სტუდია')).toBeVisible({ timeout: 15_000 });
      const hubOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(hubOverflow, 'hub horizontal overflow (px)').toBeLessThanOrEqual(1);

      await page.getByText('კინო სტუდია').click();
      await expect(page.locator('textarea').first()).toBeVisible({ timeout: 20_000 });
      const studioOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(studioOverflow, 'studio horizontal overflow (px)').toBeLessThanOrEqual(1);
    });
  }
});
