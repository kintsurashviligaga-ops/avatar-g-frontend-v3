import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AGENT G EDITS A VIDEO ITSELF, IN THE CHAT (lib/agent/media/editExec) — in a real browser, with the server route mocked
 * (nothing is decoded or stored here; the server half is proven by editLive.ffmpeg.test.ts). The contract:
 *
 *   · one attached video + „convert this video to 9:16" asks /api/agent/media/edit for a PLAN of that file (uploaded to
 *     the user's storage first) with the edits read from the words, and nothing else;
 *   · the plan is a card: source, the edits, what comes out, Start · free; nothing runs before Start;
 *   · Start queues that signed plan once, the chat follows the job (its stage on the card), and the video lands under the
 *     card with Download;
 *   · „make the last video black and white" then edits THAT result (its link), instead of „I cannot yet";
 *   · while the route says the feature is closed to this user, the chat keeps its old answer.
 */

const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));
const JOB = '44444444-3333-4444-8555-666666666666';
const JOB2 = '55555555-3333-4444-8555-666666666666';
const EDIT_URL = 'https://e2e-media.supabase.co/renders/edits/beach-edit.mp4?token=signed';
const plan = { sourceSec: 5, output: 'mp4', durationSec: 5, hasAudio: true, width: 1080, height: 1920, copyVideo: false };
const fileQuote = { jobId: JOB, credits: 0, name: 'beach-edit.mp4', expiresAt: Date.now() + 1_800_000, edits: [{ op: 'aspect', to: '9:16', fit: 'crop' }], plan };
const prevQuote = { ...fileQuote, jobId: JOB2, name: 'beach-edit-edit.mp4', edits: [{ op: 'grade', style: 'noir' }] };

interface Calls { quote: Array<Record<string, unknown>>; run: Array<Record<string, unknown>>; reads: string[]; chat: string[] }

async function open(page: Page, enabled: boolean): Promise<Calls> {
  const calls: Calls = { quote: [], run: [], reads: [], chat: [] };
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
  // Results are served from our storage's domain (*.supabase.co), the only one a production build's CSP lets the download path fetch.
  await page.route('https://e2e-media.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: CLIP }));
  await page.route('**/api/studio/library', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }));
  // The task as a worker moves it (lib/tasks/taskView TaskView): editing, checking, then delivered.
  const task = (t: Record<string, unknown>) => ({ id: JOB, kind: 'agent-media-edit', service: 'film', stage: null, pct: null, attempt: null, result: null, error: null, cancellable: false, label: null, position: null, createdAt: null, updatedAt: null, ...t });
  const views = [
    task({ status: 'running', stage: 'render', pct: 40, attempt: 1, cancellable: true }),
    task({ status: 'running', stage: 'qc', pct: 85, attempt: 1, cancellable: true }),
    task({ status: 'completed', pct: 100, result: { url: EDIT_URL, media: 'video', name: 'beach-edit.mp4', durationSec: 5.02, width: 1080, height: 1920 } }),
  ];
  await page.route(/\/api\/tasks(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      const id = new URL(r.request().url()).searchParams.get('id');
      if (!id) { await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tasks":[]}' }); return; }
      calls.reads.push(id);
      const next = views.length > 1 ? views.shift() : views[0];
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: next }) });
      return;
    }
    await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"task":null}' });
  });
  await page.route(/\/api\/agent\/media\/edit(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled }) });
      return;
    }
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'quote') {
      calls.quote.push(body);
      const quote = String(body.file).startsWith('https://') ? prevQuote : fileQuote;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, quote, request: { file: 'signed plan' }, token: 'signed-token' }) });
    } else if (body.action === 'run') {
      calls.run.push(body);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: JOB, status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false }) });
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

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

