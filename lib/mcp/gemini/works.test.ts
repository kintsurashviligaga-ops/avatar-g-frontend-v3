import { createClient } from '@supabase/supabase-js';
import { createSignedAssetUrls, provenOwnSignedLink } from '../../orchestrator/storage-adapter';
import { readRecentWorks } from './works';

jest.mock('server-only', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../env/public', () => ({ publicEnv: { NEXT_PUBLIC_SUPABASE_URL: 'https://own.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } }));
jest.mock('../../orchestrator/storage-adapter', () => ({
  createSignedAssetUrls: jest.fn(),
  provenOwnSignedLink: jest.fn(),
  ownStorageHosts: () => new Set(['own.supabase.co']),
  libraryMediaBuckets: () => new Set(['media']),
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

beforeEach(() => jest.resetAllMocks());

test('owner-scoped rows return freshly signed links, with no stale or unowned links', async () => {
  const q = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), order: jest.fn(), limit: jest.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.neq.mockReturnValue(q); q.order.mockReturnValue(q);
  q.limit.mockResolvedValue({ data: [
    row('owned', 'https://own.supabase.co/storage/v1/object/sign/media/owned.mp4?token=old'),
    row('failed', 'https://own.supabase.co/storage/v1/object/sign/media/missing.mp4?token=old'),
    row('other', 'https://own.supabase.co/storage/v1/object/sign/media/other.mp4?token=old', {}, 'other'),
    row('manual', 'https://own.supabase.co/storage/v1/object/sign/media/manual.mp4?token=forged', { source: 'manual-save' }),
    row('private-bucket', 'https://own.supabase.co/storage/v1/object/sign/twins/private.mp4?token=old'),
    row('private-ip', 'http://127.0.0.1/secret'),
    row('public', 'https://cdn.example.com/asset.mp4'),
  ], error: null });
  (createClient as jest.Mock).mockReturnValue({ from: () => q });
  (provenOwnSignedLink as jest.Mock).mockResolvedValue(false);
  (createSignedAssetUrls as jest.Mock).mockResolvedValue(['https://own.supabase.co/storage/v1/object/sign/media/owned.mp4?token=fresh', null]);
  const items = await readRecentWorks(principal, 10);
  expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ global: { headers: { Authorization: 'Bearer user-token' } } }));
  expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(createSignedAssetUrls).toHaveBeenCalledWith('media', ['owned.mp4', 'missing.mp4'], 900);
  expect(items.map((x) => x.id)).toEqual(['owned', 'public']);
  expect(items[0].url).toContain('token=fresh');
  expect(items[0].expiresAt).toBeDefined();
  expect(JSON.stringify(items)).not.toContain('token=old');
});

test('legacy manual saves are signed only after proof of the original link', async () => {
  const q = { select: jest.fn(), eq: jest.fn(), neq: jest.fn(), order: jest.fn(), limit: jest.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.neq.mockReturnValue(q); q.order.mockReturnValue(q);
  q.limit.mockResolvedValue({ data: [row('manual', 'https://own.supabase.co/storage/v1/object/sign/media/verified.mp4?token=valid', { source: 'manual-save' })], error: null });
  (createClient as jest.Mock).mockReturnValue({ from: () => q });
  (provenOwnSignedLink as jest.Mock).mockResolvedValue(true);
  (createSignedAssetUrls as jest.Mock).mockResolvedValue(['https://own.supabase.co/storage/v1/object/sign/media/verified.mp4?token=fresh']);
  const items = await readRecentWorks(principal, 1);
  expect(provenOwnSignedLink).toHaveBeenCalledTimes(1);
  expect(items[0].url).toContain('token=fresh');
});
