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
 *   · Start queues that signed plan once, the chat follows the job (its stage on the card), and the master plays in the
 *     same thread;
 *   · Cancel drops the plan and runs nothing;
 *   · a job already running (another tab, a reload) shows in the job tray with its stop, and leaves the tray the moment
 *     the chat's own card narrates it, so one job is never drawn twice;
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

interface Calls { quote: Array<Record<string, unknown>>; run: Array<Record<string, unknown>>; reads: string[]; cancel: unknown[]; remixIntent: unknown[] }

async function open(page: Page, enabled: boolean, opts: { live?: boolean; /** the job stays running (never delivered) */ stay?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { quote: [], run: [], reads: [], cancel: [], remixIntent: [] };
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
  await page.route('**/api/video/remix-intent', async (r: Route) => {
    calls.remixIntent.push(r.request().postDataJSON());
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ op: 'add_music', params: {} }) });
  });
  await page.route('**/api/video/remix', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"mocked"}' }));
  // The task as a worker moves it (lib/tasks/taskView TaskView): rendering (one read), then delivered.
  const task = (t: Record<string, unknown>) => ({ id: QUOTE.jobId, kind: 'agent-montage', service: 'film', stage: null, pct: null, attempt: null, result: null, error: null, cancellable: false, label: null, position: null, createdAt: null, updatedAt: null, ...t });
  const views = [
    task({ status: 'running', stage: 'stitch', pct: 55, attempt: 1, cancellable: true }),
    task({ status: 'completed', pct: 100, result: { url: 'https://media.test/agent-montage.mp4', media: 'video', durationSec: 19.97, aspect: '16:9' } }),
  ];
  if (opts.stay) views.pop();
  // The one task route (/api/tasks): the chat follows the job there and stops it there.
  await page.route(/\/api\/tasks(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      const id = new URL(r.request().url()).searchParams.get('id');
      if (!id) {
        // The job tray's list of live tasks (?active=1). With `live`, the job is already running somewhere (another
        // tab, before a reload), so the list carries it while it is live; it never moves the job on.
        const now = views[0];
        const tasks = opts.live && now && (now.status === 'running' || now.status === 'queued') ? [now] : [];
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tasks }) });
        return;
      }
      calls.reads.push(id);
      const task = views.length > 1 ? views.shift() : views[0];
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task }) });
      return;
    }
    calls.cancel.push(r.request().postDataJSON());
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"task":null}' });
  });
  await page.route(/\/api\/agent\/media\/montage(\?.*)?$/, async (r: Route) => {
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
      // `run` only queues: it answers at once, and a worker renders.
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: QUOTE.jobId, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }) });
    } else {
      await r.fulfill({ status: 400, contentType: 'application/json', body: '{"ok":false,"error":"bad_action"}' });
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
  await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
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
    // Every step stays on the card; the job's stage is the one in progress (the mock reads stitch at 55 %, then done).
    await expect(card.locator('li[data-step="stitch"]')).toHaveAttribute('data-state', 'active', { timeout: 10_000 });
    await expect(card.locator('li[data-step="upload"]')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('video[src^="https://media.test/agent-montage.mp4"]')).toBeAttached({ timeout: 20_000 });
    await expect(page.getByText(/Ready: 20 s, cut to your track/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible(); // playable, and downloadable
    // The card stays after the run (the owner's „it popped up and vanished"): every step ticked, nothing left to press.
    await expect(card).toHaveAttribute('data-phase', 'done');
    await expect(card.locator('li[data-state="done"]')).toHaveCount(8);
    await expect(card).toContainText('8/8 steps');
    await expect(page.getByTestId('agent-montage-stop')).toHaveCount(0);
    expect(calls.run).toEqual([{ action: 'run', request: { shots: ['signed plan'] }, token: 'signed-token', prompt: 'cut these to the music' }]);
    expect(calls.reads.length).toBeGreaterThanOrEqual(2);
    expect(new Set(calls.reads)).toEqual(new Set([QUOTE.jobId]));

    // The next chat turn does not carry the clips or the track: they went to the edit, not to the model.
    const chat: string[] = [];
    await page.route('**/api/chat/gemini', (r) => { chat.push(r.request().postData() ?? ''); return r.fulfill({ status: 500, body: '' }); });
    await say(page, 'thanks, looks great');
    await expect.poll(() => chat.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(chat[0]).toContain('looks great');
    expect(chat[0]).not.toMatch(/data:(video|audio)\//);
  });

  test('a montage already running shows once: in the tray, with its stop, until the chat\'s own card takes it over', async ({ page }) => {
    const calls = await open(page, true, { live: true });
    const tray = page.getByTestId('job-tray');
    // Running before this page opened (another tab, a reload): the tray is the only place it shows, and it can stop it.
    await expect(tray.getByText('Agent G · montage')).toBeVisible({ timeout: 20_000 });
    await expect(tray.getByRole('button', { name: 'Cancel' })).toBeVisible();

    await attachAndSend(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-start').click();
    await expect(card).toHaveAttribute('data-phase', 'running');
    // The card narrates that job now, so the tray lets go of it at once (one owner per job): never two bars for one job.
    await expect(tray.getByText('Agent G · montage')).toHaveCount(0);
    // From here on, note any moment the tray shows the job again. Its list was read while the job ran, so if the card let
    // go at the end, that stale „running" row popped up until the next read and vanished (the owner's Preview run).
    await page.evaluate(() => {
      const w = window as unknown as { __trayFlash?: boolean };
      w.__trayFlash = false;
      const check = () => { if (document.querySelector('[data-testid="job-tray"]')?.textContent?.includes('Agent G · montage')) w.__trayFlash = true; };
      new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await expect(page.locator('video[src^="https://media.test/agent-montage.mp4"]')).toBeAttached({ timeout: 20_000 });
    await expect(card).toHaveAttribute('data-phase', 'done');
    await page.waitForTimeout(8_000); // past the tray's next read
    expect(await page.evaluate(() => (window as unknown as { __trayFlash?: boolean }).__trayFlash)).toBe(false);
    await expect(tray.getByText('Agent G · montage')).toHaveCount(0);
    expect(calls.cancel).toEqual([]);
  });

  test('Cancel drops the plan and runs nothing', async ({ page }) => {
    const calls = await open(page, true);
    await attachAndSend(page, 'make a reel to this song');
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-cancel').click();
    await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'dismissed');
    await expect(page.getByTestId('agent-montage-start')).toHaveCount(0);
    await expect(page.getByTestId('agent-montage-cancel')).toHaveCount(0);
    await expect(page.getByText('Edit stopped.')).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls.run).toEqual([]);
  });

  // The Preview admin run of 2026-10-09: Stop, then ↻ under Agent G's reply — the chat model got the clips and answered
  // with advice („use the Montage tool…") in place of the card. ↻ there now asks Agent G again with the same turn.
  test('↻ under a finished montage asks Agent G again with the same files, never the chat model', async ({ page }) => {
    const calls = await open(page, true);
    const chat: unknown[] = [];
    await page.route('**/api/chat/gemini', (r) => { chat.push(r.request().postData()); return r.fulfill({ status: 500, body: '' }); });
    await attachAndSend(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    const regen = page.getByRole('button', { name: 'Regenerate', exact: true });
    await expect(regen).toHaveCount(0); // an open card: its own buttons are the way
    await page.getByTestId('agent-montage-cancel').click();
    await expect(card).toHaveAttribute('data-phase', 'dismissed');

    await regen.click();
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toHaveLength(2);
    expect(calls.quote[1]).toMatchObject({ action: 'quote', prompt: 'cut these to the music' });
    expect((calls.quote[1]!.files as string[])).toHaveLength(3);
    await expect(page.getByTestId('agent-montage-card')).toHaveCount(1); // in place of the old bubble, not a second one
    expect(calls.run).toEqual([]);   // nothing runs before Start
    expect(chat).toEqual([]);        // and the chat model never saw the turn
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

// AGENT G PART 1: the chat reads every message before a tool takes it as a prompt (lib/agent/chatTurn). Stop, „where are
// you?", a change to the plan on screen and a request missing its track are answered here, without the chat model.
test.describe('Agent G reads the message first', () => {
  const chatCalls = async (page: Page): Promise<unknown[]> => {
    const chat: unknown[] = [];
    await page.route('**/api/chat/gemini', (r) => { chat.push(r.request().postData()); return r.fulfill({ status: 500, body: '' }); });
    return chat;
  };

  test('a change typed under the plan re-quotes it with the same files; the old card says it was replaced', async ({ page }) => {
    const calls = await open(page, true);
    const chat = await chatCalls(page);
    await attachAndSend(page, 'cut these to the music');
    const cards = page.getByTestId('agent-montage-card');
    await expect(cards.first()).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });

    await say(page, 'start the music at 5 seconds');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1)).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await expect(cards.nth(0)).toHaveAttribute('data-phase', 'dismissed');
    await expect(page.getByText('Plan changed: the new one is below.')).toBeVisible();
    expect(calls.quote).toHaveLength(2);
    // The card's own words plus the change, and the SAME uploaded files (nothing is uploaded twice).
    expect(calls.quote[1]).toEqual({ action: 'quote', files: calls.quote[0]!.files, prompt: 'cut these to the music\nstart the music at 5 seconds' });
    expect(calls.run).toEqual([]);
    expect(chat).toEqual([]);
  });

  test('„სამუშაო შეწყვიტე" while the edit runs: one cancel to the task route, and Agent G says what it stopped', async ({ page }) => {
    const calls = await open(page, true, { stay: true });
    const chat = await chatCalls(page);
    await attachAndSend(page, 'cut these to the music');
    const card = page.getByTestId('agent-montage-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-montage-start').click();
    await expect(card).toHaveAttribute('data-phase', 'running');
    // The answer is what the card knows when asked: wait for the task route's 55 % to reach it first.
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '55', { timeout: 15_000 });

    await say(page, 'how far along are you?');
    await expect(page.getByText('Running now:')).toBeVisible();
    await expect(page.getByText(/• the montage — .+ · 55%/)).toBeVisible({ timeout: 10_000 });

    await say(page, 'სამუშაო შეწყვიტე');
    await expect(page.getByText('⏹ გავაჩერე: მონტაჟი.')).toBeVisible();
    await expect.poll(() => calls.cancel.length, { timeout: 10_000 }).toBe(1);
    expect(calls.cancel[0]).toEqual({ action: 'cancel', id: QUOTE.jobId });
    expect(chat).toEqual([]);
  });

  test('nothing running: „stop" and „where are you?" say so, and nothing is sent anywhere', async ({ page }) => {
    const calls = await open(page, true);
    const chat = await chatCalls(page);
    await say(page, 'stop');
    await expect(page.getByText('Nothing is running right now, so there is nothing to stop.')).toBeVisible();
    await say(page, 'სადამდე მიხვედი?');
    await expect(page.getByText(/ახლა არაფერი მუშაობს/)).toBeVisible();
    expect(calls.cancel).toEqual([]);
    expect(chat).toEqual([]);
  });

  test('clips with no track: Agent G asks for the track, keeps the files in the box, and plans nothing', async ({ page }) => {
    const calls = await open(page, true);
    const chat = await chatCalls(page);
    await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
      { name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP },
      { name: 'city.webm', mimeType: 'video/webm', buffer: CLIP },
    ]);
    await expect(page.getByTitle('city.webm')).toBeVisible({ timeout: 10_000 });
    await say(page, 'cut these to the music');
    await expect(page.getByText(/I have the clips; the music is missing/)).toBeVisible();
    await expect(page.getByTitle('city.webm')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveValue('cut these to the music');
    expect(calls.quote).toEqual([]);
    expect(calls.remixIntent).toEqual([]);
    expect(chat).toEqual([]);
  });
});

// The owner's iPhone, 2026-10-09 18:36Z: Download put the clip in Files, not in Photos, and the chat's picker hid the MP3s.
// On an iPhone a picture or a clip now goes through the share sheet as a FILE (iOS then offers "Save Video" → Photos);
// a desktop still downloads; the picker names the audio types, which the iPhone needs to show the tracks.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function finishMontage(page: Page): Promise<void> {
  await page.route('https://media.test/**', (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: CLIP }));
  await attachAndSend(page, 'cut these to the music');
  await expect(page.getByTestId('agent-montage-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
  await page.getByTestId('agent-montage-start').click();
  await expect(page.locator('video[src^="https://media.test/agent-montage.mp4"]')).toBeAttached({ timeout: 20_000 });
}

test.describe('saving the master to the device', () => {
  test('the chat\'s picker names the audio types an iPhone needs to show MP3s', async ({ page }) => {
    await open(page, true);
    const accept = await page.locator('input[type=file][multiple][accept*="application/pdf"]').first().getAttribute('accept');
    expect(accept?.split(',')).toEqual(expect.arrayContaining(['audio/*', 'audio/mpeg', 'audio/x-m4a', '.mp3', '.m4a', '.wav']));
  });

  test('a desktop downloads the MP4 under one right extension', async ({ page }) => {
    await open(page, true);
    await finishMontage(page);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).first().click()]);
    expect(file.suggestedFilename()).toMatch(/^myavatar-montage-\d+\.mp4$/);
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: IPHONE_UA });
    test('Download hands the clip to the share sheet as a video file (→ Save Video → Photos), not to Files', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __shared: Array<{ name: string; type: string; size: number }> };
        w.__shared = [];
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: { files?: File[] }) => !!d.files?.length });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async (d: { files?: File[] }) => { for (const f of d.files ?? []) w.__shared.push({ name: f.name, type: f.type, size: f.size }); },
        });
      });
      await open(page, true);
      await finishMontage(page);
      const downloads: string[] = [];
      page.on('download', (d) => downloads.push(d.suggestedFilename()));
      await page.getByRole('button', { name: 'Download', exact: true }).first().click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length), { timeout: 10_000 }).toBe(1);
      const [shared] = await page.evaluate(() => (window as unknown as { __shared: Array<{ name: string; type: string; size: number }> }).__shared);
      expect(shared!.type).toBe('video/mp4');
      expect(shared!.name).toMatch(/^myavatar-montage-\d+\.mp4$/);
      expect(shared!.size).toBe(CLIP.length);
      await page.waitForTimeout(500);
      expect(downloads).toEqual([]);
    });

    test('when the tap has expired, one more tap on "Save to Photos" opens the sheet with the same file', async ({ page }) => {
      await page.addInitScript(() => {
        const w = window as unknown as { __shared: string[]; __tries: number };
        w.__shared = [];
        w.__tries = 0;
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          // The first call stands for a share sheet iOS refused because the fetch outlasted the tap.
          value: async (d: { files?: File[] }) => {
            w.__tries += 1;
            if (w.__tries === 1) throw Object.assign(new Error('expired'), { name: 'NotAllowedError' });
            for (const f of d.files ?? []) w.__shared.push(f.name);
          },
        });
      });
      await open(page, true);
      await finishMontage(page);
      await page.getByRole('button', { name: 'Download', exact: true }).first().click();
      await expect(page.getByTestId('save-ready')).toBeVisible({ timeout: 10_000 });
      await page.getByTestId('save-ready-go').click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared), { timeout: 10_000 }).toEqual([expect.stringMatching(/\.mp4$/)]);
      await expect(page.getByTestId('save-ready')).toHaveCount(0);
    });
  });
});
