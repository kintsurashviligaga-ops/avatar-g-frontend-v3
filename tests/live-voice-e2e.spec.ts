import { test, expect } from '@playwright/test';
import { FakeLive, openLiveCall } from './fixtures/liveVoice';

/**
 * Voice mode END TO END, in a real browser: the composer's Live button → the token mint → the Gemini Live WebSocket →
 * the model's function calls → what the user sees change on the screen → the answer the model gets back.
 *
 * Only the two outside parties are simulated, and nothing else:
 *   · Google — `page.routeWebSocket` plays the Gemini Live server: it answers the setup frame with `setupComplete`,
 *     sends `toolCall` frames exactly as the real API does, and records every frame the browser sends back;
 *   · Supabase — a signed-in session cookie plus a mocked `/auth/v1/user`, because Live is for signed-in users.
 * The microphone is a silent generated stream (headless Chromium has none), so the real capture path runs.
 * Every UI piece in between — useGeminiLiveSession, liveActions, the dock, OmniStudio's live listener, the chat
 * stream — is the production code.
 *
 * Nothing here can spend: `start_generation` is cancelled during its countdown, and the test asserts that no
 * generation request ever left the browser.
 */

/** get_screen_state → the tool on screen, as the model is told. */
const toolOnScreen = async (live: FakeLive) => {
  const r = await live.call('get_screen_state');
  expect(r.ok).toBe(true);
  return String((r.state as { tool?: string } | undefined)?.tool ?? '');
};

