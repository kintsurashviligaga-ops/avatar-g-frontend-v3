import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * §4.2.4 in a real browser: a Library star is the account's. The Library API is stubbed at the network edge (the dev
 * server runs on a dummy Supabase); its answers follow app/api/studio/library: GET 200 { items (with `favorite`), demo,
 * nextCursor }, GET ?favorite=1 for the starred works, PATCH { id, favorite } → 200 { success, favorite, ids } or 503.
 *   · a tap stars the work at once and tells the server which work; the Favorites tab asks for the starred works;
 *   · a star the server refuses goes back and says so;
 *   · the stars this browser kept before (localStorage) are sent to the account once, and the ones it took leave it.
 */
const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000f4', aud: 'authenticated', role: 'authenticated', email: 'e2e-library-favorites@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const CLIP = readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'));
const film = (id: string, favorite: boolean) => ({
  id, kind: 'film', url: `${SUPABASE_URL}/storage/v1/object/sign/renders/favorites/${id}.webm?token=e2e`, prompt: id,
  orientation: 'landscape', createdAt: new Date().toISOString(), favorite,
});

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

type Patch = { id?: string; ids?: string[]; favorite: boolean };
/** A signed-in visitor and the Library API: `starred` is the server's set of stars, `refuse` makes every PATCH a 503. */
async function library(page: Page, baseURL: string | undefined, opts: { refuse?: boolean; works?: string[] } = {}) {
  const starred = new Set<string>();
  const patches: Patch[] = [];
  const reads: URLSearchParams[] = [];
  const works = opts.works ?? ['f1', 'f2'];
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route(`${SUPABASE_URL}/storage/v1/object/sign/renders/favorites/**`, (r) => r.fulfill({ status: 200, contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: CLIP }));
  await page.route('**/api/studio/library**', async (r) => {
    const req = r.request();
    const json = (body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
    if (req.method() === 'PATCH') {
      const body = JSON.parse(req.postData() ?? '{}') as Patch;
      patches.push(body);
      if (opts.refuse) return json({ success: false, error: 'favorites_unavailable' }, 503);
      const ids = (body.ids ?? [body.id!]).filter((id) => works.includes(id));
      for (const id of ids) { if (body.favorite) starred.add(id); else starred.delete(id); }
      return json({ success: true, favorite: body.favorite, ids });
    }
    if (req.method() !== 'GET') return r.fallback();
    const q = new URL(req.url()).searchParams;
    reads.push(q);
    const items = (q.get('favorite') === '1' ? works.filter((id) => starred.has(id)) : works).map((id) => film(id, starred.has(id)));
    return json({ items, demo: false, nextCursor: null });
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
  return { starred, patches, reads };
}

test.use({ viewport: { width: 1280, height: 800 } });
test.describe.configure({ timeout: 180_000 }); // cold `next dev` route

test('a tap stars the work at once and saves it to the account; the Favorites tab shows the starred works', async ({ page, baseURL }) => {
  const api = await library(page, baseURL);
  await page.goto('/en/library', { waitUntil: 'load' });
  const stars = page.getByTestId('library-star');
  await expect(stars).toHaveCount(2, { timeout: 60_000 });
  await expect(stars.nth(0)).toHaveAttribute('aria-pressed', 'false');

  await stars.nth(0).click();
  await expect(stars.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => api.patches).toEqual([{ id: 'f1', favorite: true }]);
  await expect(page.getByTestId('library-fav-failed')).toHaveCount(0);

  await page.getByRole('button', { name: 'Favorites', exact: true }).and(page.locator(':not([data-testid])')).click();
  await expect.poll(() => api.reads.some((q) => q.get('favorite') === '1' && q.get('limit') === '12' && q.get('offset') === '0')).toBe(true);
  await expect(page.locator('video[src*="favorites/f1.webm"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('video[src*="favorites/f2.webm"]')).toHaveCount(0);

  // Taken off on the Favorites tab: the work leaves it at once.
  await page.getByTestId('library-star').first().click();
  await expect(page.locator('video[src*="favorites/f1.webm"]')).toHaveCount(0);
  await expect(page.getByText('No favorites yet. Tap the star on a work to keep it here.')).toBeVisible();
  await expect.poll(() => api.patches.at(-1)).toEqual({ id: 'f1', favorite: false });
});

test('a star the server refuses goes back and says so', async ({ page, baseURL }) => {
  await library(page, baseURL, { refuse: true });
  await page.goto('/en/library', { waitUntil: 'load' });
  const star = page.getByTestId('library-star').first();
  await expect(star).toBeVisible({ timeout: 60_000 });
  await star.click();
  await expect(page.getByTestId('library-fav-failed')).toHaveText('The star could not be saved. Try again.');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
});

test('the stars this browser kept before move to the account once; the ones it did not take stay', async ({ page, baseURL }) => {
  const api = await library(page, baseURL);
  await page.addInitScript(() => {
    try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('myavatar:favorites', JSON.stringify(['f2', 'not-mine'])); sessionStorage.setItem('seeded', '1'); } } catch { /* storage blocked */ }
  });
  await page.goto('/en/library', { waitUntil: 'load' });
  await expect.poll(() => api.patches, { timeout: 60_000 }).toEqual([{ ids: ['f2', 'not-mine'], favorite: true }]);
  await expect(page.getByTestId('library-star').nth(1)).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('library-star').nth(0)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('myavatar:favorites'))).toBe('["not-mine"]');
});
