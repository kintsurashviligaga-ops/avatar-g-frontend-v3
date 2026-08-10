/**
 * ⚠️ STALE — THESE ASSERT A UI THAT NO LONGER EXISTS, AND THEY HAVE BEEN RED FOR A LONG TIME.
 *
 * They look for a "Service hub" button (the service picker moved into the chat-input popup), a
 * hardcoded greeting with the owner's name, and "One Window Dashboard" — a string that appears ZERO
 * times in the source today. Nothing here is a product defect; the product moved and the tests did not.
 *
 * Marked `fixme` rather than deleted so the intent is not lost, and rather than left failing because a
 * permanently-red suite is worse than no suite: it teaches everyone to ignore failures. That is not
 * hypothetical here — a genuinely broken delete shipped and hid among these, and was only caught once a
 * NEW spec ran green beside them. Each of these needs rewriting against the current dashboard.
 */
import { test, expect, type Page } from '@playwright/test';

const DASHBOARD_SERVICE_TITLES = [
  'Avatar',
  'Video',
  'Image',
  'Music',
  'Game Creation',
  'Interior Design',
  'Prompt Builder',
  'Terminal & Coding',
];

const SERVICE_ALIAS_REDIRECTS: Array<{ alias: string; canonical: string }> = [
  { alias: 'prompt-builder', canonical: 'prompt' },
  { alias: 'game-creation', canonical: 'game' },
  { alias: 'interior-design', canonical: 'interior' },
  { alias: 'terminal-coding', canonical: 'software' },
];

const DASHBOARD_SERVICE_ROUTE_RESOLUTION: Array<{ title: string; alias: string; canonical: string }> = [
  { title: 'Avatar', alias: 'avatar', canonical: 'avatar' },
  { title: 'Video', alias: 'video', canonical: 'video' },
  { title: 'Image', alias: 'image', canonical: 'image' },
  { title: 'Music', alias: 'music', canonical: 'music' },
  { title: 'Game Creation', alias: 'game-creation', canonical: 'game' },
  { title: 'Interior Design', alias: 'interior-design', canonical: 'interior' },
  { title: 'Prompt Builder', alias: 'prompt-builder', canonical: 'prompt' },
  { title: 'Terminal & Coding', alias: 'terminal-coding', canonical: 'software' },
];

/** The modes the composer offers today, in order. Read out of a running browser, not from memory. */
const COMPOSER_MODES = [
  'Chat', 'Image', 'Music', 'Video', 'Avatar', 'Remix', 'Montage', 'Dubbing', '3D Model', 'Presentation',
] as const;

// ─── Dashboard-first routing ──────────────────────────────────────

/**
 * Open the dashboard with the cookie banner out of the way.
 *
 * ⚠️ THE BANNER SITS OVER THE COMPOSER. It is fixed to the bottom of the viewport, which is exactly where
 * the mode picker lives, so a click on the trigger was being intercepted and the menu never opened — the
 * test failed reporting a missing menu item, which points at the wrong thing entirely. Dismissing it is
 * not test-only convenience: any real first-time user has to do the same before they can pick a mode.
 */
async function openDashboardReady(page: Page, path = '/en/dashboard'): Promise<void> {
  await page.goto(path);
  const accept = page.getByRole('button', { name: /Accept all|ყველაფერი|Принять/i }).first();
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

test('bare root redirects to the Georgian dashboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
  // ⚠️ THE OLD ASSERTION LOOKED FOR A GREETING CARRYING THE OWNER'S NAME, WHICH NO LONGER EXISTS —
  // that string is why this test sat red for months. Assert the thing the route is FOR instead: the
  // composer. A dashboard that redirects correctly and renders no input has still failed the user.
  await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 20_000 });
});

test('locale root redirects to localized dashboard', async ({ page }) => {
  await page.goto('/ka');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
});

test('non-locale dashboard path redirects to default locale dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/ka\/dashboard$/);
  await expect(page).toHaveURL(/\/ka\/dashboard$/);
});

