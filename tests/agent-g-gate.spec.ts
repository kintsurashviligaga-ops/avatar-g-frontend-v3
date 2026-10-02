import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AGENT G AT THE DOOR OF A FOCUS MODE — in a real browser, with the provider routes mocked (nothing is generated, nothing is
 * charged). The bug: in Image mode "აქ ხარ?" ("are you here?") started a paid render. The contract now:
 *
 *   · a greeting / question in Image mode is ANSWERED IN WORDS by Agent G (the chat route) and the image route is never called;
 *   · a thin prompt gets Agent G's questions and a "create it as it is" button — still no render until a decision;
 *   · a real prompt typed in the composer gets a confirmation card with the price; the render starts only when Create is tapped;
 *   · the panel's own Generate button (its price is on it) is the confirmation and starts the render directly.
 */

const DESKTOP = { width: 1280, height: 800 };

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
}

async function openImage(page: Page): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'image' })));
  await expect(page.getByTestId('image-create-panel')).toBeVisible({ timeout: 15_000 });
  // The dummy-Supabase dev server has no session; the studio stops a guest before any request. Pin "signed in" after mount.
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

const sse = (frames: unknown[]): string => frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

interface Calls { image: Array<{ prompt?: string }>; chat: Array<{ messages?: Array<{ role: string; content: unknown }> }> }

/** Agent G's chat route answers with a canned reply; the image route answers with a picture the dev server already serves. */
async function mockRoutes(page: Page): Promise<Calls> {
  const calls: Calls = { image: [], chat: [] };
  await page.route('**/api/nanobanana/image', async (route: Route) => {
    calls.image.push(route.request().postDataJSON() as { prompt?: string });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, url: new URL('/templates/image/product.jpg', page.url()).toString(), model: 'mock' }),
    });
  });
  await page.route('**/api/chat/gemini', async (route: Route) => {
    calls.chat.push(route.request().postDataJSON() as Calls['chat'][number]);
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'Yes, I am here! What shall we create?' }, '[DONE]']),
    });
  });
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  return calls;
}

async function type(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

test.use({ viewport: DESKTOP });

test.describe('Agent G gates every message typed in Image mode', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('"აქ ხარ?" is answered in words — the image route is NEVER called', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await type(page, 'აქ ხარ?');
    await expect(page.getByTestId('agent-g-note-text')).toHaveText('Yes, I am here! What shall we create?', { timeout: 20_000 });
    expect(calls.chat).toHaveLength(1);
    expect(calls.image).toHaveLength(0);
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);   // talk gets a reply, not a card
    await page.getByTestId('agent-g-note-close').click();
    await expect(page.getByTestId('agent-g-note')).toHaveCount(0);   // and the note can be dismissed
    // …and so for the English and Russian ways of saying it
    for (const hello of ['Are you here?', 'ты тут?', 'hello']) {
      await type(page, hello);
      await expect.poll(() => calls.chat.length, { timeout: 20_000 }).toBeGreaterThan(1);
    }
    expect(calls.image).toHaveLength(0);
  });

  test('a thin prompt gets questions and an "as it is" button — no render until a decision', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await type(page, 'cat');
    const card = page.getByTestId('agent-g-card');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveAttribute('data-kind', 'clarify');
    await expect(page.getByTestId('agent-g-note-text')).toContainText(/What style/i);
    expect(calls.image).toHaveLength(0);
    expect(calls.chat).toHaveLength(0);                             // asking is free: no model call, no charge
    await page.getByTestId('agent-g-confirm').click();
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe('cat');
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);  // the card is spent
  });

  test('an answer to the questions is merged into the prompt and confirmed before anything renders', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await type(page, 'a red fox');
    await expect(page.getByTestId('agent-g-card')).toHaveAttribute('data-kind', 'clarify');
    await type(page, 'photorealistic, in a snowy forest at dawn');
    const confirm = page.getByTestId('agent-g-confirm').last();
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    expect(calls.image).toHaveLength(0);
    await confirm.click();
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe('a red fox, photorealistic, in a snowy forest at dawn');
  });

  test('a real prompt in the composer waits for a tap; the card carries the price, and Edit gives the words back', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await type(page, 'a cozy cabin in a pine forest at dawn, soft light');
    const card = page.locator('[data-testid="agent-g-card"][data-kind="confirm"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBeGreaterThan(0);
    expect(calls.image).toHaveLength(0);
    await page.getByTestId('agent-g-edit').click();
    await expect(page.getByTestId('composer-input')).toHaveValue('a cozy cabin in a pine forest at dawn, soft light');
    expect(calls.image).toHaveLength(0);
  });

  test('the panel\'s own Generate button is the confirmation: a prompt goes straight through', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await page.getByTestId('create-prompt').fill('a red fox in the snow');
    await page.getByTestId('create-generate').click();
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe('a red fox in the snow');
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
  });

  test('…but a greeting in the panel\'s prompt box is still only a greeting', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await page.getByTestId('create-prompt').fill('hello');
    await page.getByTestId('create-generate').click();
    await expect(page.getByTestId('agent-g-note-text')).toHaveText('Yes, I am here! What shall we create?', { timeout: 20_000 });
    expect(calls.image).toHaveLength(0);
  });
});

// ─── Music and Video: the other two tools that spend. Their layouts keep the thread visible, so Agent G answers there. ───

async function openTool(page: Page, tool: 'music' | 'video', ready: string): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: t })), tool);
  await expect(page.getByTestId(ready)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

/** Records every request the paid routes of Music and Video would receive — a greeting must produce none. */
async function mockSpendingRoutes(page: Page): Promise<{ spent: string[]; chat: number }> {
  const seen = { spent: [] as string[], chat: 0 };
  for (const glob of ['**/api/ai/music**', '**/api/film/storyboard**', '**/api/video/**', '**/api/film/**']) {
    await page.route(glob, (route) => {
      // Generation is a POST. The studio also READS engine lists on load (/api/video/engine, /api/ai/music/engines): let those through.
      if (route.request().method() !== 'POST') return route.fallback();
      seen.spent.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  }
  await page.route('**/api/chat/gemini', async (route) => {
    seen.chat += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'Yes, I am here! What shall we create?' }, '[DONE]']),
    });
  });
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  return seen;
}

test.describe('the same door guards Music and Video', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('Music: "აქ ხარ?" is answered in the thread — no track is requested', async ({ page }) => {
    const seen = await mockSpendingRoutes(page);
    await openTool(page, 'music', 'music-create');
    await type(page, 'აქ ხარ?');
    await expect(page.getByText('Yes, I am here! What shall we create?').first()).toBeVisible({ timeout: 20_000 });
    expect(seen.chat).toBe(1);
    expect(seen.spent).toEqual([]);
  });

  test('Video: "hello" is answered in the thread — no storyboard is planned, nothing is rendered', async ({ page }) => {
    const seen = await mockSpendingRoutes(page);
    await openTool(page, 'video', 'video-create-panel');
    await type(page, 'hello');
    await expect(page.getByText('Yes, I am here! What shall we create?').first()).toBeVisible({ timeout: 20_000 });
    expect(seen.chat).toBe(1);
    expect(seen.spent).toEqual([]);
  });

  test('Video: a thin brief is clarified, with its card in the thread — and still nothing is planned', async ({ page }) => {
    const seen = await mockSpendingRoutes(page);
    await openTool(page, 'video', 'video-create-panel');
    await type(page, 'a dog running');
    await expect(page.getByTestId('agent-g-card')).toBeVisible({ timeout: 10_000 });
    expect(seen.spent).toEqual([]);
    expect(seen.chat).toBe(0);
  });
});
