import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * The product chat's stream, driven through a real browser against a MOCKED /api/chat/gemini.
 *
 * What only a browser can show: the SSE frames the route writes (lib/chat/sse.ts) reach the screen through
 * useChatStream → chatStreamStore → StreamingBubble, and the finished turn is committed as a normal message —
 * markdown with a code block, the Search sources as chips, the model that answered — with the composer usable again.
 * The unit suites cover each piece; this covers the wiring between them. And the chat's Gemini layout
 * (docs/DESIGN.md §12): the model switcher in the header, no settings column, the composer centred when empty.
 *
 * The chat is sign-in only (the route answers a guest 401 before the model is called), and the studio stops a
 * guest in the browser by reading `<html data-authed>`. There is no Supabase session in this run, so the init
 * script pins that flag to '1' — the request itself never leaves the browser (it is fulfilled by the mock).
 */

const sse = (frames: unknown[]): string =>
  frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

async function openChat(page: Page): Promise<void> {
  // Side calls a finished turn may make (title, persistence) — answered so they can't hang or 401 the run.
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ტესტი"}' }));
  await page.goto('/ka/dashboard?tool=chat');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 20_000 });
  // `?tool=chat` is applied by an effect after mount (the studio opens on Video); sending before it lands would
  // run the Video tool instead of the chat. The model switcher exists only in the chat, so it is the signal.
  await expect(switcher(page)).toBeVisible({ timeout: 10_000 });
  // Pinned AFTER mount: ChatChrome publishes '0' from an effect, and an init script runs before <html> exists.
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

/** The model switcher on screen — the desktop bar's at this width (the phone header's copy is hidden). */
function switcher(page: Page) {
  return page.getByTestId('model-switcher').filter({ visible: true });
}