test.describe('voice mode, end to end', () => {
  test.setTimeout(120_000);

  test('the agent reads the screen, opens a studio, prepares an image with its price, writes in the chat, and a confirmed start can still be cancelled — nothing is spent', async ({ page, baseURL }) => {
    const live = new FakeLive();
    await page.route('**/api/chat/gemini', (r) => r.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      body: [{ meta: { provider: 'gemini', model: 'gemini-3.8-flash' } }, { text: 'სამი იდეა: ზღვა, მთა, ქალაქი.' }]
        .map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n',
    }));
    const spend = await openLiveCall(page, baseURL, live);
    await expect(page.getByRole('dialog')).toBeVisible();

    // 1 — what is on the screen: the chat.
    expect(await toolOnScreen(live)).toBe('chat');

    // 2 — open a studio: the call docks itself so the user SEES the change, and the studio switches.
    const opened = await live.call('open_studio', { tool: 'video' });
    expect(opened.ok).toBe(true);
    await expect(page.getByTestId('live-dock')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => toolOnScreen(live)).toBe('video');

    // 3 — prepare an image: the studio, the prompt and the frame change, and the model is told the price.
    const prepared = await live.call('prepare_generation', { tool: 'image', prompt: 'წითელი მელია თოვლში', aspectRatio: '9:16' });
    expect(prepared.ok).toBe(true);
    expect(String(prepared.summary)).toMatch(/credit/i);
    expect(prepared.summary ?? prepared.priceCredits).toBeTruthy();
    await expect.poll(async () => {
      const r = await live.call('get_screen_state');
      return (r.state as { prompt?: string } | undefined)?.prompt ?? '';
    }).toBe('წითელი მელია თოვლში');
    await expect.poll(() => toolOnScreen(live)).toBe('image');

    // 3b — another service: a presentation opens with its topic filled in; its own Create button runs it.
    const deck = await live.call('prepare_generation', { tool: 'presentation', prompt: 'საქართველოს ღვინის 8000 წელი' });
    expect(deck.ok).toBe(true);
    expect(String(deck.summary)).toMatch(/press Create/);
    await expect.poll(async () => page.locator('textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).toContain('საქართველოს ღვინის 8000 წელი');
    await expect.poll(() => toolOnScreen(live)).toBe('presentation');
    const deckStart = await live.call('start_generation', { confirmed: 'yes' });
    expect(deckStart.ok).toBe(false); // a deck is made by its panel's Create, never by a voice start
    // back to the image the agent prepared
    await live.call('prepare_generation', { tool: 'image', prompt: 'წითელი მელია თოვლში', aspectRatio: '9:16' });
    await expect.poll(() => toolOnScreen(live)).toBe('image');

    // 4 — the user says yes: a 3-second countdown with Cancel; Cancel stops it before anything runs.
    const started = await live.call('start_generation', { confirmed: 'yes' });
    expect(started.ok).toBe(true);
    const banner = page.getByTestId('live-run-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-state', 'counting');
    await page.getByTestId('live-run-cancel').click();
    await expect(banner).toHaveAttribute('data-state', 'cancelled');
    await page.waitForTimeout(3_500); // past the countdown: still nothing may run
    expect(spend).toEqual([]);

    // 5 — something long goes to the chat: the chat opens and the answer is written there.
    const chat = await live.call('chat_send', { text: 'მომეცი სამი იდეა' });
    expect(chat.ok).toBe(true);
    await expect(page.getByText('სამი იდეა: ზღვა, მთა, ქალაქი.')).toBeVisible({ timeout: 15_000 });
    expect(await toolOnScreen(live)).toBe('chat');

    // 6 — the agent's own words appear in the dock while it speaks.
    live.say('მზად არის, ეკრანზეა.');
    await expect(page.getByTestId('live-dock-line')).toContainText('მზად არის', { timeout: 10_000 });

    // 7 — the dock says who is on the call: the rocket, "Agent G", and a calm End pill (not a red ✕).
    const dock = page.getByTestId('live-dock');
    await expect(dock.locator('img[src*="rocket-mark"]').first()).toBeVisible();
    await expect(dock).toContainText('Agent G');
    await expect(page.getByTestId('live-dock-end')).toContainText('დასრულება');

    // 8 — "open YouTube": a voice call cannot open a tab by itself, so a link appears; ONE tap opens it, and the call goes on.
    await page.context().route('https://www.youtube.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>YouTube</title>' }));
    const link = await live.call('open_url', { url: 'https://www.youtube.com/results?search_query=surfing+cat', title: 'YouTube — surfing cat' });
    expect(link.ok).toBe(true);
    expect(String(link.summary)).toMatch(/tap/i);
    await expect(page.getByTestId('live-dock-link')).toContainText('youtube.com');
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('live-dock-link-open').click()]);
    await popup.waitForLoadState('domcontentloaded');
    expect(popup.url()).toBe('https://www.youtube.com/results?search_query=surfing+cat');
    await popup.close();
    await expect(page.getByTestId('live-dock')).toBeVisible();
    // A dangerous address is refused, never shown as a link.
    const bad = await live.call('open_url', { url: 'javascript:alert(1)' });
    expect(bad.ok).toBe(false);

    // 9 — expand back to the full call, then the agent hangs up when asked.
    await page.getByTestId('live-dock-expand').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const bye = await live.call('end_call');
    expect(bye.ok).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('live-dock')).toHaveCount(0);
    expect(spend).toEqual([]);
  });

  test('the agent\'s hands: it presses and types what it is asked to and reads a website — and refuses what would spend', async ({ page, baseURL }) => {
    const live = new FakeLive();
    await page.route('**/api/voice/web-read', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, page: { url: 'https://example.ge/', title: 'Example — news', description: '', text: 'Hello from Tbilisi.', links: [{ text: 'More', url: 'https://example.ge/more' }] } }),
    }));
    const spend = await openLiveCall(page, baseURL, live);
    type Control = { id: string; role: string; name: string; state?: string; guard?: string };
    const screen = async () => (await live.call('get_screen_state')).state as { tool: string; controls: Control[]; results: unknown[] };

    // 1 — the screen as the model sees it: controls with ids, and no results yet.
    const s1 = await screen();
    expect(s1.controls.length).toBeGreaterThan(3);
    expect(s1.results).toEqual([]);

    // 2 — „click Music": the sidebar's row is pressed like a tap, the call docks, the music studio opens.
    const clicked = await live.call('click', { target: 'მუსიკა' });
    expect(clicked).toMatchObject({ ok: true, summary: expect.stringMatching(/Pressed/) });
    await expect(page.getByTestId('live-dock')).toBeVisible();
    await expect.poll(async () => (await screen()).tool).toBe('music');

    // 3 — the priced Generate is never pressed by voice: it is marked, and refused.
    const priced = (await screen()).controls.find((c) => c.guard === 'spend');
    expect(priced).toBeTruthy();
    const refused = await live.call('click', { target: priced!.id });
    expect(refused).toMatchObject({ ok: false, error: 'needs_user_spend' });

    // 4 — typing into the studio's prompt works; Enter there would start a paid run, so it is held.
    const placeholder = (await page.getByTestId('composer-input').getAttribute('placeholder')) ?? '';
    const box = (await screen()).controls.find((c) => c.role === 'textbox' && placeholder.startsWith(c.name.replace(/…$/, '')));
    expect(box).toBeTruthy();
    const typed = await live.call('type_text', { target: box!.id, text: 'მშვიდი პიანინო წვიმაში', submit: 'on' });
    expect(typed).toMatchObject({ ok: true, summary: expect.stringMatching(/NOT submitted/) });
    await expect(page.getByTestId('composer-input')).toHaveValue('მშვიდი პიანინო წვიმაში');

    // 5 — a website is read (title, text, links) and put on screen as a link to tap.
    const read = await live.call('read_webpage', { url: 'example.ge' });
    expect(read).toMatchObject({ ok: true, title: 'Example — news', text: 'Hello from Tbilisi.', links: ['More — https://example.ge/more'] });
    await expect(page.getByTestId('live-dock')).toContainText('example.ge');

    // 6 — nothing to download yet: the model hears the truth.
    expect(await live.call('download', { result: 'latest' })).toMatchObject({ ok: false, error: 'no_result' });

    expect(spend).toEqual([]);
  });

  test('the agent drives Montage through the editor\'s own hook — and an empty edit is not exported', async ({ page, baseURL }) => {
    const live = new FakeLive();
    const spend = await openLiveCall(page, baseURL, live);
    // No result yet: „put the latest video in Montage" is answered with the truth.
    expect(await live.call('montage', { action: 'open', videos: 'latest' })).toMatchObject({ ok: false, error: 'no_video' });
    // Commands need an open editor.
    expect(await live.call('montage', { action: 'state' })).toMatchObject({ ok: false, error: 'montage_closed' });
    // Open it (as the user's „open Montage"), then read and drive it by voice.
    expect(await live.call('open_studio', { tool: 'montage' })).toMatchObject({ ok: true });
    await expect.poll(async () => (await live.call('montage', { action: 'state' })).ok, { timeout: 15_000 }).toBe(true);
    const state = await live.call('montage', { action: 'state' });
    expect(state.state).toMatchObject({ clips: 0, hasMusic: false, exporting: false });
    expect(await live.call('montage', { action: 'export' })).toMatchObject({ ok: false, error: 'blocked' });
    expect(await live.call('montage', { action: 'set_music_start', musicStartSec: 30 })).toMatchObject({ ok: false, error: 'no_music' });
    expect(spend).toEqual([]);
  });

  test('a chain by voice: the confirmed image is made, the app tells the agent, which downloads it and carries it into Video — one paid call, the confirmed one', async ({ page, baseURL }) => {
    const live = new FakeLive();
    const FOX = 'https://e2e-media.example/fox.png';
    // A 1×1 PNG stands in for the provider's file; the image engine is the only paid call and it is answered here.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    await page.context().route('https://e2e-media.example/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }));
    await page.route('**/api/nanobanana/image', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: FOX }) }));
    const spend = await openLiveCall(page, baseURL, live);

    // 1 — prepare, the user says yes, the countdown runs out: exactly one paid request leaves the browser.
    expect(await live.call('prepare_generation', { tool: 'image', prompt: 'წითელი მელია თოვლში', aspectRatio: '9:16' })).toMatchObject({ ok: true });
    await expect.poll(() => toolOnScreen(live)).toBe('image');
    expect(await live.call('start_generation', { confirmed: 'yes' })).toMatchObject({ ok: true });
    await expect.poll(() => spend, { timeout: 15_000 }).toEqual(['/api/nanobanana/image']);

    // 2 — nobody asked, yet the agent hears it: the app's note says the image is ready, so a plan of steps goes on.
    await expect.poll(() => live.notes().some((n) => /new image is ready/.test(n)), { timeout: 15_000 }).toBe(true);
    const s = (await live.call('get_screen_state')).state as { results: Array<{ n: number; kind: string }> };
    expect(s.results[0]).toMatchObject({ n: 1, kind: 'image' });

    // 3 — „download it": the file is saved under our name, with the extension of what it really is.
    const [file] = await Promise.all([page.waitForEvent('download'), live.call('download', { result: 'latest' })]);
    expect(file.suggestedFilename()).toBe('myavatar-image.png');

    // 4 — „now make a video of it": the image becomes the Video studio's start frame. Still free.
    expect(await live.call('use_result', { result: 'latest', to: 'video' })).toMatchObject({ ok: true });
    await expect.poll(() => toolOnScreen(live)).toBe('video');
    // A video result cannot be asked for yet, and the agent is told so instead of guessing.
    expect(await live.call('use_result', { result: 'video', to: 'montage' })).toMatchObject({ ok: false, error: 'no_result' });
    expect(spend).toEqual(['/api/nanobanana/image']);
  });

  test('a function the app does not have is refused honestly, and the call keeps going', async ({ page, baseURL }) => {
    const live = new FakeLive();
    await openLiveCall(page, baseURL, live);
    const r = await live.call('format_hard_drive', {});
    expect(r.ok).toBe(false);
    expect(await toolOnScreen(live)).toBe('chat');
  });
});
