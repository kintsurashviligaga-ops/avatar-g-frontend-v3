import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

import { chunkSpeech } from '../lib/speech/chunk';
import { SPEECH_HEADERS } from '../lib/speech/contract';
import { FakeLive, fakeMicrophone, mockLiveToken, signIn } from './fixtures/liveVoice';
import { WAV_MONO_24K } from './fixtures/speechAudio';

/**
 * Read-aloud in a real browser (MASTER TASK v3.1 §5, Phase 4 PR 8), on the studio chat's speaker button, the one
 * Production shows (NEXT_PUBLIC_VOICE_EXPERIENCE_V2 is unset there).
 *
 * Signed in for real (session cookie + mocked Supabase), so the page publishes the account the replay cache keys on.
 * The reply comes from a mocked /api/chat/gemini and every chunk's audio from a mocked /api/tts/gemini that answers a
 * one-second code-generated WAV with the route's contract headers. Nothing leaves the browser for a provider.
 *
 * What only a browser shows:
 * - every chunk of a reply is asked for exactly once, in order, and each is played, so no sentence is skipped;
 * - hearing the reply again sends no request, in the same page and after a reload (IndexedDB);
 * - a chunk that fails stops the read there, and "Try again" reads on from that chunk;
 * - opening another chat while a chunk is on its way plays nothing late;
 * - starting a Live call stops the read, and nothing of it plays under the call.
 * The timings it attaches are app overhead with an instant fake provider, never provider latency.
 */

const REPLY = [
  'გამარჯობა, აი მოკლე პასუხი.',
  'მეორე აბზაცი უფრო გრძელია და ორ წინადადებას შეიცავს. ეს მისი მეორე წინადადებაა.',
  'მესამე აბზაცი პასუხს ამთავრებს.',
].join('\n\n');
// The player's own cut (lib/speech/player plays chunkSpeech(text, { leadSentence: true })).
const CHUNKS = chunkSpeech(REPLY, { leadSentence: true }).map((c) => c.text);

const READ = 'ხმამაღლა წაკითხვა';
const PAUSE = 'პაუზა';
const RETRY = 'თავიდან სცადე';

const sse = (frames: unknown[]): string =>
  frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

interface Tts {
  /** The text of every request, in the order the browser sent them. */
  texts: string[];
  /** Answer requests of these chunk indexes with a 503, once each. */
  failOnce: Set<number>;
  /** Requests for chunks at or after this index wait until `open()` is called; null answers at once. */
  holdFrom: number | null;
  open(): void;
}

async function mockTts(page: Page): Promise<Tts> {
  let waiting: Array<() => void> = [];
  const tts: Tts = {
    texts: [],
    failOnce: new Set(),
    holdFrom: null,
    open() { tts.holdFrom = null; const w = waiting; waiting = []; for (const go of w) go(); },
  };
  await page.route('**/api/tts/gemini', async (route: Route) => {
    const body = route.request().postDataJSON() as { text: string; locale: string };
    tts.texts.push(body.text);
    const index = CHUNKS.indexOf(body.text);
    if (tts.holdFrom !== null && index >= tts.holdFrom) await new Promise<void>((go) => waiting.push(go));
    try {
      if (tts.failOnce.delete(index)) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"tts_unavailable"}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: {
          'cache-control': 'no-store',
          [SPEECH_HEADERS.contract]: '1',
          [SPEECH_HEADERS.pacing]: '1;lang=auto',
          [SPEECH_HEADERS.model]: 'gemini-2.5-flash-preview-tts',
          [SPEECH_HEADERS.voice]: 'Kore',
          [SPEECH_HEADERS.sampleRate]: '24000',
          [SPEECH_HEADERS.channels]: '1',
          [SPEECH_HEADERS.frames]: '24000',
        },
        body: Buffer.from(WAV_MONO_24K),
      });
    } catch {
      // The browser cancelled the request (stop, another chat): there is nobody to answer.
    }
  });
  return tts;
}

/** Every play() of a chunk's audio (blob: URLs; the silent unlock clip is not one), with when it happened, and when the
 *  last tap was. */
async function recordPlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __plays: Array<{ src: string; at: number }>; __tap: number };
    w.__plays = [];
    w.__tap = 0;
    document.addEventListener('click', () => { w.__tap = performance.now(); }, true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      // `src` first: right after a new source is set, currentSrc still names the one before until the element loads.
      const src = this.src || this.currentSrc || '';
      if (src.startsWith('blob:')) w.__plays.push({ src, at: performance.now() });
      return play.call(this);
    };
  });
}

const plays = (page: Page) => page.evaluate(() => (window as unknown as { __plays: unknown[] }).__plays.length);

async function openChat(page: Page, baseURL: string | undefined): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar:tour-seen', '1'); } catch { /* storage blocked */ } });
  await fakeMicrophone(page);
  await signIn(page, baseURL);
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ხმა"}' }));
  await page.route('**/api/avatar/core', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/chat/gemini', (r) => r.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
    body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }, { text: REPLY }, '[DONE]']),
  }));
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 20_000 });
}

async function askForReply(page: Page): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.click();
  await box.fill('მითხარი რამე');
  // The studio's box sends on its button (or Ctrl+Enter); a plain Enter is a new line there.
  await page.getByRole('button', { name: 'გაგზავნა', exact: true }).click();
  await expect(page.getByText('მესამე აბზაცი პასუხს ამთავრებს.')).toBeVisible({ timeout: 30_000 });
}

