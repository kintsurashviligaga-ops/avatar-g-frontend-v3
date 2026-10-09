import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AGENT G TAKES THE MP3 OUT OF A LINK, IN THE CHAT (lib/agent/media/audioExtract) — in a real browser, with the server
 * route mocked (nothing is fetched, decoded or stored here; the server half is proven by audioLive.ffmpeg.test.ts and
 * the real-internet audioLive.e2e.test.ts). The contract:
 *
 *   · a direct media link + „extract the MP3" asks /api/agent/media/audio for a PLAN with that link, and nothing else;
 *   · the plan is a card: source, size, MP3 192 kbps, the rights, Start · free; nothing runs before Start;
 *   · Start queues that signed plan once, the chat follows the job (its stage on the card), and the MP3 lands in the
 *     same thread: a player with its file name, length and size, Download and Save to Library;
 *   · a video-platform link is refused by name, and the card offers an upload instead (never a workaround); the upload
 *     goes to the user's storage and gets its own plan;
 *   · while the route says the feature is closed to this user, the chat keeps its old flow.
 */

// A real MP3 (a 2 s sine tone made with ffmpeg for this test), served as the worker's result like the renders bucket does.
// AGENT_G_AUDIO_MP3=<path> serves another one (the evidence run uses the MP3 the real-internet E2E made).
const RESULT_MP3 = readFileSync(process.env.AGENT_G_AUDIO_MP3 || join(__dirname, 'fixtures/tone.mp3'));
const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));

const LINK = 'https://media.example.com/videos/flower.mp4';
const JOB = '22222222-3333-4444-8555-666666666666';
const AUDIO_URL = 'https://media.test/renders/audio/extract-flower.mp3?token=signed';
const linkQuote = { jobId: JOB, credits: 0, source: 'link', host: 'media.example.com', name: 'flower.mp3', bytes: 1_100_000, contentType: 'video/mp4', rights: { status: 'unverified' }, bitrateKbps: 192, maxSec: 3600, expiresAt: Date.now() + 1_800_000 };
const fileQuote = { ...linkQuote, jobId: '33333333-3333-4444-8555-666666666666', source: 'file', host: null, name: 'beach.mp3', rights: { status: 'own' } };

interface Calls { quote: Array<Record<string, unknown>>; run: Array<Record<string, unknown>>; reads: string[]; cancel: unknown[]; library: Array<Record<string, unknown>>; chat: string[] }

