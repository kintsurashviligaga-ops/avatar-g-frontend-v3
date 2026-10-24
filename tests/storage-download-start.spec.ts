import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const jpeg = readFileSync(path.join(__dirname, '../public/brand/v1/card-image.jpg'));

for (const trusted of [true, false]) {
  test(`Library download uses ${trusted ? 'the trusted storage attachment' : 'the existing foreign-origin byte path'}`, async ({ page }) => {
    const host = trusted ? 'example.supabase.co' : 'other.supabase.co';
    const asset = `https://${host}/storage/v1/object/sign/renders/picture.png?token=fixture-token&cache=1`;
    const storageRequests: { method: string; type: string; url: string }[] = [];
    const mutations: string[] = [];
    await page.addInitScript(() => { localStorage.setItem('myavatar-cookie-consent', 'necessary'); });
    // All remote media and API traffic stays in this fixture. No account or model is contacted.
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      // The shell's normal presence heartbeat is fixture-only, not a download mutation.
      if (url.pathname === '/api/presence/ping' && request.method() === 'POST') return route.fulfill({ json: { ok: true } });
      if (request.method() === 'POST' || request.method() === 'DELETE') {
        mutations.push(url.pathname);
        return route.abort();
      }
      if (url.hostname === host) {
        storageRequests.push({ method: request.method(), type: request.resourceType(), url: request.url() });
        const name = url.searchParams.get('download');
        return route.fulfill({ status: 200, headers: {
          'content-type': 'image/jpeg',
          'access-control-allow-origin': '*',
          // Deliberately not exposed to JS; the browser still honors it on GET.
          ...(name ? { 'content-disposition': `attachment; filename="${name}"` } : {}),
        }, body: request.method() === 'HEAD' ? '' : jpeg });
      }
      if (url.pathname === '/api/studio/library') return route.fulfill({ json: { items: [{ id: 'image-download', kind: 'image', url: asset, prompt: 'Download fixture', orientation: 'landscape', createdAt: '2026-10-23T00:00:00Z' }] } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { items: [], jobs: [], tasks: [] } });
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
      return route.continue();
    });
    await page.goto('/en/library?tab=image');
    await expect(page.getByAltText('Download fixture')).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByTestId('library-download').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('myavatar-image-image-do.jpg');
    expect(await download.failure()).toBeNull();
    expect(page.url()).toMatch(/\/en\/library\?tab=image$/);
    const fetches = storageRequests.filter((request) => request.type === 'fetch');
    if (trusted) {
      expect(fetches.map((request) => request.method)).toEqual(['HEAD']);
      const link = new URL(download.url());
      expect(link.hostname).toBe(host);
      expect(link.searchParams.get('token')).toBe('fixture-token');
      expect(link.searchParams.get('cache')).toBe('1');
      expect(link.searchParams.get('download')).toBe(download.suggestedFilename());
    } else {
      expect(fetches.map((request) => request.method)).toEqual(['GET']);
      expect(download.url()).toMatch(/^blob:/);
    }
    expect(mutations).toEqual([]);
  });
}

// §4.3: a 3D model and a song from our Storage start as attachments too (no bytes in the page), each with its own
// extension; a link that ran out is signed afresh (the Library read again) and saves; a double click saves one file.
const model = Buffer.from('glTF\x02\x00\x00\x00', 'binary');
const song = readFileSync(path.join(__dirname, 'fixtures/tone.mp3'));

async function library(page: import('@playwright/test').Page, items: () => unknown[], answer: (url: URL, method: string) => { status: number; type: string; body: Buffer }) {
  const storage: { method: string; type: string; url: string }[] = [];
  const mutations: string[] = [];
  await page.addInitScript(() => { localStorage.setItem('myavatar-cookie-consent', 'necessary'); });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/presence/ping' && request.method() === 'POST') return route.fulfill({ json: { ok: true } });
    if (request.method() === 'POST' || request.method() === 'DELETE' || request.method() === 'PATCH') {
      mutations.push(url.pathname);
      return route.abort();
    }
    if (url.hostname === 'example.supabase.co' && url.pathname.startsWith('/storage/')) {
      storage.push({ method: request.method(), type: request.resourceType(), url: request.url() });
      const a = answer(url, request.method());
      const name = url.searchParams.get('download');
      return route.fulfill({ status: a.status, headers: {
        'content-type': a.type, 'access-control-allow-origin': '*',
        ...(name && a.status === 200 ? { 'content-disposition': `attachment; filename="${name}"` } : {}),
      }, body: request.method() === 'HEAD' ? '' : a.body });
    }
    if (url.pathname === '/api/studio/library') return route.fulfill({ json: { items: items() } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { items: [], jobs: [], tasks: [] } });
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  return { storage, mutations };
}

