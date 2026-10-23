import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * The chat history's delete X, in a browser, with seeded history (MASTER TASK v3.1 §3.2; Phase 2 PR 8 of GG's plan of
 * 2026-10-23). The X was rebuilt in #113: the row is two buttons, the title and a 44 × 44 X centred by flex, with no
 * translate for `button:active`'s scale to wipe out (the audit's F-11) and no `::before` hit box spilling onto the next
 * row. This spec is the evidence, at 390, 768 and 1440 px:
 *
 *   - the X is 44 × 44, and its box is the same at rest, under the pointer and while pressed;
 *   - deleting a row opens nothing: the chat on screen and the open conversation stay as they were;
 *   - the delete leaves its tombstone: a row that came from the server is remembered as deleted, and the server is told
 *     once, so a later sync cannot bring it back (OmniStudio `removeConversation`);
 *   - Tab reaches the X with a visible focus ring, Enter deletes, and focus moves to the next row (the previous one at
 *     the end of the list, the empty list's action when none is left);
 *   - "Clear all", which still widens its hit box with `tap-44`, gets the same checks: 44 px to aim at, clear of the
 *     first row, still while pressed, and it only clears after the confirm.
 *
 * Only seeded rows are deleted: the history is this browser context's own localStorage, and every /api request is
 * answered here (nothing reaches a server). Screenshots of the list at rest and with the X pressed are attached to the
 * report (CI uploads it as the `playwright-report` artifact).
 */

const KEY = 'myavatar-archive::conversations::anon';
const TOMBSTONES = `${KEY}:deleted-sids`;
const CURRENT = 'myavatar-omni-current';

const ROWS = [
  { id: 'seed-first', title: 'Seeded chat: first', serverSid: 'srv-first', text: 'first seeded question' },
  { id: 'seed-middle', title: 'Seeded chat: middle', serverSid: 'srv-middle', text: 'middle seeded question' },
  { id: 'seed-last', title: 'Seeded chat: last', text: 'last seeded question' },
] as const;

interface Trash { action?: string; id?: string }

async function seed(page: Page, trash: Trash[], others: string[]): Promise<void> {
  await page.addInitScript(({ key, rows }) => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
      // Seeded once per context: a reload must show what the deletes left, not the seed again.
      if (!localStorage.getItem(key)) {
        const now = Date.now();
        localStorage.setItem(key, JSON.stringify(rows.map((r, i) => ({
          id: r.id, title: r.title, ...('serverSid' in r ? { serverSid: r.serverSid } : {}),
          messages: [{ role: 'user', text: r.text }], updatedAt: now - i * 1000,
        }))));
      }
    } catch { /* storage blocked */ }
  }, { key: KEY, rows: ROWS });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'POST' && path === '/api/chat/trash') trash.push(req.postDataJSON() as Trash);
    else if (req.method() === 'POST' && !/^\/api\/(presence|log-error|analytics\/track)\b/.test(path)) others.push(path);
    await route.fulfill({ json: {} });
  });
}

/** Opens the history (the phone keeps it in the menu drawer) and waits for the drawer to finish sliding in. */
async function openHistory(page: Page, width: number): Promise<void> {
  if (width < 768) await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).click();
  const first = rowTitle(page, ROWS[0].title);
  await expect(first).toBeVisible({ timeout: 60_000 });
  let last = '';
  await expect.poll(async () => {
    const b = await first.boundingBox();
    const now = b ? `${Math.round(b.x)},${Math.round(b.y)}` : '';
    const still = now === last;
    last = now;
    return still;
  }, { intervals: [150], timeout: 10_000 }).toBe(true);
}

const rowTitle = (page: Page, title: string) => page.getByRole('button', { name: title, exact: true });
const rowDelete = (page: Page, title: string) => rowTitle(page, title).locator('..').getByRole('button', { name: 'Delete', exact: true });

async function settled(el: Locator): Promise<void> {
  await el.evaluate(async (node) => { await Promise.all(node.getAnimations().map((a) => a.finished.catch(() => undefined))); });
}

async function box(el: Locator) {
  const b = await el.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

function expectSameBox(a: { x: number; y: number; width: number; height: number }, b: typeof a, what: string): void {
  for (const k of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(a[k] - b[k]), `${what}: ${k} moved from ${a[k]} to ${b[k]}`).toBeLessThanOrEqual(1);
  }
}