async function sendTurn(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

test.describe('chat streaming (mocked SSE)', () => {
  test('a streamed reply lands as markdown, code, sources and the model that answered', async ({ page }) => {
    let body: { protocol?: number; mode?: string; tier?: string; messages?: Array<{ role: string; content: unknown }> } | null = null;
    await page.route('**/api/chat/gemini', async (route: Route) => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
        body: sse([
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
          { text: '## თბილისი\n\n' },
          { text: 'თბილისი საქართველოს **დედაქალაქია**.\n\n' },
          { text: '```ts\nconst city = "Tbilisi";\n```\n' },
          { sources: [{ url: 'https://en.wikipedia.org/wiki/Tbilisi', title: 'Tbilisi — Wikipedia' }] },
          { usage: { model: 'gemini-3.8-flash', inputTokens: 12, outputTokens: 30, totalTokens: 42 } },
          '[DONE]',
        ]),
      });
    });
    await openChat(page);
    await sendTurn(page, 'რა არის საქართველოს დედაქალაქი?');

    await expect(page.getByRole('heading', { name: 'თბილისი' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('strong', { hasText: 'დედაქალაქია' })).toBeVisible();
    await expect(page.locator('pre code', { hasText: 'const city' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tbilisi — Wikipedia/ })).toBeVisible();
    // Who answered closes the reply's action row, by name — never a raw id, and never above the text.
    await expect(page.getByTestId('reply-model').first()).toHaveText('Gemini 3.8 Flash');
    await expect(page.getByText('gemini-3.8-flash', { exact: true })).toHaveCount(0);

    // The request: protocol 2 (errors arrive as frames, never as reply text), the chat MODE (never a model id, and
    // no legacy tier) and the history the server re-validates.
    expect(body).not.toBeNull();
    expect(body!.protocol).toBe(2);
    expect(body!.mode).toBe('fast');
    expect(body!).not.toHaveProperty('tier');
    expect(body!).not.toHaveProperty('model');
    const last = body!.messages?.[body!.messages.length - 1];
    expect(last?.role).toBe('user');
    expect(JSON.stringify(last?.content)).toContain('დედაქალაქი');

    // The turn is over: the composer is empty and takes the next message.
    await expect(page.getByTestId('composer-input')).toHaveValue('');
    await expect(page.getByTestId('composer-input')).toBeEnabled();
  });

  test('Stop mid-stream keeps the text already read, and the next turn streams normally', async ({ page }) => {
    await openChat(page);
    // A reply that streams two paragraphs and then HANGS (never closes) — only an in-page fetch can hold a stream
    // open; page.route needs the whole body up front. The second call answers normally.
    await page.evaluate(() => {
      const realFetch = window.fetch.bind(window);
      let n = 0;
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/api/chat/gemini')) return realFetch(input, init);
        n += 1;
        const enc = new TextEncoder();
        const frame = (f: unknown) => enc.encode(`data: ${JSON.stringify(f)}\n\n`);
        const first = n === 1;
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(frame({ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }));
            if (first) {
              c.enqueue(frame({ text: 'პირველი აბზაცი უკვე ჩანს.\n\n' }));
              c.enqueue(frame({ text: 'მეორე აბზაციც.' }));
              init?.signal?.addEventListener('abort', () => { try { c.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
              return; // hangs until Stop
            }
            c.enqueue(frame({ text: 'ახალი პასუხი.' }));
            c.enqueue(enc.encode('data: [DONE]\n\n'));
            c.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
      };
    });
    await sendTurn(page, 'მომიყევი საქართველოს ისტორიაზე');
    await expect(page.getByText('პირველი აბზაცი უკვე ჩანს.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'შეჩერება' }).first().click();
    // What the user already read stays — Stop used to replace it with a bare "Stopped" note.
    await expect(page.getByText('პირველი აბზაცი უკვე ჩანს.')).toBeVisible();
    await expect(page.getByText('მეორე აბზაციც.')).toBeVisible();
    await expect(page.getByText('⏹ შეჩერდა')).toHaveCount(0);

    await sendTurn(page, 'რა არის საქართველოს დედაქალაქი?');
    await expect(page.getByText('ახალი პასუხი.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('პირველი აბზაცი უკვე ჩანს.')).toBeVisible();
  });

  test('an error frame renders a localized error, never raw provider text', async ({ page }) => {
    await page.route('**/api/chat/gemini', (route) => route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body: sse([
        { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
        { error: { code: 'quota', retryable: true, message: 'RESOURCE_EXHAUSTED: prepayment credits are depleted' } },
      ]),
    }));
    await openChat(page);
    await sendTurn(page, 'გამარჯობა');

    // The provider's own words must not reach the user (lib/api/providerError.ts contract).
    await expect(page.getByText('AI სერვისი დროებით მიუწვდომელია').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/RESOURCE_EXHAUSTED|prepayment/)).toHaveCount(0);
    await expect(page.getByTestId('composer-input')).toBeEnabled();
  });
});

test.describe('the chat is Gemini’s (docs/DESIGN.md §12)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('no settings column and no settings toggle in the chat; both come back with the video tool', async ({ page }) => {
    await openChat(page);
    // Hidden, never unmounted (DESIGN §8: a panel's in-flight state must survive).
    await expect(page.locator('#studio-settings')).toHaveCount(1);
    await expect(page.locator('#studio-settings')).toBeHidden();
    await expect(page.getByTestId('settings-panel-toggle')).toHaveCount(0);
    await expect(page.getByTestId('options-toggle')).toHaveCount(0); // the composer's tool chip is not in the chat
    await expect(page.getByPlaceholder('ჰკითხე MyAvatar-ს')).toBeVisible();
    await expect(page.getByTestId('chat-disclaimer')).toHaveText('MyAvatar ხელოვნური ინტელექტია და შეიძლება შეცდეს.');
    await expect(page.locator('header').filter({ visible: true })).toHaveCount(1);

    await page.locator('aside[aria-label="მენიუ"]').getByRole('button', { name: 'ვიდეო', exact: true }).click();
    await expect(page.locator('#studio-settings')).toBeVisible();
    await expect(page.getByTestId('settings-panel-toggle')).toHaveCount(1);
    await expect(page.getByTestId('options-toggle')).toHaveText('ვიდეო · 9:16 · 24წმ');
    await expect(switcher(page)).toHaveCount(0);
  });

  test('choosing Pro in the switcher sends the NEXT turn as Pro — no reload, no new session', async ({ page }) => {
    const bodies: Array<{ mode?: string; tier?: string }> = [];
    await page.route('**/api/chat/gemini', async (route: Route) => {
      bodies.push(route.request().postDataJSON());
      const second = bodies.length > 1;
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
        body: sse(second
          // The daily Pro allowance is spent: the route answers with Flash and says so in the meta frame.
          ? [{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast', requestedMode: 'pro', reason: 'pro_cap' } }, { text: 'მეორე პასუხი.' }, '[DONE]']
          : [{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'პირველი პასუხი.' }, '[DONE]']),
      });
    });
    await openChat(page);
    await sendTurn(page, 'პირველი კითხვა');
    await expect(page.getByText('პირველი პასუხი.')).toBeVisible({ timeout: 15_000 });
    expect(bodies[0]?.mode).toBe('fast');

    await switcher(page).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitemradio', { name: /3\.8 Flash(?! Thinking)/ })).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: /3\.1 Pro/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(switcher(page)).toContainText('3.1 Pro');

    await sendTurn(page, 'მეორე კითხვა');
    await expect(page.getByText('მეორე პასუხი.')).toBeVisible({ timeout: 15_000 });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.mode).toBe('pro');
    expect(bodies[1]).not.toHaveProperty('tier');
    // The first answer is still on screen: the switch did not start a new session.
    await expect(page.getByText('პირველი პასუხი.')).toBeVisible();
    // The downgrade is said once, above the reply, and the reply names the model that really answered.
    await expect(page.getByText('Pro-ს დღიური ლიმიტი ამოიწურა — პასუხი გაეცა 3.8 Flash-ით.')).toBeVisible();
    await expect(page.getByTestId('reply-model').last()).toHaveText('Gemini 3.8 Flash');
    // Per viewer, and it survives the next session.
    expect(await page.evaluate(() => window.localStorage.getItem('myavatar:chat-mode'))).toBe('pro');
  });

  test('the empty chat centres the composer: greeting above, chips below, Gemini’s 64 px pill', async ({ page }) => {
    await openChat(page);
    const pillLoc = page.getByTestId('composer-input').locator('xpath=..');
    const pill = (await pillLoc.boundingBox())!;
    const centre = pill.y + pill.height / 2;
    expect(centre).toBeGreaterThan(800 * 0.35);
    expect(centre).toBeLessThan(800 * 0.65);
    const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    const chips = (await page.getByRole('group', { name: 'დაიწყე' }).boundingBox())!;
    expect(h1.y + h1.height).toBeLessThanOrEqual(pill.y);
    expect(chips.y).toBeGreaterThanOrEqual(pill.y + pill.height);
    expect(pill.height).toBeGreaterThanOrEqual(63);
    expect(await pillLoc.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('32px');
    // With text: Send is the filled accent circle, and it takes the Live slot.
    await page.getByTestId('composer-input').fill('გამარჯობა');
    await expect(page.getByRole('button', { name: 'გაგზავნა' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ცოცხალი ხმა' })).toHaveCount(0);
  });
});
