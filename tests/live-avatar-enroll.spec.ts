import { expect, test, type Page, type Route } from '@playwright/test';
import { fakeMicrophone, signIn } from './fixtures/liveVoice';

/**
 * The owner's P0 correction task (2026-10-24, phase 2): Live-Avatar enrollment on a phone and a desktop.
 *   · the live camera and the captured photo are told apart, and Save waits for a photo (and says why);
 *   · a capture is 9:16 at the camera's own resolution (a phone camera's 1080×1920 → Google's custom-avatar size);
 *   · Save shows progress, then the saved avatar and its state; a refresh brings the saved avatar back;
 *   · errors are sentences, not codes; Delete removes it.
 * The API is simulated (no storage, no spend); the server side is covered by lib/avatar/*.test.ts and the core route test.
 */

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
const PHOTO_URL = 'https://signed.example.test/twins/live-avatar/photo.jpg?token=SIGNED';

/** A camera that films a 1080×1920 portrait (headless Chromium has none). Audio stays the silent fake microphone. */
async function fakeCamera(page: Page) {
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const audioOnly = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      if (!c?.video) return audioOnly(c);
      const canvas = document.createElement('canvas');
      canvas.width = 1080; canvas.height = 1920;
      const cx = canvas.getContext('2d')!;
      const draw = () => {
        cx.fillStyle = '#3b6ea5'; cx.fillRect(0, 0, 1080, 1920);
        cx.fillStyle = '#f1c27d'; cx.beginPath(); cx.ellipse(540, 700, 260, 340, 0, 0, Math.PI * 2); cx.fill();
      };
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  });
}

type Saved = { id: string; photoUrl: string; state: string; updatedAt: string; prep: { ok: boolean; reasons: string[] } } | null;

async function openEnroll(page: Page, baseURL: string | undefined, opts: { saved?: Saved; enroll?: (route: Route) => Promise<void> } = {}) {
  const server = { saved: opts.saved ?? null, enrollBodies: [] as Array<Record<string, unknown>>, deletes: 0 };
  await fakeMicrophone(page);
  await fakeCamera(page);
  await signIn(page, baseURL);
  await page.route('**/api/voice/live', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"live_unavailable"}' }));
  await page.route(PHOTO_URL, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="9" height="16"><rect width="9" height="16" fill="#456"/></svg>' }));
  await page.route('**/api/avatar/core', async (r) => {
    if (r.request().method() === 'DELETE') {
      server.deletes++; server.saved = null;
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"deleted":true}}' });
    }
    const s = server.saved;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { core_avatar_id: s?.id ?? null, status: s ? 'ready' : 'none', poster_url: s?.photoUrl ?? null, updated_at: s?.updatedAt ?? null, live_avatar: s } }) });
  });
  await page.route('**/api/avatar/enroll', async (r) => {
    server.enrollBodies.push(JSON.parse(r.request().postData() || '{}'));
    if (opts.enroll) return opts.enroll(r);
    server.saved = { id: '67a1b2c3d4e5f607', photoUrl: PHOTO_URL, state: 'custom_unavailable', updatedAt: '2026-10-24T20:00:00.000Z', prep: { ok: true, reasons: [] } };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: PHOTO_URL, avatarAssetId: server.saved.id, avatar: server.saved, voice: 'none' }) });
  });
  await page.goto('/ka/dashboard?tool=chat');
  await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 15_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('myavatar:avatar-enroll')));
  const sheet = page.getByTestId('live-avatar-enroll');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  return { sheet, server };
}

/** The pixel size of a JPEG data URL, read by the browser. */
const imageSize = (page: Page, dataUrl: string) => page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}, dataUrl);

