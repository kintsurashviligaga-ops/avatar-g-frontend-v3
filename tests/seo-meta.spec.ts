import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * What a crawler or a link unfurler reads from the server HTML of the front doors — the share card, the manifest, the
 * icons, canonical + hreflang — and the doors to the legal documents (lib/seo/metadata.ts, app/manifest.ts,
 * scripts/brand/build-assets.mjs, lib/legal/links.ts).
 *
 * /{lang} is the studio (it opens on the chat), so its legal links sit at the foot of the studio's sidebar; the
 * marketing landing (/{lang}/landing) carries them in its footer.
 */
const LOCALES = [
  { lang: 'ka', menu: 'მენიუ', terms: 'წესები', privacy: 'კონფიდენციალურობა' },
  { lang: 'en', menu: 'Menu', terms: 'Terms', privacy: 'Privacy' },
] as const;

/** The value of a <meta property|name="key" content="…"> in server HTML (Next renders the attribute before content). */
function meta(html: string, attr: 'property' | 'name', key: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]*\\b${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'i'))?.[0];
  return tag?.match(/\bcontent="([^"]*)"/)?.[1] ?? null;
}

/** Every <link rel="…"> href in server HTML, in order. */
function links(html: string, rel: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => new RegExp(`\\brel="${rel}"`, 'i').test(tag))
    .map((tag) => (tag.match(/\bhref="([^"]*)"/)?.[1] ?? '').replace(/&amp;/g, '&'));
}

async function serverHtml(request: APIRequestContext, path: string) {
  const res = await request.get(path, { headers: { accept: 'text/html' } });
  expect(res.status(), path).toBe(200);
  return res.text();
}

async function expectImage(request: APIRequestContext, href: string, type: RegExp = /^image\//) {
  const res = await request.get(href);
  expect(res.status(), href).toBe(200);
  expect(res.headers()['content-type'], href).toMatch(type);
}

/** The cookie banner is answered up front so it never sits over the sidebar. */
async function openStudio(page: Page, path: string) {
  await page.addInitScript(() => { try { localStorage.setItem('myavatar-cookie-consent', 'necessary'); } catch { /* private mode */ } });
  await page.goto(path);
}

