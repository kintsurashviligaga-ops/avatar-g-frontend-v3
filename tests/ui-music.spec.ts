import { expect, test, type Page } from '@playwright/test';

/**
 * The Music tool's Create screen (ref2) at a phone and a desktop width, as a guest (the layout needs no account; sign-in is
 * asked for on Create): the elements in ref2's order, the exact price ON the Create pill, no sideways scroll at 375 px, 44 px
 * targets, and on a desktop the Result pane + the Engines & prices list beside the panel. The engines status is stubbed so the
 * "+ Audio / + Voice" halves and the engine rows are deterministic whatever keys the dev server was started with.
 */
const STATUS = {
  engines: {
    lyria: { configured: true, busy: false, controls: 'prompt' },
    udio: { configured: false, busy: false, controls: 'prompt' },
    'elevenlabs-music': { configured: true, busy: false, controls: 'prompt' },
    musicgen: { configured: true, busy: false, controls: 'native' },
  },
  references: { cover: true, voice: true },
  chain: ['lyria', 'elevenlabs-music', 'musicgen'],
};

async function open(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.route('**/api/ai/music/engines', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
  await page.goto('/en/dashboard?tool=music', { waitUntil: 'load' });
}

/** The page scrolls in <body>, not the document — check both for a sideways scroll. */
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(0);
}

const ORDER = ['music-title', 'music-refs', 'music-lyrics', 'music-styles-card', 'music-more', 'music-tiles', 'music-create'] as const;

async function expectOrder(page: Page) {
  for (const id of ORDER) await expect(page.getByTestId(id)).toBeAttached();
  // DOM order, not geometry: the Create pill is sticky (pinned to the bottom of the scroller), so its box is not where it sits in the flow.
  const follows = await page.evaluate((ids) => ids.every((id, i) => {
    if (i === 0) return true;
    const prev = document.querySelector(`[data-testid="${ids[i - 1]}"]`)!;
    const el = document.querySelector(`[data-testid="${id}"]`)!;
    return !!(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), [...ORDER]);
  expect(follows).toBe(true);
}

test.describe('music create · phone 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the sheet opens on the Create screen: ref2\'s elements in order, the price on the pill, nothing sideways', async ({ page }) => {
    await open(page);
    const sheet = page.getByTestId('options-sheet');
    await expect(sheet).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('music-panel')).toBeVisible();
    await expectOrder(page);

    // Title row: the mode switch (Advanced) and the engine pill ("Auto"), the Lyrics and Styles fields with their placeholders.
    await expect(page.getByTestId('music-mode-toggle')).toContainText('Advanced');
    await expect(page.getByTestId('music-engine-pill')).toContainText('Auto');
    await expect(page.getByTestId('music-add-audio')).toContainText('Audio');
    await expect(page.getByTestId('music-add-voice')).toContainText('Voice');
    await expect(page.getByTestId('music-styles-input')).toHaveAttribute('placeholder', 'Describe what you want your song to sound like');

    // The exact price is ON the Create pill: 30 s → 5 credits.
    const create = page.getByTestId('music-create');
    await expect(create).toHaveAttribute('data-price', '5');
    await expect(create).toContainText('Create');
    await expect(create).toContainText('5');

    // A longer length changes the number on the pill, to the shared quote (60 s → 8, 90 s → 12).
    await page.getByTestId('music-tile-length').click();
    await page.getByRole('option', { name: /60 s/ }).click();
    await expect(create).toHaveAttribute('data-price', '8');
    await page.getByTestId('music-tile-length').click();
    await page.getByRole('option', { name: /90 s/ }).click();
    await expect(create).toHaveAttribute('data-price', '12');

    // 44 px targets on the round buttons, the pill and Create.
    for (const id of ['music-lyrics-wand', 'music-lyrics-library', 'music-instrumental', 'music-lyrics-expand', 'music-engine-pill', 'music-mode-simple', 'music-mode-advanced', 'music-create']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height, id).toBeGreaterThanOrEqual(43.5);
      expect(box.width, id).toBeGreaterThanOrEqual(43.5);
    }
    await noHorizontalScroll(page);
  });

  test('no dead camera button; Simple is one card; the engine pill lists only what the server can run', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('options-sheet')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('music-camera')).toHaveCount(0);

    await page.getByTestId('music-engine-pill').click();
    await expect(page.getByTestId('engine-auto')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('engine-udio')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('engine-musicgen')).toHaveAttribute('data-blocked', 'instrumental-only');
    await noHorizontalScroll(page);
    await page.keyboard.press('Escape'); // closes the list only — the sheet stays
    await expect(page.getByTestId('music-engine-menu')).toHaveCount(0);
    await expect(page.getByTestId('options-sheet')).toBeVisible();

    await page.getByTestId('music-mode-simple').click();
    await expect(page.getByTestId('music-simple')).toBeVisible();
    await expect(page.getByTestId('music-lyrics')).toHaveCount(0);
    await expect(page.getByTestId('music-create')).toHaveAttribute('data-price', '5');
    await noHorizontalScroll(page);
  });

  test('the same screen in Georgian (the longest strings) does not push the page sideways', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); localStorage.setItem('myavatar:tour-seen', '1'); } catch { /* */ } });
    await page.route('**/api/ai/music/engines', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
    await page.goto('/ka/dashboard?tool=music', { waitUntil: 'load' });
    await expect(page.getByTestId('music-panel')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('music-create')).toContainText('შექმნა');
    await noHorizontalScroll(page);
  });
});

test.describe('music create · desktop 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the panel is the right column; the centre leads with the Result pane and the Engines & prices list', async ({ page }) => {
    await open(page);
    const settings = page.getByTestId('settings-panel');
    await expect(settings.getByTestId('music-panel')).toBeVisible({ timeout: 45_000 });
    await expectOrder(page);

    const pane = page.getByTestId('music-pane');
    await expect(pane).toBeVisible();
    await expect(page.getByTestId('music-result-empty')).toBeVisible(); // no track yet
    const engines = page.getByTestId('music-engines-pane');
    await expect(engines).toContainText('Engines & prices');
    await expect(engines.getByTestId('engine-auto')).toHaveAttribute('aria-checked', 'true');
    await expect(engines.getByTestId('engine-udio')).toHaveAttribute('aria-disabled', 'true');
    // Prices per length are the shared quote: 5 · 8 · 12 on the Auto row.
    await expect(engines.getByTestId('engine-auto')).toContainText('5');
    await expect(engines.getByTestId('engine-auto')).toContainText('12');

    // The pane sits in the centre column, left of the settings column.
    const paneBox = (await pane.boundingBox())!;
    const panelBox = (await settings.boundingBox())!;
    expect(paneBox.x + paneBox.width).toBeLessThanOrEqual(panelBox.x + 1);
    await expect(page.getByTestId('music-create')).toHaveAttribute('data-price', '5');
    await noHorizontalScroll(page);
  });
});
