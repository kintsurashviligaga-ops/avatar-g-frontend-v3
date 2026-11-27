import { applyRenewedMedia, isStaleSignedLink, requestMediaRenewal, resetMediaRenewClient, signedLinkExpiry, staleMediaUrls } from './mediaRenewClient';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const link = (exp: number, path = 'a.mp4') => `https://p.supabase.co/storage/v1/object/sign/renders/${path}?token=${b64({ alg: 'HS256' })}.${b64({ exp, url: `renders/${path}` })}.sig`;
const NOW = 1_800_000_000;

test('reads the expiry of a signed storage link only', () => {
  expect(signedLinkExpiry(link(NOW + 5))).toBe(NOW + 5);
  expect(signedLinkExpiry('https://p.supabase.co/storage/v1/object/public/renders/a.png')).toBeNull();
  expect(signedLinkExpiry('https://p.supabase.co/storage/v1/object/sign/renders/a.mp4?token=garbage')).toBeNull();
  expect(signedLinkExpiry('data:video/mp4;base64,AAA')).toBeNull();
});

test('stale = expired or within a day', () => {
  expect(isStaleSignedLink(link(NOW - 10), NOW)).toBe(true);
  expect(isStaleSignedLink(link(NOW + 3600), NOW)).toBe(true);
  expect(isStaleSignedLink(link(NOW + 3 * 86400), NOW)).toBe(false);
});

test('collects stale links once, and swaps renewed ones in without touching the rest', () => {
  const old = link(NOW - 1, 'v.mp4');
  const fresh = link(NOW + 7 * 86400, 'v.mp4');
  const msgs = [{ videoUrl: old, text: 'a' }, { imageUrl: old }, { audioUrl: link(NOW + 9 * 86400, 's.mp3') }, { text: 'hi' }];
  expect(staleMediaUrls(msgs, NOW)).toEqual([old]);
  const next = applyRenewedMedia(msgs, { [old]: fresh });
  expect(next[0]).toEqual({ videoUrl: fresh, text: 'a' });
  expect(next[1]).toEqual({ imageUrl: fresh });
  expect(next[2]).toBe(msgs[2]);
  expect(applyRenewedMedia(msgs, {})).toBe(msgs);
});

describe('requestMediaRenewal', () => {
  beforeEach(() => resetMediaRenewClient());
  const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

  it('returns only https links from the answer', async () => {
    const f = jest.fn(async () => res(200, { renewed: { a: 'https://x/a2', b: 'javascript:alert(1)', c: 3 } }));
    await expect(requestMediaRenewal(['a', 'b', 'c'], f as unknown as typeof fetch)).resolves.toEqual({ a: 'https://x/a2' });
  });

  it('a 404 (feature off) stops further asks this session', async () => {
    const f = jest.fn(async () => res(404, { error: 'disabled' }));
    await requestMediaRenewal(['a'], f as unknown as typeof fetch);
    await requestMediaRenewal(['b'], f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('nothing to ask → no request; a network error → {}', async () => {
    const f = jest.fn(async () => { throw new Error('offline'); });
    await expect(requestMediaRenewal([], f as unknown as typeof fetch)).resolves.toEqual({});
    expect(f).not.toHaveBeenCalled();
    await expect(requestMediaRenewal(['a'], f as unknown as typeof fetch)).resolves.toEqual({});
  });
});
