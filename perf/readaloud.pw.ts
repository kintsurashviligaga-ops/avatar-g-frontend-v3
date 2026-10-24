/**
 * perf/readaloud.pw.ts — the studio chat's read-aloud in a real browser, mock environment (MASTER TASK v3.1 §4.1, §5).
 *
 * The signed-in /ka/dashboard?tool=chat runs on the local server (the Library benchmark's session, perf/session.ts).
 * Every chat reply comes from a stubbed /api/chat/gemini, and every chunk's audio from a stubbed /api/tts/gemini that
 * answers a one-second code-generated WAV (tests/fixtures/speechAudio) with the route's contract headers after a FIXED
 * delay (PERF_FIXTURE_TTS_MS, default 0: no provider time at all). Each sample's reply is new text, so a fresh read is
 * never a cache hit.
 *
 * Timed in the page: from the speaker button's click to the `playing` event of the first chunk's audio (a blob: URL;
 * the silent unlock clip is not one), caught on the element itself. Three cases:
 *   · fresh — a reply never read before: the request, the WAV check and the element's start;
 *   · memory — the same reply again in the same page (Phase 4 PR 6's tab cache);
 *   · device — the same reply after a reload, from this browser's IndexedDB.
 * These are the app's own costs with the provider's time set to the fixture, never a provider or production number:
 * how soon a real voice starts depends on Gemini TTS, which only an authorised live run measures.
 *
 * Run: npm run perf:browser (or npx playwright test -c playwright.perf.config.ts perf/readaloud.pw.ts).
 */
import { expect, test, type Page } from '@playwright/test';

import { WAV_MONO_24K } from '../tests/fixtures/speechAudio';
import { signedInLibrary } from './session';
import { MIN_P95_SAMPLES, summarize, writeResults } from './stats';

const SAMPLES = Math.max(1, Number(process.env.PERF_SAMPLES) || MIN_P95_SAMPLES);

/** Fixed latency of the stubbed read-aloud route, in ms (PERF_FIXTURE_TTS_MS). Not measured from anything. */
const TTS_MS = (() => {
  const v = Number(process.env.PERF_FIXTURE_TTS_MS);
  return Number.isFinite(v) && v >= 0 ? v : 0;
})();

const READ = 'ხმამაღლა წაკითხვა';
const PAUSE = 'პაუზა';
const ASK = 'წამიკითხე პასუხი';

/** One short sentence per reply: one chunk, new text every time. */
const reply = (n: number) => `ეს არის პასუხი ნომერი ${n + 2}, ერთი მოკლე წინადადება.`;

const sse = (frames: unknown[]): string =>
  frames.map((f) => `data: ${typeof f === 'string' ? f : JSON.stringify(f)}\n\n`).join('');

/** The player's element is not in the document, so its `playing` is caught on the element: every play() of a chunk's
 *  audio (a blob: URL) reports its first `playing` to the sample waiting for it. */
async function watchPlaying(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __onPlaying?: (at: number) => void };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if ((this.src || this.currentSrc || '').startsWith('blob:')) {
        this.addEventListener('playing', () => w.__onPlaying?.(performance.now()), { once: true });
      }
      return play.call(this);
    };
  });
}

async function stubChatAndSpeech(page: Page): Promise<{ tts: string[] }> {
  const tts: string[] = [];
  let turns = 0;
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ხმა"}' }));
  await page.route('**/api/avatar/core', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/chat/gemini', (r) => {
    const text = reply(turns - 1);
    turns += 1;
    return r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: sse([{ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }, { text }, '[DONE]']),
    });
  });
  await page.route('**/api/tts/gemini', async (r) => {
    tts.push((r.request().postDataJSON() as { text: string }).text);
    if (TTS_MS) await new Promise((done) => setTimeout(done, TTS_MS));
    await r.fulfill({
      status: 200,
      contentType: 'audio/wav',
      // The contract's headers (lib/speech/contract SPEECH_HEADERS), spelt out so this file also runs on the code from
      // before Phase 4, which had no such module and ignored them.
      headers: {
        'cache-control': 'no-store',
        'x-speech-contract': '1',
        'x-speech-pacing': '1;lang=auto',
        'x-speech-model': 'gemini-2.5-flash-preview-tts',
        'x-voice-name': 'Kore',
        'x-speech-sample-rate': '24000',
        'x-speech-channels': '1',
        'x-speech-frames': '24000',
      },
      body: Buffer.from(WAV_MONO_24K),
    }).catch(() => undefined); // the read was stopped: nobody to answer
  });
  return { tts };
}

