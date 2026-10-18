import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * GG, 2026-10-18: „yesterday's and older files do not go into the montage, and Download saves sometimes and sometimes
 * not". A SIGNED-IN person, with the files on our storage host (a cross-origin signed link, as on Production; the
 * Library API is stubbed at the network edge, the dev server runs on a dummy Supabase):
 *   · a Library film opens in Montage with ✂;
 *   · Montage's „My creations" reaches a film older than its first page (it used to stop at the newest 36);
 *   · Download saves the file on a computer even when the browser has a share sheet and the file is slow to arrive
 *     (the Library's own old save asked for the share sheet after the wait, was refused, and opened a blocked tab).
 */
const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000d7', aud: 'authenticated', role: 'authenticated', email: 'e2e-library@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const FILM = `${SUPABASE_URL}/storage/v1/object/sign/renders/old/film.webm?token=e2e`;
const CLIP = readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'));
const PICTURE = '/brand/v1/card-image.jpg';
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const ROWS = [
  ...Array.from({ length: 40 }, (_, i) => ({ id: `img_${i}`, kind: 'image', url: `${PICTURE}?n=${i}`, prompt: `Picture ${i}`, orientation: 'landscape', createdAt: ago(i / 10) })),
  { id: 'film_old', kind: 'film', url: FILM, prompt: 'Yesterday film', orientation: 'landscape', createdAt: ago(26) },
];

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

async function signIn(page: Page, baseURL: string | undefined, opts: { slowDownloadMs?: number } = {}) {
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/renders/old/film.webm**`, async (r) => {
    // A download (a whole-file GET with no Range) arrives slowly, like a long film; the players' range reads do not wait.
    if (opts.slowDownloadMs && !r.request().headers().range) await new Promise((done) => setTimeout(done, opts.slowDownloadMs));
    await r.fulfill({ status: 200, contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: CLIP });
  });
  // Newest first: 40 pictures from today, then yesterday's film — past the first page of every list that holds both.
  await page.route('**/api/studio/library**', async (r) => {
    const q = new URL(r.request().url()).searchParams;
    const kinds = (q.get('kind') ?? '').split(',');
    const offset = Number(q.get('offset') ?? 0);
    const limit = Number(q.get('limit') ?? 40);
    const items = ROWS.filter((it) => kinds.includes(it.kind)).slice(offset, offset + limit);
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
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

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: 180_000 }); // cold `next dev` routes (Library, studio)

test('a film from yesterday opens in Montage from the Library (✂)', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto('/en/library', { waitUntil: 'load' });
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
  const edit = page.getByRole('button', { name: 'Open in Editor' });
  await expect(edit).toHaveCount(1, { timeout: 60_000 });
  await edit.click();
  await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 60_000 });
  await expect(page.getByTestId('montage-studio')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('montage-clip')).toHaveCount(1, { timeout: 30_000 });
  // It stays: nothing that settles after sign-in (the account sync, the session) takes the editor away.
  await page.waitForTimeout(3000);
  await expect(page.getByTestId('montage-clip')).toHaveCount(1);
});

test('Montage „My creations" reaches yesterday\'s film past today\'s pictures', async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  await page.goto('/en/dashboard?tool=montage', { waitUntil: 'load' });
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
  const picker = page.getByTestId('montage-start-picker');
  await expect(picker.getByTestId('montage-my-creations')).toBeVisible({ timeout: 60_000 });
  const film = picker.getByRole('button', { name: /Yesterday film/ });
  await expect(film).toHaveCount(0);
  await picker.getByTestId('montage-library-more').click();
  await expect(film).toHaveCount(1, { timeout: 30_000 });
  await film.click();
  await picker.getByTestId('montage-add-picked').click();
  await expect(page.getByTestId('montage-clip')).toHaveCount(1, { timeout: 30_000 });

  // Beside the timeline (a wide screen keeps „My creations" open), the Videos filter goes straight to it.
  const side = page.getByTestId('montage-side-picker');
  await side.getByRole('button', { name: 'Videos' }).click();
  await expect(side.getByRole('button', { name: /Yesterday film/ })).toHaveCount(1, { timeout: 30_000 });
  await expect(side.getByRole('button', { name: /Picture 0/ })).toHaveCount(0);
});

test('Download saves a slow film on a computer whose browser also has a share sheet', async ({ page, baseURL }) => {
  await signIn(page, baseURL, { slowDownloadMs: 6500 });
  // A browser with the system share sheet, which — like Chrome — answers only within a few seconds of the tap.
  await page.addInitScript(() => {
    const w = window as unknown as { __shares: number };
    w.__shares = 0;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        w.__shares += 1;
        if (!(navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) throw new DOMException('Must be handling a user gesture', 'NotAllowedError');
      },
    });
  });
  await page.goto('/en/library', { waitUntil: 'load' });
  const button = page.getByRole('button', { name: 'Download' });
  await expect(button).toHaveCount(1, { timeout: 60_000 });
  const saved = page.waitForEvent('download', { timeout: 30_000 });
  await button.click();
  const busy = await button.getAttribute('aria-busy'); // read while the film is still on its way
  const file = await saved;
  expect(busy).toBe('true'); // it said it was working while the film arrived
  expect(file.suggestedFilename()).toBe('myavatar-film-film_old.webm');
  await expect(button).not.toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => (window as unknown as { __shares: number }).__shares)).toBe(0); // a computer gets a download, not the share sheet
});
