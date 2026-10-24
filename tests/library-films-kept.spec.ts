import { expect, test } from '@playwright/test';
import { signedInLibrary } from '../perf/session';

/**
 * §4.2.5, §4.2.6 in a real browser: a Library film is not read again when its card comes back. The signed-in /en/library
 * page with 12 films, 12 pictures and 12 songs (perf/session: the Library API and the storage host stubbed at the
 * network edge, media from the repo's fixtures).
 *   · a film far below the screen gets no link, so it reads nothing, until it is scrolled near;
 *   · going to Image and back to Video shows the same <video> elements, first frame already there, and reads no film;
 *   · the Library API is not asked again for a tab it already has.
 */
test.use({ viewport: { width: 390, height: 640 } });
test.describe.configure({ timeout: 180_000 }); // cold `next dev` route

test('films off screen read nothing; a tab that comes back reads no film again', async ({ page, baseURL }) => {
  const traffic = await signedInLibrary(page, baseURL);
  const films = () => traffic.media.filter((r) => r.url().includes('/film_')).length;
  await page.goto('/en/library', { waitUntil: 'load' });
  const videos = page.locator('video');
  await expect(videos).toHaveCount(12, { timeout: 120_000 });
  await expect(page.locator('video[src*="film_0"]')).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (document.querySelector('video[src*="film_0"]') as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  // Below the fold: no link yet, nothing read.
  const linked = await page.locator('video[src]').count();
  expect(linked).toBeGreaterThan(0);
  expect(linked).toBeLessThan(12);
  expect(await page.locator('video[src*="film_11"]').count()).toBe(0);
  expect(traffic.media.some((r) => r.url().includes('/film_11.'))).toBe(false);

  // Scrolled to: it gets its link.
  await videos.nth(11).scrollIntoViewIfNeeded();
  await expect(page.locator('video[src*="film_11"]')).toHaveCount(1);
  await expect.poll(() => traffic.media.some((r) => r.url().includes('/film_11.'))).toBe(true);
  await page.waitForTimeout(500); // let the metadata reads land

  // Mark today's elements, go to Image and back.
  await page.evaluate(() => document.querySelectorAll('video').forEach((v, i) => { (v as HTMLVideoElement & { kept?: number }).kept = i; }));
  const filmsBefore = films();
  const libraryBefore = traffic.library.length;
  const tab = (name: string) => page.locator('h1', { hasText: 'Library' }).locator('..').getByRole('button', { name, exact: true });
  await tab('Image').click();
  await expect(page.locator('img[alt="image 0"]')).toBeVisible({ timeout: 30_000 });
  await expect(videos).toHaveCount(0);
  await tab('Video').click();
  await expect(videos).toHaveCount(12);
  const back = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({
    kept: (v as HTMLVideoElement & { kept?: number }).kept, ready: (v as HTMLVideoElement).readyState, src: v.getAttribute('src'),
  })));
  expect(back.map((v) => v.kept)).toEqual([...Array(12).keys()]); // the same elements, in the same order
  expect(back[0]!.ready).toBeGreaterThanOrEqual(1); // first frame and length known at once
  await page.waitForTimeout(500);
  expect(films()).toBe(filmsBefore); // no film read again
  expect(traffic.library.length - libraryBefore).toBe(1); // Image was new; Video came from what was loaded
});
