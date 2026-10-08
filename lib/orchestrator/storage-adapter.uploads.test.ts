/** @jest-environment node */
/**
 * storage-adapter vs the capped `uploads` bucket (migration 20261008c): server writes are typed from their path when a
 * provider answered octet-stream (the bucket only takes media types), and the "raise the size limit" self-heal never
 * touches the user-upload bucket — it would silently undo the 50 MB cap for every signed browser upload.
 */
jest.mock('server-only', () => ({}));

const mockUploads: Array<{ bucket: string; path: string; contentType: string }> = [];
const mockUpdates: Array<{ bucket: string; opts: unknown }> = [];
let mockUploadError: string | null = null;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    storage: {
      createBucket: async () => ({ error: { message: 'The resource already exists' } }),
      updateBucket: async (bucket: string, opts: unknown) => { mockUpdates.push({ bucket, opts }); return { error: null }; },
      from: (bucket: string) => ({
        upload: async (path: string, _b: unknown, o: { contentType: string }) => {
          mockUploads.push({ bucket, path, contentType: o.contentType });
          return { error: mockUploadError ? { message: mockUploadError } : null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://p.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }),
      }),
    },
  }),
}));

import { isUserUploadBucket, uploadAndSign, uploadBufferAndSign, __resetKnownBuckets } from './storage-adapter';

beforeEach(() => {
  mockUploads.length = 0;
  mockUpdates.length = 0;
  mockUploadError = null;
  __resetKnownBuckets();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('isUserUploadBucket follows UPLOAD_BUCKET, defaulting to uploads', () => {
  expect(isUserUploadBucket('uploads', {} as NodeJS.ProcessEnv)).toBe(true);
  expect(isUserUploadBucket('renders', {} as NodeJS.ProcessEnv)).toBe(false);
  expect(isUserUploadBucket('media-in', { UPLOAD_BUCKET: 'media-in' } as NodeJS.ProcessEnv)).toBe(true);
  expect(isUserUploadBucket('uploads', { UPLOAD_BUCKET: 'media-in' } as NodeJS.ProcessEnv)).toBe(false);
});

test('a provider octet-stream is stored under the type its path names; parameters are dropped', async () => {
  await uploadAndSign('uploads', 'music/a.mp3', 'AAAA', 'application/octet-stream');
  await uploadAndSign('uploads', 'rec/b.webm', 'AAAA', 'audio/webm;codecs=opus');
  await uploadBufferAndSign('uploads', 'img/c.png', Buffer.from('x'), 'binary/octet-stream');
  expect(mockUploads.map((u) => u.contentType)).toEqual(['audio/mpeg', 'audio/webm', 'image/png']);
});

test('a size rejection on the user-upload bucket is NOT "healed" by raising its limit', async () => {
  mockUploadError = 'The object exceeded the maximum allowed size';
  await expect(uploadBufferAndSign('uploads', 'x/big.mp4', Buffer.from('x'), 'video/mp4')).resolves.toBeNull();
  expect(mockUpdates).toEqual([]);
});

test('the renders bucket still self-heals a too-small limit', async () => {
  mockUploadError = 'The object exceeded the maximum allowed size';
  await uploadBufferAndSign('renders', 'x/big.mp4', Buffer.from('x'), 'video/mp4');
  expect(mockUpdates.length).toBeGreaterThan(0);
  expect(mockUpdates.every((u) => u.bucket === 'renders')).toBe(true);
});
