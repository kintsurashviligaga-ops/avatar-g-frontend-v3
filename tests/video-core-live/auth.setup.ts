import { test as setup, expect } from '@playwright/test';
import { join } from 'node:path';
import { STATE_DIR, password, projectUser, shot } from './_live';

/**
 * LOGIN, through the real sign-in sheet against the local auth server: /en/dashboard?auth=login → the address →
 * /api/auth/lookup (the service-role account lookup, 20261003f) says "password" → the password → signInWithPassword →
 * the page is signed in (<html data-authed="1">, a session cookie). The session is saved for this project's journey.
 */
setup('sign in through the sheet as this project\'s synthetic user', async ({ page, isMobile }, info) => {
  const user = projectUser(info);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* private mode */ }
  });
  await page.goto('/en/dashboard?auth=login');
  const sheet = page.getByTestId('auth-sheet');
  await expect(sheet).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('auth-identifier').fill(user.email);
  const lookup = page.waitForResponse((r) => r.url().endsWith('/api/auth/lookup'));
  await page.getByTestId('auth-continue').click();
  const looked = await lookup;
  expect(looked.status()).toBe(200);
  expect(await looked.json()).toMatchObject({ status: 'password' });
  await page.getByTestId('auth-password').fill(password());
  await page.getByTestId('auth-login').click();
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 30_000 });
  await expect(sheet).toBeHidden();
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => /^sb-.*-auth-token/.test(c.name)), 'a Supabase session cookie').toBe(true);
  await shot(page, `${isMobile ? 'mobile' : 'desktop'}-signed-in`);
  await page.context().storageState({ path: join(STATE_DIR, `${isMobile ? 'mobile' : 'desktop'}.json`) });
});
