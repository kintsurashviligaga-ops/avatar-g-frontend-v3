/**
 * lib/agent/browser/openSiteAsk.ts — "open a site" asks typed in the main chat („გახსენი youtube", "open github.com").
 *
 * The main chat model (/api/chat/gemini) has no browser, so such an ask used to be answered there and nothing opened
 * (GG 2026-11-07 06:58Z). The studio hands it to Agent G instead, which plans the steps with quote_browser_task and shows
 * the Start card; nothing opens before Start. Pure: no I/O.
 */

/** Opening verbs, as stems (Georgian has no \b): ka, en, ru. */
const OPEN_VERB = /(?:გა(?:მი)?ხსენ|გახსნა|შედი|შემიყვან|გადადი|ეწვიე|დაათვალიერ|(?:^|[^a-z])(?:open|visit|browse|go\s+to)(?![a-z])|откр[ыо]|зайди|перейди)/iu;

/** A web address: example.com, www.example.ge/path, https://… */
const ADDRESS = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|ge|org|net|io|ai|dev|app|gov|edu|info|co|uk|de|ru|tv|me)(?:\/[^\s]*)?/i;

/** Well-known sites named without an address, and the address each opens. */
const KNOWN: ReadonlyArray<readonly [RegExp, string]> = [
  [/youtube|იუთუბ|იუტუბ|ютуб/iu, 'https://www.youtube.com'],
  [/google|გუგლ|гугл/iu, 'https://www.google.com'],
  [/wikipedia|ვიკიპედი|википеди/iu, 'https://www.wikipedia.org'],
  [/facebook|ფეისბუქ|фейсбук/iu, 'https://www.facebook.com'],
  [/instagram|ინსტაგრამ|инстаграм/iu, 'https://www.instagram.com'],
  [/tiktok|ტიკტოკ|тикток/iu, 'https://www.tiktok.com'],
  [/github|გითჰაბ/iu, 'https://github.com'],
  [/reddit|რედიტ/iu, 'https://www.reddit.com'],
  [/linkedin|ლინკედინ/iu, 'https://www.linkedin.com'],
];

/** A site named generically („საიტი", "website"): Agent G picks the address from the words. */
const SITE_WORD = /(?:საიტ|ვებ-?გვერდ|website|web\s*page|\bsite\b|сайт)/iu;

export interface OpenSiteAsk {
  /** The address to open when the words name one (or a well-known site); null when only "a site" is named. */
  url: string | null;
}

/** An "open this site" ask, or null. The words must say open/visit AND name a site, an address or "a site". */
export function openSiteAsk(text: string): OpenSiteAsk | null {
  const t = text.trim();
  if (!t || t.length > 500 || !OPEN_VERB.test(t)) return null;
  const addr = t.match(ADDRESS)?.[0];
  if (addr) return { url: /^https?:\/\//i.test(addr) ? addr : `https://${addr}` };
  for (const [re, url] of KNOWN) if (re.test(t)) return { url };
  return SITE_WORD.test(t) ? { url: null } : null;
}

/** The goal Agent G gets: the user's words, plus the address when one was found, so it plans a goto there. */
export function openSiteGoal(text: string, ask: OpenSiteAsk): string {
  const words = text.trim();
  return ask.url ? `${words}\n\n(Open ${ask.url} in the browser and take a screenshot.)` : words;
}
