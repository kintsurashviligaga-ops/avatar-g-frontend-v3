import { test, expect, type Page } from '@playwright/test';

/**
 * tests/preview-e2e.spec.ts
 * =========================
 * END-TO-END proof that EVERY chat service mounts its generated media preview
 * IN THE SAME WINDOW — never a new tab — across the real V2 production chat
 * (`components/chat/MyAvatarChatV2.tsx`).
 *
 * Design: the single orchestration endpoint (`/api/chat/orchestrate`) is MOCKED
 * with a deterministic terminal result. That makes these tests:
 *   • fast      — no 12–150s provider waits,
 *   • free      — zero paid HeyGen/LTX/Udio/ElevenLabs/WorldLabs calls,
 *   • CI-safe   — no secrets/credits required,
 *   • exact     — they assert the CLIENT render+preview contract (the part that
 *                 actually regressed: typeless <source> → audio stuck at 00:00,
 *                 flaky video, "no service shows a preview").
 *
 * For a genuine provider round-trip, the opt-in `@live` block runs only when
 * RUN_LIVE_E2E=1 is set against a server that has real keys.
 */

// 1×1 transparent PNG as a data: URL — decodes in-browser, no network, no CSP
// host needed. We assert on the element's `src` attribute, so even a strict CSP
// that blocks the pixel load does not affect the contract being verified.
const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

// Stable fake media URLs. The v62 fix puts `src` DIRECTLY on the <video>/<audio>
// element (not a typeless child <source>); we verify exactly that attribute.
const SAMPLE_MP4 = 'https://e2e.invalid/sample-video.mp4';
const SAMPLE_AUDIO = 'https://e2e.invalid/sample-audio.mp3';

// MyAvatarChatV2 — the surface these tests assert (the chat-input / preview-workspace testids live in
// components/chat/MyAvatarChatV2.tsx) — now lives at /[locale]/chat. The /dashboard home was swapped to
// the Cinematic Film Studio (FilmStudioHome), which carries neither testid, so the tests were pointed at a
// route that no longer hosts the component under test. Point them at the chat hub's real route (renders
// MyAvatarChatV2 with a guest fallback → works anonymously, which is what this mocked contract needs).
const KA_CHAT = '/ka/chat';

/** Mock the one orchestration endpoint with a deterministic terminal result. */
async function mockOrchestrate(page: Page, body: Record<string, unknown>): Promise<void> {
  await page.route('**/api/chat/orchestrate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** Land on the dashboard, dismiss the cookie banner, reveal the composer. */
async function openChat(page: Page): Promise<void> {
  await page.goto(KA_CHAT);
  // Cookie consent is a bottom-corner banner (not a wall). "Necessary only" is
  // the privacy-preserving choice and dismisses + persists it.
  const necessary = page.getByTestId('cookie-necessary');
  if (await necessary.isVisible().catch(() => false)) {
    await necessary.click();
  }
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 45_000 });
}

async function sendPrompt(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('chat-input');
  await input.click();
  await input.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}

// ─── Cookie consent (the thing the external scraper mistook for a "wall") ──────

test('cookie banner appears, dismisses, and stays dismissed after reload', async ({ page }) => {
  await page.goto(KA_CHAT);
  const accept = page.getByTestId('cookie-accept');
  await expect(accept).toBeVisible({ timeout: 45_000 });
  await accept.click();
  await expect(accept).toBeHidden();

  // Choice is persisted in localStorage → the banner must not return.
  await page.reload();
  await expect(page.getByTestId('cookie-accept')).toHaveCount(0);
});

// ─── Text chat round-trip ─────────────────────────────────────────────────────

test('text chat: a prompt renders an assistant reply', async ({ page }) => {
  await mockOrchestrate(page, {
    success: true,
    intent: 'text_chat',
    responseType: 'text',
    message: 'გამარჯობა! აი ქართული ანდაზა: მთa და მთა არ შეხვდება, კაცი და კაცი — შეხვდებაო.',
    metadata: { provider: 'test' },
  });
  await openChat(page);
  await sendPrompt(page, 'მითხარი ერთი ქართული ანდაზა');
  await expect(page.getByText('აი ქართული ანდაზა', { exact: false })).toBeVisible({ timeout: 15_000 });
});

// ─── Image → same-window preview (no new tab) ─────────────────────────────────

test('image: mounts in the PreviewWorkspace IN THE SAME WINDOW (no new tab)', async ({ page, context }) => {
  await mockOrchestrate(page, {
    success: true,
    intent: 'image_generation',
    responseType: 'image',
    assetUrl: SAMPLE_PNG,
    message: 'აი თქვენი სურათი.',
    metadata: { provider: 'test' },
  });
  await openChat(page);
  await sendPrompt(page, 'დახატე ქართული მთა მზის ჩასვლისას');

  const workspace = page.getByTestId('preview-workspace');
  await expect(workspace).toBeVisible({ timeout: 15_000 });
  await expect(workspace.locator('img').first()).toHaveAttribute('src', SAMPLE_PNG);

  // CRITICAL: the preview opened inline — no second tab/window was spawned.
  expect(context.pages().length).toBe(1);
});

// ─── Video → same-window preview with DIRECT src (v62 contract) ───────────────

test('video: <video src> mounted directly in the workspace, no typeless <source>', async ({ page, context }) => {
  await mockOrchestrate(page, {
    success: true,
    intent: 'video_generation',
    responseType: 'video',
    assetUrl: SAMPLE_MP4,
    message: 'აი თქვენი ვიდეო.',
    metadata: { provider: 'test' },
  });
  await openChat(page);
  await sendPrompt(page, 'შექმენი მოკლე ვიდეო');

  const workspace = page.getByTestId('preview-workspace');
  await expect(workspace).toBeVisible({ timeout: 15_000 });

  const video = workspace.locator('video').first();
  await expect(video).toHaveAttribute('src', SAMPLE_MP4);
  // The v62 fix: Safari-hostile typeless child <source> must NOT exist.
  await expect(workspace.locator('video > source')).toHaveCount(0);

  expect(context.pages().length).toBe(1);
});

// ─── Audio → inline player with DIRECT src (the 00:00-stall fix) ──────────────

test('audio: <audio src> mounted directly (no typeless <source> that stalls at 00:00)', async ({ page }) => {
  await mockOrchestrate(page, {
    success: true,
    intent: 'music_generation',
    responseType: 'audio',
    assetUrl: SAMPLE_AUDIO,
    message: 'აი თქვენი მუსიკა.',
    metadata: { provider: 'test' },
  });
  await openChat(page);
  await sendPrompt(page, 'შექმენი ქართული ფოლკლორული მელოდია');

  const audio = page.locator('audio').first();
  await expect(audio).toHaveAttribute('src', SAMPLE_AUDIO, { timeout: 15_000 });
  await expect(page.locator('audio > source')).toHaveCount(0);
});

// ─── Opt-in LIVE provider round-trip (needs real keys + credits) ──────────────

test.describe('@live real provider round-trip', () => {
  test.skip(process.env.RUN_LIVE_E2E !== '1', 'Set RUN_LIVE_E2E=1 against a server with real provider keys.');

  test('real image generation opens the preview workspace end-to-end', async ({ page }) => {
    await openChat(page);
    await sendPrompt(page, 'A serene Georgian mountain village at golden hour, photorealistic');
    // A genuine provider job can take a while; the workspace opens the instant a
    // real asset URL resolves.
    await expect(page.getByTestId('preview-workspace')).toBeVisible({ timeout: 180_000 });
  });
});
