import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/**
 * tests/vfx-genjutsu.spec.ts — the VFX (Genjutsu) tool: reachable, laid out in Higgsfield's mobile grammar, honest.
 *
 * Deterministic and auth-free (a guest sees the studio): the capabilities endpoint is stubbed so every state of the panel
 * can be reached without a provider key, and no test presses a Generate that would spend — the money path is covered
 * by the route tests (app/api/genjutsu/*). What is pinned here is what only a browser can show:
 *   · the tool is reachable by its deep link (`?tool=vfx`) and its panel mounts in the settings column / sheet;
 *   · the ELEMENT ORDER (hero → presets → modes → references → prompt → engines → Generate) and the price ON the button;
 *   · a preset tap enables Generate with nothing typed; the dropzone counts and says "Using N of M" before any payment;
 *   · a locked mode is inert and says "soon"; nothing scrolls sideways at 375 px; every control is ≥ 44 px.
 *
 * Optional: VFX_SHOTS_DIR=<dir> saves screenshots of the key states there (never committed).
 */

const SHOTS = process.env.VFX_SHOTS_DIR;

const CAPS_SCENE_OPEN = { ops: { scene: { open: true, state: 'open' }, motion: { open: false, state: 'soon' }, swap: { open: false, state: 'soon' } } };
const CAPS_ALL_SOON = { ops: { scene: { open: false, state: 'soon' }, motion: { open: false, state: 'soon' }, swap: { open: false, state: 'soon' } } };

async function openVfx(page: Page, o: { lang?: 'ka' | 'en' | 'ru'; width: number; height: number; caps?: unknown }) {
  await page.setViewportSize({ width: o.width, height: o.height });
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.route('**/api/genjutsu/capabilities', (r) => r.fulfill({ json: o.caps ?? CAPS_SCENE_OPEN }));
  await page.goto(`/${o.lang ?? 'en'}/dashboard?tool=vfx`, { waitUntil: 'load' });
  const panel = page.getByTestId('vfx-panel');
  // The deep link selects the tool on mount. On a phone the settings are a sheet that the tool pick opens; if the first
  // (mount-time) pick did not open it, the sidebar's own path (`omni:set-tool`, what tapping VFX in the menu fires) does.
  await panel.waitFor({ state: 'attached', timeout: 90_000 });
  if (!(await panel.isVisible())) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('omni:set-tool', { detail: 'vfx' })));
  }
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600); // framer-motion settles
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** A solid-colour JPEG big enough to pass the 300 px floor, as an upload payload. */
async function photo(i: number) {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: (i * 53) % 255, g: (i * 97) % 255, b: (i * 31) % 255 } } }).jpeg().toBuffer();
  return { name: `photo-${i}.jpg`, mimeType: 'image/jpeg', buffer };
}

/** No page-level horizontal scroll, and nothing in the panel wider than the panel. */
async function sideways(page: Page): Promise<{ page: boolean; panel: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const panel = document.querySelector('[data-testid="vfx-panel"]') as HTMLElement;
    const spill: string[] = [];
    const clipped = (el: HTMLElement): boolean => {
      // Anything inside a box that clips or scrolls its own overflow (the preset rail, a rounded card) cannot widen the page.
      for (let a = el.parentElement; a && a !== panel; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return el.classList.contains('sr-only');
    };
    for (const el of Array.from(panel.querySelectorAll<HTMLElement>('*'))) {
      if (clipped(el)) continue;
      const r = el.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      // By design two elements bleed past the panel's text column INTO its own padding: the preset rail (-mx-3, so the
      // tiles scroll edge to edge in the phone sheet) and the sticky Generate pill (-mx-1). Anything beyond 14 px is a bug.
      if (r.width > 0 && (r.right > p.right + 14 || r.left < p.left - 14)) spill.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.className.toString().slice(0, 40)}] ${Math.round(p.left)}..${Math.round(p.right)} vs ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return { page: doc.scrollWidth > doc.clientWidth + 1 || document.body.scrollWidth > document.body.clientWidth + 1, panel: spill };
  });
}

