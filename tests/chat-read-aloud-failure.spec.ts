import { test, expect } from '@playwright/test';

const second = `Second ${'read every complete word '.repeat(5)}sentence.`;
const third = `Third ${'keep all remaining words '.repeat(5)}sentence.`;
const reply = `First sentence. ${second} ${third}`;
const errorCopy = {
  en: 'Read aloud stopped before the end. Please try again.',
  ka: 'წაკითხვა ტექსტის დასრულებამდე შეწყდა. სცადე ხელახლა.',
  ru: 'Озвучивание остановилось до конца текста. Попробуйте ещё раз.',
};

for (const locale of ['en', 'ka', 'ru'] as const) {
  test(`read aloud ${locale} stops at failed synthesis instead of skipping text`, async ({ page }) => {
    await run(page, locale, 'synthesis');
    await expect(page.getByText(errorCopy[locale], { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { ttsPlayed: string[] }).ttsPlayed.length)).toBe(1);
  });
}

test('read aloud stops on play rejection and reports incomplete playback', async ({ page }) => {
  await run(page, 'en', 'play');
  await expect(page.getByText(errorCopy.en, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { ttsPlayed: string[] }).ttsPlayed.length)).toBe(1);
});

test('user Stop settles playback without an error or automatic restart', async ({ page }) => {
  await run(page, 'en', 'stop');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect(pause).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { ttsPlayed: string[] }).ttsPlayed.length)).toBe(1);
  await pause.click();
  await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toBeVisible();
  await expect(page.getByText(errorCopy.en, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { ttsPlayed: string[] }).ttsPlayed.length)).toBe(1);
});

async function run(page: import('@playwright/test').Page, locale: keyof typeof errorCopy, mode: string) {
  const tts: string[] = [];
  const otherPosts: string[] = [];
  await page.addInitScript(mode => {
    localStorage.setItem('myavatar-cookie-consent', 'necessary');
    localStorage.setItem('myavatar:tour-seen', '1');
    localStorage.setItem('myavatar:welcomed', '1');
    const played: string[] = [];
    (window as unknown as { ttsPlayed: string[] }).ttsPlayed = played;
    // Synthetic playback only: no actual device audio, credentials, decoder or provider is used.
    class FakeAudio {
      src = '';
      error = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      get currentSrc() { return this.src; }
      pause() {}
      load() {}
      play() {
        if (!this.src.startsWith('blob:')) return Promise.resolve();
        played.push(this.src);
        if (mode === 'play') return Promise.reject(new Error('synthetic autoplay refusal'));
        if (mode !== 'stop') queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }
    }
    // A pure fake prevents the real decoder's asynchronous errors/ended events from contaminating this test.
    Object.defineProperty(window, 'Audio', { configurable: true, value: FakeAudio });
  }, mode);
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/chat/gemini') {
      await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ text: reply })}\n\ndata: [DONE]\n\n` });
    } else if (path === '/api/tts/gemini') {
      const text = (req.postDataJSON() as { text: string }).text;
      tts.push(text);
      await route.fulfill(mode === 'synthesis' && text.startsWith('Second')
        ? { status: 503, json: { error: 'synthetic_unavailable' } }
        : { contentType: 'audio/wav', body: 'synthetic-audio-bytes' });
    } else {
      if (req.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) otherPosts.push(path);
      await route.fulfill({ json: {} });
    }
  });
  await page.goto(`/${locale}/dashboard?tool=chat`);
  const composer = page.getByTestId('composer-input');
  await expect(composer).toBeVisible();
  await composer.fill('Please give a short answer.');
  await composer.press('Control+Enter');
  const read = page.getByRole('button', { name: locale === 'en' ? 'Read aloud' : locale === 'ru' ? 'Озвучить' : 'ხმამაღლა წაკითხვა', exact: true });
  await expect(read).toBeVisible();
  // Lift only the browser guest flag after shell hydration; every backend request is still intercepted above.
  await page.evaluate(() => { document.documentElement.dataset.authed = '1'; });
  await read.click();
  await expect.poll(() => tts.length).toBeGreaterThanOrEqual(3);
  expect(tts.filter(text => text.startsWith('Second'))).toHaveLength(1);
  expect(otherPosts).toEqual([]);
}
