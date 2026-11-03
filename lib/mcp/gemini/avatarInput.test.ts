/** @jest-environment node */
import { resolveOwnedAvatarInput } from './avatarInput';

jest.mock('server-only', () => ({}));
jest.mock('../../env/public', () => ({ publicEnv: {} }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const avatarId = '33333333-3333-4333-8333-333333333333';
const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', UPLOAD_BUCKET: 'uploads' };
const media = (path: string) => `https://project.supabase.co/storage/v1/object/sign/uploads/${path}?token=do-not-return`;
const row = (overrides: Record<string, unknown> = {}) => ({ id: avatarId, owner_id: userId, preview_image_url: media(`${userId}/avatar.png`), ...overrides });
const resolve = (value: unknown) => resolveOwnedAvatarInput(avatarId, userId, async () => value, env);

test('accepts only an own-project, owner-prefixed upload and returns no URL token', async () => {
  expect(await resolve(row())).toEqual({ bucket: 'uploads', path: `${userId}/avatar.png` });
  expect(await resolve(row({ owner_id: undefined, user_id: userId }))).toEqual({ bucket: 'uploads', path: `${userId}/avatar.png` });
});

test('requires verified matching identity and rejects contradictory owner columns', async () => {
  expect(await resolve(row({ owner_id: otherId }))).toBeNull();
  expect(await resolve(row({ user_id: otherId }))).toBeNull();
  expect(await resolve(row({ user_id: 42 }))).toBeNull();
  expect(await resolve(row({ owner_id: null }))).toBeNull();
  expect(await resolve(row({ id: otherId }))).toBeNull();
  const load = jest.fn();
  expect(await resolveOwnedAvatarInput('invalid', userId, load, env)).toBeNull();
  expect(load).not.toHaveBeenCalled();
});

test.each([
  media(`${otherId}/avatar.png`),
  'https://other.supabase.co/storage/v1/object/sign/uploads/11111111-1111-4111-8111-111111111111/avatar.png',
  'https://project.supabase.co/storage/v1/object/sign/renders/11111111-1111-4111-8111-111111111111/avatar.png',
  'http://project.supabase.co/storage/v1/object/sign/uploads/11111111-1111-4111-8111-111111111111/avatar.png',
  'https://user:password@project.supabase.co/storage/v1/object/sign/uploads/11111111-1111-4111-8111-111111111111/avatar.png',
  'https://example.com/avatar.png',
  'data:image/png;base64,AAAA',
  media(`${userId}/%2e%2e/other.png`),
])('rejects untrusted avatar image reference %#', async (preview_image_url) => {
  expect(await resolve(row({ preview_image_url }))).toBeNull();
});

test('fails closed when the authenticated lookup fails', async () => {
  expect(await resolveOwnedAvatarInput(avatarId, userId, async () => { throw new Error('unavailable'); }, env)).toBeNull();
});
