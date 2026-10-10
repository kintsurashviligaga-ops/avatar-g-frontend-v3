import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AGENT G PART 6, THE ONE WINDOW — in a real browser, the server mocked (nothing is decoded, stored or charged here; the
 * server halves are proven by their own suites). The contract:
 *
 *   · three videos + „use the audio from the first video and cut the other clips to it" is ONE run card: the files
 *     upload, the steps are planned with their price (nothing runs before Start), Start sends the signed plan once;
 *   · the card follows the run through the one task route: the live step, the step that waits for the user's yes (with
 *     its own price), the credits held and spent, and „what Agent G did";
 *   · the result (the cut video and the extracted track) lands under the card, which stays, ticked, with no buttons; the
 *     run's jobs never show a second time in the job tray;
 *   · on a phone, a tablet and a desktop, in light and dark, in KA / EN / RU, nothing spills sideways and the player is
 *     never left under the composer;
 *   · where the whole-file analysis is open, „what is said in this video?" is answered by Agent G's analysis card
 *     (scenes, moments, transcript), not by the chat model.
 */

const CLIP = readFileSync(join(__dirname, 'fixtures/clip.webm'));
const RUN = '77777777-3333-4444-8555-666666666666';
const VIDEO_URL = 'https://media.test/renders/run-cut.mp4?token=signed';
const AUDIO_URL = 'https://media.test/renders/run-sound.mp3?token=signed';
const PLAN = { runId: RUN, credits: 6, expiresAt: Date.now() + 1_800_000, steps: [{ id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'cut', tool: 'montage', credits: 6 }] };

type Lang = 'ka' | 'en' | 'ru';
interface Calls { plan: unknown[]; run: unknown[]; approve: unknown[]; analyze: unknown[]; chat: string[]; reads: number }

const step = (id: string, tool: string, over: Record<string, unknown> = {}) => ({
  id, tool, capability: tool === 'montage' ? 'agent.montage' : 'agent.audio-extract',
  status: 'queued', taskId: null, stage: null, pct: null, result: null, error: null, reused: false, approval: null, credits: null, ...over,
});
const runView = (status: string, steps: unknown[], events: unknown[]) => ({
  id: RUN, kind: 'agent-run', service: 'film', status, stage: null, pct: null, attempt: null, result: null, error: null,
  cancellable: status !== 'completed', label: null, position: null, createdAt: null, updatedAt: null, steps, events,
});
const SOUND_DONE = step('sound', 'audio_extract', { status: 'completed', taskId: 'job-sound', credits: 0, result: { url: AUDIO_URL, media: 'audio', name: 'clip-1.mp3', bytes: 96_000, durationSec: 5 } });
const BEFORE_YES = [
  runView('running', [step('sound', 'audio_extract', { status: 'running', taskId: 'job-sound', stage: 'extract', pct: 50 }), step('cut', 'montage')],
    [{ seq: 1, at: 1, type: 'run.created' }, { seq: 2, at: 2, type: 'step.started', step: 'sound' }]),
  runView('awaiting_approval', [SOUND_DONE, step('cut', 'montage', { status: 'awaiting_approval', approval: { credits: 6, quoteId: 'q-cut', expiresAt: Date.now() + 600_000 } })],
    [{ seq: 3, at: 3, type: 'step.completed', step: 'sound' }, { seq: 4, at: 4, type: 'step.awaiting_approval', step: 'cut' }]),
];
const AFTER_YES = [
  runView('running', [SOUND_DONE, step('cut', 'montage', { status: 'running', taskId: 'job-cut', stage: 'stitch', pct: 60, credits: 6 })],
    [{ seq: 5, at: 5, type: 'step.approved', step: 'cut' }, { seq: 6, at: 6, type: 'step.started', step: 'cut' }]),
  runView('completed', [SOUND_DONE, step('cut', 'montage', { status: 'completed', taskId: 'job-cut', credits: 6, result: { url: VIDEO_URL, media: 'video', aspect: '16:9', durationSec: 5 } })],
    [{ seq: 7, at: 7, type: 'step.completed', step: 'cut' }, { seq: 8, at: 8, type: 'run.completed' }]),
];
const ANALYSIS = {
  summary: 'A short beach clip.', language: 'en',
  scenes: [{ startSec: 0, endSec: 2, description: 'Waves roll onto the sand' }, { startSec: 2, endSec: 5, description: 'A wide shot of the shore at sunset' }],
  moments: [{ atSec: 3, why: 'The sun touches the water' }],
  transcript: [{ startSec: 1, speaker: 'A', text: 'Look at that.' }],
  speakers: [{ id: 'A', description: 'a man behind the camera' }],
  objects: ['sea', 'sand'], answer: 'One person says „Look at that." while the camera watches the waves.', dropped: 0,
};

