import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Montage — the CapCut-style editor (components/studio/montage), at a phone and a desktop width:
 *  · `?tool=montage` opens it full screen (the shell's header steps aside) on the new-project screen;
 *  · added photos become clips on the timeline; a clip selects into its tools; text goes on a clip;
 *  · Export sends the montage route's contract and the finished video is posted into the chat.
 * Storage and the render are stubbed at the network edge (the dev server runs on a dummy Supabase): the encode itself is
 * covered by lib/services/montage tests and the ffmpeg checks in lib/pipeline/compositing.
 * Set SHOTS_DIR to also write screenshots there.
 */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

// A 1×1 PNG: photos need no decoding to land on the timeline.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  let n = 0;
  await page.route('**/api/upload/sign', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bucket: 'uploads', path: `u/e2e-${++n}`, token: 't' }) }));
  await page.route(/supabase\.co\/storage\/v1\/object\/upload\/sign/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"uploads/u/e2e"}' }));
  await page.route('**/api/orchestrator/jobs*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"jobs":[]}' }));
}

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

for (const vp of VIEWPORTS) {
  test.describe(`montage · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('opens full screen on a new project, edits on the timeline, exports into the chat', async ({ page }) => {
      await prepare(page);
      let body: Record<string, unknown> | null = null;
      await page.route('**/api/v2/montage/render', async (r) => {
        body = r.request().postDataJSON() as Record<string, unknown>;
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobId: 'j', videoUrl: 'https://example.com/montage.mp4', warnings: {} }) });
      });

      await page.goto('/en/dashboard?tool=montage', { waitUntil: 'load' });
      const studio = page.getByTestId('montage-studio');
      await expect(studio).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('montage-start')).toBeVisible();
      // Full screen: the shell's header is out of the way, the editor's own bar has the ✕.
      await expect(page.locator('[data-chrome-header]')).toBeHidden();
      await expect(page.getByTestId('montage-close')).toBeVisible();
      // Nothing to export yet — no button that can only fail.
      await expect(page.getByTestId('montage-export-btn')).toHaveCount(0);
      await page.locator('[data-testid="montage-aspect"] [data-value="16:9"]').click();
      await shot(page, `montage-${vp.name}-start`);

      await page.getByTestId('montage-file-input').setInputFiles([
        { name: 'one.png', mimeType: 'image/png', buffer: PNG },
        { name: 'two.png', mimeType: 'image/png', buffer: PNG },
      ]);
      await expect(page.getByTestId('montage-clip')).toHaveCount(2);
      await expect(page.getByTestId('montage-format-chip')).toHaveText(/16:9/);
      await expect(page.getByTestId('montage-export-btn')).toBeEnabled({ timeout: 15_000 });

      // The clip under the playhead → its tools; text on it.
      await page.getByTestId('montage-clip').first().click();
      await expect(page.getByTestId('montage-clip').first()).toHaveAttribute('data-selected', 'true');
      await page.getByTestId('montage-tool-text').click();
      await page.getByTestId('montage-text-input').fill('Summer in Tbilisi');
      await page.getByTestId('montage-panel-done').click();
      await expect(page.getByTestId('montage-text-chip')).toHaveText(/Summer in Tbilisi/);
      // A transition on the cut.
      await page.getByTestId('montage-clip').first().click(); // deselect
      await page.getByTestId('montage-transition').first().click();
      await page.locator('[data-testid="montage-transition-choice"] [data-value="crossfade"]').click();
      await page.getByTestId('montage-panel-done').click();
      await expect(page.getByTestId('montage-transition').first()).toHaveAttribute('data-transition', 'crossfade');
      await shot(page, `montage-${vp.name}-editor`);

      // Nothing on the page may push it sideways.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      await page.getByTestId('montage-export-btn').click();
      await expect(page.locator('[data-testid="montage-export"][data-phase="done"]')).toBeVisible({ timeout: 15_000 });
      expect(body).toMatchObject({
        aspect: '16:9',
        shots: [
          { url: 'u/e2e-1', kind: 'image', caption: 'Summer in Tbilisi', transition: 'cut' },
          { url: 'u/e2e-2', kind: 'image', transition: 'crossfade' },
        ],
      });
      await shot(page, `montage-${vp.name}-done`);

      // Back in the chat, the montage is there as a message — closing the editor did not lose it.
      await page.getByRole('button', { name: 'Back to the chat' }).click();
      await expect(page.getByTestId('montage-studio')).toHaveCount(0);
      await expect(page.locator('video[src^="https://example.com/montage.mp4"]').first()).toBeAttached({ timeout: 15_000 });
    });

    test('a montage request in the chat opens the same editor', async ({ page }) => {
      await prepare(page);
      await page.goto('/ka/dashboard', { waitUntil: 'load' });
      const box = page.getByTestId('composer-input');
      await expect(box).toBeVisible({ timeout: 60_000 });
      // The dummy-Supabase dev server has no session, and a guest's request stops at sign-in. Pin "signed in" after mount.
      await page.evaluate(() => {
        const el = document.documentElement;
        const pin = () => { if (el.dataset.authed !== '1') el.dataset.authed = '1'; };
        pin();
        new MutationObserver(pin).observe(el, { attributes: true, attributeFilter: ['data-authed'] });
      });
      await box.fill('გამიკეთე მონტაჟი ამ კადრებისგან');
      await box.press('Enter');
      await expect(page.getByTestId('montage-studio')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('montage-start')).toBeVisible();
      // ✕ goes back to the conversation, where the request and the editor's answer were kept.
      await page.getByTestId('montage-close').click();
      await expect(page.getByTestId('montage-studio')).toHaveCount(0);
      await expect(page.getByText('გავხსენი')).toBeVisible();
    });
  });
}
