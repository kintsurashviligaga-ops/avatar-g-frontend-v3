/**
 * lib/agent/browser/sessionStore.ts — where a user's sealed logins live: ONE object per user, `<uid>/vault.bin`, in its
 * own PRIVATE bucket (SESSION_BUCKET). The path is built from the caller's uid here and nowhere else, the generic signers
 * refuse this bucket (lib/orchestrator/storage-adapter refuseTwin), and no link to it is ever minted.
 */
import {
  dropSite, emptyVault, listSites, openVault, putSite, sealVault, SESSION_MAX_BYTES, siteOf, stateForSite,
  type PwState, type Vault,
} from './sessionVault';

export const SESSION_BUCKET = 'agent-browser-sessions';

export interface VaultBlobs {
  get(path: string): Promise<Buffer | null>;
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface SessionStore {
  /** The sites with a saved login, newest first. */
  list(userId: string): Promise<Array<{ site: string; savedAt: number }>>;
  /** Seal `state` (Playwright storageState) as the login for `site`; only that site's cookies are kept. */
  save(userId: string, site: string, state: unknown): Promise<{ ok: true; cookies: number } | { ok: false; error: string }>;
  /** The saved login for the site a URL is on, or null. */
  forUrl(userId: string, url: string): Promise<{ site: string; state: PwState } | null>;
  forget(userId: string, site: string): Promise<void>;
}

const UID = /^[0-9a-f-]{36}$/i;
const pathOf = (userId: string) => {
  if (!UID.test(userId)) throw new Error('bad user id');
  return `${userId.toLowerCase()}/vault.bin`;
};

export function sessionStore(blobs: VaultBlobs, key: Buffer, now: () => number = Date.now): SessionStore {
  const read = async (userId: string): Promise<Vault> => {
    const box = await blobs.get(pathOf(userId));
    // A box that does not open (other key, changed bytes) is treated as empty and overwritten on the next save.
    return (box && openVault(key, userId, box)) || emptyVault();
  };
  const write = async (userId: string, v: Vault) => {
    if (Object.keys(v.sites).length === 0) {
      await blobs.remove([pathOf(userId)]);
      return;
    }
    await blobs.put(pathOf(userId), sealVault(key, userId, v), 'application/octet-stream');
  };
  return {
    async list(userId) {
      return listSites(await read(userId), now());
    },
    async save(userId, site, state) {
      const clean = stateForSite(state, site);
      if (clean.cookies.length === 0 && clean.origins.length === 0) {
        return { ok: false, error: 'This site set no login cookies yet. Log in first, then save.' };
      }
      const next = putSite(await read(userId), site, clean, now());
      if (Buffer.byteLength(JSON.stringify(next)) > SESSION_MAX_BYTES) return { ok: false, error: 'The login is too large to keep.' };
      await write(userId, next);
      return { ok: true, cookies: clean.cookies.length };
    },
    async forUrl(userId, url) {
      const site = siteOf(url);
      if (!site) return null;
      const v = await read(userId);
      const hit = listSites(v, now()).find((s) => s.site === site || site.endsWith(`.${s.site}`));
      if (!hit) return null;
      const saved = v.sites[hit.site];
      return saved ? { site: hit.site, state: { cookies: saved.cookies, origins: saved.origins } } : null;
    },
    async forget(userId, site) {
      const v = await read(userId);
      if (!v.sites[site]) return;
      await write(userId, dropSite(v, site));
    },
  };
}

/** In memory, for tests. */
export function memoryVaultBlobs(): VaultBlobs & { data: Map<string, Buffer> } {
  const data = new Map<string, Buffer>();
  return {
    data,
    async get(p) { return data.get(p) ?? null; },
    async put(p, b) { data.set(p, Buffer.from(b)); },
    async remove(ps) { for (const p of ps) data.delete(p); },
  };
}
