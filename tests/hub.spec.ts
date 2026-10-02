import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * The Connectors · Plugins · Skills hub in a real browser, against MOCKED /api/plugins, /api/agent-g/channels,
 * /api/research* and /api/connectors*.
 *
 * What only a browser can show: the sidebar row opens ONE sheet (a bottom sheet on a phone, a floating panel on a desktop)
 * whose tabs switch; a switch in Plugins flips at once, PUTs the whole list, and the tool really leaves the sidebar and the
 * composer's „+" sheet (and comes back); the Telegram line has nothing to press; the table-missing and guest states are
 * plain lines, never errors; and nothing pushes the page sideways at 390 px.
 *
 * No Supabase session here, so — like tests/chat-research.spec.ts — the studio's publish-once flags on <html> (`data-authed`,
 * `data-uid`) are pinned after mount; HubHost reads them and asks GET /api/plugins for that account.
 * Set SHOTS_DIR to also write screenshots (phone 390×844, desktop 1280×800).
 */

const UID = '5b7e1c2d-3f4a-4b5c-8d6e-7f8091a2b3c4';
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

interface Mock {
  available: boolean;
  disabled: string[];
  getCalls: number;
  putBodies: Array<{ disabledTools: string[] }>;
  tgReady: boolean;
}

async function mockApi(page: Page, init: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = { available: true, disabled: [], getCalls: 0, putBodies: [], tgReady: true, ...init };
  await page.route('**/api/chat/title', (r) => r.fulfill(json({ title: 'x' })));
  await page.route(/\/api\/plugins(\?.*)?$/, async (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON() as { disabledTools: string[] };
      m.putBodies.push(body);
      if (!m.available) return r.fulfill(json({ available: false, error: 'unavailable' }, 503));
      m.disabled = body.disabledTools;
      return r.fulfill(json({ available: true, disabledTools: m.disabled }));
    }
    m.getCalls++;
    return r.fulfill(json(m.available ? { available: true, disabledTools: m.disabled } : { available: false }));
  });
  await page.route(/\/api\/agent-g\/channels/, (r) => r.fulfill(json({
    status: 'success',
    data: {
      guest: false,
      channels: [],
      runtime_status: [
        { type: 'web', connected: true, ready: true, note: 'Primary channel' },
        { type: 'telegram', connected: true, ready: m.tgReady, note: 'Webhook ready' },
        { type: 'whatsapp', connected: false, ready: false, note: 'Not connected' },
      ],
    },
  })));
  await page.route(/\/api\/research\/capabilities/, (r) => r.fulfill(json({ available: true, credits: 120, filesAvailable: true, maxActive: 1 })));
  await page.route(/\/api\/research(\?[^/]*)?$/, (r) => r.fulfill(json({ items: [], serverNow: new Date().toISOString(), available: true })));
  await page.route(/\/api\/connectors(\?.*)?$/, (r) => r.fulfill(json({
    connectors: [
      { id: 'local_files', label: 'Local files', status: 'ready', fileCount: 0 },
      { id: 'google_drive', label: 'Google Drive', status: 'soon' },
      { id: 'onedrive', label: 'OneDrive', status: 'soon' },
      { id: 'notion', label: 'Notion', status: 'soon' },
      { id: 'dropbox', label: 'Dropbox', status: 'soon' },
    ],
    limits: { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 },
  })));
  await page.route(/\/api\/connectors\/files/, (r) => r.fulfill(json({ files: [], limits: { maxFiles: 10, maxFileChars: 30000, maxAttach: 5, maxContextChars: 40000 } })));
  return m;
}

async function openChat(page: Page, locale = 'en'): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.goto(`/${locale}/dashboard?tool=chat`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible({ timeout: 20_000 });
}

/** Signed in, as far as the page can tell: pinned AFTER mount, because ChatChrome publishes '0' from an effect. */
async function pinSignedIn(page: Page): Promise<void> {
  await page.evaluate((uid) => {
    const el = document.documentElement;
    const pin = () => {
      if (el.dataset.authed !== '1') el.dataset.authed = '1';
      if (el.dataset.uid !== uid) el.dataset.uid = uid;
    };
    pin();
    new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed', 'data-uid'] });
  }, UID);
}

/**
 * The sidebar row: on a phone it lives in the ☰ drawer (translated off-canvas while closed — "visible" to a locator, so the
 * ☰ button decides, not the row); on a desktop the sidebar is always there and ☰ is not drawn.
 */
async function openHub(page: Page): Promise<void> {
  const menu = page.getByRole('button', { name: 'Menu' }).first();
  if (await menu.isVisible()) await menu.click();
  await page.getByTestId('sidebar-hub').click();
  // The sheet is a lazy chunk: the first open under a cold `next dev` compiles it (seconds), later opens are instant.
  await expect(page.getByTestId('hub-sheet')).toBeVisible({ timeout: 30_000 });
}

/** The „+" sheet's tool rows, by their visible title (a row's accessible name is its title and its one line). */
async function plusHasTool(page: Page, title: string): Promise<boolean> {
  await page.getByTestId('plus').click();
  const sheet = page.getByTestId('tool-sheet');
  await expect(sheet).toBeVisible();
  const n = await sheet.getByRole('button', { name: new RegExp(`^${title}\\b`) }).count();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  return n > 0;
}

/** The sidebar's „Services" rows (on a phone the drawer is opened first, and closed after). */
async function sidebarHasTool(page: Page, title: string): Promise<boolean> {
  const menu = page.getByRole('button', { name: 'Menu' }).first();
  const phone = await menu.isVisible();
  if (phone) await menu.click();
  const aside = page.locator('aside').first();
  await expect(aside.getByTestId('sidebar-hub')).toBeVisible();
  const n = await aside.getByRole('button', { name: title, exact: true }).count();
  if (phone) await page.keyboard.press('Escape');
  return n > 0;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600); // let the sheet-rise / fade animations settle
  await page.screenshot({ path: `${dir}/${name}.png` });
}

