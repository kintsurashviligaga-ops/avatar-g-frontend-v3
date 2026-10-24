import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * §4.2.7 in a real browser: the /library page tells „the Library could not be read" from „you have nothing", and a
 * signed-out visitor's demo library from anyone's own works. The Library API is stubbed at the network edge (the dev
 * server runs on a dummy Supabase); its answers follow app/api/studio/library: 503 { error: 'library_unavailable' },
 * 200 { items, demo, nextCursor }.
 *   · signed in, the read fails: the page says the Library is not reachable and the works are safe, never „Nothing
 *     created yet"; Try again reads it again and shows the works;
 *   · signed out: the demo library is labelled as examples, has no Delete, and Sign in opens the sign-in sheet.
 */
const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000d8', aud: 'authenticated', role: 'authenticated', email: 'e2e-library-states@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const FILM_URL = `${SUPABASE_URL}/storage/v1/object/sign/renders/states/film.webm?token=e2e`;
const CLIP = readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'));
const FILM = { id: 'film_states', kind: 'film', url: FILM_URL, prompt: 'A film', orientation: 'landscape', createdAt: new Date().toISOString() };

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

/** The edge every test shares; `answer` is the Library API. */
async function edge(page: Page, answer: () => { status: number; body: unknown }) {
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/renders/states/**`, (r) => r.fulfill({ status: 200, contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: CLIP }));
  await page.route('**/api/studio/library**', (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    const a = answer();
    return r.fulfill({ status: a.status, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify(a.body) });
  });
  await page.route('**/api/orchestrator/jobs*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"jobs":[]}' }));
  await page.route(/\/api\/tasks(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tasks":[]}' }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* storage blocked */ }
  });
}

async function signIn(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
}

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: 180_000 }); // cold `next dev` route

test('a Library that cannot be read says so, and Try again brings the works back', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  let up = false;
  await edge(page, () => (up
    ? { status: 200, body: { items: [FILM], demo: false, nextCursor: null } }
    : { status: 503, body: { items: [], error: 'library_unavailable' } }));
  await page.goto('/en/library', { waitUntil: 'load' });
  const failed = page.getByTestId('library-failed');
  await expect(failed).toBeVisible({ timeout: 60_000 });
  await expect(failed).toHaveAttribute('data-failure', 'unavailable');
  await expect(failed).toContainText('The Library is not reachable right now.');
  await expect(failed).toContainText('Your works are safe.');
  await expect(page.getByText('Nothing created yet')).toHaveCount(0);

  up = true;
  await failed.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('video[src*="states/film.webm"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(failed).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(1);
});

test('a signed-out visitor sees the demo library as examples, without Delete, and Sign in opens the sheet', async ({ page }) => {
  await edge(page, () => ({ status: 200, body: { items: [FILM], demo: true, nextCursor: null } }));
  await page.goto('/en/library', { waitUntil: 'load' });
  const notice = page.getByTestId('library-demo');
  await expect(notice).toBeVisible({ timeout: 60_000 });
  await expect(notice).toContainText('These are examples. Sign in to see your own works.');
  await expect(page.locator('video[src*="states/film.webm"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await notice.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('auth-sheet')).toBeVisible({ timeout: 30_000 });
});
