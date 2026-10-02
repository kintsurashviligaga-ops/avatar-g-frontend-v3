/** @jest-environment node */
/**
 * Every public page's <head> carries the full set — localized title + description, self-canonical + hreflang, and
 * Open Graph / X cards on the one share image — and the layouts above them no longer leak per-URL facts downward.
 *
 * ⚠️ The pages are imported for real (their heavy client trees mocked away): the legal pages used to set a title only,
 * so they inherited the HOME page's description, og:url and og:title from the [locale] layout.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { OG_IMAGE, OG_LOCALE, SITE_NAME, pageMetadata, seoLang, shareCards } from './metadata';
import { SITE_URL } from './site';

jest.mock('../../components/studio/FilmStudioHome', () => ({ FilmStudioHome: () => null }));
jest.mock('../../components/landing/Landing', () => ({ Landing: () => null }));
jest.mock('../../components/PricingSection', () => ({ PricingSection: () => null }));
jest.mock('../../components/studio/StudioPageShell', () => ({ StudioPageShell: () => null }));
jest.mock('../../components/support/SupportChat', () => ({ SupportChat: () => null }));
jest.mock('../../lib/supabase/server', () => ({ createServerClient: jest.fn() }));
// The layouts' providers and shells — only their metadata is under test.
jest.mock('../../app/providers', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/AppShell', () => ({ AppShell: () => null }));
jest.mock('../../components/analytics/PostHogProvider', () => ({ PostHogProvider: () => null }));
jest.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
jest.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));
jest.mock('../../lib/env/startupValidation', () => ({ logStartupEnvValidation: () => undefined }));
jest.mock('../../lib/studio/flags', () => ({ studioV2Enabled: () => false }));
jest.mock('next-intl/server', () => ({ getMessages: jest.fn(), setRequestLocale: jest.fn() }));
jest.mock('next-intl', () => ({ NextIntlClientProvider: () => null }));
jest.mock('../../i18n.config', () => ({ i18n: { defaultLocale: 'ka', locales: ['en', 'ka', 'ru'] } }));
jest.mock('../../components/providers/QueryProvider', () => ({ QueryProvider: () => null }));
jest.mock('../../components/layout/PageTransitionWrapper', () => ({ PageTransitionWrapper: () => null }));
jest.mock('../../components/providers/AppProviders', () => ({ AppProviders: () => null }));
jest.mock('../../components/i18n/HtmlLangSync', () => ({ __esModule: true, default: () => null }));

const LANGS = ['ka', 'en', 'ru'] as const;
type GenerateMetadata = (props: { params: unknown }) => Metadata | Promise<Metadata>;

/** Pages read `params` either as a Promise (Next 15 style) or as a plain object — this is both. */
const paramsFor = (locale: string) => Object.assign(Promise.resolve({ locale }), { locale });

const og = (md: Metadata) => md.openGraph as Record<string, unknown> & { images: Array<Record<string, unknown>> };
const tw = (md: Metadata) => md.twitter as Record<string, unknown> & { images: unknown[] };
const titleOf = (md: Metadata) => (md.title as { absolute: string }).absolute;

describe('pageMetadata', () => {
  const md = pageMetadata({ locale: 'en', path: '/terms', title: 'Terms of Service', description: 'The terms.' });

  it('suffixes the brand once and uses that one string for the document, og and twitter titles', () => {
    expect(titleOf(md)).toBe('Terms of Service · MyAvatar');
    expect(og(md).title).toBe('Terms of Service · MyAvatar');
    expect(tw(md).title).toBe('Terms of Service · MyAvatar');
    expect(titleOf(pageMetadata({ locale: 'en', path: '', title: 'MyAvatar.ge — Video', description: 'd', brandSuffix: false }))).toBe('MyAvatar.ge — Video');
  });

  it('is self-canonical with the full hreflang cluster, all absolute on SITE_URL', () => {
    expect(md.alternates?.canonical).toBe(`${SITE_URL}/en/terms`);
    expect(md.alternates?.languages).toEqual({
      ka: `${SITE_URL}/ka/terms`, en: `${SITE_URL}/en/terms`, ru: `${SITE_URL}/ru/terms`, 'x-default': `${SITE_URL}/ka/terms`,
    });
  });

  it('carries a complete Open Graph card: type, site name, locale + alternates, its own url, the share image', () => {
    expect(og(md)).toMatchObject({ type: 'website', siteName: SITE_NAME, locale: 'en_US', url: `${SITE_URL}/en/terms`, description: 'The terms.' });
    expect(og(md).alternateLocale).toEqual(['ka_GE', 'ru_RU']);
    expect(og(md).images).toEqual([OG_IMAGE]);
  });

  it('carries a summary_large_image X card on the same image', () => {
    expect(tw(md)).toMatchObject({ card: 'summary_large_image', description: 'The terms.' });
    expect(tw(md).images).toEqual([OG_IMAGE.url]);
  });

  it('falls back to ka for an unknown locale — never en', () => {
    expect(seoLang('de')).toBe('ka');
    expect(seoLang(undefined)).toBe('ka');
    expect(pageMetadata({ locale: 'xx', path: '', title: 't', description: 'd' }).alternates?.canonical).toBe(`${SITE_URL}/ka`);
  });

  it('a layout\'s cards carry no url (it would be claimed by every page below)', () => {
    expect(og(shareCards('ka', 't', 'd') as Metadata).url).toBeUndefined();
  });
});

