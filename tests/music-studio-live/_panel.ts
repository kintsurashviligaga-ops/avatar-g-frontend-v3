import { expect, type Page } from '@playwright/test';

/** Opening the Music tool does not automatically open desktop settings. Follow its visible toggle. */
export async function openMusicSettings(page: Page): Promise<void> {
  const toggle = page.getByTestId('options-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', /^(true|false)$/);
  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await expect(toggle).toBeVisible();
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('music-panel')).toBeVisible();
}
