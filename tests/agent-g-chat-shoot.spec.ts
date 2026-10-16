import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * THE PHOTOGRAPHER AND THE INTERIOR DESIGNER RUN IN THE CHAT — in a real browser, with the provider routes mocked
 * (nothing is generated, nothing is charged).
 *
 * GG's rule (Production 2026-10-16 18:20–18:21Z): every service runs in the chat; Agent G clarifies, the user agrees,
 * and generation starts. „ოთახის დიზაინი გამიკეთე…" with the room's photo attached used to open the Interior panel and
 * leave the photo in the composer. The contract:
 *
 *   · the order gets Agent G's card: what it makes, from which photo, at one render's price — and nothing is sent yet;
 *   · a „კი" (or the card's Create) renders it through the image route with the studio and the attached photo;
 *   · with no photo the card says so, and Create renders from the words alone;
 *   · a question about the service opens nothing and starts nothing.
 */

const PHOTO = readFileSync(join(__dirname, 'fixtures', 'photo.png'));

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
}

async function openChat(page: Page): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'chat' })));
  // The dummy-Supabase dev server has no session; the studio stops a guest before any request. Pin "signed in" after mount.
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

const sse = (frames: unknown[]): string => frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

interface ImageCall { prompt?: string; aspectRatio?: string; referenceImage?: string; studio?: { kind?: string }; templateId?: string }
interface Calls { image: ImageCall[]; chat: number }

async function mockRoutes(page: Page): Promise<Calls> {
  const calls: Calls = { image: [], chat: 0 };
  await page.route('**/api/nanobanana/image', async (route: Route) => {
    calls.image.push(route.request().postDataJSON() as ImageCall);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }),
    });
  });
  await page.route('**/api/chat/gemini', async (route: Route) => {
    calls.chat += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'A photo shoot costs 2 credits.' }, '[DONE]']),
    });
  });
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  return calls;
}

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

const ROOM = 'ოთახის დიზაინი გამიკეთე სკანდინავიურ სტილში';
const SHOOT = 'make me a photo shoot in a black suit';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('the Photographer and the Interior designer run in the chat', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('a room redesign with the room\'s photo: Agent G\'s card first, then „კი" renders it from that photo', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
      { name: 'room.png', mimeType: 'image/png', buffer: PHOTO },
    ]);
    await expect(page.getByTitle('room.png')).toBeVisible({ timeout: 10_000 });
    await say(page, ROOM);

    const card = page.locator('[data-testid="agent-g-card"][data-kind="confirm"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBe(2);
    await expect(page.getByText('from your room photo', { exact: false })).toBeVisible(); // the page is in English; the order was Georgian
    expect(calls.image).toHaveLength(0);
    expect(calls.chat).toBe(0);
    await expect(page.getByTitle('room.png')).toHaveCount(0); // the photo left the composer with the order

    await say(page, 'კი');
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe(ROOM);
    expect(calls.image[0]?.studio?.kind).toBe('interior');
    expect(calls.image[0]?.referenceImage).toMatch(/^data:image\//);
    expect(calls.image[0]?.templateId).toBeUndefined();
    expect(calls.chat).toBe(0);
    await page.screenshot({ path: 'test-results/agent-g-chat-shoot-1-interior.png' });
  });

  test('a photo shoot with no photo: the card says so, and its Create renders from the words', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await say(page, SHOOT);
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('attach your photo', { exact: false })).toBeVisible();
    expect(calls.image).toHaveLength(0);

    await page.getByTestId('agent-g-confirm').click();
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe(SHOOT);
    expect(calls.image[0]?.studio?.kind).toBe('photoshoot');
    expect(calls.image[0]?.referenceImage).toBeUndefined();
    expect(calls.chat).toBe(0);
  });

  test('a question about the service opens nothing and starts nothing', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await say(page, 'რა ღირს ფოტოსესია?');
    await expect.poll(() => calls.chat, { timeout: 20_000 }).toBe(1);
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
    expect(calls.image).toHaveLength(0);
  });
});