const readButton = (page: Page) => page.getByRole('button', { name: READ, exact: true }).last();

/** Tap the speaker and wait until the whole reply has been read (the button is back to "Read aloud"). Returns the time
 *  from the tap to the first chunk's play() in the page, in ms. */
async function readWhole(page: Page): Promise<number> {
  const before = await plays(page);
  await readButton(page).click();
  await expect(page.getByRole('button', { name: PAUSE, exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(readButton(page)).toBeVisible({ timeout: 30_000 });
  return page.evaluate((n) => {
    const w = window as unknown as { __plays: Array<{ at: number }>; __tap: number };
    return Math.round(w.__plays[n]!.at - w.__tap);
  }, before);
}

/** The timings go to the report as an attachment: app overhead with an instant fake provider, never provider latency. */
const attachTiming = (info: TestInfo, body: Record<string, unknown>) => info.attach('speech-timing.json', {
  contentType: 'application/json',
  body: JSON.stringify({ browser: info.project.name, chunks: CHUNKS.length, provider: 'mock (instant)', ...body }),
});

test.beforeEach(async ({ page }) => { await recordPlays(page); });

test('every chunk is asked for once, in order, and played: no sentence is skipped', async ({ page, baseURL }, info) => {
  expect(CHUNKS.length).toBeGreaterThanOrEqual(3);
  const tts = await mockTts(page);
  await openChat(page, baseURL);
  await askForReply(page);

  const fresh = await readWhole(page);
  expect(tts.texts).toEqual(CHUNKS);
  expect(await plays(page)).toBe(CHUNKS.length);
  // The concatenated chunks are the whole reply: nothing dropped, nothing twice (whitespace between them aside).
  expect(CHUNKS.join(' ').replace(/\s+/g, ' ')).toBe(REPLY.replace(/\s+/g, ' '));
  await attachTiming(info, { tapToFirstPlayMs: { fresh } });
});

test('hearing the reply again sends no request, in the same page and after a reload', async ({ page, baseURL }, info) => {
  const tts = await mockTts(page);
  await openChat(page, baseURL);
  await askForReply(page);
  const fresh = await readWhole(page);
  expect(tts.texts).toHaveLength(CHUNKS.length);

  const memory = await readWhole(page);
  expect(tts.texts).toHaveLength(CHUNKS.length);
  expect(await plays(page)).toBe(CHUNKS.length * 2);

  // After a reload the studio opens a new session; the chat is reopened from the sidebar's history, and its audio comes
  // back from IndexedDB.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 60_000 });
  await page.getByRole('button', { name: 'მითხარი რამე', exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText('მესამე აბზაცი პასუხს ამთავრებს.')).toBeVisible({ timeout: 20_000 });
  const device = await readWhole(page);
  expect(tts.texts).toHaveLength(CHUNKS.length);
  expect(await plays(page)).toBe(CHUNKS.length);
  await attachTiming(info, { tapToFirstPlayMs: { fresh, memory, device } });
});

test('a chunk that fails stops the read there, and "Try again" reads on from it', async ({ page, baseURL }) => {
  const tts = await mockTts(page);
  tts.failOnce.add(1);
  await openChat(page, baseURL);
  await askForReply(page);

  await readButton(page).click();
  await expect(page.getByRole('button', { name: RETRY, exact: true })).toBeVisible({ timeout: 30_000 });
  // Chunk 0 was heard; chunk 1 failed, so nothing after it was played.
  expect(await plays(page)).toBe(1);

  await page.getByRole('button', { name: RETRY, exact: true }).click();
  await expect(readButton(page)).toBeVisible({ timeout: 30_000 });
  expect(await plays(page)).toBe(CHUNKS.length);
  // Chunk 1 was asked for again; every other chunk once (audio fetched ahead of the failure was kept).
  expect(tts.texts.filter((t) => t === CHUNKS[1])).toHaveLength(2);
  for (const [i, text] of CHUNKS.entries()) if (i !== 1) expect(tts.texts.filter((t) => t === text)).toHaveLength(1);
});

test('opening another chat while a chunk is on its way plays nothing late', async ({ page, baseURL }) => {
  const tts = await mockTts(page);
  await openChat(page, baseURL);
  await askForReply(page);

  tts.holdFrom = 0;
  await readButton(page).click();
  await expect.poll(() => tts.texts.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'ახალი ჩატი' }).filter({ visible: true }).first().click();
  await expect(page.getByText('მესამე აბზაცი პასუხს ამთავრებს.')).toHaveCount(0, { timeout: 10_000 });
  tts.open();
  await page.waitForTimeout(2_500);
  expect(await plays(page)).toBe(0);
});

test('starting a Live call stops the read, and nothing of it plays under the call', async ({ page, baseURL }) => {
  const tts = await mockTts(page);
  const live = new FakeLive();
  await live.install(page);
  await mockLiveToken(page);
  await openChat(page, baseURL);
  await askForReply(page);

  // Chunk 0 answers at once; the rest wait, so the read is still on when the call starts.
  tts.holdFrom = 1;
  await readButton(page).click();
  await expect.poll(() => plays(page), { timeout: 20_000 }).toBe(1);

  await page.getByRole('button', { name: 'ცოცხალი ხმა' }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-live-call', '1', { timeout: 45_000 });
  tts.open();
  await page.waitForTimeout(2_500);
  expect(await plays(page)).toBe(1);
  await expect(page.locator('[data-speech]')).toHaveCount(0);
});
