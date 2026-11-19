import { test, expect, type Page } from '@playwright/test';

/**
 * ONE CONVERSATION (GG 2026-10-25, the unified composer) — in a real browser, the chat route mocked. Picking a service is a
 * setting of the conversation on screen: the thread, its History entry and the current conversation id all stay. (Until
 * 2026-10-25 every tool opened its own session.)
 */

const sse = (text: string): string =>
  [`data: ${JSON.stringify({ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } })}`, `data: ${JSON.stringify({ text })}`, 'data: [DONE]']
    .map((l) => `${l}\n\n`).join('');

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
  await page.route('**/api/chat/gemini', (route) => route.fulfill({
    status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body: sse('Tbilisi is the capital of Georgia.'),
  }));
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  await page.goto('/en/dashboard', { waitUntil: 'load' });
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
}

const pick = (page: Page, tool: string) => page.evaluate((t) => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: t })), tool);

test.use({ viewport: { width: 1280, height: 800 } });

/** The ids of the conversations History holds with something in them. */
const threadIds = async (page: Page): Promise<string[]> => {
  await page.waitForTimeout(600); // the idle auto-save
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('conversations::')) ?? '';
    const list = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string; messages: unknown[] }>;
    return list.filter((c) => c.messages.length > 0).map((c) => c.id);
  });
};

test('a chat, then Music, then back: one conversation the whole way, the chat thread still there', async ({ page }) => {
  await open(page);
  const box = page.getByTestId('composer-input');
  await box.fill('What is the capital of Georgia?');
  await box.press('Control+Enter');
  await expect(page.getByText('Tbilisi is the capital of Georgia.').first()).toBeVisible({ timeout: 20_000 });
  const before = await threadIds(page);
  expect(before).toHaveLength(1);

  await pick(page, 'music');
  await expect(page.getByTestId('music-create')).toBeAttached({ timeout: 15_000 });
  expect(await threadIds(page)).toEqual(before);

  await pick(page, 'chat');
  await expect(page.getByText('Tbilisi is the capital of Georgia.').first()).toBeVisible({ timeout: 10_000 });
  expect(await threadIds(page)).toEqual(before);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('Image, then Video: the chat answer stays on screen above the composer the whole way', async ({ page }) => {
    await open(page);
    const box = page.getByTestId('composer-input');
    await box.fill('hello there');
    await box.press('Control+Enter');
    const answer = page.getByText('Tbilisi is the capital of Georgia.').first();
    await expect(answer).toBeVisible({ timeout: 20_000 });
    const before = await threadIds(page);
    for (const tool of ['image', 'video']) {
      await pick(page, tool);
      await expect(answer).toBeVisible({ timeout: 10_000 });
      expect(await threadIds(page)).toEqual(before);
    }
  });
});
