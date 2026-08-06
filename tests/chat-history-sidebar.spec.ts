import { test, expect, type Page } from '@playwright/test';

/**
 * The chat history a user can actually reach — ChatChrome's sidebar — driven through a real browser.
 *
 * ⚠️ EVERY OTHER GUARD ON THIS BUG CHECKS THE SHAPE OF THE CODE, AND THE SHAPE WAS NEVER WRONG.
 * Deleting a chat DID remove it and the list DID re-render; the cross-device sync then wrote it back, so
 * from the owner's chair the button "did nothing". No unit could see that, because no single unit was
 * broken. It needed a browser, a reload, and a look.
 *
 * The first version of this file drove OmniStudio's history panel — and could not open it, because that
 * panel's only trigger carries `className="hidden"`. That failure is what revealed I had been polishing
 * an unreachable surface. Keeping the test aimed at the sidebar is the point of it.
 */

const KEY = 'myavatar-archive::conversations::anon';

const seed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    title: i === 0 ? 'ზღვის სანაპირო' : i === 1 ? 'ლოგოს იდეები' : `ჩატი ${i}`,
    messages: [{ role: 'user', text: 'გამარჯობა' }],
    // Spread across days so the sidebar's date buckets have something to separate.
    updatedAt: Date.now() - i * 86_400_000,
  }));

async function openDashboard(page: Page, count = 7): Promise<void> {
  // Seed BEFORE the app boots — the sidebar reads localStorage on mount.
  // ⚠️ ONLY IF ABSENT. addInitScript runs on EVERY navigation, so an unconditional write re-seeded the
  // list during the reload and made the resurrection test pass for the wrong reason — it would have
  // reported the bug as fixed no matter what the product did.
  await page.addInitScript(([k, v]) => {
    if (!window.localStorage.getItem(k as string)) window.localStorage.setItem(k as string, v as string);
  }, [KEY, JSON.stringify(seed(count))] as const);
  await page.goto('/ka/dashboard');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('button', { name: 'ზღვის სანაპირო' })).toBeVisible({ timeout: 20_000 });
}

/** The row wrapper the sidebar renders per chat. */
const rowFor = (page: Page, title: string) => page.locator('div.group').filter({ hasText: title }).first();

test.describe('sidebar chat history', () => {
  test('a deleted chat stays deleted across a reload', async ({ page }) => {
    await openDashboard(page);
    await expect(page.getByRole('button', { name: 'ლოგოს იდეები' })).toBeVisible();

    const row = rowFor(page, 'ლოგოს იდეები');
    await row.hover();
    await row.getByRole('button', { name: /წაშლა|delete/i }).click();
    await expect(page.getByRole('button', { name: 'ლოგოს იდეები' })).toHaveCount(0);

    // ⚠️ THE ACTUAL BUG LIVED HERE. Before the fix the row came back on the next mount, because the sync
    // re-imported the server session whose local copy had just been removed.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: 'ზღვის სანაპირო' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'ლოგოს იდეები' })).toHaveCount(0);
  });

  test('the delete reaches storage, not just the screen', async ({ page }) => {
    await openDashboard(page);
    const row = rowFor(page, 'ლოგოს იდეები');
    await row.hover();
    await row.getByRole('button', { name: /წაშლა|delete/i }).click();
    await expect(page.getByRole('button', { name: 'ლოგოს იდეები' })).toHaveCount(0);

    // ⚠️ POLL, DO NOT SNAPSHOT. The write is asynchronous — the studio is asked first and the sidebar's
    // own fallback runs a tick later — so reading storage the instant the row leaves the screen is a
    // race the test loses roughly half the time. The contract is "the delete reaches storage", not
    // "it reaches storage synchronously".
    await expect.poll(async () => page.evaluate((k) => window.localStorage.getItem(k), KEY), { timeout: 5_000 })
      .not.toContain('ლოგოს იდეები');
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), KEY);
    expect(stored).toContain('ზღვის სანაპირო');
  });

  test('search finds a chat the date groups cannot help with', async ({ page }) => {
    await openDashboard(page);
    const search = page.getByPlaceholder(/ძებნა|search/i);
    await expect(search).toBeVisible();

    await search.fill('ლოგო');
    await expect(page.getByRole('button', { name: 'ლოგოს იდეები' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ზღვის სანაპირო' })).toHaveCount(0);

    await search.fill('არარსებული');
    await expect(page.getByText('ვერაფერი მოიძებნა')).toBeVisible();
    // A query matching nothing must not leave empty date headings behind — the filter runs first.
    await expect(page.getByText('დღეს', { exact: true })).toHaveCount(0);
  });

  test('no search box for a handful of chats', async ({ page }) => {
    await openDashboard(page, 3);
    await expect(page.getByPlaceholder(/ძებნა|search/i)).toHaveCount(0);
  });
});

test.describe('sidebar chat history on a touch device', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the delete control is reachable without a hover', async ({ page }) => {
    // ⚠️ A UNIT TEST CANNOT SEE THIS. `opacity-0 group-hover:opacity-100` is valid CSS rendering a button
    // jsdom finds happily — and a finger can never reveal. The sidebar gets this right; the hidden panel
    // did not, which is why the check belongs here rather than in a source scan.
    await openDashboard(page);
    const del = rowFor(page, 'ლოგოს იდეები').getByRole('button', { name: /წაშლა|delete/i });
    const opacity = await del.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.5);
  });
});
