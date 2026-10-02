import { test, expect, type Page } from '@playwright/test';

/**
 * EVERY SERVICE ITS OWN SESSION — in a real browser, the chat route mocked. The bug: a chat, then Image, then the
 * Photographer all landed in ONE conversation. Picking a tool now opens that tool's own session (fresh, or the one it had in
 * this visit), and going back to the chat brings the chat's thread back; History lists them separately.
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

test('a chat, then Music: Music opens on its own empty session; back to the chat, the chat thread is there', async ({ page }) => {
  await open(page);
  const box = page.getByTestId('composer-input');
  await box.fill('What is the capital of Georgia?');
  await box.press('Enter');
  await expect(page.getByText('Tbilisi is the capital of Georgia.').first()).toBeVisible({ timeout: 20_000 });

  await pick(page, 'music');
  await expect(page.getByTestId('music-create')).toBeAttached({ timeout: 15_000 });
  await expect(page.getByText('Tbilisi is the capital of Georgia.')).toHaveCount(0);
  // The question is now only the chat's entry in History — not a bubble in Music's thread.
  await expect(page.getByRole('button', { name: 'What is the capital of Georgia?' })).toHaveCount(1);
  await expect(page.getByText('What is the capital of Georgia?')).toHaveCount(1);

  await pick(page, 'chat');
  await expect(page.getByText('Tbilisi is the capital of Georgia.').first()).toBeVisible({ timeout: 10_000 });

  // Two sessions now: the chat (tagged chat) — and Music's stays empty, so History holds just the chat.
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes('conversations::')) ?? '';
    return JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ tool?: string; messages: unknown[] }>;
  });
  expect(saved.filter((c) => c.messages.length > 0).map((c) => c.tool)).toEqual(['chat']);
});

test('the Photographer, then Video, each start on their own session — the chat thread never follows them', async ({ page }) => {
  await open(page);
  const box = page.getByTestId('composer-input');
  await box.fill('hello there');
  await box.press('Enter');
  await expect(page.getByText('Tbilisi is the capital of Georgia.').first()).toBeVisible({ timeout: 20_000 });
  for (const tool of ['photoshoot', 'video']) {
    await pick(page, tool);
    await page.waitForTimeout(400);
    await expect(page.getByText('Tbilisi is the capital of Georgia.')).toHaveCount(0);
    await expect(page.getByText('hello there')).toHaveCount(1); // only the chat's History entry
  }
  await pick(page, 'chat');
  await expect(page.getByText('hello there').first()).toBeVisible({ timeout: 10_000 });
});