async function open(page: Page, o: { lang?: Lang; theme?: 'light' | 'dark'; analyze?: boolean } = {}): Promise<Calls> {
  const calls: Calls = { plan: [], run: [], approve: [], analyze: [], chat: [], reads: 0 };
  const theme = o.theme ?? 'light';
  await page.addInitScript((th) => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-theme', th);
    } catch { /* private mode */ }
  }, theme);
  let n = 0;
  await page.route('**/api/upload/sign', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `omni-uploads/u/${Date.now()}-${++n}.webm`, token: 't' }) }));
  await page.route(/\/storage\/v1\/object\/upload\/sign\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"uploads/u/x"}' }));
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"t"}' }));
  await page.route('**/api/chat/gemini', (r) => { calls.chat.push(r.request().postData() ?? ''); return r.fulfill({ status: 500, body: '' }); });
  await page.route('https://media.test/**', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: CLIP }));
  await page.route('**/api/studio/library', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }));
  for (const door of ['montage', 'audio', 'edit']) {
    await page.route(new RegExp(`/api/agent/media/${door}(\\?.*)?$`), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true }) }));
  }
  await page.route(/\/api\/agent\/media\/analyze(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') { await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: !!o.analyze }) }); return; }
    calls.analyze.push(r.request().postDataJSON());
    await new Promise((res) => setTimeout(res, 600));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, analysis: ANALYSIS, source: { kind: 'file', type: 'video', durationSec: 5 }, model: 'gemini' }) });
  });
  let approved = false;
  const before = [...BEFORE_YES];
  const after = [...AFTER_YES];
  await page.route(/\/api\/tasks(\?.*)?$/, async (r: Route) => {
    if (r.request().method() === 'GET') {
      const id = new URL(r.request().url()).searchParams.get('id');
      if (!id) { await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tasks":[]}' }); return; }
      calls.reads++;
      const q = approved ? after : before;
      const view = q.length > 1 ? q.shift() : q[0];
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: view }) });
      return;
    }
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.action === 'plan') {
      calls.plan.push(body);
      await new Promise((res) => setTimeout(res, 400));
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, plan: PLAN, token: 'signed-run' }) });
    } else if (body.action === 'run') {
      calls.run.push(body);
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: RUN }) });
    } else if (body.action === 'approve') {
      calls.approve.push(body);
      approved = true;
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, task: null }) });
    } else {
      await r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"task":null}' });
    }
  });
  await page.goto(`/${o.lang ?? 'en'}/dashboard?tool=chat`);
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const el = document.documentElement;
    const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
  });
  // The doors are asked once per sign-in: let them answer before the first message is read.
  await page.waitForTimeout(800);
  return calls;
}

async function attach(page: Page, names: string[]): Promise<void> {
  await page.locator('input[type=file][multiple][accept^="image/*,audio/*"][accept*="application/pdf"]').setInputFiles(
    names.map((name) => ({ name, mimeType: 'video/webm', buffer: CLIP })),
  );
  for (const name of names) await expect(page.getByTitle(name)).toBeVisible({ timeout: 10_000 });
}

async function say(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(text);
  await box.press('Enter');
}

const ASK: Record<Lang, string> = {
  en: 'Use the audio from the first video and cut the other clips to it',
  ka: 'პირველი ვიდეოს ხმა აიღე და დანარჩენი კლიპები ამ ხმაზე დაამონტაჟე',
  ru: 'Возьми звук из первого видео и смонтируй остальные клипы под него',
};

/** From the plan to the delivered result on one card. Returns the card. */
async function runToEnd(page: Page, calls: Calls, lang: Lang, shot?: string) {
  await attach(page, ['first.webm', 'second.webm', 'third.webm']);
  await say(page, ASK[lang]);
  const card = page.getByTestId('agent-run-card');
  await expect(card).toHaveAttribute('data-phase', 'planned', { timeout: 30_000 });
  expect(calls.plan).toHaveLength(1);
  expect(calls.run).toEqual([]); // nothing runs before Start
  await expect(page.getByTestId('agent-run-start')).toHaveAttribute('data-price', '6');
  if (shot) await page.screenshot({ path: `test-results/${shot}-1-plan.png` });

  await page.getByTestId('agent-run-start').dblclick(); // a double tap is still one Start
  await expect(page.getByTestId('agent-run-approve')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('agent-run-approve')).toHaveAttribute('data-price', '6');
  await expect(page.getByTestId('agent-run-stop')).toBeVisible();
  if (shot) await page.screenshot({ path: `test-results/${shot}-2-yes.png` });
  await page.getByTestId('agent-run-approve').click();

  await expect(card).toHaveAttribute('data-phase', 'ended', { timeout: 30_000 });
  // Every step stays on the card, ticked (the upload, the plan, both tools, the delivery).
  await expect(card.locator('li[data-step]').first()).toBeVisible();
  await expect(card.locator('li[data-step]:not([data-state="done"])')).toHaveCount(0);
  await expect(page.getByTestId('agent-run-stop')).toHaveCount(0);
  await expect(page.getByTestId('agent-run-retry')).toHaveCount(0);
  const result = page.getByTestId('agent-run-result');
  await expect(result.locator(`video[src^="${VIDEO_URL}"]`)).toBeAttached({ timeout: 20_000 });
  await expect(result.locator(`audio[src^="${AUDIO_URL}"]`)).toBeAttached();
  expect(calls.run).toHaveLength(1);
  expect(calls.approve).toEqual([{ action: 'approve', id: RUN, step: 'cut', quoteId: 'q-cut' }]);
  expect(calls.chat).toEqual([]); // the request never went to the chat model
  return card;
}

