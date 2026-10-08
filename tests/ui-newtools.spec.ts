import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * The Interior designer and the Photographer (components/studio/create), on the studio at a phone and a desktop width:
 *  · both are reachable — from the tool picker (the „+" sheet on a phone, the sidebar's Services on a desktop) and by
 *    `?tool=interior|photoshoot`;
 *  · each panel has the reference's structure, top to bottom (header · dashed upload · … · prompt · chips · Generate),
 *    with the price ON the Generate button (the image route's price for one render: 2 credits);
 *  · the centre pane is the tool's welcome with its models-and-prices list;
 *  · nothing pushes the page sideways at 375 px.
 * No generation is started (the network is the dummy-Supabase dev server): the paid path is covered by the jest suites
 * (components/studio/create/createPanels.test.tsx, app/api/nanobanana/image/studio.test.ts).
 * Set SHOTS_DIR to also write screenshots there.
 */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const TOOLS = [
  { id: 'interior', title: 'Interior designer', order: ['header', 'upload', 'room', 'styles', 'prompt', 'chips', 'generate'] },
  { id: 'photoshoot', title: 'Photographer', order: ['header', 'upload', 'presets', 'camera', 'prompt', 'chips', 'generate'] },
] as const;

async function presetConsent(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
}

/** The page scrolls in <body>, not the document — check both for a sideways scroll. */
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

for (const vp of VIEWPORTS) {
  test.describe(`interior designer + photographer · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const tool of TOOLS) {
      test(`?tool=${tool.id} opens the ${tool.title}: reference structure, the price on Generate, no sideways scroll`, async ({ page }) => {
        await presetConsent(page);
        await page.goto(`/en/dashboard?tool=${tool.id}`, { waitUntil: 'load' });
        const panel = page.getByTestId(`${tool.id}-panel`);
        await expect(panel).toBeAttached({ timeout: 60_000 });
        // A phone shows the settings as a sheet: the tool chip opens it if the deep link left it closed (`next dev` re-runs effects).
        if (!(await panel.isVisible())) await page.getByTestId('options-toggle').click();
        await expect(panel).toBeVisible();

        // The reference's order, top to bottom.
        const ids = tool.order.map((o) => `${tool.id}-${o}`);
        for (const id of ids) await expect(page.getByTestId(id)).toBeAttached();
        // (the footer is sticky, so compare the document order, not the pinned position)
        const order = await page.evaluate((list) => {
          const nodes = list.map((id) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement);
          return nodes.every((n, i) => i === 0 || Boolean(nodes[i - 1]!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
        }, ids);
        expect(order).toBe(true);

        // The header names the tool and has the ✕; the upload card is dashed.
        await expect(page.getByTestId(`${tool.id}-header`)).toContainText(tool.title);
        await expect(page.getByTestId(`${tool.id}-close`)).toBeVisible();
        expect(await page.getByTestId(`${tool.id}-dropzone`).evaluate((n) => getComputedStyle(n).borderTopStyle)).toBe('dashed');

        // The price is ON the button: one render = 2 credits (creditCostFor('image')), whatever the viewport.
        const generate = page.getByTestId(`${tool.id}-generate`);
        await expect(generate).toBeVisible();
        await expect(generate).toHaveAttribute('data-price', '2');
        await expect(generate).toContainText('Generate');
        await expect(generate).toContainText('2');
        expect((await generate.boundingBox())!.height).toBeGreaterThanOrEqual(44);

        // Every control on the chip row is a real, ≥ 44 px target.
        for (const chip of await page.getByTestId(`${tool.id}-chips`).getByRole('button').all()) {
          expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await noHorizontalScroll(page);
        await shot(page, `${tool.id}-${vp.name}-panel`);

        // The centre pane is EMPTY before the first run: no description card, no numbered steps, no price table that stays
        // behind the sheet (the owner removed them) — the price is on the panel's Generate pill.
        await expect(page.getByTestId('shoot-empty')).toBeAttached();
        await expect(page.getByTestId('shoot-empty')).toBeEmpty();
        await expect(page.getByTestId('models-prices')).toHaveCount(0);
      });
    }

    test('both tools are in the tool picker, and picking one opens it', async ({ page }) => {
      await presetConsent(page);
      await page.goto('/en/dashboard', { waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
      if (vp.name === 'desktop') {
        const nav = page.locator('aside[aria-label="Menu"]');
        // The sidebar lists categories (§60 step 11); both tools live under Image & Photo's „More".
        await nav.getByRole('button', { name: 'Image & Photo: More' }).click();
        for (const t of TOOLS) await expect(nav.getByRole('button', { name: t.title })).toBeVisible();
        await nav.getByRole('button', { name: 'Interior designer' }).click();
      } else {
        await page.getByRole('button', { name: 'Tools', exact: true }).click();
        const sheet = page.getByTestId('tool-sheet');
        await expect(sheet).toBeVisible();
        for (const t of TOOLS) await expect(sheet.getByRole('button', { name: new RegExp(t.title) })).toBeVisible();
        await shot(page, `picker-${vp.name}`);
        await sheet.getByRole('button', { name: /Interior designer/ }).click();
      }
      await expect(page.getByTestId('interior-panel')).toBeAttached();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tool)).toBe('interior');
      await noHorizontalScroll(page);
    });
  });
}
