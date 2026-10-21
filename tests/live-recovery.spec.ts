import { expect, test } from '@playwright/test';
import { FakeLive, openLiveCall } from './fixtures/liveVoice';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test.describe(`Live recovery ${viewport.width}px`, () => {
    test.use({ viewport });
    test('the simulated call exposes its status, real caption and keyboard exit without spending', async ({ page, baseURL }, info) => {
      const live = new FakeLive();
      // The fixture replaces microphone capture with a silent synthetic stream and intercepts Google/Supabase.
      const spend = await openLiveCall(page, baseURL, live);
      await expect(page.getByRole('dialog', { name: 'ცოცხალი საუბარი' })).toBeVisible();
      await expect(page.getByTestId('live-status')).toHaveText('გისმენ');
      await expect(page.getByText('გამარჯობა! რით შემიძლია დაგეხმაროთ?')).toHaveCount(0);
      live.say('This caption came from the simulated server.');
      await expect(page.getByText('This caption came from the simulated server.', { exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath('live-current-screen.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'ცოცხალი საუბარი' })).toHaveCount(0);
      expect(spend).toEqual([]);
    });
  });
}