async function attachAndSay(page: Page, text: string): Promise<void> {
  await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles([
    { name: 'beach.webm', mimeType: 'video/webm', buffer: CLIP },
  ]);
  await expect(page.getByTitle('beach.webm')).toBeVisible({ timeout: 10_000 });
  await say(page, text);
}

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('Agent G edits a video itself in the chat', () => {
  test('attached video → plan card → Start → the edit under the card; then its own last video is edited by its link', async ({ page }) => {
    const calls = await open(page, true);
    // Wait for the route check, so the message is read with the edit open.
    await page.waitForTimeout(500);
    await attachAndSay(page, 'Convert this video to 9:16.');

    const card = page.getByTestId('agent-edit-card');
    await expect(card).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote).toEqual([{ action: 'quote', file: 'omni-uploads/u/file-1', edits: [{ op: 'aspect', to: '9:16', fit: 'crop' }], name: 'beach.webm' }]);
    await expect(page.getByText(/Plan: frame 9:16, cropped to fill\./)).toBeVisible();
    await expect(page.getByText(/Result: “beach-edit\.mp4”, MP4 · 0:05 · 1080×1920\./)).toBeVisible();
    await expect(page.getByTestId('agent-edit-start')).toContainText('free');
    expect(calls.run).toEqual([]); // nothing runs before Start
    expect(calls.chat).toEqual([]); // and the request never went to the chat model
    await page.screenshot({ path: 'test-results/agent-g-edit-1-plan.png' });

    // A double tap is still one Start.
    await page.getByTestId('agent-edit-start').dblclick();
    await expect(card).toHaveAttribute('data-phase', 'running');
    await expect(page.getByTestId('agent-edit-stop')).toBeVisible();
    await expect(card.locator('li[aria-current="step"]')).toHaveAttribute('data-step', /^(render|qc)$/, { timeout: 10_000 });

    const result = page.getByTestId('agent-edit-result');
    await expect(result.locator(`video[src^="${EDIT_URL}"]`)).toBeAttached({ timeout: 25_000 });
    await expect(page.getByText('Ready: “beach-edit.mp4”, 0:05 · 1080×1920. Watch it here, download it, or find it in your Library.')).toBeVisible();
    await expect(card).toHaveAttribute('data-phase', 'done');
    await expect(card.locator('li[data-state="done"]')).toHaveCount(5);
    await expect(page.getByTestId('agent-edit-stop')).toHaveCount(0);
    expect(calls.run).toEqual([{ action: 'run', request: { file: 'signed plan' }, token: 'signed-token' }]);
    expect(new Set(calls.reads)).toEqual(new Set([JOB]));
    await page.screenshot({ path: 'test-results/agent-g-edit-2-done.png' });

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('edit-download').click()]);
    // The edit's own name; saveMedia keeps the extension true to the bytes, and this mock serves the WebM fixture.
    expect(download.suggestedFilename()).toBe('beach-edit.webm');

    // The result it just made is „the last video": an edit of it goes by its link, no upload, no new video.
    await say(page, 'Make the last video black and white.');
    const second = page.getByTestId('agent-edit-card').last();
    await expect(second).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    expect(calls.quote[1]).toEqual({ action: 'quote', file: EDIT_URL, edits: [{ op: 'grade', style: 'noir' }] });
    await expect(page.getByText(/Source: the result I made last here\./)).toBeVisible();
    await expect(page.getByText(/Plan: black and white colour\./)).toBeVisible();
    expect(calls.run).toHaveLength(1);
    expect(calls.chat).toEqual([]);
    await page.screenshot({ path: 'test-results/agent-g-edit-3-previous.png' });
  });

  test('Cancel drops the plan and runs nothing', async ({ page }) => {
    const calls = await open(page, true);
    await page.waitForTimeout(500);
    await attachAndSay(page, 'Convert this video to 9:16.');
    await expect(page.getByTestId('agent-edit-card')).toHaveAttribute('data-phase', 'quoted', { timeout: 20_000 });
    await page.getByTestId('agent-edit-cancel').click();
    await expect(page.getByTestId('agent-edit-card')).toHaveAttribute('data-phase', 'dismissed');
    await expect(page.getByTestId('agent-edit-start')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(calls.run).toEqual([]);
  });

  test('closed to this user: the old answer stands and no plan is asked for', async ({ page }) => {
    const calls = await open(page, false);
    await page.waitForTimeout(500);
    await attachAndSay(page, 'Convert this video to 9:16.');
    await expect(page.getByText(/I cannot change a video's frame shape \(9:16\) in the chat yet/)).toBeVisible({ timeout: 20_000 });
    expect(calls.quote).toEqual([]);
    await expect(page.getByTestId('agent-edit-card')).toHaveCount(0);
  });
});
