import { expect, test } from '@playwright/test';
import { FakeLive, openLiveCall } from './fixtures/liveVoice';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test.describe(`Live recovery ${viewport.width}px`, () => {
    test.use({ viewport });
    test('in-app mic failure keeps a clean manual Live link when both clipboard paths refuse', async ({ page, baseURL }, info) => {
      const live = new FakeLive();
      const mintRequests: string[] = [];
      page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/voice/live') mintRequests.push(request.method()); });
      const spend = await openLiveCall(page, baseURL, live, { micInApp: true });
      const dialog = page.getByRole('dialog', { name: 'ცოცხალი საუბარი' });
      const link = dialog.getByRole('textbox', { name: 'ცოცხალი საუბრის ბმული' });
      await expect(link).toHaveValue(`${baseURL}/ka/dashboard?voice=1`);
      await expect(link).toHaveAttribute('readonly', '');
      const mintedBeforeCopy = [...mintRequests]; // Initial warm/start mints are intercepted; Copy must not retry the call.
      await dialog.getByRole('button', { name: 'ბმულის კოპირება', exact: true }).click();
      await expect(dialog.getByRole('status')).toHaveText('კოპირება ვერ მოხერხდა');
      await expect(link).toHaveValue(`${baseURL}/ka/dashboard?voice=1`);
      expect(mintRequests).toEqual(mintedBeforeCopy);
      expect(live.sent).toEqual([]);
      expect(spend).toEqual([]);
      for (const control of [link, dialog.getByRole('button', { name: 'ბმულის კოპირება', exact: true }), dialog.getByRole('button', { name: 'თავიდან ცდა', exact: true }), dialog.getByRole('button', { name: 'ზარის დასრულება', exact: true })]) {
        const bounds = await control.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      }
      await page.screenshot({ path: info.outputPath('live-mic-recovery.png') });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });

    test('the simulated call exposes its status, real caption and keyboard exit without spending', async ({ page, baseURL }, info) => {
      const live = new FakeLive();
      // The fixture replaces microphone capture with a silent synthetic stream and intercepts Google/Supabase.
      const spend = await openLiveCall(page, baseURL, live);
      const dialog = page.getByRole('dialog', { name: 'ცოცხალი საუბარი' });
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('live-status')).toHaveText('გისმენ');
      const mute = dialog.getByRole('button', { name: 'მიკროფონის დადუმება', exact: true });
      await expect(mute).toHaveAttribute('aria-pressed', 'false');
      await mute.click();
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
      await expect(dialog.getByTestId('live-waveform').locator('[data-state]')).toHaveAttribute('data-state', 'idle');
      await mute.click();
      await expect(dialog.getByTestId('live-waveform').locator('[data-state]')).toHaveAttribute('data-state', 'listening');
      // Keyboard docking keeps the same call alive; only End/Escape end it.
      await dialog.getByRole('button', { name: 'ეკრანის ნახვა', exact: true }).press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('live-dock')).toBeVisible();
      await page.getByTestId('live-dock-expand').click();
      await expect(dialog).toBeVisible();

      await expect(page.getByText('გამარჯობა! რით შემიძლია დაგეხმაროთ?')).toHaveCount(0);
      live.say('This caption came from the simulated server.');
      await expect(page.getByText('This caption came from the simulated server.', { exact: true })).toBeVisible();
      live.hear('This is the user transcript.');
      await expect(dialog.getByText('This is the user transcript.', { exact: true })).toBeVisible();
      const captions = page.getByRole('button', { name: 'სუბტიტრები', exact: true });
      await captions.click();
      await expect(dialog.getByText('This is the user transcript.', { exact: true })).toHaveCount(0);
      const linked = await live.call('open_url', { url: 'https://example.com', title: 'A prepared link' });
      expect(linked.ok).toBe(true);
      await expect(dialog.getByText('A prepared link', { exact: true })).toBeVisible();
      await captions.click();
      await expect(dialog.getByText('This is the user transcript.', { exact: true })).toBeVisible();
      // The dock retains the prepared link; neither opening a tool nor hiding the chip spends or opens that URL.
      expect((await live.call('open_studio', { tool: 'music' })).ok).toBe(true);
      await expect(page.getByTestId('live-dock-link')).toContainText('A prepared link');
      await page.getByTestId('live-dock-link').getByRole('button', { name: 'ბმულის დამალვა', exact: true }).click();
      await expect(page.getByTestId('live-dock-link')).toHaveCount(0);
      await page.getByTestId('live-dock-expand').click();
      await expect(dialog.getByText('A prepared link', { exact: true })).toBeVisible();
      const copyBounds = await dialog.getByRole('button', { name: 'ტექსტის კოპირება', exact: true }).boundingBox();
      expect(copyBounds!.width).toBeGreaterThanOrEqual(44);
      expect(copyBounds!.height).toBeGreaterThanOrEqual(44);
      const action = await dialog.getByTestId('live-action-card').first().boundingBox();
      expect(action).not.toBeNull();
      expect(action!.x).toBeGreaterThanOrEqual(0);
      expect(action!.x + action!.width).toBeLessThanOrEqual(viewport.width + 1);
      const controls = await page.getByTestId('live-controls').boundingBox();
      expect(controls).not.toBeNull();
      expect(controls!.x + controls!.width).toBeLessThanOrEqual(viewport.width + 1);
      for (const name of ['კამერა', 'მიკროფონის დადუმება', 'ზარის დასრულება']) {
        const bounds = await dialog.getByRole('button', { name, exact: true }).boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      await expect(dialog.getByTestId('live-content').locator('.animate-fade-in')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: info.outputPath('live-current-screen.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'ცოცხალი საუბარი' })).toHaveCount(0);
      expect(spend).toEqual([]);
    });
  });
}
