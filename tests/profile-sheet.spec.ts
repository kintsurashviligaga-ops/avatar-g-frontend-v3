import { expect, test, type Page } from '@playwright/test';

/**
 * The owner's PRD (2026-10-18, 2.3): Settings → „პროფილი“ opened only a photo and a name. A SIGNED-IN person (the
 * session and the account stubbed at the network edge; the dev server runs on a dummy Supabase) opens it from the
 * chat and finds the whole account in that one window: the details, the language, the balance and its movements,
 * the password, the other devices, the data export, deletion and sign-out — on a phone without sideways scrolling.
 */
const SUPABASE_URL = (process.env.PLAYWRIGHT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co').replace(/\/$/, '');
const AUTH_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const USER = {
  id: '00000000-0000-4000-8000-0000000000e8', aud: 'authenticated', role: 'authenticated', email: 'e2e-profile@example.com',
  email_confirmed_at: '2026-10-01T09:05:00.000Z', created_at: '2026-10-01T09:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email', 'google'] }, identities: [{ provider: 'email' }, { provider: 'google' }],
  user_metadata: { name: 'E2E Profile', password_set: true },
};

const b64url = (s: string) => Buffer.from(s).toString('base64url');
function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64url(JSON.stringify({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp })), 'e2e-signature'].join('.');
  return `base64-${b64url(JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh', user: USER }))}`;
}

async function signIn(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([{ name: AUTH_COOKIE, value: sessionCookie(), url: baseURL ?? 'http://localhost:3000' }]);
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }));
  await page.route(`${SUPABASE_URL}/auth/v1/token**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, refresh_token: 'y', user: USER }) }));
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/credits/balance**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: 120, monthlyAllowance: 0, resetAt: null }) }));
  await page.route('**/api/credits/history**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
    { action: 'topup', creditsDelta: 100, createdAt: '2026-10-17T10:00:00.000Z' },
    { action: 'music', creditsDelta: -5, createdAt: '2026-10-18T10:00:00.000Z' },
  ] }) }));
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

async function openProfile(page: Page) {
  await page.goto('/ka/dashboard', { waitUntil: 'load' });
  await expect(page.locator('html[data-authed="1"]')).toHaveCount(1, { timeout: 60_000 });
  // The account button in a phone's header (the closed drawer's settings button sits off-screen there); the sidebar's
  // settings button on a desktop.
  const phone = (page.viewportSize()?.width ?? 1280) < 768;
  await page.getByRole('button', { name: phone ? 'ანგარიში' : 'პარამეტრები', exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId('settings-profile').click();
  const sheet = page.getByRole('dialog', { name: 'პროფილი' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe.configure({ timeout: 180_000 }); // a cold `next dev` studio

for (const [label, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`${label}: the profile is the whole account, in the chat's window`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    await signIn(page, baseURL);
    const sheet = await openProfile(page);
    await expect(sheet.getByTestId('profile-email')).toHaveText(USER.email);
    await expect(sheet.getByTestId('profile-email-state')).toHaveText('დადასტურებულია');
    await expect(sheet.getByTestId('profile-methods')).toHaveText('ელფოსტა · Google');
    await expect(sheet.getByTestId('profile-name-input')).toHaveValue('E2E Profile');
    for (const h of ['პირადი მონაცემები', 'ენა', 'ბალანსი', 'უსაფრთხოება', 'ჩემი მონაცემები']) await expect(sheet.getByRole('heading', { name: h })).toBeAttached();
    await expect(sheet.getByTestId('profile-lang-ka')).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByTestId('profile-history')).toContainText('მუსიკა');
    await expect(sheet.getByTestId('profile-history')).toContainText('+100');
    await expect(sheet.getByTestId('profile-since')).toHaveText('1 ოქტომბერი 2026');
    await expect(sheet.getByTestId('profile-password')).toHaveText('პაროლის შეცვლა');
    await expect(sheet.getByTestId('profile-delete')).toHaveAttribute('href', '/ka/account/delete');
    // The whole sheet scrolls inside itself; nothing goes sideways on a phone, and the last row is reachable.
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await sheet.getByTestId('profile-signout').scrollIntoViewIfNeeded();
    await expect(sheet.getByTestId('profile-signout')).toBeInViewport();
    // Escape closes it, back to the chat.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('composer-input')).toBeVisible();
  });
}

test('the password form checks its two fields before anything is sent', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, baseURL);
  let sent = 0;
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (r) => {
    if (r.request().method() === 'PUT') sent += 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) });
  });
  const sheet = await openProfile(page);
  await sheet.getByTestId('profile-password').click();
  await sheet.getByTestId('profile-password-new').fill('long-enough-1');
  await sheet.getByTestId('profile-password-repeat').fill('long-enough-2');
  await sheet.getByTestId('profile-password-save').click();
  await expect(sheet.getByTestId('profile-security-status')).toHaveText('პაროლები არ ემთხვევა.');
  expect(sent).toBe(0);
});