for (const viewport of VIEWPORTS) {
  test.describe(`Live Avatar enrollment ${viewport.width}px`, () => {
    test.use({ viewport });

    test('camera ≠ photo; Save waits for a photo; a 9:16 capture saves with progress and shows its state; a refresh keeps it', async ({ page, baseURL }, info) => {
      const { sheet, server } = await openEnroll(page, baseURL);
      await expect(sheet).toHaveAttribute('data-view', 'capture');
      await expect(sheet.getByTestId('live-avatar-camera')).toContainText('კამერა');
      const save = sheet.getByTestId('live-avatar-save');
      await expect(save).toBeDisabled();
      await expect(sheet.getByTestId('live-avatar-save-hint')).toHaveText('ჯერ გადაიღე ან ატვირთე ფოტო');
      await page.screenshot({ path: info.outputPath(`enroll-camera-${viewport.width}.png`) });

      await sheet.getByRole('button', { name: 'გადაღება' }).click();
      await expect(sheet.getByTestId('live-avatar-photo')).toContainText('შენი ფოტო');
      await expect(save).toBeEnabled();
      await expect(sheet.getByTestId('live-avatar-save-hint')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`enroll-photo-${viewport.width}.png`) });

      await save.click();
      await expect(sheet).toHaveAttribute('data-view', 'saved');
      const body = server.enrollBodies[0]!;
      expect(body.source).toBe('camera');
      expect(String(body.dataUrl)).toMatch(/^data:image\/jpeg;base64,/);
      expect(await imageSize(page, String(body.dataUrl))).toEqual({ width: 1080, height: 1920 });
      await expect(sheet.getByTestId('live-avatar-saved')).toHaveAttribute('data-state', 'custom_unavailable');
      await expect(sheet.getByTestId('live-avatar-state')).toHaveText('პერსონალური Live ავატარი ჯერ მიუწვდომელია');
      await page.screenshot({ path: info.outputPath(`enroll-saved-${viewport.width}.png`) });

      // Refresh: the saved avatar comes back from the server, not the camera.
      await page.reload();
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 15_000 });
      await page.evaluate(() => window.dispatchEvent(new Event('myavatar:avatar-enroll')));
      await expect(page.getByTestId('live-avatar-enroll')).toHaveAttribute('data-view', 'saved', { timeout: 30_000 });
      await expect(page.getByTestId('live-avatar-saved').locator('img')).toHaveAttribute('src', PHOTO_URL);
    });

    test('a refused photo reads as a sentence; Delete removes the saved avatar', async ({ page, baseURL }, info) => {
      const { sheet, server } = await openEnroll(page, baseURL, {
        enroll: (r) => r.fulfill({ status: 415, contentType: 'application/json', body: '{"error":"content_mismatch"}' }),
      });
      await sheet.getByRole('button', { name: 'გადაღება' }).click();
      await sheet.getByTestId('live-avatar-save').click();
      await expect(sheet.getByTestId('live-avatar-error')).toHaveText('ფაილი სურათს არ ჰგავს.');
      await expect(sheet).toHaveAttribute('data-view', 'capture');
      await page.screenshot({ path: info.outputPath(`enroll-error-${viewport.width}.png`) });

      server.saved = { id: '67a1b2c3d4e5f607', photoUrl: PHOTO_URL, state: 'saved_photo', updatedAt: '2026-10-24T20:00:00.000Z', prep: { ok: false, reasons: ['too_small'] } };
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-authed', '1', { timeout: 30_000 });
      await page.evaluate(() => window.dispatchEvent(new Event('myavatar:avatar-enroll')));
      const again = page.getByTestId('live-avatar-enroll');
      await expect(again).toHaveAttribute('data-view', 'saved', { timeout: 30_000 });
      await expect(again.getByTestId('live-avatar-state')).toHaveText('შენახული ფოტო');
      await expect(again).toContainText('მინიმუმ 720×1280');
      page.once('dialog', (d) => void d.accept());
      await again.getByRole('button', { name: 'წაშლა' }).click();
      await expect(again).toHaveAttribute('data-view', 'capture');
      await expect(again.getByRole('status')).toHaveText('ავატარი წაიშალა');
      expect(server.deletes).toBe(1);
    });
  });
}
