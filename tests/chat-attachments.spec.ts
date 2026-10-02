import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * What the chat can be given — photos, video, camera, files — and whether it can actually USE it, in a real browser against a
 * MOCKED /api/chat/gemini (nothing reaches a provider, nothing is charged).
 *
 *   · a QUESTION about an attached video is answered from its frames + soundtrack (made in the browser: no upload, the clip
 *     never travels), while an EDIT request still goes to the remix pipeline;
 *   · a Word file and a source file are read as TEXT (a .docx used to reach the model as bytes it could not read);
 *   · the tray names each document with its type and size;
 *   · a set that cannot fit the platform's request body is refused at the picker, with the limit named.
 *
 * Chromium here has no H.264, so the video fixture is a 4 s WebM (VP8 + Opus, 41 KB, tests/fixtures/clip.webm).
 */

const sse = (frames: unknown[]): string => frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');
const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));

async function openChat(page: Page): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.route('**/api/chat/title', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ტესტი"}' }));
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
}

type Part = { type: string; text?: string; image?: string; data?: string; mimeType?: string; name?: string };
type Body = { messages?: Array<{ role: string; content: string | Part[] }> };

/** Answers the chat with a canned reply and hands back every request body it saw. */
async function mockChat(page: Page): Promise<Body[]> {
  const bodies: Body[] = [];
  await page.route('**/api/chat/gemini', async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash', mode: 'fast' } }, { text: 'პასუხი.' }, '[DONE]']),
    });
  });
  return bodies;
}

const lastUserParts = (b: Body): Part[] => {
  const user = [...(b.messages ?? [])].reverse().find((m) => m.role === 'user');
  return Array.isArray(user?.content) ? user!.content : [{ type: 'text', text: String(user?.content ?? '') }];
};
const decode = (dataUrl: string | undefined) => Buffer.from((dataUrl ?? '').split(',')[1] ?? '', 'base64').toString('utf8');

async function send(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('the chat reads what it is given', () => {
  test('a question about an attached video is answered from its frames and soundtrack — the clip itself never travels', async ({ page }) => {
    const bodies = await mockChat(page);
    const remix: string[] = [];
    page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/video/remix')) remix.push(r.url()); });
    await openChat(page);
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    await expect(page.getByTitle('clip.webm')).toBeVisible();
    await send(page, 'რა ხდება ამ ვიდეოში?');
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(1);
    const parts = lastUserParts(bodies[0]!);
    const frames = parts.filter((p) => p.type === 'image');
    expect(frames.length).toBeGreaterThanOrEqual(3);                                  // a 4 s clip: one frame per second
    expect(frames.every((p) => (p.image ?? '').startsWith('data:image/jpeg'))).toBe(true);
    const audio = parts.find((p) => p.type === 'file' && p.mimeType === 'audio/wav');
    expect(audio).toBeTruthy();                                                        // its soundtrack, as WAV
    const info = parts.find((p) => p.type === 'file' && p.mimeType === 'text/plain');
    expect(decode(info?.data)).toContain('Video "clip.webm"');
    expect(parts.some((p) => (p.mimeType ?? '').startsWith('video/'))).toBe(false);   // never the clip
    expect(parts.find((p) => p.type === 'text')?.text).toBe('რა ხდება ამ ვიდეოში?');
    expect(remix).toEqual([]);                                                          // not an edit: nothing charged
    await expect(page.getByText('პასუხი.')).toBeVisible();
  });

  test('a video with no words is asked the default question, in the user\'s language', async ({ page }) => {
    const bodies = await mockChat(page);
    await openChat(page);
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    await expect(page.getByTitle('clip.webm')).toBeVisible();
    await page.getByRole('button', { name: 'გაგზავნა' }).click();
    await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(1);
    expect(lastUserParts(bodies[0]!).find((p) => p.type === 'text')?.text).toContain('აღწერე ეს ვიდეო');
  });

  test('an EDIT request on a video still goes to the remix pipeline, not to the chat', async ({ page }) => {
    const bodies = await mockChat(page);
    const intent: unknown[] = [];
    await page.route('**/api/video/remix-intent', async (route) => {
      intent.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ op: 'add_subtitles', params: {} }) });
    });
    await openChat(page);
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    await expect(page.getByTitle('clip.webm')).toBeVisible();
    await send(page, 'სუბტიტრები დაამატე');
    await expect.poll(() => intent.length, { timeout: 15_000 }).toBe(1);
    expect(bodies).toEqual([]);
  });

  test('a Word file is read as text: it travels as text/plain under its own name', async ({ page }) => {
    const bodies = await mockChat(page);
    await page.route('**/api/utils/extract-text', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'ხელშეკრულება №1: მხარეები თანხმდებიან…' }) }));
    await openChat(page);
    await page.locator('input[type=file][accept*="application/pdf"][multiple]').setInputFiles({
      name: 'deal.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004 not really a zip'),
    });
    const chip = page.getByTitle('deal.docx');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('deal.docx');
    await expect(chip).toContainText(/docx/i);            // its type (drawn upper-case) …
    await expect(chip).toContainText(/\d+ B|KB/);        // … and its size
    await send(page, 'რას ამბობს დოკუმენტი?');
    await expect.poll(() => bodies.length).toBe(1);
    const doc = lastUserParts(bodies[0]!).find((p) => p.type === 'file' && p.name === 'deal.docx');
    expect(doc?.mimeType).toBe('text/plain');
    expect(decode(doc?.data)).toBe('ხელშეკრულება №1: მხარეები თანხმდებიან…');
  });

  test('a source file is read as text too', async ({ page }) => {
    const bodies = await mockChat(page);
    await openChat(page);
    await page.locator('input[type=file][accept*="application/pdf"][multiple]').setInputFiles({ name: 'app.py', mimeType: 'text/x-python', buffer: Buffer.from('print("გამარჯობა")\n') });
    await expect(page.getByTitle('app.py')).toBeVisible();
    await send(page, 'რას აკეთებს ეს კოდი?');
    await expect.poll(() => bodies.length).toBe(1);
    const code = lastUserParts(bodies[0]!).find((p) => p.type === 'file' && p.name === 'app.py');
    expect(['text/plain', 'text/x-python']).toContain(code?.mimeType);   // both are on Gemini's inline list
    expect(decode(code?.data)).toBe('print("გამარჯობა")\n');
  });

  test('a set that cannot fit the request body is refused at the picker, with the limit named — and nothing is attached', async ({ page }) => {
    await openChat(page);
    await page.locator('input[type=file][accept*="application/pdf"][multiple]').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4_300_000, 65) });
    await expect(page.getByText(/ძალიან დიდია/).first()).toBeVisible();
    await expect(page.getByTitle('big.pdf')).toHaveCount(0);
  });
});
