/** @jest-environment node */
/**
 * app/sitemap — service pages come from the catalog: only slugs mapped to a usable service, with a real page, and
 * never a redirect. The hand-kept list it replaces advertised `game`, `tourism` and `voice`, which no service runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sitemap from '../../app/sitemap';
import { LEGACY_SLUG_TO_SERVICE, getService } from '../catalog/services';
import { getLocalizedMeta } from '../services/metadata';
import { REDIRECTED_SERVICE_SLUGS, sitemapServiceSlugs } from './sitemapServices';
import { SITE_URL } from './site';

const ROOT = join(__dirname, '..', '..');
const serviceSlugsIn = (locale: string) =>
  sitemap()
    .map((e) => e.url)
    .filter((u) => u.startsWith(`${SITE_URL}/${locale}/services/`))
    .map((u) => u.slice(`${SITE_URL}/${locale}/services/`.length));

/** Every `from` slug of next.config.js serviceRedirects (a /services/<from> → /services/<to> 308). */
function redirectSources(): Set<string> {
  const cfg = readFileSync(join(ROOT, 'next.config.js'), 'utf8');
  const block = cfg.slice(cfg.indexOf('const serviceRedirects = ['), cfg.indexOf('];', cfg.indexOf('const serviceRedirects = [')));
  return new Set([...block.matchAll(/from: '([^']+)'/g)].map((m) => m[1]!));
}

test('the service entries are exactly the catalog-derived slugs, in every locale', () => {
  const slugs = sitemapServiceSlugs();
  for (const l of ['ka', 'en', 'ru']) expect(serviceSlugsIn(l).sort()).toEqual([...slugs].sort());
  expect(slugs).toEqual(expect.arrayContaining(['video', 'image', 'music', 'avatar', 'interior', 'prompt', 'content-writer']));
});

test('slugs no catalog service runs are gone (game, tourism, voice), and so is the prompt-builder redirect', () => {
  const listed = new Set(serviceSlugsIn('en'));
  for (const gone of ['game', 'tourism', 'voice', 'prompt-builder']) expect(listed.has(gone)).toBe(false);
});

test('every listed slug maps to a usable catalog service and has a real page', () => {
  const page = readFileSync(join(ROOT, 'app/[locale]/services/[slug]/page.tsx'), 'utf8');
  for (const slug of sitemapServiceSlugs()) {
    const svc = getService(LEGACY_SLUG_TO_SERVICE[slug]!);
    expect(svc && (svc.status === 'live' || svc.status === 'beta')).toBe(true);
    expect(getLocalizedMeta(slug, 'en')).toBeDefined();
    expect(page).toContain(`'${slug}'`); // in the route's generateStaticParams list
  }
});

test('no listed slug is a redirect source in next.config.js, and the helper knows every mapped one that is', () => {
  const sources = redirectSources();
  expect(sources.size).toBeGreaterThan(10);
  for (const slug of sitemapServiceSlugs()) expect(sources.has(slug)).toBe(false);
  for (const slug of Object.keys(LEGACY_SLUG_TO_SERVICE)) {
    if (sources.has(slug)) expect(REDIRECTED_SERVICE_SLUGS.has(slug)).toBe(true);
  }
});
