import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';
import { mockStoredUpload, SIGNED_UPLOAD_URL } from './fixtures/uploads';

/**
 * What the chat can be given — photos, video, camera, files — and whether it can actually USE it, in a real browser against a
 * MOCKED /api/chat/gemini (nothing reaches a provider, nothing is charged).
 *
 *   · a QUESTION about an attached video is answered from its frames + soundtrack (made in the browser: the clip never
 *     travels in the chat request; it goes only to the user's own storage, on select), while an EDIT request still goes to
 *     the remix pipeline;
 *   · a Word file and a source file are read as TEXT (a .docx used to reach the model as bytes it could not read);
 *   · the tray names each document with its type and size;
 *   · a set that cannot fit the platform's request body is refused at the picker, with the limit named.
 *
 * Chromium here has no H.264, so the video fixture is a 4 s WebM (VP8 + Opus, 41 KB, tests/fixtures/clip.webm).
 */

const sse = (frames: unknown[]): string => frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');
const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));

/** A picked video uploads at once (upload on select); a test that counts uploads mocks them itself (mockRemix). */
async function mockUploads(page: Page): Promise<void> {
  let n = 0;
  await page.route('**/api/upload/sign', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `omni-uploads/u/file-${++n}`, token: 't', signedUrl: SIGNED_UPLOAD_URL }) }));
  await mockStoredUpload(page);
}

async function openChat(page: Page, opts: { ownUploads?: boolean } = {}): Promise<void> {
  if (!opts.ownUploads) await mockUploads(page);
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

  test('a picked video shows Ready and its length, and the remove button never covers the length', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openChat(page);
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    const tile = page.getByTestId('composer-attachment');
    await expect(tile).toHaveAttribute('data-status', 'ready', { timeout: 15_000 });
    const length = tile.getByTestId('composer-attachment-length');
    await expect(length).toHaveText(/^0:0[34]$/);
    const a = (await length.boundingBox())!;
    const b = (await tile.getByRole('button', { name: 'მოცილება' }).boundingBox())!;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap).toBe(false);
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

  // A CHARGED edit (here: a face swap, 15 credits) waits for Agent G's Create with the price on it — every other paid chat
  // order already did. Nothing runs or is charged before the tap; the clip itself uploads once, when it is picked (upload on
  // select, owner 2026-10-11), and the tap uses that stored copy. Edit hands the words and the clip back.
  async function mockRemix(page: Page, op: string): Promise<{ intent: unknown[]; remix: Array<Record<string, unknown>>; uploads: number[] }> {
    const calls = { intent: [] as unknown[], remix: [] as Array<Record<string, unknown>>, uploads: [] as number[] };
    await page.route('**/api/video/remix-intent', async (route) => {
      calls.intent.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ op, params: {} }) });
    });
    await page.route('**/api/upload/sign', (route) => { calls.uploads.push(1); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `omni-uploads/u/clip-${calls.uploads.length}`, token: 't', signedUrl: SIGNED_UPLOAD_URL }) }); });
    await mockStoredUpload(page);
    await page.route(/\/storage\/v1\/object\/upload\/sign\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"uploads/u/x"}' }));
    await page.route('**/api/video/remix', async (route) => {
      calls.remix.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://e2e-media.supabase.co/swapped.mp4', charged: true, method: 'roop' }) });
    });
    return calls;
  }

  test('a CHARGED edit waits for Agent G\'s Create with the price on it; nothing runs before the tap, and the clip uploads once', async ({ page }) => {
    await mockChat(page);
    const calls = await mockRemix(page, 'face_swap');
    await openChat(page, { ownUploads: true });
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    await expect(page.getByTitle('clip.webm')).toBeVisible();
    await send(page, 'შეცვალე პერსონაჟი ამ ვიდეოში');
    const create = page.getByTestId('agent-g-confirm');
    await expect(create).toBeVisible({ timeout: 15_000 });
    await expect(create).toHaveAttribute('data-price', '15');
    // The question names the file and the engine (an outside service, not Google or ElevenLabs).
    await expect(page.getByText(/^ვიდეოს ეს რედაქტირება, „პერსონაჟის შეცვლა", 15 კრედიტი ღირს\. ფაილები: clip\.webm\. ძრავა: გარე სერვისი .*დავიწყო\?$/)).toBeVisible();
    expect(calls.uploads).toEqual([1]);
    expect(calls.remix).toEqual([]);
    await create.click();
    await expect.poll(() => calls.remix.length, { timeout: 15_000 }).toBe(1);
    expect(calls.uploads).toEqual([1]);
    expect(calls.remix[0]).toMatchObject({ op: 'face_swap', videoUrl: 'omni-uploads/u/clip-1' });
    await expect(page.getByTestId('agent-g-confirm')).toHaveCount(0);   // the card is spent: a second tap cannot run it again
    await expect(page.locator('video[src^="https://e2e-media.supabase.co/swapped.mp4"]')).toBeAttached({ timeout: 15_000 });
  });

  test('Edit on the price card runs nothing and puts the words and the clip back in the composer', async ({ page }) => {
    await mockChat(page);
    const calls = await mockRemix(page, 'background_remove');
    await openChat(page, { ownUploads: true });
    await page.locator('input[type=file][accept="video/*"][multiple]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: CLIP });
    await send(page, 'ფონი მოაშორე');
    await expect(page.getByTestId('agent-g-edit')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('agent-g-edit').click();
    await expect(page.getByTestId('composer-input')).toHaveValue('ფონი მოაშორე');
    await expect(page.getByTitle('clip.webm')).toBeVisible();
    await expect(page.getByTestId('agent-g-confirm')).toHaveCount(0);
    expect(calls.uploads).toEqual([1]);   // the upload on select, and no other
    expect(calls.remix).toEqual([]);
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
