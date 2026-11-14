/** @jest-environment node */
import { randomBytes } from 'node:crypto';
import { memoryVaultBlobs, sessionStore } from './sessionStore';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const state = { cookies: [{ name: 'sid', value: 'secret-cookie', domain: '.facebook.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }, { name: 'x', value: 'y', domain: '.tracker.com', path: '/', expires: -1, httpOnly: false, secure: true, sameSite: 'None' }], origins: [] };

describe('session store', () => {
  it('saves one sealed object per user, under their own uid, readable only by them', async () => {
    const blobs = memoryVaultBlobs();
    const s = sessionStore(blobs, randomBytes(32), () => 5000);
    expect(await s.save(U1, 'facebook.com', state)).toEqual({ ok: true, cookies: 1 });
    expect([...blobs.data.keys()]).toEqual([`${U1}/vault.bin`]);
    expect(blobs.data.get(`${U1}/vault.bin`)!.toString('utf8')).not.toContain('secret-cookie');
    expect(await s.list(U1)).toEqual([{ site: 'facebook.com', savedAt: 5000 }]);
    expect(await s.list(U2)).toEqual([]);
    // A box copied to another user's path does not open there.
    blobs.data.set(`${U2}/vault.bin`, blobs.data.get(`${U1}/vault.bin`)!);
    expect(await s.forUrl(U2, 'https://facebook.com/')).toBeNull();
  });
  it('finds the login for the site a task starts on, and nothing for other sites', async () => {
    const s = sessionStore(memoryVaultBlobs(), randomBytes(32));
    await s.save(U1, 'facebook.com', state);
    const hit = await s.forUrl(U1, 'https://m.facebook.com/messages');
    expect(hit?.site).toBe('facebook.com');
    expect(hit?.state.cookies.map((c) => c.domain)).toEqual(['.facebook.com']);
    expect(await s.forUrl(U1, 'https://example.com/')).toBeNull();
  });
  it('refuses a state with no login in it, and forgets on request', async () => {
    const blobs = memoryVaultBlobs();
    const s = sessionStore(blobs, randomBytes(32));
    expect((await s.save(U1, 'example.com', state)).ok).toBe(false);
    await s.save(U1, 'facebook.com', state);
    await s.forget(U1, 'facebook.com');
    expect(await s.list(U1)).toEqual([]);
    expect(blobs.data.size).toBe(0);
  });
  it('refuses a malformed user id', async () => {
    const s = sessionStore(memoryVaultBlobs(), randomBytes(32));
    await expect(s.list('../../etc')).rejects.toThrow();
  });
});
