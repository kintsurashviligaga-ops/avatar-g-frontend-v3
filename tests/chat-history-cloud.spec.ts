import { test, expect, type Page } from '@playwright/test';

/**
 * A chat the account keeps on the server, opened from History, stays ONE History row (owner's report 2026-10-09 18:26Z:
 * "when I press one in the history it multiplies in the list").
 *
 * The cause was two steps apart. Opening a `cloud:` row emptied it for a moment while its transcript loaded, the save of
 * that moment deleted the row, and it came back without its server session id; the next mount ("New session" remounts the
 * studio) then imported the same session again under the same id. Only a signed-in browser with a server session shows it.
 */

const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = { id: '00000000-0000-4000-8000-0000000000c1', aud: 'authenticated', role: 'authenticated', email: 'e2e-history@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const KEY = `myavatar-archive::conversations::${USER.id}`;
const SID = 'a36ad942-37d3-40e5-82a7-fd32c884f588';
// Longer than both cuts of a title (the sidebar's 52 characters, the server's 80).
const FIRST = 'ექსტრაქტ გაუკეთე mp3 და დაადე მუსიკა ამ ვიდეოდან https://youtube.com/shorts/gbtHNIZhelw?si=olq-7T14ozOQqiA9';

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

async function openSignedIn(page: Page, baseURL: string | undefined, seed?: unknown[]): Promise<void> {
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => {
    const u = r.request().url();
    const get = r.request().method() === 'GET';
    if (get && u.includes('/chat_sessions')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ session_id: SID, title: FIRST.slice(0, 80), updated_at: '2026-10-09T12:19:40Z', agent_id: 'agent-g' }]) });
    if (get && u.includes('/chat_messages')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 1, role: 'user', content: FIRST, created_at: '2026-10-09T12:19:33Z' },
      { id: 2, role: 'assistant', content: 'ლინკს ვერ ვხსნი; ატვირთე ფაილი.', created_at: '2026-10-09T12:19:40Z' },
    ]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript(([k, v]) => {
    try {
      localStorage.setItem('myavatar:welcomed', '1');
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      if (v && !localStorage.getItem(k as string)) localStorage.setItem(k as string, v as string);
    } catch { /* storage blocked */ }
  }, [KEY, seed ? JSON.stringify(seed) : ''] as const);
  await page.goto('/en/dashboard');
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
}

const rowsInStorage = (page: Page) => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) || '[]') as Array<{ id: string }>).map((c) => c.id), KEY);
const historyRows = (page: Page) => page.getByRole('button', { name: /^ექსტრაქტ/ });

test.use({ viewport: { width: 1280, height: 800 } });
test.setTimeout(180_000);

test('opening a server chat from History, again and again, keeps one row', async ({ page, baseURL }) => {
  await openSignedIn(page, baseURL);
  await expect(historyRows(page)).toHaveCount(1, { timeout: 20_000 });
  for (let i = 0; i < 3; i++) {
    await historyRows(page).first().click();
    await expect(page.getByText('ლინკს ვერ ვხსნი; ატვირთე ფაილი.')).toBeVisible();
    // "New session" remounts the studio, which runs the account sync again: the step that used to import the copy.
    await page.getByRole('button', { name: /New session/ }).first().click();
    await page.waitForTimeout(1500);
    await expect(historyRows(page)).toHaveCount(1);
    expect(await rowsInStorage(page)).toEqual([`cloud:${SID}`]);
  }
  await page.reload();
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(historyRows(page)).toHaveCount(1);
  expect(await rowsInStorage(page)).toEqual([`cloud:${SID}`]);
});

test('a device that already holds copies shows the chat once, with its transcript', async ({ page, baseURL }) => {
  const now = Date.now();
  const copy = (updatedAt: number, messages: unknown[], extra: Record<string, unknown> = {}) => ({ id: `cloud:${SID}`, title: `${FIRST.slice(0, 52)}…`, updatedAt, messages, ...extra });
  await openSignedIn(page, baseURL, [
    copy(now - 1000, [{ role: 'user', text: FIRST }, { role: 'assistant', text: 'ლინკს ვერ ვხსნი; ატვირთე ფაილი.' }], { tool: 'chat' }),
    copy(now - 2000, [], { serverSid: SID }),
    copy(now - 3000, []),
  ]);
  await expect(historyRows(page)).toHaveCount(1, { timeout: 20_000 });
  // Picked at once, as a person does, maybe before the studio's code has even loaded: the pick must still open the chat.
  await historyRows(page).first().click();
  await expect(page.getByText('ლინკს ვერ ვხსნი; ატვირთე ფაილი.')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  expect(await rowsInStorage(page)).toEqual([`cloud:${SID}`]);
});
