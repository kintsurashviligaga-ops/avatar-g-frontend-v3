import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A YES IN THE CHAT STARTS WHAT AGENT G OFFERED — in a real browser, with the provider routes mocked (nothing is generated,
 * nothing is charged).
 *
 * Production 2026-10-16 (GG's iPhone, 22:19 Tbilisi): Agent G had offered a 9:16 portrait from GG's photo; GG answered
 * „კი შექმენი სურათი 9:16 ფორმატის" and the chat said it cannot generate in the chat — open the Image tool, attach the
 * photo again, pick 9:16, paste a prompt. GG's rule (18:20–18:21Z): every service runs in the chat, and once Agent G has
 * clarified and the user agrees, generation starts. The contract:
 *
 *   · a yes to a reply that quoted a prompt AND its real price starts that prompt — in the frame the yes or the prompt
 *     names, from the photo given earlier when the offer says it uses it — and the model is not asked again;
 *   · a yes to an offer with no price (or a wrong one) shows Agent G's card with the real price; the next yes starts it;
 *   · a yes that changes the job („yes but in watercolor") goes back to Agent G, nothing starts;
 *   · a typed yes under Agent G's own card is that card's Create.
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

interface ImageCall { prompt?: string; aspectRatio?: string; referenceImage?: string }
interface Calls { image: ImageCall[]; chat: number }

/** The chat route answers each turn with the next of `replies`; the image route answers with a picture the dev server serves. */
async function mockRoutes(page: Page, replies: string[]): Promise<Calls> {
  const calls: Calls = { image: [], chat: 0 };
  await page.route('**/api/nanobanana/image', async (route: Route) => {
    calls.image.push(route.request().postDataJSON() as ImageCall);
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }),
    });
  });
  await page.route('**/api/chat/gemini', async (route: Route) => {
    const text = replies[Math.min(calls.chat, replies.length - 1)] ?? 'OK.';
    calls.chat += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text }, '[DONE]']),
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

// The reply GG got, shortened in the middle only: a quoted prompt that uses GG's photo, and its price.
const PORTRAIT = 'Vertical 9:16 professional portrait maintaining the exact face and features of the man in the reference image, wearing a crisp white dress shirt and a tailored black suit jacket, solid matte black background, studio lighting, photorealistic';
const GG_OFFER = `სურათის შესაქმნელად გახსენი ხელსაწყო „სურათი“, მიამაგრე ეს ფოტო და აირჩიე 9:16.\n\nპრომპტის ველში ჩასვი:\n\n„${PORTRAIT}“\n\n(ფასი: 2 კრედიტი / 0.20 ₾).`;
const FOX = 'a red fox in deep snow at dawn, photorealistic, soft light';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('a yes in the chat starts what Agent G offered', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('GG\'s „კი შექმენი სურათი 9:16 ფორმატის" starts the offered portrait, in 9:16, from GG\'s earlier photo', async ({ page }) => {
    const calls = await mockRoutes(page, [GG_OFFER]);
    await openChat(page);
    await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
      { name: 'me.png', mimeType: 'image/png', buffer: PHOTO },
    ]);
    await expect(page.getByTitle('me.png')).toBeVisible({ timeout: 10_000 });
    await say(page, 'I would like a professional portrait of me in a black suit, is that possible?');
    await expect(page.getByText('(ფასი: 2 კრედიტი / 0.20 ₾).')).toBeVisible({ timeout: 20_000 });
    expect(calls.chat).toBe(1);

    await say(page, 'კი შექმენი სურათი 9:16 ფორმატის');
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe(PORTRAIT);
    expect(calls.image[0]?.aspectRatio).toBe('9:16');
    expect(calls.image[0]?.referenceImage).toMatch(/^data:image\//); // the photo from the first turn, not a new upload
    expect(calls.chat).toBe(1);                                      // the model was not asked again
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);    // no second question
    await page.screenshot({ path: 'test-results/agent-g-chat-yes-1-started.png' });
  });

  test('an offer with no price gets Agent G\'s card with the real one; the next yes starts it', async ({ page }) => {
    const calls = await mockRoutes(page, [`Here is the image I would make: "${FOX}". Shall I start?`]);
    await openChat(page);
    await say(page, 'I need a picture of a fox for my blog');
    await expect(page.getByText(FOX)).toBeVisible({ timeout: 20_000 });

    await say(page, 'yes');
    const card = page.locator('[data-testid="agent-g-card"][data-kind="confirm"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBe(2);
    expect(calls.image).toHaveLength(0);

    await say(page, 'ok');
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe(FOX);
    expect(calls.image[0]?.referenceImage).toBeUndefined();
    expect(calls.chat).toBe(1);
  });

  test('a yes that changes the job goes back to Agent G — nothing starts', async ({ page }) => {
    const calls = await mockRoutes(page, [`Image: "${FOX}" — 2 credits (0.20 ₾). Shall I start?`, 'Sure — here is the watercolor version.']);
    await openChat(page);
    await say(page, 'I need a picture of a fox for my blog');
    await expect(page.getByText(FOX)).toBeVisible({ timeout: 20_000 });
    await say(page, 'yes but in watercolor');
    await expect.poll(() => calls.chat, { timeout: 20_000 }).toBe(2);
    expect(calls.image).toHaveLength(0);
  });

  test('a typed yes under Agent G\'s own card is its Create', async ({ page }) => {
    const calls = await mockRoutes(page, ['OK.']);
    await openChat(page);
    await say(page, `draw ${FOX}`);
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    expect(calls.image).toHaveLength(0);
    await say(page, 'კი');
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe(`draw ${FOX}`);
    expect(calls.chat).toBe(0);
  });
});