describe('the share image the metadata points at', () => {
  it('exists at OG_IMAGE.url with the declared size', () => {
    const file = join(process.cwd(), 'public', OG_IMAGE.url);
    expect(existsSync(file)).toBe(true);
    const b = readFileSync(file);
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
  });
});

/**
 * Every public page the launch puts in front of a stranger: its post-locale path (the module is
 * app/[locale]{path}/page.tsx — a relative import, because next/jest rewrites the `@/` alias only in static imports).
 */
const PUBLIC_PAGES = ['', '/landing', '/dashboard', '/pricing', '/terms', '/privacy', '/refund', '/cookies', '/licenses', '/support'];

describe.each(PUBLIC_PAGES)('/{lang}%s', (path) => {
  let byLang: Record<string, Metadata>;
  beforeAll(async () => {
    const { generateMetadata } = (await import(`../../app/[locale]${path}/page`)) as { generateMetadata: GenerateMetadata };
    byLang = {};
    for (const l of LANGS) byLang[l] = await generateMetadata({ params: paramsFor(l) });
  });

  it.each(LANGS)('%s: localized title + description, self-canonical, hreflang, OG + X cards on the share image', (l) => {
    const md = byLang[l]!;
    expect(titleOf(md).length).toBeGreaterThan(3);
    expect(typeof md.description).toBe('string');
    expect((md.description as string).length).toBeGreaterThan(20);
    expect(md.alternates?.canonical).toBe(`${SITE_URL}/${l}${path}`);
    expect(Object.keys(md.alternates?.languages ?? {}).sort()).toEqual(['en', 'ka', 'ru', 'x-default']);
    expect(og(md)).toMatchObject({ type: 'website', siteName: SITE_NAME, locale: OG_LOCALE[l], url: `${SITE_URL}/${l}${path}` });
    expect(og(md).images[0]).toMatchObject({ url: OG_IMAGE.url, width: 1200, height: 630 });
    expect(tw(md)).toMatchObject({ card: 'summary_large_image' });
    expect(tw(md).images).toEqual([OG_IMAGE.url]);
  });

  it('says it in three languages — no two locales share a title or a description', () => {
    expect(new Set(LANGS.map((l) => titleOf(byLang[l]!))).size).toBe(3);
    expect(new Set(LANGS.map((l) => byLang[l]!.description)).size).toBe(3);
  });
});

describe('the layouts above the pages', () => {
  it('root: metadataBase IS SITE_URL (so og:image renders absolute there), and no icon list or manifest link', async () => {
    const { metadata } = (await import('../../app/layout')) as { metadata: Metadata };
    expect(String(metadata.metadataBase)).toBe(`${SITE_URL}/`);
    expect(metadata).not.toHaveProperty('icons');
    expect(metadata).not.toHaveProperty('manifest');
    expect(og(metadata).images).toEqual([OG_IMAGE]);
    expect(og(metadata).url).toBeUndefined();
    expect(tw(metadata).images).toEqual([OG_IMAGE.url]);
  });

  it.each(LANGS)('[locale] (%s): no hreflang cluster, og:url, icons, manifest or origin of its own to leak downward', async (l) => {
    const { generateMetadata } = (await import('../../app/[locale]/layout')) as { generateMetadata: GenerateMetadata };
    const md = await generateMetadata({ params: { locale: l } });
    for (const key of ['alternates', 'icons', 'manifest', 'metadataBase']) expect(md).not.toHaveProperty(key);
    expect(og(md).url).toBeUndefined();
    expect(og(md).locale).toBe(OG_LOCALE[l]);
    expect(og(md).images[0]).toMatchObject({ url: OG_IMAGE.url });
  });
});
