import { test, expect } from '@playwright/test';

const KEY = 'myavatar-archive::conversations::anon';
const TITLE = 'A long conversation title that must leave a separate target for deletion';

for (const width of [390, 768, 1440]) {
  test.describe(`history delete layout ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1024 });
    test('press stays centered, targets do not overlap, and only the chosen history is deleted', async ({ page }, info) => {
      const mutations: string[] = [];
      await page.addInitScript(({ key, title }) => {
        localStorage.setItem('myavatar-cookie-consent', 'necessary');
        localStorage.setItem('myavatar:tour-seen', '1');
        localStorage.setItem('myavatar:welcomed', '1');
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([
          { id: 'delete-target', title, messages: [{ role: 'user', text: 'test' }], updatedAt: Date.now() },
          { id: 'keep-target', title: 'Keep this conversation', messages: [{ role: 'user', text: 'keep' }], updatedAt: Date.now() },
        ]));
      }, { key: KEY, title: TITLE });
      await page.route('**/api/**', async route => {
        if (route.request().method() === 'POST') mutations.push(new URL(route.request().url()).pathname);
        await route.fulfill({ json: {} });
      });
      await page.goto('/en/dashboard');
      const title = page.getByRole('button', { name: TITLE, exact: true });
      if (width < 768) await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).click();
      await expect(title).toBeVisible();
      const row = title.locator('..');
      const del = row.getByRole('button', { name: 'Delete', exact: true });
      await row.hover();
      await expect(del).toHaveCSS('opacity', '1');
      const before = (await del.boundingBox())!;
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      try {
        await expect.poll(async () => {
          const box = (await del.boundingBox())!;
          return Math.abs(box.y + box.height / 2 - before.y - before.height / 2);
        }).toBeLessThanOrEqual(1);
        // Wait for the active transform to settle, then measure its final geometry as well.
        await del.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
        const pressed = (await del.boundingBox())!;
        expect(Math.abs(pressed.y + pressed.height / 2 - before.y - before.height / 2)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath('delete-pressed.png') });
      } finally { await page.mouse.up(); }
      expect(before.width).toBeGreaterThanOrEqual(44);
      expect(before.height).toBeGreaterThanOrEqual(44);
      await expect(title).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Keep this conversation', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(key => localStorage.getItem(key), KEY)).not.toContain('delete-target');
      expect((await page.getByTestId('composer-input').inputValue())).toBe('');
      await page.reload();
      if (width < 768) await page.getByRole('button', { name: 'Menu', exact: true }).filter({ visible: true }).click();
      const keep = page.getByRole('button', { name: 'Keep this conversation', exact: true });
      await expect(keep).toBeVisible();
      await expect(title).toHaveCount(0);
      const keepDelete = keep.locator('..').getByRole('button', { name: 'Delete', exact: true });
      const titleBox = (await keep.boundingBox())!;
      const deleteBox = (await keepDelete.boundingBox())!;
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(deleteBox.x + 1);
      expect(await keepDelete.evaluate(el => getComputedStyle(el, '::before').content)).toMatch(/^(none|normal)$/);
      await keepDelete.focus();
      await expect(keepDelete).toBeFocused();
      await keepDelete.press('Enter');
      await expect(keep).toHaveCount(0);
      expect(mutations.filter(p => !/^\/api\/(presence|log-error|analytics\/track)\b/.test(p))).toEqual([]);
    });
  });
}
