import { test, expect, type Page } from '@playwright/test';

/**
 * tests/preview-e2e.spec.ts — the CI e2e gate (.github/workflows/e2e.yml runs exactly this file).
 * ==============================================================================================
 * The product's core contracts on the CURRENT surface: the home page (`/ka`) is the studio, opening on the chat
 * (docs/DESIGN.md §13). Every provider call is MOCKED, so this is fast, free and needs no secrets:
 *
 *   • the cookie banner appears, dismisses, and stays dismissed;
 *   • a guest's chat turn streams an answer (the SSE wire, keep-alive comments included);
 *   • a guest's paid request opens sign-in and sends NOTHING;
 *   • a generated image lands IN THE SAME WINDOW (the feed), never a new tab.
 *
 * ⚠️ This file used to drive `components/chat/MyAvatarChatV2.tsx` at /ka/chat. That surface was deleted with the old
 * shell on 2026-10-01 (/ka/chat now redirects home), so the same promises are asserted where the product lives now.
 */

const HOME = '/ka';
const COMPOSER = 'ჰკითხე MyAvatar-ს';

/** The chat SSE as the route writes it: an opening keep-alive, meta, text deltas, [DONE]. */
function sse(text: string): string {
  return [
    ': keep-alive',
    '',
    `data: ${JSON.stringify({ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } })}`,
    '',
    ': keep-alive',
    '',
    `data: ${JSON.stringify({ text })}`,
    '',
    'data: [DONE]',
    '',
    '',
  ].join('\n');
}

/** Requests a send would make: every POST to /api/ except background telemetry. */
function trackPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (r.method() === 'POST' && path.startsWith('/api/') && !/^\/api\/(presence|log-error)\b/.test(path)) posts.push(path);
  });
  return posts;
}

async function openHome(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.goto(HOME);
  await expect(page.getByPlaceholder(COMPOSER)).toBeVisible({ timeout: 45_000 });
}

test('cookie banner appears, dismisses, and stays dismissed after reload', async ({ page }) => {
  await page.goto(HOME);
  const necessary = page.getByTestId('cookie-necessary');
  await expect(necessary).toBeVisible({ timeout: 45_000 });
  await necessary.click();
  await expect(necessary).toBeHidden();
  await page.reload();
  await expect(page.getByPlaceholder(COMPOSER)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cookie-necessary')).toHaveCount(0);
});

test('a guest chat turn streams an assistant reply (keep-alive comments are invisible)', async ({ page }) => {
  await page.route('**/api/chat/gemini', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('გამარჯობა! რით დაგეხმარო?') }));
  const posts = trackPosts(page);
  await openHome(page);
  const box = page.getByPlaceholder(COMPOSER);
  await box.fill('გამარჯობა');
  await box.press('Enter');
  await expect(page.getByText('გამარჯობა! რით დაგეხმარო?')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(': keep-alive')).toHaveCount(0);
  expect(posts).toEqual(['/api/chat/gemini']);
});

test('the old /ka/chat lands on the chat home', async ({ page }) => {
  await page.goto('/ka/chat');
  await expect(page).toHaveURL(/\/ka$/);
  await expect(page.getByPlaceholder(COMPOSER)).toBeVisible({ timeout: 45_000 });
});

test('a guest asking for a paid tool gets sign-in, and nothing is sent', async ({ page }) => {
  const posts = trackPosts(page);
  await openHome(page);
  const box = page.getByPlaceholder(COMPOSER);
  await box.fill('გამიკეთე ვიდეო ზღვაზე');
  await box.press('Enter');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(box).toHaveValue('გამიკეთე ვიდეო ზღვაზე'); // the request is kept for after sign-in
});

test('a generated image lands in the feed, in the same window (no new tab)', async ({ page, context }) => {
  // A same-origin image the provider stub "returns" (the client re-hosts / validates result URLs; a data: URL is not one).
  const RESULT = '/brand/v1/card-image.jpg';
  await page.route('**/api/nanobanana/image', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: RESULT }) }));
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.goto(`${HOME}/dashboard?tool=image`);
  const box = page.getByPlaceholder('აღწერე სურათი, რომ დაგიხატო…');
  await expect(box).toBeVisible({ timeout: 45_000 });
  // The sign-in wall is not what is under test: lift it in this browser only, AFTER the shell has published its own
  // guest flag (setting it earlier is overwritten). The image route itself is mocked — nothing is spent.
  await page.evaluate(() => { document.documentElement.dataset.authed = '1'; });
  const pagesBefore = context.pages().length;
  await box.fill('შავი ღვინის ბოთლი სველ ქვაზე, ღამე');
  // The composer's run button (the Create panel beside it has its own Generate button with the price).
  await page.getByTestId('run-button').click();
  // Agent G confirms before anything is spent (lib/chat/focusGate): a prompt typed in a focus mode shows its card with the
  // price, and the render starts when Create is tapped — never from a stray message. (tests/agent-g-gate.spec.ts covers the gate.)
  await page.getByTestId('agent-g-confirm').click();
  await expect(page.locator(`img[src="${RESULT}"]`).first()).toBeVisible({ timeout: 20_000 });
  expect(context.pages().length).toBe(pagesBefore);
});
