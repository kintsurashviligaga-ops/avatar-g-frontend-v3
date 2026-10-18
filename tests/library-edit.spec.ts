import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Library's „edit" (GG's UI/UX plan, 2026-10-18), at a phone and a desktop width: a Library file opens in the
 * studio's Montage — a film or a picture on its timeline, a song as its music (GG's card answer, 2026-10-18) — carried in this tab's
 * sessionStorage (lib/studio/pendingEdit), so the file's link never shows in the address bar. Opening it calls no
 * generation. The Library API is stubbed at the network edge (the dev server runs on a dummy Supabase); the files are
 * served from this site, so nothing leaves the machine.
 */
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

// Served from this site by the routes below (a WebM: the test browser plays no H.264), and a picture from public/.
const FILM = '/e2e-library/film.webm';
const PICTURE = '/brand/v1/card-image.jpg';
const SONG = '/e2e-library/song.mp3';
const CLIP = readFileSync(path.join(__dirname, 'fixtures', 'clip.webm'));
const TONE = readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3'));
const at = new Date().toISOString();

async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('myavatar-cookie-consent', 'necessary');
      localStorage.setItem('myavatar:tour-seen', '1');
    } catch { /* private mode */ }
  });
  await page.route('**/e2e-library/film.webm', (r) => r.fulfill({ status: 200, contentType: 'video/webm', body: CLIP }));
  await page.route('**/e2e-library/song.mp3', (r) => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: TONE }));
  await page.route('**/api/studio/library**', async (r) => {
    const kind = new URL(r.request().url()).searchParams.get('kind') ?? '';
    const items = kind.includes('film')
      ? [{ id: 'film_1', kind: 'film', url: FILM, prompt: 'Street film', orientation: 'landscape', createdAt: at }]
      : kind.includes('image')
        ? [{ id: 'img_1', kind: 'image', url: PICTURE, prompt: 'A picture', orientation: 'landscape', createdAt: at }]
        : kind.includes('music')
          ? [{ id: 'song_1', kind: 'music', url: SONG, prompt: 'A song', orientation: 'landscape', createdAt: at }]
          : [];
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
  });
  await page.route('**/api/orchestrator/jobs*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"jobs":[]}' }));
  await page.route(/\/api\/tasks(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"tasks":[]}' }));
}

/** Every POST the page sends to a generation route while the editor opens: there must be none. */
function watchGenerations(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (req.method() === 'POST' && /^\/api\/(v2|orchestrator|nanobanana|veo|music|image|video|film)\b/.test(u.pathname)) posts.push(u.pathname);
  });
  return posts;
}

for (const vp of VIEWPORTS) {
  test.describe(`library edit · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test.describe.configure({ timeout: 180_000 }); // two cold `next dev` routes (Library, studio) per test

    test('a film opens in Montage with the film on its timeline', async ({ page }) => {
      await prepare(page);
      const posts = watchGenerations(page);
      await page.goto('/en/library', { waitUntil: 'load' });
      const edit = page.getByRole('button', { name: 'Open in Editor' });
      await expect(edit).toHaveCount(1, { timeout: 60_000 });
      await edit.click();

      await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByTestId('montage-studio')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('montage-clip')).toHaveCount(1, { timeout: 30_000 });
      // The link rode in sessionStorage, read once: none left behind, and none in the address bar.
      expect(await page.evaluate(() => sessionStorage.getItem('myavatar:pending-edit'))).toBeNull();
      expect(page.url()).not.toContain('e2e-library');
      expect(posts).toEqual([]);

      // A reload is a fresh studio, not the same file again.
      await page.reload({ waitUntil: 'load' });
      await expect(page.getByTestId('composer-input')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('montage-studio')).toHaveCount(0);
    });

    test('a picture opens on the Montage timeline and a song as its music', async ({ page }) => {
      await prepare(page);
      const posts = watchGenerations(page);

      await page.goto('/en/library?tab=image', { waitUntil: 'load' });
      await expect(page.getByAltText('A picture')).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Open in Editor' }).click();
      await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByTestId('montage-studio')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('montage-clip')).toHaveCount(1, { timeout: 30_000 });
      // Not the photo editor any more (it used to open there, and read as the picture not having come over).
      await expect(page.locator('button[title^="import-"]')).toHaveCount(0);

      await page.goto('/en/library?tab=music', { waitUntil: 'load' });
      const songEdit = page.getByRole('button', { name: 'Open in Editor' });
      await expect(songEdit).toHaveCount(1, { timeout: 60_000 });
      await songEdit.click();
      await expect(page).toHaveURL(/\/en\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByTestId('montage-studio')).toBeVisible({ timeout: 60_000 });
      // No footage yet, so the start screen says the song is in; the first picture or film puts it under them.
      await expect(page.getByTestId('montage-start-music')).toContainText('The music is in', { timeout: 30_000 });
      await expect(page.getByTestId('montage-clip')).toHaveCount(0);
      expect(posts).toEqual([]);
    });
  });
}
