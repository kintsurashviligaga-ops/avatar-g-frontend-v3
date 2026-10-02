/**
 * The public legal documents and their addresses — one list for every surface that links them from inside the
 * product (the studio's sidebar foot and its settings). The documents themselves are the pages
 * app/[locale]/{terms,privacy,refund}; lib/legal/content.ts holds the legal copy the product shows inline.
 *
 * ⚠️ Links, not the in-app modal: the settings used to open components/studio/LegalModal — a four-line ENGLISH
 * summary stamped "Last updated: June 2024" — in place of the real, localized documents a paying customer agrees to.
 */
import { resolveLegalLang, type LegalLang } from './content';

export type LegalDocId = 'terms' | 'privacy' | 'refund';

export interface LegalLink {
  id: LegalDocId;
  /** The page's path after the locale. */
  path: `/${string}`;
  /** The document's own title — the page's <h1>. */
  title: Record<LegalLang, string>;
  /** A compact label for a row of links. */
  short: Record<LegalLang, string>;
}

export const LEGAL_LINKS: readonly LegalLink[] = [
  {
    id: 'terms',
    path: '/terms',
    title: { ka: 'მომსახურების პირობები', en: 'Terms of Service', ru: 'Условия использования' },
    short: { ka: 'წესები', en: 'Terms', ru: 'Условия' },
  },
  {
    id: 'privacy',
    path: '/privacy',
    title: { ka: 'კონფიდენციალურობის პოლიტიკა', en: 'Privacy Policy', ru: 'Политика конфиденциальности' },
    short: { ka: 'კონფიდენციალურობა', en: 'Privacy', ru: 'Конфиденциальность' },
  },
  {
    id: 'refund',
    path: '/refund',
    title: { ka: 'თანხის დაბრუნების პოლიტიკა', en: 'Refund Policy', ru: 'Политика возврата средств' },
    short: { ka: 'დაბრუნება', en: 'Refunds', ru: 'Возврат' },
  },
];

export function legalDoc(id: LegalDocId): LegalLink {
  const doc = LEGAL_LINKS.find((l) => l.id === id);
  if (!doc) throw new Error(`unknown legal document: ${id}`);
  return doc;
}

/** The locale-prefixed address of a document, in the visitor's language (ka for anything unknown, like the middleware). */
export function legalHref(locale: string | null | undefined, id: LegalDocId): string {
  return `/${resolveLegalLang(locale)}${legalDoc(id).path}`;
}
