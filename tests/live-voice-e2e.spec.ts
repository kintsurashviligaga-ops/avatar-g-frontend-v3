import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

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

const SUPABASE_URL = 'https://dummy.supabase.co';
const USER = {
  id: '00000000-0000-4000-8000-0000000000e2',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e-voice@example.com',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
};

const b64url = (s: string) => Buffer.from(s).toString('base64url');

/** A Supabase session cookie the way @supabase/ssr writes it ("base64-" + base64url(JSON)). */
function sessionCookieValue(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [
    b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })),
    'e2e-signature',
  ].join('.');
  const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER };
  return `base64-${b64url(JSON.stringify(session))}`;
}

interface Sent { setup?: unknown; toolResponse?: { functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> } }

/** The simulated Gemini Live server: answers the setup, sends tool calls, records what the browser sends back. */
class FakeLive {
  ws: WebSocketRoute | null = null;
  sent: Sent[] = [];
  private n = 0;

  async install(page: Page): Promise<void> {
    await page.routeWebSocket(/generativelanguage\.googleapis\.com/, (ws) => {
      this.ws = ws;
      ws.onMessage((m) => {
        const text = typeof m === 'string' ? m : m.toString('utf8');
        let j: Sent;
        try { j = JSON.parse(text) as Sent; } catch { return; }
        this.sent.push(j);
        if (j.setup) ws.send(JSON.stringify({ setupComplete: {} }));
      });
    });
  }

  /** Send one function call as Google does, and wait for the browser's answer to it. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = `fc-${++this.n}`;
    expect(this.ws, 'the Live socket is open').not.toBeNull();
    this.ws!.send(JSON.stringify({ toolCall: { functionCalls: [{ id, name, args }] } }));
    let found: Record<string, unknown> | undefined;
    await expect.poll(() => {
      for (const s of this.sent) {
        const r = s.toolResponse?.functionResponses.find((f) => f.id === id);
        if (r) { found = r.response; return true; }
      }
      return false;
    }, { message: `the browser answers ${name}`, timeout: 10_000 }).toBe(true);
    return found!;
  }

  /** The model speaking: an output transcription, as the dock and captions show it. */
  say(text: string): void {
    this.ws?.send(JSON.stringify({ serverContent: { outputTranscription: { text } } }));
  }
}

async function signIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: 'sb-dummy-auth-token', value: sessionCookieValue(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/** A silent microphone: headless Chromium has none, and the real capture path (worklet, levels) must still run. */
async function fakeMicrophone(page: Page): Promise<void> {
  // A returning user: the first-run welcome and the cookie banner were answered on an earlier visit.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
    } catch { /* storage blocked */ }
  });
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    md.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dst = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dst);
      osc.start();
      return dst.stream;
    };
  });
}

/** Requests that would cost money if they ran. None may leave the browser in this test. */
const SPEND = /\/api\/(image|images|video|music|lipsync|generate|gen|orchestrator|jobs)(\/|$|\?)/;

async function openLiveCall(page: Page, baseURL: string | undefined, live: FakeLive): Promise<string[]> {
  const spend: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (r.method() === 'POST' && SPEND.test(u.pathname)) spend.push(u.pathname);
  });
  await fakeMicrophone(page);
  await signIn(page, baseURL);
  await live.install(page);
  await page.route('**/api/voice/live', (r) => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'e2e-ephemeral-token',
      model: 'models/gemini-live-e2e',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      setupMessage: { setup: { model: 'models/gemini-live-e2e', generationConfig: { responseModalities: ['AUDIO'] } } },
      setupLocked: true,
      voice: 'Aoede',
      locale: 'ka',
      actions: true,
    }),
  }));
  await page.route('**/api/avatar/core', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/chat/title', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"title":"ხმოვანი"}' }));

  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  // Signed in for real (the session cookie + /auth/v1/user): the page publishes it on <html data-authed>.
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 15_000 });

  await page.getByRole('button', { name: 'ცოცხალი ხმა' }).first().click();
  // The browser minted a token, opened the socket and sent the setup frame; the fake server said setupComplete.
  await expect.poll(() => live.sent.some((s) => s.setup), { timeout: 20_000 }).toBe(true);
  return spend;
}

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

    // 7 — expand back to the full call, then the agent hangs up when asked.
    await page.getByTestId('live-dock-expand').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const bye = await live.call('end_call');
    expect(bye.ok).toBe(true);
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('live-dock')).toHaveCount(0);
    expect(spend).toEqual([]);
  });

  test('a function the app does not have is refused honestly, and the call keeps going', async ({ page, baseURL }) => {
    const live = new FakeLive();
    await openLiveCall(page, baseURL, live);
    const r = await live.call('format_hard_drive', {});
    expect(r.ok).toBe(false);
    expect(await toolOnScreen(live)).toBe('chat');
  });
});
