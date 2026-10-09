import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * tests/auth-sheet.spec.ts — Log in · Sign up · Forgot password (owner, 2026-10-03: separate „Log in" and „Sign up for
 * free", a reset code by email, and an address that already has an account can never register again).
 *
 * The auth backend is stubbed IN THE BROWSER: /api/auth/lookup and /api/auth/email-otp/send (their server logic has its
 * own unit tests), and Supabase's GoTrue endpoints (settings, verify, token, user, logout) on the dummy project URL the
 * dev server runs with. So every step of every flow is driven for real — the sheet, its requests and its answers —
 * without an account, a mailbox or a network.
 */

type Json = Record<string, unknown>;

const b64 = (o: Json) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (email: string) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-1', email, exp, aud: 'authenticated', role: 'authenticated' })}.sig`,
    token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-1',
    user: { id: 'u-1', aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() },
  };
};

interface Backend {
  lookups: string[];
  sends: Json[];
  verifies: Json[];
  userUpdates: Json[];
  logouts: string[];
}

/** Stub the backend. `status` = what /api/auth/lookup answers; `send` = what the code send answers. */
async function backend(page: Page, opts: { status?: string; send?: { status: number; body: Json }; password?: 'ok' | 'wrong' } = {}): Promise<Backend> {
  const b: Backend = { lookups: [], sends: [], verifies: [], userUpdates: [], logouts: [] };
  await page.addInitScript(() => {
    try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); localStorage.setItem('myavatar:tour-seen', '1'); } catch { /* */ }
  });
  await page.route('**/auth/v1/settings', (r) => r.fulfill({ json: { external: { email: true, google: true, phone: false } } }));
  await page.route('**/api/auth/lookup', async (r: Route) => {
    b.lookups.push(String((r.request().postDataJSON() as Json).identifier));
    await r.fulfill({ json: { status: opts.status ?? 'none' } });
  });
  await page.route('**/api/auth/email-otp/send', async (r: Route) => {
    b.sends.push(r.request().postDataJSON() as Json);
    const s = opts.send ?? { status: 200, body: { ok: true } };
    await r.fulfill({ status: s.status, json: s.body });
  });
  await page.route('**/auth/v1/verify', async (r: Route) => {
    const body = r.request().postDataJSON() as Json;
    b.verifies.push(body);
    await r.fulfill({ json: session(String(body.email ?? 'x@example.com')) });
  });
  await page.route('**/auth/v1/token?grant_type=password', (r) => (opts.password ?? 'wrong') === 'ok'
    ? r.fulfill({ json: session('member@example.com') })
    : r.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }));
  await page.route('**/auth/v1/user', async (r: Route) => {
    if (r.request().method() === 'PUT') b.userUpdates.push(r.request().postDataJSON() as Json);
    await r.fulfill({ json: session('member@example.com').user });
  });
  await page.route('**/auth/v1/logout**', async (r: Route) => { b.logouts.push(r.request().url()); await r.fulfill({ status: 204, body: '' }); });
  return b;
}

const sheet = (page: Page) => page.getByTestId('auth-sheet');

async function openSheet(page: Page, mode: 'login' | 'signup') {
  await page.goto(`/ka/dashboard?auth=${mode}`);
  await expect(sheet(page)).toBeVisible({ timeout: 45_000 });
  await expect(sheet(page)).toHaveAttribute('data-flow', mode);
}

async function enterEmail(page: Page, email: string) {
  await page.getByTestId('auth-identifier').fill(email);
  await page.getByTestId('auth-continue').click();
}

