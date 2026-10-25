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

/** Picks a tool the way the studio's own buttons do. Picking it can leave its settings shut (the current composer): the tool
 *  chip opens them, as a person would, and `ready` is the panel's visible copy (the phone sheet and the desktop rail both
 *  mount one). */
async function pickTool(page: Page, tool: string, ready: string): Promise<void> {
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
  await page.evaluate((t) => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: t })), tool);
  const toggle = page.getByTestId('options-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', /^(true|false)$/);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(page.getByTestId(ready).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
}

/** The dummy-Supabase dev server has no session; the studio stops a guest before any request. Pin "signed in" after mount. */
async function pinSignedIn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

async function openImage(page: Page): Promise<void> {
  await pickTool(page, 'image', 'image-create-panel');
  await pinSignedIn(page);
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
  // On a desktop an open Image or Music panel holds the description and the composer's box steps aside (GG's card,
  // 2026-10-18): put the panel away, as a person does, to write to Agent G. Video keeps its box beside the panel.
  if (await box.isHidden()) {
    await page.getByTestId('options-toggle').click();
    await expect(box).toBeVisible();
  }
  await box.fill(text);
  // Plain Enter inserts a newline (GG's composer, 2026-10-21); match its explicit send shortcut.
  await box.press('Control+Enter');
}

test.use({ viewport: DESKTOP });

test.describe('Agent G gates every message typed in Image mode', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  test('"აქ ხარ?" is answered in words — the image route is NEVER called', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImage(page);
    await type(page, 'აქ ხარ?');
    // The unified composer (GG 2026-10-25): the Image tool keeps the conversation on screen, so the reply is a bubble in it.
    await expect(page.getByText('Yes, I am here! What shall we create?').last()).toBeVisible({ timeout: 20_000 });
    expect(calls.chat).toHaveLength(1);
    expect(calls.image).toHaveLength(0);
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);   // talk gets a reply, not a card
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
    await expect(page.getByText(/What style/i).last()).toBeVisible();
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
    // The unified composer (GG 2026-10-25): the Image tool keeps the conversation on screen, so the reply is a bubble in it.
    await expect(page.getByText('Yes, I am here! What shall we create?').last()).toBeVisible({ timeout: 20_000 });
    expect(calls.image).toHaveLength(0);
  });
});

// ─── Music and Video: the other two tools that spend. Their layouts keep the thread visible, so Agent G answers there. ───

