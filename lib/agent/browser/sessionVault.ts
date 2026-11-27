/**
 * lib/agent/browser/sessionVault.ts — the user's saved site logins for Agent G's cloud browser, sealed (GG 2026-11-07
 * 08:02Z chose "both": Premiere XML AND logging in inside the cloud browser, the session stored encrypted).
 *
 * One sealed box per user: { v, sites: { "<site>": { cookies, origins, savedAt } } }, AES-256-GCM with a key that exists
 * only in the server env (AGENT_BROWSER_VAULT_KEY, 32 bytes as base64 or hex). The additional data binds the box to its
 * owner, so a box copied to another user's path does not open. No fallback key: without the env the vault is closed and
 * nothing is saved (fail closed). The password itself is never stored: only what the site set after the user logged in
 * (its cookies and that origin's localStorage), and only for that site's own domains.
 *
 * Pure: no I/O. The store is ./sessionStore.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** A saved login lives this long; after that the user logs in again. */
export const SESSION_MAX_AGE_MS = 30 * 24 * 3600 * 1000;
/** At most this many sites per user, and this many bytes in one sealed box. */
export const SESSION_MAX_SITES = 20;
export const SESSION_MAX_BYTES = 512 * 1024;

export interface PwCookie {
  name: string; value: string; domain: string; path: string;
  expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None';
}
export interface PwOrigin { origin: string; localStorage: Array<{ name: string; value: string }> }
/** Playwright's storageState shape. */
export interface PwState { cookies: PwCookie[]; origins: PwOrigin[] }
export interface SavedSite extends PwState { savedAt: number }
export interface Vault { v: 1; sites: Record<string, SavedSite> }

export const emptyVault = (): Vault => ({ v: 1, sites: {} });

/** The key from the env, or null (vault closed). */
export function vaultKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = (env.AGENT_BROWSER_VAULT_KEY ?? '').trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

/**
 * The site a URL belongs to: its host without "www.", lower case. A login is saved under this name and used again only
 * when a task starts on the same site.
 */
export function siteOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const h = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!h || !h.includes('.')) return null;
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return null;
  }
}

/** Does a cookie domain (".example.com", "accounts.example.com") belong to `site`? */
export function domainBelongs(domain: string, site: string): boolean {
  const d = domain.toLowerCase().replace(/^\./, '');
  return d === site || d.endsWith(`.${site}`) || site.endsWith(`.${d}`);
}

/** Keep only what belongs to `site`: a login for one site never carries another site's cookies. */
export function stateForSite(state: unknown, site: string): PwState {
  const s = (state ?? {}) as { cookies?: unknown; origins?: unknown };
  const cookies = (Array.isArray(s.cookies) ? s.cookies : [])
    .filter((c): c is PwCookie => !!c && typeof c === 'object' && typeof (c as PwCookie).name === 'string'
      && typeof (c as PwCookie).value === 'string' && typeof (c as PwCookie).domain === 'string')
    .filter((c) => domainBelongs(c.domain, site))
    .slice(0, 300);
  const origins = (Array.isArray(s.origins) ? s.origins : [])
    .filter((o): o is PwOrigin => !!o && typeof o === 'object' && typeof (o as PwOrigin).origin === 'string' && Array.isArray((o as PwOrigin).localStorage))
    .filter((o) => { try { return domainBelongs(new URL(o.origin).hostname, site); } catch { return false; } })
    .slice(0, 20);
  return { cookies, origins };
}

const aad = (userId: string) => Buffer.from(`agent-browser-vault|v1|${userId}`, 'utf8');

export function sealVault(key: Buffer, userId: string, vault: Vault): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(aad(userId));
  const body = Buffer.concat([c.update(JSON.stringify(vault), 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]);
}

/** The box opened, or null when it is not this user's, was changed, or the key is different. */
export function openVault(key: Buffer, userId: string, box: Buffer | null): Vault | null {
  if (!box || box.length < 1 + 12 + 16 || box[0] !== 1) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key, box.subarray(1, 13));
    d.setAAD(aad(userId));
    d.setAuthTag(box.subarray(13, 29));
    const json = Buffer.concat([d.update(box.subarray(29)), d.final()]).toString('utf8');
    const v = JSON.parse(json) as Vault;
    return v && v.v === 1 && v.sites && typeof v.sites === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** Drop logins older than SESSION_MAX_AGE_MS. */
export function pruneVault(v: Vault, now: number): Vault {
  const sites: Record<string, SavedSite> = {};
  for (const [k, s] of Object.entries(v.sites)) if (s && now - s.savedAt < SESSION_MAX_AGE_MS) sites[k] = s;
  return { v: 1, sites };
}

/** Add or replace one site's login; the oldest go first when there are too many. */
export function putSite(v: Vault, site: string, state: PwState, now: number): Vault {
  const sites = { ...pruneVault(v, now).sites, [site]: { ...state, savedAt: now } };
  const keep = Object.entries(sites).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, SESSION_MAX_SITES);
  return { v: 1, sites: Object.fromEntries(keep) };
}

export function dropSite(v: Vault, site: string): Vault {
  const sites = { ...v.sites };
  delete sites[site];
  return { v: 1, sites };
}

/** What the user may see: the sites and when each was saved, never a cookie. */
export function listSites(v: Vault, now: number): Array<{ site: string; savedAt: number }> {
  return Object.entries(pruneVault(v, now).sites)
    .map(([site, s]) => ({ site, savedAt: s.savedAt }))
    .sort((a, b) => b.savedAt - a.savedAt);
}