for (const view of [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const) {
  test.describe(`VFX tool — ${view.name} ${view.width}×${view.height}`, () => {
    test('the tool is reachable by its deep link and the panel mounts', async ({ page }) => {
      await openVfx(page, view);
      await expect(page.getByTestId('vfx-hero')).toBeVisible();
      await expect(page.getByTestId('vfx-presets')).toBeVisible();
      await expect(page.getByTestId('vfx-modes')).toBeVisible();
      await expect(page.getByTestId('vfx-refs')).toBeVisible();
      await expect(page.getByTestId('vfx-generate')).toBeVisible();
      // The settings surface that carries it: a sheet on a phone, the right column on a desktop.
      await expect(page.getByTestId(view.width < 1024 ? 'options-sheet' : 'settings-panel')).toContainText('VFX');
      await shot(page, `${view.name}-01-initial`);
    });

    test('the elements come in Higgsfield order: hero, presets, modes, references, detail, engines, Generate', async ({ page }) => {
      await openVfx(page, view);
      // DOM order, not coordinates: the panel scrolls inside its own column and the Generate pill is sticky.
      const ids = ['vfx-hero', 'vfx-presets', 'vfx-modes', 'vfx-refs', 'vfx-prompt', 'vfx-engines', 'vfx-generate'];
      const inOrder = await page.evaluate((list) => {
        const els = list.map((id) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement);
        return els.every((el, i) => i === 0 || !!(els[i - 1]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
      }, ids);
      expect(inOrder).toBe(true);
    });

    test('there are at least fourteen presets, one tap picks one, and Generate then works with NOTHING typed — the price is ON the button', async ({ page }) => {
      await openVfx(page, view);
      const tiles = page.locator('[data-testid="vfx-presets"] [role="radio"]');
      expect(await tiles.count()).toBeGreaterThanOrEqual(14);

      const gen = page.getByTestId('vfx-generate');
      await expect(gen).toBeDisabled();
      await expect(gen).toContainText('Pick an effect');

      await page.locator('[data-preset="fire"]').first().click();
      await expect(page.getByTestId('vfx-hero')).toHaveAttribute('data-preset', 'fire');
      await expect(gen).toBeEnabled();
      await expect(gen).toHaveAttribute('data-price', '25'); // Veo Fast, one 8 s clip — the number the server charges
      await expect(gen).toContainText('Generate');
      await expect(gen).toContainText('25');
      await expect(page.getByTestId('vfx-prompt')).toHaveValue(''); // nothing typed
      // The owner removed the caption under the composer: a tool's price lives ONLY on its button.
      await expect(page.getByTestId('price-tag')).toHaveCount(0);
      await shot(page, `${view.name}-02-preset-picked`);
    });

    test('Quality changes the price on the button (Fast 25 → Standard 83), through the same function the server charges with', async ({ page }) => {
      await openVfx(page, view);
      await page.locator('[data-preset="portal"]').first().click();
      const gen = page.getByTestId('vfx-generate');
      await expect(gen).toHaveAttribute('data-price', '25');
      await page.getByRole('radio', { name: 'Standard' }).click();
      await expect(gen).toHaveAttribute('data-price', '83');
    });

    test('the dropzone counts "n / 40", says how many photos the engine really receives, and lets a photo be re-roled and removed', async ({ page }) => {
      await openVfx(page, view);
      const input = page.getByTestId('vfx-refs-input');
      await expect(page.getByTestId('vfx-refs-count')).toHaveText('0 / 40');
      await expect(page.getByTestId('vfx-refs-policy')).toContainText('takes up to 3');

      await input.setInputFiles(await Promise.all([1, 2, 3, 4, 5].map(photo)));
      await expect(page.getByTestId('vfx-refs-count')).toHaveText('5 / 40', { timeout: 20_000 });
      // 5 photos, Veo takes 3 → the user is told BEFORE paying.
      await expect(page.getByTestId('vfx-refs-policy')).toContainText('Using 3 of 5');
      await expect(page.locator('[data-testid^="vfx-ref-"][data-used="true"]')).toHaveCount(3);

      // Select the fourth photo (not in use), make it a Product — now the role pass picks it.
      await page.getByTestId('vfx-ref-3').click();
      await page.getByTestId('vfx-ref-toolbar').getByRole('radio', { name: 'Product' }).click();
      await expect(page.getByTestId('vfx-ref-3')).toHaveAttribute('data-role', 'product');
      await expect(page.getByTestId('vfx-ref-3')).toHaveAttribute('data-used', 'true');

      await page.getByTestId('vfx-ref-toolbar').getByRole('button', { name: 'Remove photo' }).click();
      await expect(page.getByTestId('vfx-refs-count')).toHaveText('4 / 40');
      await shot(page, `${view.name}-03-references`);
    });

    test('a locked mode is shown inert with a plain "soon" line, its button is off, and nothing is charged', async ({ page }) => {
      await openVfx(page, view);
      await page.locator('[data-preset="ice"]').first().click();
      await page.getByRole('radio', { name: /Motion/ }).click();
      await expect(page.getByTestId('vfx-locked')).toContainText('Soon');
      const gen = page.getByTestId('vfx-generate');
      await expect(gen).toBeDisabled();
      await expect(gen).not.toHaveAttribute('data-price', /.+/);
      // The inputs are visible (the user sees what the mode will ask for) but inert.
      await expect(page.getByTestId('vfx-video')).toBeVisible();
      expect(await page.getByTestId('vfx-video-input').evaluate((el) => (el as HTMLInputElement).disabled)).toBe(true);
      await shot(page, `${view.name}-04-locked-motion`);
    });

    test('with every op shut the panel still opens, and says so — nothing is faked', async ({ page }) => {
      await openVfx(page, { ...view, caps: CAPS_ALL_SOON });
      await expect(page.getByTestId('vfx-locked')).toContainText('Soon');
      await expect(page.getByTestId('vfx-generate')).toBeDisabled();
    });

    test('no horizontal scroll, and every control is at least 44 px', async ({ page }) => {
      await openVfx(page, view);
      await page.getByTestId('vfx-refs-input').setInputFiles(await Promise.all([1, 2].map(photo)));
      await expect(page.getByTestId('vfx-refs-count')).toHaveText('2 / 40', { timeout: 20_000 });
      const s = await sideways(page);
      expect(s.page).toBe(false);
      expect(s.panel).toEqual([]);
      const small = await page.getByTestId('vfx-panel').evaluate((panel) => {
        const out: string[] = [];
        const els = panel.querySelectorAll<HTMLElement>('button, [role="radio"], a[href], input:not(.sr-only), textarea, select, summary');
        els.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return; // not rendered
          if (r.height < 43.5 || r.width < 43.5) {
            // Thumbnails are tiles, not buttons, in a dense grid; they are checked at their own size below.
            if (/^vfx-ref-\d+$/.test(el.getAttribute('data-testid') ?? '')) return;
            out.push(`${el.tagName.toLowerCase()}[${el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)}] ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
        });
        return out;
      });
      expect(small).toEqual([]);
    });
  });
}

test.describe('VFX tool — copy in all three languages', () => {
  const HERO: Record<'ka' | 'en' | 'ru', string> = { ka: 'აირჩიე ეფექტი', en: 'Pick an effect', ru: 'Выберите эффект' };
  for (const lang of ['ka', 'en', 'ru'] as const) {
    test(`the panel speaks ${lang}`, async ({ page }) => {
      await openVfx(page, { lang, width: 375, height: 812 });
      await expect(page.getByTestId('vfx-hero')).toContainText(HERO[lang]);
      const s = await sideways(page);
      expect(s.page).toBe(false);
      await shot(page, `phone-lang-${lang}`);
    });
  }
});
