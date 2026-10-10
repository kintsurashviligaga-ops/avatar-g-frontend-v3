/**
 * lib/agent/media/commonsLicense.ts — the licence Wikimedia Commons publishes for one of its files, read from Commons'
 * own API, so Agent G can name it (and its author) instead of asking the user to vouch for the file.
 *
 * Commons hosts only freely licensed or public-domain media (its own policy), and its API states each file's licence
 * (`LicenseShortName`, e.g. "CC BY-SA 4.0", "Public domain") and author (`Artist`). Three addresses name a Commons file:
 *   https://upload.wikimedia.org/wikipedia/commons/a/ab/Name.webm                       the file
 *   https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Name.webm/Name.webm.480p.vp9.webm   a transcode
 *   https://commons.wikimedia.org/wiki/File:Name.webm                                   its page (→ the file, by the API)
 * Another wiki's local upload (upload.wikimedia.org/wikipedia/en/…) may be non-free, so it is not read as licensed.
 *
 * Fetched through lib/web/publicFetch (public hosts, a byte cap, one deadline). Never throws; null = no licence known.
 */
import { fetchPublicBytes, type PublicFetchOptions } from '@/lib/web/publicFetch';

/** The Commons file an address names (`File:Name.ext`), or null. */
export function commonsFileTitle(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  let name: string | null = null;
  try {
    if (host === 'upload.wikimedia.org') {
      const m = /^\/wikipedia\/commons\/(?:transcoded\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/.exec(u.pathname);
      name = m ? decodeURIComponent(m[1]!) : null;
    } else if (host === 'commons.wikimedia.org' || host === 'commons.m.wikimedia.org') {
      const m = /^\/wiki\/File:(.+)$/.exec(u.pathname);
      name = m ? decodeURIComponent(m[1]!) : u.searchParams.get('title')?.replace(/^File:/, '') ?? null;
    }
  } catch {
    return null;
  }
  if (!name || name.length > 240 || /[[\]{}|#<>]/.test(name)) return null;
  return `File:${name.replace(/_/g, ' ')}`;
}

/** Is this address a Commons file PAGE (an HTML page that names one file)? */
export function isCommonsPage(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (h === 'commons.wikimedia.org' || h === 'commons.m.wikimedia.org') && commonsFileTitle(url) !== null;
  } catch {
    return false;
  }
}

const strip = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export interface CommonsFile {
  /** The original file's direct address. */
  fileUrl: string;
  /** Its page on Commons: where the licence is stated. */
  pageUrl: string;
  license: string;
  author?: string;
}

/** Read the file's licence from the Commons API. */
export async function commonsLicense(url: string, io: Pick<PublicFetchOptions, 'fetchImpl' | 'lookupImpl'> = {}): Promise<CommonsFile | null> {
  const title = commonsFileTitle(url);
  if (!title) return null;
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({
    action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', titles: title,
    iiprop: 'url|extmetadata', iiextmetadatafilter: 'LicenseShortName|Artist|Copyrighted',
  })) api.searchParams.set(k, v);
  const r = await fetchPublicBytes(api.href, { ...io, maxBytes: 256 * 1024, accept: /^application\/json$/, timeoutMs: 8000 });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(r.bytes.toString('utf8')) as {
      query?: { pages?: Array<{ missing?: boolean; imageinfo?: Array<{ url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: unknown }> }> }> };
    };
    const info = j.query?.pages?.[0]?.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = typeof meta.LicenseShortName?.value === 'string' ? strip(meta.LicenseShortName.value).slice(0, 80) : '';
    const fileUrl = typeof info?.url === 'string' ? info.url : '';
    if (!license || !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(fileUrl)) return null;
    const author = typeof meta.Artist?.value === 'string' ? strip(meta.Artist.value).slice(0, 120) : '';
    const pageUrl = typeof info?.descriptionurl === 'string' && /^https:\/\/commons\.wikimedia\.org\//.test(info.descriptionurl)
      ? info.descriptionurl
      : `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    return { fileUrl, pageUrl, license, ...(author ? { author } : {}) };
  } catch {
    return null;
  }
}

/**
 * A licence the file's own server declares in its answer (`Link: <…>; rel="license"`, RFC 8288's registered relation),
 * as a short name when it is a Creative Commons address ("CC BY 4.0", "CC0 1.0"), else the address itself.
 */
export function licenseFromLinkHeader(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(/,(?=\s*<)/)) {
    const m = /<([^>]+)>\s*;(.*)$/.exec(part.trim());
    if (!m || !/\brel\s*=\s*"?(?:[^"]*\s)?license(?:\s[^"]*)?"?/i.test(m[2]!)) continue;
    let u: URL;
    try { u = new URL(m[1]!); } catch { continue; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
    const cc = /^\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/.exec(u.pathname);
    if (/(^|\.)creativecommons\.org$/i.test(u.hostname) && cc) {
      if (cc[1] === 'publicdomain') return cc[2] === 'zero' ? `CC0 ${cc[3]}` : `Public Domain Mark ${cc[3]}`;
      return `CC ${cc[2]!.toUpperCase()} ${cc[3]}`;
    }
    return u.href.slice(0, 200);
  }
  return null;
}
