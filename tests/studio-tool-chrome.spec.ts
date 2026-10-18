import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Two rules of the owner's PRD of 2026-10-18 (2.4), in a real browser against `next dev` (nothing is sent or generated):
 *
 *   · once a service is open in the chat box, ONE plain ✕ returns to the conversation;
 *   · the product ad's three reference photos all arrive: three picked at once fill the three shots, a fourth is
 *     refused with a word, never dropped silently, and a removed shot frees its place for the next pick.
 */

const PHOTO = readFileSync(join(__dirname, 'fixtures', 'photo.png'));
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PHOTO });

async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
      localStorage.setItem('myavatar:welcomed', '1');
    } catch { /* storage blocked */ }
  });
  await page.goto(path);
  await expect(page.getByTestId('composer-input')).toBeAttached({ timeout: 45_000 });
}

test.describe.configure({ timeout: 120_000 }); // a cold `next dev` studio
test.use({ viewport: { width: 1280, height: 800 } });

test('✕ beside the service name goes back to the chat in one tap', async ({ page }) => {
  await open(page, '/ka/dashboard?tool=product');
  await expect(page.locator('#studio-settings').getByRole('heading', { name: /პროდუქტის რეკლამა/ })).toBeVisible();
  const back = page.getByTestId('tool-back-to-chat');
  await expect(back).toHaveAccessibleName('ჩატში დაბრუნება');
  await back.click();
  // The chat: its model switcher is back, the service's panel and the ✕ are gone, the box takes a message.
  await expect(page.getByTestId('model-switcher').filter({ visible: true })).toBeVisible();
  await expect(page.locator('#studio-settings')).toBeHidden();
  await expect(back).toHaveCount(0);
  await expect(page.getByTestId('composer-input')).toBeVisible();
});

test('the product ad takes three photos picked at once; a fourth is refused with a word; a removed one frees its place', async ({ page }) => {
  await open(page, '/ka/dashboard?tool=product');
  const panel = page.locator('#studio-settings');
  await panel.locator('input[type=file][multiple]').first().setInputFiles([png('a.png'), png('b.png'), png('c.png')]);
  await expect(panel.getByText('კადრები 3/3 — მეტი რაკურსი')).toBeVisible();
  for (const alt of ['shot 1', 'shot 2', 'shot 3']) await expect(panel.getByRole('img', { name: alt, exact: true })).toBeVisible();
  // Full: the „+" tile is gone, and the composer's own picker refuses a 4th with a word.
  await expect(panel.locator('label:has(svg.lucide-plus) input[type=file]')).toHaveCount(0);
  await page.locator('input[type=file][accept*="image/webp"]:not(#studio-settings *)').first().setInputFiles([png('d.png')]);
  await expect(page.getByText('მაქს 3 სურათი')).toBeVisible();
  await expect(panel.getByRole('img', { name: 'shot 4', exact: true })).toHaveCount(0);
  // Remove the 2nd shot: 2/3, and the next pick lands in the freed place.
  await panel.getByRole('button', { name: 'კადრის მოცილება' }).first().click();
  await expect(panel.getByText('კადრები 2/3 — მეტი რაკურსი')).toBeVisible();
  await panel.locator('label:has(svg.lucide-plus) input[type=file]').setInputFiles([png('e.png')]);
  await expect(panel.getByText('კადრები 3/3 — მეტი რაკურსი')).toBeVisible();
});
