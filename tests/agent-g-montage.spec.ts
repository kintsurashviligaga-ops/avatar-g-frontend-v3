import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AGENT G CUTS THE CLIPS TO THE TRACK, IN THE CHAT (media execution, slice 1) — in a real browser, with every server route
 * mocked (nothing is uploaded, analysed, rendered or charged). The contract:
 *
 *   · clips + one track + „cut these to the music" asks /api/agent/media/montage for a PLAN with EVERY file, in order — not
 *     the video remix, which took the first clip and dropped the rest;
 *   · the plan is a card with its numbers and price; nothing runs until Start;
 *   · Start runs that signed plan once, and the master plays in the same thread;
 *   · Cancel drops the plan and runs nothing;
 *   · while the route says the feature is closed to this user, the chat keeps its old flow.
 */

const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));

function wav(seconds = 6, rate = 8000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 3000), 44 + i * 2);
  return buf;
}

const QUOTE = { jobId: '11111111-2222-4333-8444-555555555555', credits: 0, totalSec: 19.97, shots: 8, clips: 2, aspect: '16:9', beatSynced: true, bpm: 119.96, musicStartSec: 0.23, unusedFiles: [], expiresAt: Date.now() + 1_800_000 };

interface Calls { quote: Array<Record<string, unknown>>; run: Array<Record<string, unknown>>; cancel: unknown[]; remixIntent: unknown[] }

async function open(page: Page, enabled: boolean): Promise<Calls> {
  const calls: Calls = { quote: [], run: [], cancel: [], remixIntent: [] };
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  let n = 0;
  await page.route('**/api/upload/sign', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `omni-uploads/u/file-${++n}`, token: 't' }) }));
  await page.route(/\/storage\/v1\/object\/upload\/sign\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"uploads/u/x"}' }));
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  await page.route('**/api/orchestrator/jobs**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [{ id: QUOTE.jobId, status: 'processing', pct: 55, current_stage: 'stitch' }] }) }));
  await page.route('**/api/video/remix-intent', async (r: Route) => {
    calls.remixIntent.push(r.request().postDataJSON());
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ op: 'add_music', params: {} }) });
  });
  await page.route('**/api/video/remix', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"mocked"}' }));
  await page.route('**/api/agent/media/montage', async (r: Route) => {
    if (r.request().method() === 'GET') {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled }) });
      return;
    }
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'quote') {
      calls.quote.push(body);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quote: QUOTE, request: { shots: ['signed plan'] }, token: 'signed-token' }) });
    } else if (body.action === 'run') {
      calls.run.push(body);
      await new Promise((res) => setTimeout(res, 3_500)); // long enough for one progress read
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: QUOTE.jobId, videoUrl: 'https://media.test/agent-montage.mp4', durationSec: 19.97, aspect: '16:9', replay: false }) });
    } else {
      calls.cancel.push(body);
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
  });
  await page.goto('/en/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 45_000 });
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
  return calls;
}

async function attachAndSend(page: Page, text: string, song: Buffer = wav()): Promise<void> {
  await page.locator('input[type=file][multiple][accept^="image/*,audio/*,video/*"]').setInputFiles([
    { name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP },
    { name: 'city.webm', mimeType: 'video/webm', buffer: CLIP },
    { name: 'song.wav', mimeType: 'audio/wav', buffer: song },
  ]);
  await expect(page.getByTitle('song.wav')).toBeVisible({ timeout: 10_000 });
  await say(page, text);
}

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('Agent G cuts the clips to the track in the chat', () => {
  test('every file goes into one plan; the card shows it; Start runs it once and the master plays in the thread', async ({ page }) => {
    const calls = await open(page, true);
    await attachAndSend(page, 'cut these to the music');

    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toEqual([{ action: 'quote', files: ['omni-uploads/u/file-1', 'omni-uploads/u/file-2', 'omni-uploads/u/file-3'], prompt: 'cut these to the music' }]);
    await expect(card).toContainText('8 shots');
    await expect(card).toContainText('120 BPM');
    await expect(page.getByTestId('agent-montage-start')).toContainText('Free');
    await expect(page.getByText('Plan: 8 shots from 2 clips, 20 s, 16:9')).toBeVisible();
    expect(calls.run).toEqual([]);          // nothing runs before Start
    expect(calls.remixIntent).toEqual([]);  // the remix (first clip only) is not involved

    // A double tap is still one Start.
    await page.getByTestId('agent-montage-start').dblclick();
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByText('Joining the shots')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('video[src^="https://media.test/agent-montage.mp4"]')).toBeAttached({ timeout: 20_000 });
    await expect(page.getByText(/Ready: 20 s, cut to your track/)).toBeVisible();
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
    expect(calls.run).toEqual([{ action: 'run', request: { shots: ['signed plan'] }, token: 'signed-token', prompt: 'cut these to the music' }]);

    // The next chat turn does not carry the clips or the track: they went to the edit, not to the model.
    const chat: string[] = [];
    await page.route('**/api/chat/gemini', (r) => { chat.push(r.request().postData() ?? ''); return r.fulfill({ status: 500, body: '' }); });
    await say(page, 'thanks, looks great');
    await expect.poll(() => chat.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(chat[0]).toContain('looks great');
    expect(chat[0]).not.toMatch(/data:(video|audio)\//);
  });

  test('Cancel drops the plan and runs nothing', async ({ page }) => {
    const calls = await open(page, true);
    await attachAndSend(page, 'make a reel to this song');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-cancel').click();
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
    await expect(page.getByText('Edit stopped.')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.run).toEqual([]);
  });

  test('a real-size song (over the chat\'s ~4 MB inline cap) is taken for the montage and uploaded — never sent to the chat', async ({ page }) => {
    const calls = await open(page, true);
    const chat: unknown[] = [];
    await page.route('**/api/chat/gemini', (r) => { chat.push(r.request().postDataJSON()); return r.fulfill({ status: 500, body: '' }); });
    const song = wav(280); // 4.5 MB raw, ~6 MB as a data URL
    await attachAndSend(page, 'hello there', song);
    // Not a montage: the track cannot ride in a chat request, so Agent G says what it is for, and keeps the files.
    await expect(page.getByText('This track is too big to send to the chat')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTitle('song.wav')).toBeVisible();
    expect(chat).toEqual([]);
    await say(page, 'cut these to the music');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 30_000 });
    expect(calls.quote).toHaveLength(1);
    expect((calls.quote[0]!.files as string[])).toHaveLength(3);
    expect(chat).toEqual([]);
  });

  test('closed to this user: the chat keeps its old flow and never asks for a plan', async ({ page }) => {
    const calls = await open(page, false);
    await attachAndSend(page, 'cut these to the music');
    await expect.poll(() => calls.remixIntent.length, { timeout: 20_000 }).toBe(1);
    expect(calls.quote).toEqual([]);
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(0);
  });
});
