import { createClient } from '@supabase/supabase-js';
import { createSignedAssetUrls, verifyFileableUrl } from '../../orchestrator/storage-adapter';
import { readRecentWorks } from './works';

jest.mock('server-only', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../env/public', () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://own.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } }));
jest.mock('../../security/callerMedia', () => ({
  uploadBucket: () => 'uploads',
  ownsUploadObject: (path: string, user: string) => path.startsWith(`${user}/`) && !path.includes('..'),
}));
jest.mock('../../orchestrator/storage-adapter', () => ({
  createSignedAssetUrls: jest.fn(), verifyFileableUrl: jest.fn(),
  ownStorageHosts: () => new Set(['own.supabase.co']),
  libraryMediaBuckets: () => new Set(['media', 'uploads']),
  describeSupabaseObjectUrl: (raw: string) => {
    const u = new URL(raw);
    const m = u.pathname.match(/^\/storage\/v1\/object\/(sign|public)\/([^/]+)\/(.+)$/);
    return m ? { access: m[1], bucket: m[2], path: m[3], host: u.hostname } : null;
  },
}));

const principal = { userId: 'owner', token: 'user-token' };
const row = (id: string, signed_url: string, params: object = {}, user_id = 'owner') => ({
  id, signed_url, params, user_id, service_type: 'film', created_at: '2026-01-01', result: null,
});
const link = (bucket: string, path: string, token = 'old') => `https://own.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=${token}`;
function rows(data: ReturnType<typeof row>[]) {
  const q = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), order: jest.fn(), limit: jest.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.neq.mockReturnValue(q); q.order.mockReturnValue(q);
  q.limit.mockResolvedValue({ data, error: null });
  (createClient as jest.Mock).mockReturnValue({ from: () => q });
  return q;
}
beforeEach(() => jest.resetAllMocks());

test('signs only a user-owned upload path, retains live generated links without extending them', async () => {
  const live = link('media', 'outputs/video.mp4', 'valid');
  const q = rows([
    row('owned-upload', link('uploads', 'owner/avatar.png')),
    row('live-generated', live),
    row('other-user', link('uploads', 'other/private.png'), {}, 'other'),
    row('public', 'https://cdn.example.com/asset.mp4'),
  ]);
  (verifyFileableUrl as jest.Mock).mockResolvedValue({ ok: true, kind: 'own-signed', bucket: 'media', path: 'outputs/video.mp4' });
  (createSignedAssetUrls as jest.Mock).mockResolvedValue([link('uploads', 'owner/avatar.png', 'fresh')]);
  const items = await readRecentWorks(principal, 10);
  expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(createSignedAssetUrls).toHaveBeenCalledWith('uploads', ['owner/avatar.png'], 900);
  expect(items.map((x) => x.id)).toEqual(['owned-upload', 'live-generated', 'public']);
  expect(items[0].url).toContain('token=fresh');
  expect(items[0].expiresAt).toBeDefined();
  expect(items[1].url).toBe(live);
  expect(items[1].expiresAt).toBeUndefined();
});

test('does not sign a forged, expired or other-user path even with trusted-looking row metadata', async () => {
  rows([
    row('forged-server', link('media', 'victim/secret.mp4', 'forged'), { source: 'server', storage_verified: true }),
    row('expired-manual', link('media', 'victim/old.mp4', 'expired'), { source: 'manual-save', storage_verified: true }),
    row('foreign-upload', link('uploads', 'other/private.png', 'forged')),
    row('private-bucket', link('twins', 'secret.wav', 'forged')),
  ]);
  (verifyFileableUrl as jest.Mock).mockResolvedValue({ ok: false, reason: 'not_readable' });
  expect(await readRecentWorks(principal, 10)).toEqual([]);
  expect(createSignedAssetUrls).not.toHaveBeenCalled();
});

test('rejects a purportedly valid grant when verification identifies a different object', async () => {
  rows([row('repointed', link('media', 'victim/secret.mp4', 'valid'))]);
  (verifyFileableUrl as jest.Mock).mockResolvedValue({ ok: true, kind: 'own-signed', bucket: 'media', path: 'owner/own.mp4' });
  expect(await readRecentWorks(principal, 10)).toEqual([]);
  expect(createSignedAssetUrls).not.toHaveBeenCalled();
});

test('does not return a stale link when signing an owned upload fails', async () => {
  rows([row('owned-upload', link('uploads', 'owner/avatar.png'))]);
  (createSignedAssetUrls as jest.Mock).mockResolvedValue([]);
  expect(await readRecentWorks(principal, 10)).toEqual([]);
});
