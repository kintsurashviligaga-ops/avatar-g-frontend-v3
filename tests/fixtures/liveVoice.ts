import { expect, type Page, type WebSocketRoute } from '@playwright/test';

/**
 * The two outside parties of a Live voice call, simulated for Playwright (tests/live-voice-e2e.spec.ts):
 *   · Google — `FakeLive` plays the Gemini Live WebSocket server;
 *   · Supabase — a signed-in session cookie plus a mocked `/auth/v1/user`.
 * `openLiveCall` signs in, mocks the token mint, opens the chat and starts a call from the composer's Live button.
 */

// The Supabase project the dev server under test runs with: its cookie name and its auth host both come from it.
// ⚠️ It was hard-coded to dummy.supabase.co, so against `npm run dev:ui` (example.supabase.co) the session cookie had the
// wrong name and the mocked /auth/v1/user the wrong host — every test here stopped at „signed in" (2026-10-03).
// PLAYWRIGHT_SUPABASE_URL names it explicitly; NEXT_PUBLIC_SUPABASE_URL is used when the runner shares the app's env.
const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
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
export class FakeLive {
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

  /** The app's own notes to the model ("[App] A new image is ready…"), however the session framed the text. */
  notes(): string[] {
    return this.sent.map((s) => JSON.stringify(s)).filter((t) => t.includes('[App]'));
  }

  /** The model speaking: an output transcription, as the dock and captions show it. */
  say(text: string): void {
    this.ws?.send(JSON.stringify({ serverContent: { outputTranscription: { text } } }));
  }

  /**
   * The user speaking: Google's input transcription of their words, then the end of that exchange. A voice start runs
   * only on these words (components/voice/live/liveActions: the yes is the user's, never the model's function call).
   */
  hear(text: string): void {
    this.ws?.send(JSON.stringify({ serverContent: { inputTranscription: { text } } }));
    this.ws?.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  }
}

async function signIn(page: Page, baseURL: string | undefined): Promise<void> {
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookieValue(), url: baseURL ?? 'http://localhost:3000' }]);
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

/**
 * Requests that would cost money if they ran — every generation family the studio calls (nanobanana is the image
 * engine, ai/music the music one, film/heygen/genjutsu the video ones). None may leave the browser in these tests.
 * The free routes (chat, voice, presence, the Montage cut, a job's progress note) are deliberately not here.
 */
const SPEND = new RegExp(
  '^/api/(' + [
    'image', 'images', 'video', 'videos', 'music', 'lipsync', 'generate', 'gen', 'orchestrate', 'jobs(?:/create)?$',
    // the orchestrator's produce routes render; its /jobs is the free progress note every image job writes
    'orchestrator/(?:produce|music|image|voice|avatar|interior)',
    'nanobanana', 'film', 'heygen', 'genjutsu', 'ltx-video', 'motion-control', 'pipeline', 'udio', 'replicate',
    'audio', 'elevenlabs', 'ai/(?:music|upscale|magic-wand|edit|edit-audio|edit-photo)',
    'avatar/(?:create|generate|enroll)', 'v2/(?:dubbing|model3d|presentation)',
  ].join('|') + ')(/|$)',
);

export async function openLiveCall(page: Page, baseURL: string | undefined, live: FakeLive): Promise<string[]> {
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

