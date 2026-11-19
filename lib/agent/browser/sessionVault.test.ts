/** @jest-environment node */
import { randomBytes } from 'node:crypto';
import {
  domainBelongs, emptyVault, listSites, openVault, pruneVault, putSite, sealVault, SESSION_MAX_AGE_MS, SESSION_MAX_SITES,
  siteOf, stateForSite, vaultKey,
} from './sessionVault';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const cookie = (domain: string, name = 'sid') => ({ name, value: 'v', domain, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const });

describe('vault key', () => {
  it('is closed without a 32-byte key, with no fallback', () => {
    expect(vaultKey({} as NodeJS.ProcessEnv)).toBeNull();
    expect(vaultKey({ AGENT_BROWSER_VAULT_KEY: 'short' } as NodeJS.ProcessEnv)).toBeNull();
    expect(vaultKey({ AGENT_BROWSER_VAULT_KEY: 'ab'.repeat(32) } as NodeJS.ProcessEnv)?.length).toBe(32);
    expect(vaultKey({ AGENT_BROWSER_VAULT_KEY: randomBytes(32).toString('base64') } as NodeJS.ProcessEnv)?.length).toBe(32);
  });
});

describe('sites', () => {
  it('names a site by its host without www', () => {
    expect(siteOf('https://www.Facebook.com/login')).toBe('facebook.com');
    expect(siteOf('https://accounts.google.com/')).toBe('accounts.google.com');
    expect(siteOf('file:///etc/passwd')).toBeNull();
    expect(siteOf('http://localhost/')).toBeNull();
  });
  it('keeps only the cookies and storage of that site', () => {
    expect(domainBelongs('.facebook.com', 'facebook.com')).toBe(true);
    expect(domainBelongs('m.facebook.com', 'facebook.com')).toBe(true);
    expect(domainBelongs('evilfacebook.com', 'facebook.com')).toBe(false);
    const s = stateForSite({
      cookies: [cookie('.facebook.com'), cookie('ads.example.com'), { junk: 1 }],
      origins: [{ origin: 'https://www.facebook.com', localStorage: [] }, { origin: 'https://other.com', localStorage: [] }],
    }, 'facebook.com');
    expect(s.cookies.map((c) => c.domain)).toEqual(['.facebook.com']);
    expect(s.origins.map((o) => o.origin)).toEqual(['https://www.facebook.com']);
  });
});

describe('sealing', () => {
  const key = randomBytes(32);
  const v = putSite(emptyVault(), 'facebook.com', { cookies: [cookie('.facebook.com')], origins: [] }, 1000);
  it('opens for its owner with its key only', () => {
    const box = sealVault(key, U1, v);
    expect(box.toString('utf8')).not.toContain('facebook');
    expect(openVault(key, U1, box)?.sites['facebook.com']?.cookies).toHaveLength(1);
    expect(openVault(key, U2, box)).toBeNull();
    expect(openVault(randomBytes(32), U1, box)).toBeNull();
    const bent = Buffer.from(box); bent[bent.length - 1] ^= 1;
    expect(openVault(key, U1, bent)).toBeNull();
    expect(openVault(key, U1, null)).toBeNull();
  });
  it('forgets old logins and keeps at most the newest sites', () => {
    expect(listSites(pruneVault(v, 1000 + SESSION_MAX_AGE_MS + 1), 1000 + SESSION_MAX_AGE_MS + 1)).toEqual([]);
    let many = emptyVault();
    for (let i = 0; i < SESSION_MAX_SITES + 3; i++) many = putSite(many, `s${i}.com`, { cookies: [cookie(`s${i}.com`)], origins: [] }, 1000 + i);
    const l = listSites(many, 2000);
    expect(l).toHaveLength(SESSION_MAX_SITES);
    expect(l[0]?.site).toBe(`s${SESSION_MAX_SITES + 2}.com`);
  });
});
