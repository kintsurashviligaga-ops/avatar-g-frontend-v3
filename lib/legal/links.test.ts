/** @jest-environment node */
/**
 * The legal links the product shows: every one is a real, localized page, its name is the page's own title, and the
 * studio links them (sidebar foot + settings) instead of the English placeholder modal it used to open.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { LEGAL_LINKS, legalDoc, legalHref } from './links';

const root = process.cwd();
const LANGS = ['ka', 'en', 'ru'] as const;

describe('LEGAL_LINKS', () => {
  it('covers terms, privacy and the refund policy — the three a paying customer agrees to', () => {
    expect(LEGAL_LINKS.map((l) => l.id)).toEqual(['terms', 'privacy', 'refund']);
  });

  it.each(LEGAL_LINKS.map((l) => [l.id, l.path] as const))('%s is a page that exists (app/[locale]%s)', (_id, path) => {
    expect(existsSync(join(root, `app/[locale]${path}/page.tsx`))).toBe(true);
  });

  it('hrefs are locale-prefixed, in the visitor\'s language, ka for anything unknown', () => {
    expect(legalHref('en', 'terms')).toBe('/en/terms');
    expect(legalHref('ru', 'privacy')).toBe('/ru/privacy');
    expect(legalHref('ka', 'refund')).toBe('/ka/refund');
    expect(legalHref('de', 'terms')).toBe('/ka/terms');
    expect(legalHref(undefined, 'terms')).toBe('/ka/terms');
  });

  it.each(LEGAL_LINKS.map((l) => [l.id] as const))('%s: each language names the document by the page\'s own title', async (id) => {
    const doc = legalDoc(id);
    const { generateMetadata } = (await import(`../../app/[locale]${doc.path}/page`)) as {
      generateMetadata: (p: { params: Promise<{ locale: string }> }) => Promise<Metadata>;
    };
    for (const l of LANGS) {
      const md = await generateMetadata({ params: Promise.resolve({ locale: l }) });
      expect((md.title as { absolute: string }).absolute).toBe(`${doc.title[l]} · MyAvatar`);
      expect(doc.short[l].length).toBeGreaterThan(0);
    }
  });
});

describe('the studio links the documents', () => {
  const chrome = readFileSync(join(root, 'components/studio/ChatChrome.tsx'), 'utf8');

  it('in the sidebar foot and the settings, as links to the pages — never the old placeholder modal', () => {
    expect(chrome).toContain('data-testid="sidebar-legal"');
    for (const id of ['terms', 'privacy', 'refund']) expect(chrome).toContain(`legalHref(lang, '${id}')`);
    expect(chrome).not.toMatch(/import\s*\{[^}]*LegalModal/);
    expect(existsSync(join(root, 'components/studio/LegalModal.tsx'))).toBe(false);
  });
});
