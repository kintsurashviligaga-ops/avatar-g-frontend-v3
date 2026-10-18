import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { productAdCredits } from '@/lib/credits/quote';

/**
 * THE PRODUCT AD RUNS IN THE CHAT — in a real browser, with the provider routes mocked (nothing is generated or charged).
 *
 * GG's rule (Production 2026-10-16 18:20–18:21Z): every service runs in the chat; Agent G clarifies, the user agrees, and
 * generation starts. „make a product ad for my sneakers" used to open the Product ad panel and leave the photo in the
 * composer. The contract:
 *
 *   · with the product's photo attached, Agent G's card offers the ad (length, frame, style, price) and nothing is sent;
 *   · a „კი" (or Create) runs the panel's own product-ad job from THAT photo;
 *   · ordered with no photo, Agent G asks for it; the photo sent next makes the card;
 *   · any other message ends the question: a later photo is not taken for the ad.
 */

const PHOTO = readFileSync(join(__dirname, 'fixtures', 'photo.png'));
/** The card's price is the price book's (lib/credits/quote): an 8 s product ad is a Fast film of that length. */
const AD_8S = productAdCredits(8);

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

interface RemixCall { op?: string; imageUrl?: string; aspect?: string; preset?: string; productDurationSec?: number }
interface Calls { remix: RemixCall[]; chat: number }

async function mockRoutes(page: Page): Promise<Calls> {
  const calls: Calls = { remix: [], chat: 0 };
  await page.route('**/api/video/remix', async (route: Route) => {
    calls.remix.push(route.request().postDataJSON() as RemixCall);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: new URL('/templates/video/anime.jpg', page.url()).toString(), music: true, clipSec: 8 }) });
  });
  await page.route('**/api/chat/gemini', async (route: Route) => {
    calls.chat += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'Sunny.' }, '[DONE]']),
    });
  });
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  return calls;
}

const attach = (page: Page) => page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
  { name: 'sneakers.png', mimeType: 'image/png', buffer: PHOTO },
]);

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

/** A photo sent alone: the composer's send button (Enter in an empty box sends nothing). */
async function sendPhotoAlone(page: Page): Promise<void> {
  await page.getByTestId('composer-input').focus();
  await page.getByRole('button', { name: /^send$/i }).click();
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('the product ad runs in the chat', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('with the photo attached: Agent G\'s card first, then „კი" runs the ad from that photo', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await attach(page);
    await expect(page.getByTitle('sneakers.png')).toBeVisible({ timeout: 10_000 });
    await say(page, 'make a product ad for my sneakers');

    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBe(AD_8S);
    await expect(page.getByText('product ad video from your photo: 8 s, 9:16, style „Luxury"', { exact: false })).toBeVisible();
    expect(calls.remix).toHaveLength(0);
    expect(calls.chat).toBe(0);
    await expect(page.getByTitle('sneakers.png')).toHaveCount(0); // the photo left the composer with the order

    await say(page, 'კი');
    await expect.poll(() => calls.remix.length, { timeout: 20_000 }).toBe(1);
    expect(calls.remix[0]).toMatchObject({ op: 'productad', aspect: '9:16', preset: 'luxury', productDurationSec: 8 });
    expect(calls.remix[0]?.imageUrl).toMatch(/^data:image\//);
    expect(calls.chat).toBe(0);
    await page.screenshot({ path: 'test-results/agent-g-chat-product-1.png' });
  });

  test('ordered with no photo: Agent G asks for it, and the photo sent next makes the card; Create runs it', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await say(page, 'პროდუქტის რეკლამა გამიკეთე');
    await expect(page.getByText('For the product ad I need the product\'s photo', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
    expect(calls.remix).toHaveLength(0);
    expect(calls.chat).toBe(0);

    await attach(page);
    await expect(page.getByTitle('sneakers.png')).toBeVisible({ timeout: 10_000 });
    await sendPhotoAlone(page);
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBe(AD_8S);
    expect(calls.remix).toHaveLength(0);

    await page.getByTestId('agent-g-confirm').click();
    await expect.poll(() => calls.remix.length, { timeout: 20_000 }).toBe(1);
    expect(calls.remix[0]?.op).toBe('productad');
    expect(calls.remix[0]?.imageUrl).toMatch(/^data:image\//);
    expect(calls.chat).toBe(0);
  });

  test('another message ends the question: a later photo is not taken for the ad', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await say(page, 'make a product ad for my sneakers');
    await expect(page.getByText('For the product ad I need the product\'s photo', { exact: false })).toBeVisible({ timeout: 10_000 });
    await say(page, 'what is the weather today?');
    await expect.poll(() => calls.chat, { timeout: 20_000 }).toBe(1);

    await attach(page);
    await expect(page.getByTitle('sneakers.png')).toBeVisible({ timeout: 10_000 });
    await sendPhotoAlone(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toHaveCount(0);
    expect(calls.remix).toHaveLength(0);
  });
});