for (const { lang, menu, terms, privacy } of LOCALES) {
  test.describe(`/${lang}`, () => {
    test('og:image and twitter:image are absolute URLs to the 1200×630 share card, and the card answers 200 as a PNG', async ({ request, baseURL }) => {
      const html = await serverHtml(request, `/${lang}`);
      const og = meta(html, 'property', 'og:image');
      const tw = meta(html, 'name', 'twitter:image');
      expect(og).toMatch(/^https?:\/\/[^/]+\/og-image\.png$/);
      expect(tw).toBe(og);
      // Resolved through metadataBase: the site's origin (SITE_URL, as the canonical shows) in production — and, by
      // Next's design, the server's own origin under `next dev` (and the deployment's on a Vercel preview).
      const [canonical] = links(html, 'canonical');
      expect([new URL(canonical!).origin, new URL(baseURL!).origin]).toContain(new URL(og!).origin);
      expect(meta(html, 'property', 'og:image:width')).toBe('1200');
      expect(meta(html, 'property', 'og:image:height')).toBe('630');
      expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
      expect(meta(html, 'property', 'og:type')).toBe('website');
      expect(meta(html, 'property', 'og:site_name')).toBe('MyAvatar');
      expect(meta(html, 'property', 'og:locale')).toBe(lang === 'ka' ? 'ka_GE' : 'en_US');
      // The URL names the site's origin (SITE_URL); the file itself is checked on this server.
      await expectImage(request, new URL(og!).pathname, /^image\/png/);
    });

    test('canonical and hreflang are absolute and self-referential', async ({ request }) => {
      const html = await serverHtml(request, `/${lang}`);
      const [canonical] = links(html, 'canonical');
      expect(canonical).toMatch(new RegExp(`^https://[^/]+/${lang}$`));
      expect(meta(html, 'property', 'og:url')).toBe(canonical);
      const origin = new URL(canonical!).origin;
      for (const l of ['ka', 'en', 'ru']) expect(html).toMatch(new RegExp(`<link[^>]*hreflang="${l}"[^>]*href="${origin}/${l}"`, 'i'));
      expect(html).toMatch(new RegExp(`<link[^>]*hreflang="x-default"[^>]*href="${origin}/ka"`, 'i'));
    });

    test('one manifest and one apple-touch-icon are linked, and every icon answers 200 with an image type', async ({ request }) => {
      const html = await serverHtml(request, `/${lang}`);
      expect(links(html, 'manifest')).toEqual(['/manifest.webmanifest']);
      const apple = links(html, 'apple-touch-icon');
      expect(apple).toHaveLength(1);
      const icons = links(html, 'icon');
      expect(icons.some((h) => h.startsWith('/favicon.ico'))).toBe(true);
      expect(icons.some((h) => h.startsWith('/icon.png'))).toBe(true);
      for (const href of [...apple, ...icons]) await expectImage(request, href);

      const res = await request.get('/manifest.webmanifest');
      expect(res.status()).toBe(200);
      const manifest = (await res.json()) as { name: string; start_url: string; icons: Array<{ src: string }> };
      expect(manifest.name).toBe('MyAvatar');
      for (const icon of manifest.icons) await expectImage(request, icon.src, /^image\/png/);
    });

    test('the studio links Terms and Privacy at the foot of its sidebar — locale-prefixed, and both pages answer 200', async ({ page, request }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openStudio(page, `/${lang}`);
      const legal = page.getByTestId('sidebar-legal');
      await expect(legal).toBeVisible();
      for (const [name, slug] of [[terms, 'terms'], [privacy, 'privacy']] as const) {
        const link = legal.getByRole('link', { name, exact: true });
        await expect(link).toHaveAttribute('href', `/${lang}/${slug}`);
        await expect(link).toHaveAttribute('target', '_blank'); // the studio keeps its jobs and its draft
        expect((await request.get(`/${lang}/${slug}`)).status(), slug).toBe(200);
      }
    });

    test('the landing footer links Terms and Privacy, and both pages answer 200', async ({ page, request }) => {
      await page.goto(`/${lang}/landing`);
      const footer = page.locator('footer');
      for (const slug of ['terms', 'privacy']) {
        const link = footer.locator(`a[href="/${lang}/${slug}"]`);
        await expect(link).toHaveCount(1);
        expect((await request.get(`/${lang}/${slug}`)).status(), slug).toBe(200);
      }
    });
  });
}

test.describe('375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the drawer carries the legal row inside its own width, and nothing scrolls sideways', async ({ page }) => {
    await openStudio(page, '/ka');
    await page.locator('header').getByRole('button', { name: LOCALES[0].menu }).click();
    const drawer = page.locator('aside[aria-label="მენიუ"]');
    const legal = drawer.getByTestId('sidebar-legal');
    await expect(legal).toBeVisible();
    const box = (await drawer.boundingBox())!;
    for (const link of await legal.getByRole('link').all()) {
      const l = (await link.boundingBox())!;
      expect(l.x).toBeGreaterThanOrEqual(box.x);
      expect(l.x + l.width).toBeLessThanOrEqual(box.x + box.width);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('the legal pages render in every language', () => {
  const TITLES = {
    ka: { terms: 'მომსახურების პირობები', privacy: 'კონფიდენციალურობის პოლიტიკა', refund: 'თანხის დაბრუნების პოლიტიკა' },
    en: { terms: 'Terms of Service', privacy: 'Privacy Policy', refund: 'Refund Policy' },
    ru: { terms: 'Условия использования', privacy: 'Политика конфиденциальности', refund: 'Политика возврата средств' },
  } as const;

  for (const [lang, titles] of Object.entries(TITLES)) {
    test(`/${lang}: terms, privacy and refund each show their own heading, <title> and description`, async ({ page, request }) => {
      for (const [slug, title] of Object.entries(titles)) {
        await page.goto(`/${lang}/${slug}`);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        await expect(page).toHaveTitle(`${title} · MyAvatar`);
        const html = await serverHtml(request, `/${lang}/${slug}`);
        expect(meta(html, 'property', 'og:url')).toMatch(new RegExp(`/${lang}/${slug}$`));
        expect(meta(html, 'name', 'description')).not.toBe(meta(await serverHtml(request, `/${lang}`), 'name', 'description'));
      }
    });
  }
});