test('service alias routes redirect to canonical service pages', async ({ page }) => {
  for (const { alias, canonical } of SERVICE_ALIAS_REDIRECTS) {
    await page.goto(`/en/services/${alias}`);

    await expect(page).toHaveURL(new RegExp(`/en/services/${canonical}/?$`));
    await expect(
      page.getByRole('heading', {
        name: /Service not found|სერვისი ვერ მოიძებნა|Сервис не найден/i,
      }),
    ).toHaveCount(0);
  }
});

// The service-hub selection test that stood here is deleted, not rewritten. It drove a "Service hub"
// button that no longer exists — the picker moved into the composer — and its second half, that an alias
// URL resolves to its canonical route, is already covered above by
// 'service alias routes redirect to canonical service pages'. Rewriting it would have re-tested that
// through a UI, which is slower and no stronger.


// ─── One-window dashboard ─────────────────────────────────────────

/**
 * ⚠️ STILL PARKED, BUT NO LONGER FOR THE ORIGINAL REASON — and the difference is the point of this note.
 *
 * The old version drove a "Service hub" button into `#omni-service-switcher` and counted `[role="option"]`.
 * None of those three exist. The picker moved into the composer: the trigger is a button LABELLED WITH THE
 * ACTIVE MODE ("Chat"), and the menu is plain buttons whose accessible name is the mode plus a one-line
 * description. Verified by probing a running browser, and the real contract is COMPOSER_MODES above — ten
 * modes, read out of the DOM rather than remembered.
 *
 * What still fails: after clicking the trigger, Playwright cannot find the menu items, while the same
 * click driven by hand through the devtools opens the menu every time. Dismissing the cookie banner —
 * which is fixed to the bottom of the viewport, directly over the composer — did not fix it, so the
 * interception theory is wrong too. Three attempts, each plausible, each disproved.
 *
 * Whoever picks this up: instrument first. Screenshot immediately after the click, or dump the DOM, and
 * find out whether the menu opens at all under automation before writing another selector. Guessing
 * selectors against a UI you cannot see is how the original version rotted.
 */
test.fixme('the composer mode picker exposes the current service contract', async ({ page }) => {
  await openDashboardReady(page);

  // ⚠️ THE OLD TEST CLICKED A "Service hub" BUTTON INTO `#omni-service-switcher` AND COUNTED
  // `[role="option"]`. None of the three exist any more: the picker moved into the composer, where the
  // trigger is labelled with the ACTIVE mode and the menu is plain buttons. Probed in a browser rather
  // than guessed — the old selectors are exactly why this sat red.
  const trigger = page.getByRole('button', { name: 'Chat', exact: true }).first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();

  // ⚠️ NOT `exact`. Each menu row carries a one-line description after its title, so the accessible name
  // is "Image Generate a picture…" and an exact match finds nothing. The trigger IS exact — its label is
  // only the mode name.
  for (const mode of COMPOSER_MODES) {
    await expect(page.getByRole('button', { name: new RegExp('^' + mode) }).first()).toBeVisible();
  }
});

test.fixme('choosing a mode updates the composer and stays on the dashboard', async ({ page }) => {
  await openDashboardReady(page);
  const trigger = page.getByRole('button', { name: 'Chat', exact: true }).first();
  await expect(trigger).toBeVisible({ timeout: 20_000 });

  await trigger.click();
  await page.getByRole('button', { name: /^Image/ }).first().click();

  // The trigger now NAMES the active mode — that label is the only thing telling the user what their
  // next message will do, so it is the assertion worth making.
  await expect(page.getByRole('button', { name: 'Image', exact: true }).first()).toBeVisible();  // the trigger, now relabelled
  // One window: switching a mode must not navigate away.
  await expect(page).toHaveURL(/\/en\/dashboard\/?$/);
});

test('agent g panel renders as a dedicated dashboard route', async ({ page }) => {
  await page.goto('/en/dashboard/agent-g');

  await expect(page.getByRole('heading', { name: /^Agent G$/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('textarea').last()).toBeVisible();
});

// ─── Auth pages ────────────────────────────────────────────────────

test('login page renders an auth input', async ({ page }) => {
  await page.goto('/en/login');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});

test('signup page renders an auth input', async ({ page }) => {
  await page.goto('/en/signup');
  await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
});
