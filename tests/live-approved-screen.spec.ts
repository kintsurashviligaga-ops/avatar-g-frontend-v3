import { expect, test, type Page } from '@playwright/test';
import { fakeMicrophone, signIn } from './fixtures/liveVoice';

/**
 * The owner's P0 correction task (2026-10-24): the old rocket background is gone from the Live chat in every state,
 * and the call wears the owner's approved Gemini Live design (2026-10-20): true black, one blue glow rising from the
 * bottom, the words at the top left, one row at the bottom with the glowing blue voice pill.
 *
 * Under MASTER TASK v3.1 nobody mints a Gemini Live token (lib/voice/liveMint.ts), so /api/voice/live answers 503 and
 * every user lands on the turn-by-turn call (VoiceConversation). This spec opens the Live chat exactly that way, on a
 * phone and a desktop, and keeps a screenshot of each state for the before/after report.
 */

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];

async function openLiveChat(page: Page, baseURL: string | undefined, options: { micDenied?: boolean } = {}) {
  await fakeMicrophone(page);
  if (options.micDenied) await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (md) md.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  });
  await signIn(page, baseURL);
  // Production today: no Live transport, the mint refuses before any provider I/O.
  await page.route('**/api/voice/live', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"live_unavailable"}' }));
  await page.route('**/api/avatar/core', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 15_000 });
  await page.getByRole('button', { name: 'ცოცხალი ხმა' }).first().click();
  // A refused microphone stops the Gemini Live screen before its mint; a working one falls back to the voice call.
  const dialog = page.locator(options.micDenied ? '[role="dialog"][data-live-call-ui]' : '[role="dialog"][data-voice-status]');
  await expect(dialog).toBeVisible({ timeout: 45_000 });
  return dialog;
}

async function expectNoRocket(page: Page) {
  // No rocket raster, no rocket in any background, anywhere on the call screen.
  const call = page.locator('[role="dialog"][data-voice-status], [role="dialog"][data-live-call-ui]').first();
  await expect(call.locator('img')).toHaveCount(0);
  const html = await call.evaluate((el) => {
    const bgs = Array.from(el.querySelectorAll('*')).map((n) => getComputedStyle(n).backgroundImage + getComputedStyle(n, '::before').backgroundImage + getComputedStyle(n, '::after').backgroundImage);
    return el.outerHTML + bgs.join(' ');
  });
  expect(html).not.toMatch(/rocket/i);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Live chat, approved screen ${viewport.width}px`, () => {
    test.use({ viewport });

    test('listening: black, the glow from below, the voice pill, Mute and End; no rocket', async ({ page, baseURL }, info) => {
      const dialog = await openLiveChat(page, baseURL);
      await expect(dialog).toHaveAttribute('data-voice-status', 'listening', { timeout: 20_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: info.outputPath(`live-listening-${viewport.width}.png`) });
      await expectNoRocket(page);
      await expect(dialog.getByTestId('live-ambient')).toBeAttached();
      await expect(dialog.getByTestId('live-voice-pill')).toBeVisible();
      const bg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).toBe('rgb(0, 0, 0)');
      for (const name of ['მიკროფონის დადუმება', 'ზარის დასრულება']) {
        const box = await dialog.getByRole('button', { name, exact: true }).boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      }
      // A reload brings back the same screen, never the rocket.
      await page.reload();
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: 'ცოცხალი ხმა' }).first().click();
      await expect(page.locator('[role="dialog"][data-voice-status]')).toBeVisible({ timeout: 45_000 });
      await expectNoRocket(page);
    });

    test('microphone refused: the error screen keeps the approved background; no rocket', async ({ page, baseURL }, info) => {
      const dialog = await openLiveChat(page, baseURL, { micDenied: true });
      await expect(dialog.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: info.outputPath(`live-error-${viewport.width}.png`) });
      await expectNoRocket(page);
      await expect(dialog.getByTestId('live-ambient')).toBeAttached();
    });
  });
}