for (const c of [
  { tab: 'image', file: 'chair.glb', kind: 'image', type: 'model/gltf-binary', body: model, name: 'myavatar-image-glb-down.glb' },
  { tab: 'music', file: 'song.mp3', kind: 'music', type: 'audio/mpeg', body: song, name: 'myavatar-music-song-dow.mp3' },
]) {
  test(`a ${c.type} from Storage starts as an attachment, named .${c.name.split('.').pop()}`, async ({ page }) => {
    const id = c.kind === 'image' ? 'glb-download' : 'song-download';
    const asset = `https://example.supabase.co/storage/v1/object/sign/renders/${c.file}?token=fixture-token`;
    const { storage, mutations } = await library(page, () => [{ id, kind: c.kind, url: asset, prompt: 'Download fixture', orientation: 'landscape', createdAt: '2026-10-23T00:00:00Z' }],
      () => ({ status: 200, type: c.type, body: c.body }));
    await page.goto(`/en/library?tab=${c.tab}`);
    const button = page.getByTestId('library-download');
    await expect(button).toHaveCount(1, { timeout: 120_000 });
    const downloading = page.waitForEvent('download');
    await button.click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(c.name);
    expect(await download.failure()).toBeNull();
    expect(new URL(download.url()).searchParams.get('download')).toBe(c.name); // the browser's own transfer, no blob
    expect(storage.filter((r) => r.type === 'fetch').map((r) => r.method)).toEqual(['HEAD']);
    expect(mutations).toEqual([]);
  });
}

test('a link that ran out is signed afresh and saves; a double click saves one file', async ({ page }) => {
  let reads = 0;
  const link = (n: number) => `https://example.supabase.co/storage/v1/object/sign/renders/picture.png?token=round-${n}`;
  const { storage, mutations } = await library(page, () => {
    reads += 1;
    return [{ id: 'image-download', kind: 'image', url: link(reads), prompt: 'Download fixture', orientation: 'landscape', createdAt: '2026-10-23T00:00:00Z' }];
  }, (url) => (url.searchParams.get('token') === 'round-1' && url.searchParams.has('download') // only the save's own requests
    ? { status: 400, type: 'application/json', body: Buffer.from('{"statusCode":"400","error":"InvalidJWT","message":"\\"exp\\" claim timestamp check failed"}') }
    : { status: 200, type: 'image/jpeg', body: jpeg }));
  await page.goto('/en/library?tab=image');
  await expect(page.getByAltText('Download fixture')).toBeVisible({ timeout: 120_000 });
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (d) => { downloads.push(d); });
  const popups: string[] = [];
  page.context().on('page', (p) => { popups.push(p.url()); });
  // The picture itself shows from round 1 (the stub refuses only the save's attachment requests).
  const readsBefore = reads;
  await page.getByTestId('library-download').dblclick();
  await expect.poll(() => downloads.length, { timeout: 30_000 }).toBe(1);
  await page.waitForTimeout(2000); // a second file would have started by now
  expect(downloads).toHaveLength(1);
  const saved = new URL(downloads[0]!.url());
  expect(saved.searchParams.get('token')).toBe(`round-${reads}`);
  expect(reads).toBeGreaterThan(readsBefore); // the page was read again for the fresh link
  expect(await downloads[0]!.failure()).toBeNull();
  const heads = storage.filter((r) => r.type === 'fetch' && r.method === 'HEAD').map((r) => new URL(r.url).searchParams.get('token'));
  expect(heads).toEqual(['round-1', `round-${reads}`]);
  expect(popups).toEqual([]); // nothing opened in a tab
  expect(mutations).toEqual([]);
});