async function attach(page: Page, info: TestInfo, name: string): Promise<void> {
  const list = page.getByTestId('history-list');
  await info.attach(name, { body: await list.screenshot(), contentType: 'image/png' });
}

const tombstones = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]') as string[], TOMBSTONES);
const storedIds = (page: Page) => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '[]') as { id: string }[]).map((c) => c.id), KEY);

for (const width of [390, 768, 1440]) {
  test.describe(`delete X · ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1024 });

    test('the X is 44 × 44 and holds still under the pointer and the press; deleting opens nothing and leaves a tombstone', async ({ page }, info) => {
      test.setTimeout(120_000);
      const trash: Trash[] = [];
      const others: string[] = [];
      await seed(page, trash, others);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
      await openHistory(page, width);
      const openBefore = await page.evaluate((k) => localStorage.getItem(k), CURRENT);
      await attach(page, info, `history-${width}-rest`);

      const del = rowDelete(page, ROWS[1].title);
      const rest = await box(del);
      expect(rest.width).toBeGreaterThanOrEqual(44);
      expect(rest.height).toBeGreaterThanOrEqual(44);

      await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2);
      await expect(del).toHaveCSS('opacity', '1');
      await settled(del);
      expectSameBox(rest, await box(del), 'under the pointer');

      await page.mouse.down();
      try {
        await settled(del);
        // The pressed X scales in place (button:active), so its centre is where it was and its box shrinks by at most 3%.
        const pressed = await box(del);
        expect(Math.abs(pressed.x + pressed.width / 2 - (rest.x + rest.width / 2))).toBeLessThanOrEqual(1);
        expect(Math.abs(pressed.y + pressed.height / 2 - (rest.y + rest.height / 2))).toBeLessThanOrEqual(1);
        expect(pressed.width).toBeGreaterThanOrEqual(rest.width * 0.96);
        // Still the X under the finger: the press would land on it, not on the row's title.
        const under = await page.evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y)?.closest('button');
          return hit?.getAttribute('aria-label') ?? hit?.textContent ?? null;
        }, { x: rest.x + rest.width / 2, y: rest.y + rest.height / 2 });
        expect(under).toBe('Delete');
        await attach(page, info, `history-${width}-pressed`);
      } finally {
        await page.mouse.up();
      }

      // Gone, alone: the neighbours stay, and nothing opened.
      await expect(rowTitle(page, ROWS[1].title)).toHaveCount(0);
      await expect(rowTitle(page, ROWS[0].title)).toBeVisible();
      await expect(rowTitle(page, ROWS[2].title)).toBeVisible();
      await expect(page.getByText(ROWS[1].text)).toHaveCount(0);
      expect(await page.getByTestId('composer-input').inputValue()).toBe('');
      expect(await page.evaluate((k) => localStorage.getItem(k), CURRENT)).toBe(openBefore);
      await expect.poll(() => storedIds(page)).toEqual([ROWS[0].id, ROWS[2].id]);

      // The tombstone, and one server delete for the server's row.
      await expect.poll(() => tombstones(page)).toContain(ROWS[1].serverSid);
      await expect.poll(() => trash).toEqual([{ action: 'delete', id: ROWS[1].serverSid }]);
      expect(others).toEqual([]);

      // A reload shows what the delete left, and the tombstone is still there.
      await page.reload({ waitUntil: 'load' });
      await openHistory(page, width);
      await expect(rowTitle(page, ROWS[1].title)).toHaveCount(0);
      await expect(rowTitle(page, ROWS[2].title)).toBeVisible();
      expect(await tombstones(page)).toContain(ROWS[1].serverSid);
    });

    test('Tab reaches the X with a visible ring, Enter deletes, and focus moves to the next row', async ({ page }) => {
      test.setTimeout(120_000);
      const trash: Trash[] = [];
      const others: string[] = [];
      await seed(page, trash, others);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
      await openHistory(page, width);

      // From the first row's title, Tab is its X.
      await rowTitle(page, ROWS[0].title).focus();
      await page.keyboard.press('Tab');
      const firstX = rowDelete(page, ROWS[0].title);
      await expect(firstX).toBeFocused();
      const ring = await firstX.evaluate((el) => { const s = getComputedStyle(el); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
      expect(ring.style).not.toBe('none');
      expect(ring.width).toBeGreaterThanOrEqual(2);

      // Enter deletes it; focus moves to the next row, so the next Tab is that row's X.
      await page.keyboard.press('Enter');
      await expect(rowTitle(page, ROWS[0].title)).toHaveCount(0);
      await expect(rowTitle(page, ROWS[1].title)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(rowDelete(page, ROWS[1].title)).toBeFocused();

      // At the end of the list focus goes back one row.
      await rowDelete(page, ROWS[2].title).focus();
      await page.keyboard.press('Enter');
      await expect(rowTitle(page, ROWS[2].title)).toHaveCount(0);
      await expect(rowTitle(page, ROWS[1].title)).toBeFocused();

      // The last one: focus lands on the empty list's action.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(rowTitle(page, ROWS[1].title)).toHaveCount(0);
      await expect(page.getByTestId('history-empty').getByRole('button')).toBeFocused();

      await expect.poll(() => storedIds(page)).toEqual([]);
      await expect.poll(() => trash.map((t) => t.id).sort()).toEqual(['srv-first', 'srv-middle']);
      expect((await tombstones(page)).sort()).toEqual(['srv-first', 'srv-middle']);
      expect(others).toEqual([]);
    });

    test('"Clear all" has 44 px to aim at, clear of the first row, holds still when pressed, and clears only after the confirm', async ({ page }) => {
      test.setTimeout(120_000);
      const trash: Trash[] = [];
      const others: string[] = [];
      await seed(page, trash, others);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 60_000 });
      await openHistory(page, width);

      const clear = page.getByRole('button', { name: 'Clear all', exact: true });
      await expect(clear).toBeVisible();
      const rest = await box(clear);
      // The target a finger gets: every point of a 44 × 44 square on its centre belongs to it…
      const cx = rest.x + rest.width / 2;
      const cy = rest.y + rest.height / 2;
      const misses = await page.evaluate(({ cx, cy }) => {
        const out: string[] = [];
        for (const dx of [-21, 0, 21]) for (const dy of [-21, 0, 21]) {
          const hit = document.elementFromPoint(cx + dx, cy + dy)?.closest('button');
          if (hit?.textContent?.trim() !== 'Clear all') out.push(`${dx},${dy}`);
        }
        return out;
      }, { cx, cy });
      expect(misses).toEqual([]);
      // …and none of it lies on the first row, whose title and X still get their own taps.
      for (const target of [rowTitle(page, ROWS[0].title), rowDelete(page, ROWS[0].title)]) {
        const b = await box(target);
        expect(b.y, 'the first row starts below the Clear all target').toBeGreaterThanOrEqual(cy + 22);
        const own = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null, { x: b.x + b.width / 2, y: b.y + 2 });
        expect(own).not.toBe('Clear all');
      }

      // Pressed, it scales in place.
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await settled(clear);
      const pressed = await box(clear);
      expect(Math.abs(pressed.x + pressed.width / 2 - cx)).toBeLessThanOrEqual(1);
      expect(Math.abs(pressed.y + pressed.height / 2 - cy)).toBeLessThanOrEqual(1);

      // Declining the confirm clears nothing.
      page.once('dialog', (d) => void d.dismiss());
      await page.mouse.up();
      await expect(rowTitle(page, ROWS[0].title)).toBeVisible();
      expect(await storedIds(page)).toEqual(ROWS.map((r) => r.id));
      expect(trash).toEqual([]);

      // Accepting it clears every seeded row and tombstones the two the server had.
      page.once('dialog', (d) => void d.accept());
      await clear.click();
      await expect(page.getByTestId('history-empty')).toBeVisible();
      await expect.poll(() => storedIds(page)).toEqual([]);
      await expect.poll(() => tombstones(page).then((t) => t.sort())).toEqual(['srv-first', 'srv-middle']);
      await expect.poll(() => trash.map((t) => t.id).sort()).toEqual(['srv-first', 'srv-middle']);
      expect(others).toEqual([]);
    });
  });
}
