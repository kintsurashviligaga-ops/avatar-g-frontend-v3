import { test, expect, type Page } from '@playwright/test';

/**
 * Voice → screen: the studio's side of the Gemini Live actions, in a real browser (docs/voice/LIVE_ACTIONS.md).
 *
 * The Live socket is not opened here — the model's function calls reach the page as the cancelable
 * `myavatar:live-action` window event (components/voice/live/liveActions.ts dispatches it), so the test dispatches it
 * the same way and reads what the studio did: `preventDefault()` is its receipt, `detail.reply` its answer to the
 * model, and the screen is what the user sees change. Nothing here can spend a credit: `start_generation` is not
 * dispatched (its countdown and confirmation are unit-tested in liveActions.test.tsx).
 *
 * As in chat-streaming.spec.ts, there is no Supabase session in this run: `<html data-authed>` is pinned to '1' after
 * mount, and the chat route is mocked.
 */

interface Fired { took: boolean; reply: Record<string, unknown> | null }

/** Dispatch one live action the way liveActions.ts does, and return the receipt and the studio's reply. */
async function fire(page: Page, detail: Record<string, unknown>): Promise<Fired> {
  return page.evaluate((d) => {
    const e = new CustomEvent('myavatar:live-action', { detail: d, cancelable: true });
    const took = !window.dispatchEvent(e);
    return { took, reply: ((d as { reply?: Record<string, unknown> }).reply ?? null) };
  }, detail);
}

/** What the studio reports is on screen (get_screen_state). */
async function screenState(page: Page): Promise<Record<string, unknown>> {
  const r = await fire(page, { type: 'get_screen_state' });
  expect(r.took).toBe(true);
  return (r.reply?.state ?? {}) as Record<string, unknown>;
}