async function ask(page: Page, n: number): Promise<void> {
  const box = page.getByTestId('composer-input');
  await box.fill(ASK);
  await page.getByRole('button', { name: 'გაგზავნა', exact: true }).click();
  await expect(page.getByText(reply(n), { exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Clicks the last reply's speaker and resolves at the first chunk's `playing`, timed inside the page; then waits for
 *  the read to end, so samples never overlap. */
async function timedRead(page: Page): Promise<number> {
  const ms = await page.evaluate(async (read) => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${read}"]`)];
    const button = buttons[buttons.length - 1];
    if (!button) throw new Error('no speaker button');
    const w = window as unknown as { __onPlaying?: (at: number) => void };
    const playing = new Promise<number>((resolve) => { w.__onPlaying = resolve; });
    const started = performance.now();
    button.click();
    const at = await playing;
    delete w.__onPlaying;
    return at - started;
  }, READ);
  await expect(page.getByRole('button', { name: PAUSE, exact: true })).toHaveCount(0, { timeout: 30_000 });
  return ms;
}

test.use({ viewport: { width: 1280, height: 800 } });

test(`Read-aloud, tap to first audible chunk (${SAMPLES} samples)`, async ({ page, baseURL }) => {
  test.setTimeout(45 * 60_000);
  await signedInLibrary(page, baseURL);
  await watchPlaying(page);
  const { tts } = await stubChatAndSpeech(page);
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 30_000 });

  /** One timed read, and how many read-aloud requests it caused. */
  interface Read { ms: number; requests: number }
  const counted = async (): Promise<Read> => {
    const before = tts.length;
    const ms = await timedRead(page);
    return { ms, requests: tts.length - before };
  };

  const fresh: Read[] = [];
  const memory: Read[] = [];
  for (let i = -1; i < SAMPLES; i += 1) { // i = -1 compiles the routes and warms the element; not counted
    await ask(page, i);
    const a = await counted();
    expect(a.requests, 'a reply never read before is asked for').toBeGreaterThan(0);
    const b = await counted();
    if (i >= 0) { fresh.push(a); memory.push(b); }
  }

  // The last reply again after a reload: the tab's memory is gone, this browser's IndexedDB is not.
  const device: Read[] = [];
  for (let i = -1; i < SAMPLES; i += 1) {
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 60_000 });
    await page.getByRole('button', { name: ASK, exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText(reply(SAMPLES - 1), { exact: true })).toBeVisible({ timeout: 30_000 });
    const c = await counted();
    if (i >= 0) device.push(c);
  }

  const base = {
    environment: 'mock' as const,
    payload: `1-sentence reply (1 chunk), 1 s WAV (48 KB), read-aloud route fixture ${TTS_MS} ms`,
    network: 'loopback; chat and read-aloud routes stubbed in the page',
    unit: 'ms' as const,
    note: `Click on the speaker → the first chunk's playing event; ${process.env.PERF_SERVER ?? 'next dev'} server.`,
  };
  const cases = [
    { key: 'fresh', cache: 'cold' as const, reads: fresh, what: 'A reply never read before.' },
    { key: 'memory', cache: 'warm' as const, reads: memory, what: 'The same reply again in the same page.' },
    { key: 'device', cache: 'warm' as const, reads: device, what: 'The same reply after a reload.' },
  ];
  writeResults('readaloud', cases.flatMap(({ key, cache, reads, what }) => [
    summarize({ ...base, interaction: `readaloud.first-audio.${key}`, cache, note: `${base.note} ${what}` }, reads.map((r) => r.ms)),
    summarize({ ...base, interaction: `readaloud.first-audio.${key}.requests`, cache, unit: 'count', note: `Read-aloud requests one read caused. ${what}` }, reads.map((r) => r.requests)),
  ]));
});
