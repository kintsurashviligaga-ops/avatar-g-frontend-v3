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