async function openStudio(page: Page): Promise<void> {
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ტესტი"}' }));
  await page.goto('/ka/dashboard?tool=chat');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

test.describe('Live actions on the studio', () => {
  test('the agent reads the screen, then prepares an image — the studio, prompt and settings change, nothing runs', async ({ page }) => {
    await openStudio(page);
    expect(await screenState(page)).toMatchObject({ tool: 'chat' });

    const prepared = await fire(page, {
      type: 'prepare_generation', tool: 'image', prompt: 'წითელი მელია თოვლში', aspectRatio: '9:16', style: 'watercolour',
    });
    expect(prepared.took).toBe(true);
    // The answer says what the panel actually took (the spoken "watercolour" is the panel's Watercolor) and the price.
    expect(prepared.reply).toMatchObject({ ok: true, tool: 'image', applied: { aspectRatio: '9:16' } });
    expect(String((prepared.reply?.applied as { style?: string }).style)).toMatch(/watercolor/i);
    expect(typeof prepared.reply?.priceCredits).toBe('number');

    await expect(page.getByTestId('composer-input')).toHaveValue('წითელი მელია თოვლში');
    await expect.poll(async () => (await screenState(page)).tool, { timeout: 10_000 }).toBe('image');
    const state = await screenState(page);
    expect(state).toMatchObject({ tool: 'image', prompt: 'წითელი მელია თოვლში', busy: false });
    // Prepared, never started: no generation is running.
    expect(state.runningGenerations ?? []).toEqual([]);
  });

  test('every service by voice: the photographer, the interior designer and a product ad are prepared with their price — and a start that lacks the user\'s file is refused in words, nothing runs', async ({ page }) => {
    await openStudio(page);

    // The photographer: the brief lands in ITS form (not the composer), the shape is the panel's own, the price is its button's.
    const shoot = await fire(page, { type: 'prepare_generation', tool: 'photoshoot', prompt: 'სტუდიური პორტრეტი თბილ შუქზე', aspectRatio: '4:5' });
    expect(shoot.took).toBe(true);
    expect(shoot.reply).toMatchObject({ ok: true, tool: 'photoshoot', applied: { prompt: true, aspectRatio: '4:5' } });
    expect(typeof shoot.reply?.priceCredits).toBe('number');
    expect(String(shoot.reply?.message)).toMatch(/No photo of the user/);
    await expect.poll(async () => (await screenState(page)).tool, { timeout: 10_000 }).toBe('photoshoot');
    await expect(page.getByTestId('photoshoot-brief').filter({ visible: true })).toHaveValue('სტუდიური პორტრეტი თბილ შუქზე');
    // A brief is enough to run — the start is accepted (its countdown is the call's, and it is never fired here).
    expect((await fire(page, { type: 'start_generation', confirmed: 'yes' })).reply).toMatchObject({ ok: true, tool: 'photoshoot' });

    const room = await fire(page, { type: 'prepare_generation', tool: 'interior', prompt: 'სკანდინავიური მისაღები ოთახი' });
    expect(room.reply).toMatchObject({ ok: true, tool: 'interior', applied: { prompt: true } });
    await expect.poll(async () => (await screenState(page)).tool, { timeout: 10_000 }).toBe('interior');
    await expect(page.getByTestId('interior-brief').filter({ visible: true })).toHaveValue('სკანდინავიური მისაღები ოთახი');

    // A product ad needs the product photo — a file only the user can pick: prepared with its price, the start refused in words.
    const ad = await fire(page, { type: 'prepare_generation', tool: 'product', prompt: 'ქართული ღვინო — გემო, რომელიც გახსოვს' });
    expect(ad.reply).toMatchObject({ ok: true, tool: 'product' });
    expect(typeof ad.reply?.priceCredits).toBe('number');
    expect(String(ad.reply?.message)).toMatch(/product photo/);
    await expect.poll(async () => (await screenState(page)).tool, { timeout: 10_000 }).toBe('product');
    const start = await fire(page, { type: 'start_generation', confirmed: 'yes' });
    expect(start.reply).toMatchObject({ ok: false, error: 'missing_input' });
    expect(String(start.reply?.message)).toMatch(/product photo/);
    expect((await screenState(page)).runningGenerations ?? []).toEqual([]);
  });

  test('chat_send from another studio opens the chat and sends the message there', async ({ page }) => {
    let sent: { messages?: Array<{ role: string; content: unknown }> } | null = null;
    await page.route('**/api/chat/gemini', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        body: [
          { meta: { provider: 'gemini', model: 'gemini-3.8-flash' } },
          { text: 'გამარჯობა! რით დაგეხმარო?' },
        ].map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n',
      });
    });
    await openStudio(page);
    expect((await fire(page, { type: 'open_studio', tool: 'image' })).took).toBe(true);
    await expect.poll(async () => (await screenState(page)).tool, { timeout: 10_000 }).toBe('image');

    const r = await fire(page, { type: 'chat_send', text: 'გამარჯობა' });
    expect(r.took).toBe(true);
    await expect(page.getByText('გამარჯობა! რით დაგეხმარო?')).toBeVisible({ timeout: 15_000 });
    expect(await screenState(page)).toMatchObject({ tool: 'chat', lastChatReply: expect.stringContaining('რით დაგეხმარო') });
    const last = sent!.messages![sent!.messages!.length - 1]!;
    expect(last.role).toBe('user');
    expect(JSON.stringify(last.content)).toContain('გამარჯობა');
  });

  test('an unknown action is not taken, so the model hears the truth instead of "done"', async ({ page }) => {
    await openStudio(page);
    expect((await fire(page, { type: 'no_such_action' })).took).toBe(false);
  });

  test('the docked call moves the studio down by the bar, instead of covering it', async ({ page }) => {
    await openStudio(page);
    // The STUDIO's shell (ChatChrome). AppShell's outer box is an `.ag-fixed-shell` too, and it comes first — it must
    // NOT move: shifted by the dock in flow, it grew the document and the body scrolled by the dock's height.
    const shell = page.locator('.ag-fixed-shell:not(.app-native-shell)');
    await expect(shell).toBeVisible();
    const before = await shell.boundingBox();
    await page.evaluate(() => { document.documentElement.dataset.liveDocked = '1'; });
    await expect.poll(async () => (await shell.boundingBox())?.y ?? 0).toBeGreaterThanOrEqual((before?.y ?? 0) + 50);
    // ⚠️ The body is the scroller, not the window (window.scrollY stays 0), so every ancestor is probed.
    const scrolls = await page.evaluate(() => {
      const found: string[] = [];
      const start = document.querySelector('.ag-fixed-shell:not(.app-native-shell)')!.parentElement;
      for (let el = start; el; el = el.parentElement) {
        const was = el.scrollTop;
        el.scrollTop = 10_000;
        if (el.scrollTop > 0) found.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} by ${el.scrollTop}px`);
        el.scrollTop = was;
      }
      return found;
    });
    expect(scrolls).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.liveDocked; });
    await expect.poll(async () => (await shell.boundingBox())?.y ?? -1).toBe(before?.y ?? 0);
  });
});