/** Nothing spills sideways; the player can be scrolled clear of the composer. */
async function fitsTheWindow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const card = await page.getByTestId('agent-run-card').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(card!.x).toBeGreaterThanOrEqual(0);
  expect(card!.x + card!.width).toBeLessThanOrEqual(vw + 1);
  const video = page.getByTestId('agent-run-result').locator('video').first();
  await video.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const v = await video.boundingBox();
  const composer = await page.getByTestId('composer-input').boundingBox();
  expect(v!.x + v!.width).toBeLessThanOrEqual(vw + 1);
  // The player's bottom edge sits above the composer once it is scrolled into view.
  expect(v!.y + Math.min(v!.height, 120)).toBeLessThanOrEqual(composer!.y);
}

test.describe('Agent G runs two steps from one message', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('plan → Start → the step\'s own yes → both results under the one card; the tray never shows them twice', async ({ page }) => {
    const calls = await open(page, { lang: 'en' });
    const card = await runToEnd(page, calls, 'en', 'agent-g-run-en');
    await expect(page.getByTestId('agent-run-credits')).toHaveText('✦ 6 spent · up to ✦ 6');
    await expect(page.getByTestId('agent-run-log')).toContainText('What Agent G did');
    // One owner per job: the run's two jobs are the card's, never a second row in the tray.
    const tray = page.getByTestId('job-tray');
    if (await tray.count()) await expect(tray).not.toContainText(/job-sound|job-cut/);
    await expect(page.getByTestId('agent-run-card')).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/agent-g-run-en-3-done.png', fullPage: false });
    await fitsTheWindow(page);
  });

  test('Cancel drops the plan and runs nothing', async ({ page }) => {
    const calls = await open(page, { lang: 'en' });
    await attach(page, ['first.webm', 'second.webm', 'third.webm']);
    await say(page, ASK.en);
    await expect(page.getByTestId('agent-run-card')).toHaveAttribute('data-phase', 'planned', { timeout: 30_000 });
    await page.getByTestId('agent-run-cancel').click();
    await expect(page.getByTestId('agent-run-card')).toHaveAttribute('data-phase', 'dismissed');
    await page.waitForTimeout(500);
    expect(calls.run).toEqual([]);
  });
});

const SCREENS: Array<{ name: string; width: number; height: number; lang: Lang; theme: 'light' | 'dark' }> = [
  { name: 'phone-ka-dark', width: 390, height: 844, lang: 'ka', theme: 'dark' },
  { name: 'tablet-ru-light', width: 820, height: 1180, lang: 'ru', theme: 'light' },
  { name: 'desktop-ka-dark', width: 1280, height: 800, lang: 'ka', theme: 'dark' },
];

for (const s of SCREENS) {
  test.describe(`the run card on ${s.name}`, () => {
    test.use({ viewport: { width: s.width, height: s.height } });
    test('fits the window, keeps its result clear of the composer, speaks the page\'s language', async ({ page }) => {
      const calls = await open(page, { lang: s.lang, theme: s.theme });
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(s.theme);
      await runToEnd(page, calls, s.lang, `agent-g-run-${s.name}`);
      const credits = await page.getByTestId('agent-run-credits').textContent();
      if (s.lang === 'ka') expect(credits).toBe('დაიხარჯა ✦ 6 · მაქსიმუმ ✦ 6');
      else expect(credits).toMatch(/✦ 6/);
      await fitsTheWindow(page);
      await page.screenshot({ path: `test-results/agent-g-run-${s.name}-3-done.png` });
    });
  });
}

test.describe('„what is said in this video?" on Agent G\'s analysis card', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('open: the file uploads, Gemini reads it whole, the answer and its card; the chat model is not asked', async ({ page }) => {
    const calls = await open(page, { lang: 'en', theme: 'dark', analyze: true });
    await attach(page, ['beach.webm']);
    await say(page, 'What is said in this video?');
    const card = page.getByTestId('agent-analyze-card');
    await expect(card).toHaveAttribute('data-phase', 'done', { timeout: 30_000 });
    expect(calls.analyze).toHaveLength(1);
    expect(calls.analyze[0]).toMatchObject({ source: { kind: 'file', ref: expect.stringMatching(/^omni-uploads\/u\//) }, focus: 'transcript', lang: 'en' });
    await expect(page.getByText(ANALYSIS.answer)).toBeVisible();
    await expect(page.getByTestId('agent-analyze-scenes').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('agent-analyze-note')).toHaveText('Free for you (within a daily limit)');
    expect(calls.chat).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/agent-g-analyze-phone-dark.png' });
  });

  test('closed: the question goes to the chat as before, no analysis is asked for', async ({ page }) => {
    const calls = await open(page, { lang: 'en', analyze: false });
    await attach(page, ['beach.webm']);
    await say(page, 'What is said in this video?');
    await expect.poll(() => calls.chat.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(calls.analyze).toEqual([]);
    await expect(page.getByTestId('agent-analyze-card')).toHaveCount(0);
  });
});
