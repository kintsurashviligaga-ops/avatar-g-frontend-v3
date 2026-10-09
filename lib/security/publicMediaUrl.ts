/**
 * A media link that is safe to put in an href / src on a page someone else opens: an absolute https URL, or nothing.
 *
 * `user_creations.url` and `thumbnail_url` are writable by their owner straight through the anon key (RLS checks only
 * `user_id`), and `z.string().url()` accepts `javascript:` too. The share page renders the url as its download link,
 * and the CSP allows inline script, so a `javascript:` value there ran on myavatar.ge for whoever pressed Download.
 */
const MAX_LEN = 4096;

export function publicMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_LEN) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  return raw; // as stored: a signed link's token must reach the browser byte for byte
}

export function isPublicMediaUrl(value: unknown): boolean {
  return publicMediaUrl(value) !== null;
}

/** The row with its two links checked; anything that is not an https URL becomes null. */
export function withPublicMediaUrls<T extends { url?: string | null; thumbnail_url?: string | null }>(row: T): T {
  return { ...row, url: publicMediaUrl(row.url), thumbnail_url: publicMediaUrl(row.thumbnail_url) } as T;
}