async function open(page: Page, enabled: boolean): Promise<Calls> {
  const calls: Calls = { quote: [], run: [], reads: [], cancel: [], library: [], chat: [] };
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
  await page.route('**/api/chat/gemini', (r) => { calls.chat.push(r.request().postData() ?? ''); return r.fulfill({ status: 500, body: '' }); });
  await page.route('https://media.test/**', (r) => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: RESULT_MP3 }));
  await page.route('**/api/studio/library', async (r: Route) => {
    if (r.request().method() !== 'POST') { await r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }); return; }
    calls.library.push(r.request().postDataJSON() as Record<string, unknown>);
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' });
  });
  // The job as a worker moves it: extracting, checking, then delivered.
  const views = [
    { ok: true, jobId: JOB, status: 'running', stage: 'extract', pct: 40, attempt: 1 },
    { ok: true, jobId: JOB, status: 'running', stage: 'qc', pct: 85, attempt: 1 },
    { ok: true, jobId: JOB, status: 'completed', audioUrl: AUDIO_URL, name: 'flower.mp3', durationSec: 5.09, bytes: 122_941, bitrateKbps: 192, rights: { status: 'unverified' } },
  ];
  await page.route(/\/api\/agent\/media\/audio(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      const jobId = new URL(r.request().url()).searchParams.get('jobId');
      if (jobId) calls.reads.push(jobId);
      const body = jobId ? (views.length > 1 ? views.shift() : views[0]) : { enabled };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'quote') {
      calls.quote.push(body);
      const url = typeof body.url === 'string' ? body.url : '';
      if (/youtu\.?be/.test(url)) {
        await r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'platform', platform: 'YouTube', message: 'YouTube does not allow downloads outside its player.' }) });
        return;
      }
      const quote = body.file ? fileQuote : linkQuote;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quote, request: { source: 'signed plan' }, token: 'signed-token' }) });
    } else if (body.action === 'run') {
      calls.run.push(body);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: JOB, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }) });
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

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('Agent G takes the MP3 out of a link in the chat', () => {
  test('link → plan card → Start → progress → the MP3 in the thread with its name, length, size, Download and Library', async ({ page }) => {
    const calls = await open(page, true);
    await say(page, `Extract the MP3 from this video ${LINK}`);

    const card = page.getByTestId('agent-audio-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toEqual([{ action: 'quote', url: LINK }]);
    await expect(card).toContainText('media.example.com');
    await expect(card).toContainText('MP3 · 192 kbps');
    await expect(page.getByTestId('agent-audio-rights')).toHaveAttribute('data-rights', 'unverified');
    await expect(page.getByTestId('agent-audio-start')).toContainText('free');
    await expect(page.getByText('Plan: take out the sound and save it as “flower.mp3” (MP3, 192 kbps).')).toBeVisible();
    await expect(page.getByText(/Press Start only if it is yours or you have a licence/)).toBeVisible();
    expect(calls.run).toEqual([]); // nothing runs before Start
    expect(calls.chat).toEqual([]); // and the request never went to the chat model
    await page.screenshot({ path: 'test-results/agent-g-audio-1-plan.png' });

    // A double tap is still one Start.
    await page.getByTestId('agent-audio-start').dblclick();
    await expect(page.getByTestId('agent-audio-card')).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('agent-audio-stop')).toBeVisible();
    await expect(page.getByText(/Fetching the file and turning its sound into MP3|Checking the result/).first()).toBeVisible({ timeout: 10_000 });

    const player = page.locator('audio[src^="https://media.test/renders/audio/extract-flower.mp3"]');
    await expect(player).toBeAttached({ timeout: 25_000 });
    await expect(page.getByText('Ready: “flower.mp3”, 0:05 · 120 KB. Play it here, download it, or save it to your Library.')).toBeVisible();
    await expect(page.getByText('0:05 · 120 KB · MP3 192 kbps')).toBeVisible(); // the player's own line
    await expect(page.getByText('flower.mp3', { exact: true })).toBeVisible();     // the player's label is the file name
    await expect(page.getByTestId('agent-audio-card')).toHaveCount(0);
    expect(calls.run).toEqual([{ action: 'run', request: { source: 'signed plan' }, token: 'signed-token' }]);
    expect(new Set(calls.reads)).toEqual(new Set([JOB]));
    await page.screenshot({ path: 'test-results/agent-g-audio-2-done.png' });

    // Download saves it under its own name.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('audio-download').click()]);
    expect(download.suggestedFilename()).toBe('flower.mp3');

    // Save to Library files the MP3 by its link, with its name.
    await page.getByRole('button', { name: 'Save to library' }).first().click();
    await expect.poll(() => calls.library.length, { timeout: 10_000 }).toBe(1);
    expect(calls.library[0]).toEqual({ url: AUDIO_URL, kind: 'music', prompt: 'flower' });
    await expect(page.getByRole('button', { name: 'Saved to library' }).first()).toBeVisible();
  });

  test('a YouTube link is refused by name with the upload offer; the user\'s own file gets its plan', async ({ page }) => {
    const calls = await open(page, true);
    await say(page, 'extract mp3 from https://youtu.be/dQw4w9WgXcQ');

    await expect(page.getByText(/YouTube does not allow its videos or audio to be downloaded outside its own player/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/If the video is yours or you have a licence for it, upload the file here/)).toBeVisible();
    const offer = page.getByTestId('agent-audio-upload');
    await expect(offer).toHaveText('Upload a file');
    expect(calls.quote).toEqual([{ action: 'quote', url: 'https://youtu.be/dQw4w9WgXcQ' }]);
    expect(calls.run).toEqual([]);
    await page.screenshot({ path: 'test-results/agent-g-audio-3-refused.png' });

    // The offer opens the file picker with the request already in the composer.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), offer.click()]);
    await expect(page.getByTestId('composer-input')).toHaveValue('Extract the MP3 from this file');
    await chooser.setFiles([{ name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP }]);
    await expect(page.getByTitle('beach.webm')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('composer-input').press('Enter');

    // The refusal stays in the thread above; the new plan is the newest card.
    const plan = page.getByTestId('agent-audio-card').last();
    await expect(plan).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote[1]).toEqual({ action: 'quote', file: 'omni-uploads/u/file-1', name: 'beach.webm' });
    await expect(page.getByTestId('agent-audio-rights')).toHaveAttribute('data-rights', 'own');
    await expect(plan).toContainText('your file');
    await expect(page.getByTestId('agent-audio-rights')).toHaveText('rights: yours');
    await page.screenshot({ path: 'test-results/agent-g-audio-4-own-file.png' });
    expect(calls.chat).toEqual([]); // the file went to the extraction, never inline to the chat model
  });

  test('Cancel drops the plan and runs nothing', async ({ page }) => {
    const calls = await open(page, true);
    await say(page, `rip the audio from ${LINK} as mp3`);
    await expect(page.getByTestId('agent-audio-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-audio-cancel').click();
    await expect(page.getByTestId('agent-audio-card')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(calls.run).toEqual([]);
  });

  test('Live Voice: extract_audio plans on the same card, the call hears the plan, and start runs it', async ({ page }) => {
    const calls = await open(page, true);
    // A call is on (GeminiLiveConversation sets this): the studio announces results and plans as [App] notes.
    await page.evaluate(() => {
      document.documentElement.dataset.liveCall = '1';
      const notes: unknown[] = [];
      (window as unknown as { __notes: unknown[] }).__notes = notes;
      window.addEventListener('myavatar:live-result', (e) => notes.push((e as CustomEvent).detail));
    });
    const fire = (detail: Record<string, unknown>) => page.evaluate((d) => {
      const e = new CustomEvent('myavatar:live-action', { detail: d, cancelable: true });
      const took = !window.dispatchEvent(e);
      return { took, reply: (d as { reply?: Record<string, unknown> }).reply ?? null };
    }, detail);
    const notes = () => page.evaluate(() => (window as unknown as { __notes: Array<{ kind: string; what?: string }> }).__notes);

    // The studio asks the route whether this is open to the user once, on mount; until then the call is told so.
    await expect.poll(async () => (await fire({ type: 'extract_audio', action: 'stop' })).reply?.error, { timeout: 15_000 }).toBe('nothing_running');
    // start before any plan: refused, nothing runs
    expect(await fire({ type: 'extract_audio', action: 'start' })).toMatchObject({ took: true, reply: { ok: false, error: 'no_plan' } });

    const planned = await fire({ type: 'extract_audio', action: 'plan', url: LINK });
    expect(planned).toMatchObject({ took: true, reply: { ok: true } });
    expect(String(planned.reply?.message)).toMatch(/checking media\.example\.com/);
    await expect(page.getByTestId('agent-audio-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toEqual([{ action: 'quote', url: LINK }]);
    await expect.poll(async () => (await notes()).find((n) => n.kind === 'plan')?.what ?? '', { timeout: 10_000 })
      .toMatch(/media\.example\.com as "flower\.mp3".*MP3 192 kbps, free; rights unverified: starting confirms/);
    expect(calls.run).toEqual([]);

    const started = await fire({ type: 'extract_audio', action: 'start' });
    expect(started).toMatchObject({ took: true, reply: { ok: true } });
    await expect(page.locator('audio[src^="https://media.test/renders/audio/extract-flower.mp3"]')).toBeAttached({ timeout: 25_000 });
    expect(calls.run).toHaveLength(1);
    await expect.poll(async () => (await notes()).find((n) => n.kind === 'audio')?.what, { timeout: 10_000 }).toBe('flower.mp3');
  });

  test('closed to this user: the chat keeps its old flow and never asks for a plan', async ({ page }) => {
    const calls = await open(page, false);
    await say(page, `Extract the MP3 from this video ${LINK}`);
    await expect.poll(() => calls.chat.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(calls.quote).toEqual([]);
    await expect(page.getByTestId('agent-audio-card')).toHaveCount(0);
  });
});