test.describe('the sign-in sheet', () => {
  test('a guest has two doors — „შესვლა" and „დარეგისტრირდი უფასოდ" — and each opens its own sheet, on the email field', async ({ page }) => {
    await backend(page);
    await page.goto('/ka/dashboard?tool=chat');
    await page.getByTestId('titlebar-login').click();
    await expect(sheet(page)).toHaveAttribute('data-flow', 'login');
    await expect(page.getByRole('dialog', { name: 'შესვლა MyAvatar-ში' })).toBeVisible();
    await expect(page.getByTestId('auth-identifier')).toBeFocused();
    await expect(page.getByTestId('auth-google')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await page.getByTestId('titlebar-signup').click();
    await expect(page.getByRole('dialog', { name: 'შექმენი ანგარიში' })).toBeVisible();
    // The terms the account is made under are one tap away.
    await expect(sheet(page).getByRole('link', { name: 'წესებს' })).toHaveAttribute('href', '/ka/terms');
  });

  test('log in: an address with no account is told so — and one tap creates it', async ({ page }) => {
    const b = await backend(page, { status: 'none' });
    await openSheet(page, 'login');
    await enterEmail(page, 'Nina@Example.com');
    await expect(page.getByTestId('auth-issue-noAccount')).toContainText('ამ ელფოსტით ანგარიში ვერ მოიძებნა.');
    expect(b.lookups).toEqual(['nina@example.com']);
    expect(b.sends).toEqual([]); // no code for an address with no account
    await page.getByTestId('auth-issue-action').click();
    await expect(sheet(page)).toHaveAttribute('data-step', 'code');
    await expect(sheet(page)).toHaveAttribute('data-flow', 'signup');
    expect(b.sends).toEqual([{ email: 'nina@example.com', purpose: 'register', locale: 'ka' }]);
    await expect(page.getByRole('dialog', { name: 'დაადასტურე ელფოსტა' })).toBeVisible();
  });

  test('sign up: an address that already has an account cannot register again — it is sent to log in', async ({ page }) => {
    const b = await backend(page, { status: 'password' });
    await openSheet(page, 'signup');
    await enterEmail(page, 'member@example.com');
    await expect(page.getByTestId('auth-issue-exists')).toContainText('ეს ელფოსტა უკვე რეგისტრირებულია.');
    expect(b.sends).toEqual([]); // nothing was registered, no code was sent
    await page.getByTestId('auth-issue-action').click();
    await expect(sheet(page)).toHaveAttribute('data-flow', 'login');
    await expect(sheet(page)).toHaveAttribute('data-step', 'password');
    await expect(page.getByTestId('auth-address').first()).toHaveText('member@example.com');
  });

  test('sign up: even when the lookup is unavailable, the server refuses a registered address (account_exists)', async ({ page }) => {
    const b = await backend(page, { status: 'unknown', send: { status: 409, body: { error: 'account_exists' } } });
    await openSheet(page, 'signup');
    await enterEmail(page, 'member@example.com');
    await expect(page.getByTestId('auth-issue-exists')).toBeVisible();
    expect(b.sends).toEqual([{ email: 'member@example.com', purpose: 'register', locale: 'ka' }]);
    await expect(sheet(page)).toHaveAttribute('data-step', 'start');
  });

  test('sign up end to end: a confirmation code, then a name and a password (8+)', async ({ page }) => {
    const b = await backend(page, { status: 'none' });
    await openSheet(page, 'signup');
    await enterEmail(page, 'new@example.com');
    await expect(page.getByTestId('auth-resend')).toHaveText('ხელახლა გაგზავნა 60 წმ-ში');
    await expect(page.getByTestId('auth-resend')).toBeDisabled();
    await page.getByTestId('auth-code').fill('123456'); // six digits verify at once
    await expect(sheet(page)).toHaveAttribute('data-step', 'profile');
    // The session exists now — and nothing (the first-login welcome) may open on top of the step still to fill in.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(b.verifies).toEqual([{ email: 'new@example.com', token: '123456', type: 'email', gotrue_meta_security: {} }]);
    // The password typed into the name field too (a real sign-up, 2026-10-09) is refused: it would show in plain text.
    await page.getByTestId('auth-name').fill('a-long-passphrase');
    await page.getByTestId('auth-new-password').fill('a-long-passphrase');
    await page.getByTestId('auth-finish').click();
    await expect(sheet(page).getByRole('alert')).toHaveText('სახელის ველში პაროლი წერია. ჩაწერე სახელი ან დატოვე ცარიელი.');
    expect(b.userUpdates).toHaveLength(0);
    await page.getByTestId('auth-name').fill('ნინო');
    await page.getByTestId('auth-new-password').fill('short');
    await expect(page.getByTestId('auth-finish')).toBeDisabled();
    await page.getByTestId('auth-new-password').fill('a-long-passphrase');
    await page.getByTestId('auth-finish').click();
    await expect(sheet(page)).toHaveCount(0);
    expect(b.userUpdates).toHaveLength(1);
    expect(b.userUpdates[0]).toMatchObject({ password: 'a-long-passphrase', data: { password_set: true, name: 'ნინო' } });
  });

  test('forgot password: a RESET code by email, then a new password — and every other device is signed out', async ({ page }) => {
    const b = await backend(page, { status: 'password' });
    await openSheet(page, 'login');
    await enterEmail(page, 'member@example.com');
    await expect(sheet(page)).toHaveAttribute('data-step', 'password');
    await page.getByTestId('auth-forgot').click();
    await expect(page.getByRole('dialog', { name: 'პაროლის აღდგენა' })).toBeVisible();
    expect(b.sends).toEqual([{ email: 'member@example.com', purpose: 'recovery', locale: 'ka' }]);
    await page.getByTestId('auth-code').fill('654321');
    await expect(sheet(page)).toHaveAttribute('data-step', 'newPassword');
    expect(b.verifies[0]).toMatchObject({ email: 'member@example.com', token: '654321', type: 'recovery' });
    await page.getByTestId('auth-new-password').fill('brand-new-pass');
    await page.getByTestId('auth-repeat').fill('brand-new-pas');
    await page.getByTestId('auth-save-password').click();
    await expect(sheet(page).getByRole('alert')).toHaveText('პაროლები არ ემთხვევა.');
    await page.getByTestId('auth-repeat').fill('brand-new-pass');
    await page.getByTestId('auth-save-password').click();
    await expect(sheet(page).getByRole('status')).toHaveText('პაროლი შეიცვალა.');
    expect(b.userUpdates).toHaveLength(1);
    expect(b.userUpdates[0]).toMatchObject({ password: 'brand-new-pass', data: { password_set: true } });
    await expect.poll(() => b.logouts.length).toBe(1);
    expect(b.logouts[0]).toContain('scope=others');
  });

  test('log in: an account that has only codes gets a code straight away; a wrong password says so', async ({ page }) => {
    const b = await backend(page, { status: 'code' });
    await openSheet(page, 'login');
    await enterEmail(page, 'codes@example.com');
    await expect(page.getByRole('dialog', { name: 'შეიყვანე კოდი' })).toBeVisible();
    expect(b.sends).toEqual([{ email: 'codes@example.com', purpose: 'signin', locale: 'ka' }]);

    const b2 = await backend(page, { status: 'password', password: 'wrong' });
    await openSheet(page, 'login');
    await enterEmail(page, 'member@example.com');
    await page.getByTestId('auth-password').fill('not-it');
    await page.getByTestId('auth-login').click();
    await expect(sheet(page).getByRole('alert')).toHaveText('პაროლი არასწორია.');
    expect(b2.lookups).toEqual(['member@example.com']);
  });

  test('phone: the sheet is a bottom sheet that fits the screen, with nothing sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await backend(page);
    await openSheet(page, 'login');
    // Measured once its rise (8 px, 220 ms) has settled: it sits on the bottom edge, full width.
    await expect.poll(async () => { const r = (await sheet(page).boundingBox())!; return Math.round(r.y + r.height); }).toBe(760);
    const box = (await sheet(page).boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.width)).toBe(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
