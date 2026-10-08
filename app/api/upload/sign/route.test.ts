/** @jest-environment node */
/**
 * POST /api/upload/sign — mints a service-role upload token only for images, video and audio, and refuses a declared
 * size over the 50 MB cap. It used to sign ANY content type at any size.
 */
let mockUser: { id: string } | null = { id: 'u1' };
const mockSignedPaths: string[] = [];
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { WRITE: {} } }));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ user: mockUser }),
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          mockSignedPaths.push(path);
          return { data: { token: 'tok', signedUrl: `https://p.supabase.co/upload/${path}` }, error: null };
        },
      }),
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/upload/sign', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockSignedPaths.length = 0;
});

test('signed out → 401, nothing signed', async () => {
  mockUser = null;
  expect((await POST(req({ contentType: 'video/mp4' }))).status).toBe(401);
  expect(mockSignedPaths).toEqual([]);
});

test.each(['text/html', 'image/svg+xml', 'application/javascript', 'application/zip', 'application/octet-stream', ''])(
  '%s → 415, no token minted',
  async (contentType) => {
    const res = await POST(req({ contentType }));
    expect(res.status).toBe(415);
    expect(mockSignedPaths).toEqual([]);
  },
);

test('a declared size over 50 MB → 413, no token minted', async () => {
  const res = await POST(req({ contentType: 'video/mp4', size: 50 * 1024 * 1024 + 1 }));
  expect(res.status).toBe(413);
  expect(mockSignedPaths).toEqual([]);
});

test('a video within the cap gets an owner-scoped token and the type to PUT with', async () => {
  const res = await POST(req({ contentType: 'video/quicktime', size: 12_000_000, name: 'beach.mov' }));
  expect(res.status).toBe(200);
  const j = (await res.json()) as { bucket: string; path: string; token: string; contentType: string };
  expect(j).toMatchObject({ bucket: 'uploads', token: 'tok', contentType: 'video/quicktime' });
  expect(j.path).toMatch(/^omni-uploads\/u1\/\d+-[a-z0-9]+\.mov$/);
});

test('an untyped file is typed from its name (a .heic from Chrome arrives with no type)', async () => {
  const res = await POST(req({ contentType: '', name: 'IMG_0001.HEIC', size: 2_000_000 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ contentType: 'image/heic' });
  expect(mockSignedPaths[0]).toMatch(/\.heic$/);
});

test('an older client that sends no size still works (the bucket enforces the cap on the PUT)', async () => {
  expect((await POST(req({ contentType: 'audio/mpeg' }))).status).toBe(200);
});