for (const vp of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }] as const) {
  test.describe(`hub · ${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('open the hub → switch tabs → switch a plugin off: the tool leaves the sidebar and the „+" sheet, and comes back', async ({ page }) => {
      const m = await mockApi(page);
      await openChat(page);
      await pinSignedIn(page);
      await expect.poll(() => m.getCalls).toBeGreaterThan(0);
      expect(await plusHasTool(page, 'Music')).toBe(true);
      expect(await sidebarHasTool(page, 'Music')).toBe(true);

      // Open: Connectors first — the documents, the two cards' places, and Telegram with nothing to press.
      await openHub(page);
      const sheet = page.getByTestId('hub-sheet');
      await expect(sheet.getByRole('tab')).toHaveText(['Connectors', 'Plugins', 'Skills']);
      await expect(page.getByTestId('hub-tab-connectors')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('connector-local')).toBeVisible();
      await expect(page.getByTestId('connector-soon')).toHaveCount(4);
      await expect(page.getByTestId('hub-telegram')).toHaveAttribute('data-state', 'bot');
      await expect(page.getByTestId('hub-telegram').locator('button, a, [role="button"]')).toHaveCount(0);
      await expect(sheet).not.toContainText(/\bconnected\b/i);
      await noHorizontalScroll(page);
      if (vp.name === 'phone') {
        // A phone's sheet spans the screen; a desktop's floats as a panel.
        expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(vp.width);
      } else {
        expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(440);
      }
      await shot(page, `hub-${vp.name}-1-connectors`);
      await page.getByTestId('hub-telegram').scrollIntoViewIfNeeded();
      await shot(page, `hub-${vp.name}-1b-channels`);

      // Skills: read-only, states from the mocked signals.
      await page.getByTestId('hub-tab-skills').click();
      await expect(page.getByTestId('hub-panel-skills')).toBeVisible();
      await expect(page.getByTestId('skill-research')).toHaveAttribute('data-state', 'available');
      await expect(page.getByTestId('skill-telegram')).toHaveAttribute('data-state', 'soon');
      await expect(page.getByTestId('skills-tab').locator('button, a, [role="switch"]')).toHaveCount(0);
      await shot(page, `hub-${vp.name}-2-skills`);

      // Plugins (keyboard: ← from Skills).
      await page.getByTestId('hub-tab-skills').press('ArrowLeft');
      await expect(page.getByTestId('hub-tab-plugins')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('hub-tab-plugins')).toBeFocused();
      const music = page.getByTestId('plugin-switch-music');
      await expect(music).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('plugin-row-chat')).toContainText('Always on');
      const box = await music.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await music.click();
      await expect(music).toHaveAttribute('aria-checked', 'false');
      await expect.poll(() => m.putBodies.length).toBe(1);
      expect(m.putBodies[0]).toEqual({ disabledTools: ['music'] });
      await expect(page.getByTestId('plugins-save-status')).toHaveText('Saved');
      await noHorizontalScroll(page);
      await shot(page, `hub-${vp.name}-3-plugins`);

      // Skills notes it (still a skill — only hidden from the menus).
      await page.getByTestId('hub-tab-skills').click();
      await expect(page.getByTestId('skill-music')).toContainText('Hidden from your menus');

      // Close: Music has left the sidebar and the „+" sheet.
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      expect(await plusHasTool(page, 'Music')).toBe(false);
      expect(await plusHasTool(page, 'Video')).toBe(true);
      expect(await sidebarHasTool(page, 'Music')).toBe(false);

      // …and back on.
      await openHub(page);
      await page.getByTestId('hub-tab-plugins').click();
      await page.getByTestId('plugin-switch-music').click();
      await expect.poll(() => m.putBodies.length).toBe(2);
      expect(m.putBodies[1]).toEqual({ disabledTools: [] });
      await page.keyboard.press('Escape');
      expect(await plusHasTool(page, 'Music')).toBe(true);
      expect(await sidebarHasTool(page, 'Music')).toBe(true);
    });

    test('the table is not migrated: switches disabled and one „opening soon" line; a guest gets a sign-in prompt', async ({ page }) => {
      const m = await mockApi(page, { available: false });
      await openChat(page);

      // Guest first: the row is there for everyone; the Plugins tab asks to sign in and asks the server nothing.
      await openHub(page);
      await page.getByTestId('hub-tab-plugins').click();
      await expect(page.getByTestId('plugins-signin')).toBeVisible();
      await expect(page.getByTestId('plugin-switch-music')).toBeDisabled();
      expect(m.getCalls).toBe(0);
      await shot(page, `hub-${vp.name}-4-guest`);
      await page.keyboard.press('Escape');

      // Signed in, table missing.
      await pinSignedIn(page);
      await expect.poll(() => m.getCalls).toBeGreaterThan(0);
      await openHub(page);
      await page.getByTestId('hub-tab-plugins').click();
      await expect(page.getByTestId('plugins-soon')).toHaveText('Choosing your tools opens soon.');
      await expect(page.getByTestId('hub-sheet').getByRole('alert')).toHaveCount(0);
      await expect(page.getByTestId('plugin-switch-music')).toBeDisabled();
      expect(m.putBodies).toHaveLength(0);
      await page.keyboard.press('Escape');
      expect(await plusHasTool(page, 'Music')).toBe(true);
    });
  });
}