async function openTool(page: Page, tool: 'music' | 'video', ready: string): Promise<void> {
  await pickTool(page, tool, ready);
  await pinSignedIn(page);
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
    // GG 2026-10-18: the video panel has no prompt; the chat box stays beside it, and Enter there still meets Agent G.
    await expect(page.getByTestId('composer-input')).toBeVisible();
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

// ─── A visitor without an account: talk is answered, anything that could spend asks them to sign in. ───

test.describe('signed out', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  async function openImageAsGuest(page: Page): Promise<void> {
    await pickTool(page, 'image', 'image-create-panel');
  }

  test('"hello" with the Image tool open gets Agent G\'s answer — not a sign-in wall, not a render', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImageAsGuest(page);
    await type(page, 'hello');
    // The unified composer (GG 2026-10-25): the Image tool keeps the conversation on screen, so the reply is a bubble in it.
    await expect(page.getByText('Yes, I am here! What shall we create?').last()).toBeVisible({ timeout: 20_000 });
    expect(calls.image).toHaveLength(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test('a real prompt still asks the visitor to sign in first, and nothing is sent', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openImageAsGuest(page);
    await type(page, 'a red fox in the snow, cinematic light');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
    expect(calls.image).toHaveLength(0);
    expect(calls.chat).toHaveLength(0);
  });
});

// ─── Plain chat and Avatar: Agent G directs there too. An order typed in the chat gets its card (it used to start a paid
// render on the sentence), and Avatar's words are a SCRIPT — a greeting there used to become a paid talking-head video. ───

test.describe('Agent G directs plain chat and Avatar', () => {
  test.beforeEach(async ({ page }) => { await seed(page); });

  async function openChat(page: Page): Promise<void> {
    await page.goto('/en/dashboard', { waitUntil: 'load' });
    await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
    // The studio opens on its last tool; plain chat is picked explicitly, as agent-g-chat-yes does.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'chat' })));
    await pinSignedIn(page);
  }

  test('chat: "draw me …" waits for Agent G’s card — the render starts only on Create, with the words as typed', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await type(page, 'draw a cozy cabin in a pine forest at dawn, soft light');
    const card = page.locator('[data-testid="agent-g-card"][data-kind="confirm"]');
    await expect(card).toBeVisible({ timeout: 15_000 });
    expect(Number(await page.getByTestId('agent-g-confirm').getAttribute('data-price'))).toBeGreaterThan(0);
    expect(calls.image).toHaveLength(0);
    expect(calls.chat).toHaveLength(0);
    await page.getByTestId('agent-g-confirm').click();
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe('draw a cozy cabin in a pine forest at dawn, soft light');
  });

  test('chat: a thin order gets questions; "yes" creates it as it is — and talk afterwards is just talk', async ({ page }) => {
    const calls = await mockRoutes(page);
    await openChat(page);
    await type(page, 'draw a cat');
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="clarify"]')).toBeVisible({ timeout: 15_000 });
    expect(calls.image).toHaveLength(0);
    await type(page, 'yes');
    await expect.poll(() => calls.image.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image[0]?.prompt).toBe('draw a cat');
    await type(page, 'are you there?');
    await expect.poll(() => calls.chat.length, { timeout: 20_000 }).toBe(1);
    expect(calls.image).toHaveLength(1);
  });

  /** Avatar's paid routes (a greeting must reach none) and its door: GET /api/avatar/veo says whether the built-in Veo
   *  avatar is open to this user and at what price (app/api/avatar/veo). The dummy-Supabase server has no user, so it
   *  would always answer closed; `door` stands in for the server's answer. */
  async function mockAvatar(page: Page, door: { open: boolean; credits: number }): Promise<{ spent: string[]; chat: number }> {
    const seen = { spent: [] as string[], chat: 0 };
    for (const glob of ['**/api/heygen/**', '**/api/video/lipsync**', '**/api/avatar/**']) {
      await page.route(glob, (route) => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'GET' && path === '/api/avatar/veo') {
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ...door, seconds: 8 }) });
        }
        if (route.request().method() !== 'POST') return route.fallback();
        seen.spent.push(path);
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

  test('Avatar: "აქ ხარ?" is answered in words — no presenter video is requested', async ({ page }) => {
    const seen = await mockAvatar(page, { open: true, credits: 25 });
    await openChat(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'avatar' })));
    await expect(page.getByTestId('avatar-templates')).toBeAttached({ timeout: 15_000 });
    await type(page, 'აქ ხარ?');
    await expect(page.getByText('Yes, I am here! What shall we create?').first()).toBeVisible({ timeout: 20_000 });
    expect(seen.chat).toBe(1);
    expect(seen.spent).toEqual([]);
    // A real script is confirmed first, and still nothing is requested until Create.
    await type(page, 'Welcome to my channel, today we cook khachapuri together');
    await expect(page.locator('[data-testid="agent-g-card"][data-kind="confirm"]')).toBeVisible({ timeout: 10_000 });
    // The card carries the door's own price, not the old avatar tool's.
    await expect(page.getByTestId('agent-g-confirm')).toHaveAttribute('data-price', '25');
    expect(seen.spent).toEqual([]);
  });

  test('Avatar: where the door is closed, a script is told so in words — no card, no price, nothing requested', async ({ page }) => {
    const seen = await mockAvatar(page, { open: false, credits: 25 });
    await openChat(page);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'avatar' })));
    await expect(page.getByTestId('avatar-templates')).toBeAttached({ timeout: 15_000 });
    await type(page, 'Welcome to my channel, today we cook khachapuri together');
    await expect(page.getByText(/isn.t available on your account yet/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('agent-g-card')).toHaveCount(0);
    expect(seen.spent).toEqual([]);
    expect(seen.chat).toBe(0);
  });
});
