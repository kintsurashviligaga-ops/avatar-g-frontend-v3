/** @jest-environment node */
/**
 * POST /api/upload/verify — the chat marks an attachment Ready only when the STORED bytes can be the kind attached.
 * A mismatch or an oversize object is refused and removed (no orphan); someone else's path is never read.
 */
let mockUser: { id: string } | null = { id: 'u1' };
const mockRemoved: string[][] = [];
let mockSignError: unknown = null;
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { READ: {} } }));
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ user: mockUser }),
  createServiceRoleClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => (mockSignError
          ? { data: null, error: mockSignError }
          : { data: { signedUrl: `https://p.supabase.co/storage/v1/object/sign/uploads/${path}?token=t` }, error: null }),
        remove: async (paths: string[]) => { mockRemoved.push(paths); return { data: [], error: null }; },
      }),
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/upload/verify', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const MP4 = hex('000000206674797069736f6d00000200');
const MP3 = hex('49443304000000000023545353450000');

let fetchMock: jest.Mock;
const answer = (bytes: Uint8Array, total: number, status = 206) =>
  fetchMock.mockResolvedValueOnce(new Response(bytes, { status, headers: { 'content-range': `bytes 0-${bytes.length - 1}/${total}` } }));

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockRemoved.length = 0;
  mockSignError = null;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

test('signed out → 401; someone else\'s folder → 403, nothing read', async () => {
  mockUser = null;
  expect((await POST(req({ path: 'omni-uploads/u1/a.mp4', kind: 'video' }))).status).toBe(401);
  mockUser = { id: 'u1' };
  expect((await POST(req({ path: 'omni-uploads/u2/a.mp4', kind: 'video' }))).status).toBe(403);
  expect((await POST(req({ path: 'omni-uploads/u1/../u2/a.mp4', kind: 'video' }))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a bad body → 400', async () => {
  expect((await POST(req({ path: 'omni-uploads/u1/a.mp4', kind: 'pdf' }))).status).toBe(400);
  expect((await POST(req({ kind: 'video' }))).status).toBe(400);
});

test('a real clip is Ready: format and full size from the range answer, only the head requested', async () => {
  answer(MP4, 14_400_000);
  const res = await POST(req({ path: 'omni-uploads/u1/171-a.mp4', kind: 'video' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, path: 'omni-uploads/u1/171-a.mp4', kind: 'video', format: 'mp4', size: 14_400_000 });
  expect(fetchMock.mock.calls[0]![1].headers.Range).toBe('bytes=0-4095');
  expect(mockRemoved).toEqual([]);
});

test('an MP3 is Ready as audio', async () => {
  answer(MP3, 721_000);
  const res = await POST(req({ path: 'omni-uploads/u1/171-t.mp3', kind: 'audio' }));
  expect((await res.json()).format).toBe('mp3');
});

test('bytes that cannot be the attached kind → 422 and the object is removed', async () => {
  answer(new TextEncoder().encode('<!DOCTYPE html><html>not a video</html>'), 40);
  const res = await POST(req({ path: 'omni-uploads/u1/171-x.mp4', kind: 'video' }));
  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({ error: 'content_mismatch', format: null });
  expect(mockRemoved).toEqual([['omni-uploads/u1/171-x.mp4']]);
});

test('an MP3 attached as video → 422, removed', async () => {
  answer(MP3, 721_000);
  const res = await POST(req({ path: 'omni-uploads/u1/171-y.mp4', kind: 'video' }));
  expect(res.status).toBe(422);
  expect(mockRemoved).toEqual([['omni-uploads/u1/171-y.mp4']]);
});

test('over the 50 MB cap → 413, removed', async () => {
  answer(MP4, 60 * 1024 * 1024);
  const res = await POST(req({ path: 'omni-uploads/u1/171-big.mp4', kind: 'video' }));
  expect(res.status).toBe(413);
  expect(mockRemoved).toEqual([['omni-uploads/u1/171-big.mp4']]);
});

test('an upload that never landed → 404, nothing removed', async () => {
  mockSignError = { message: 'Object not found' };
  expect((await POST(req({ path: 'omni-uploads/u1/171-none.mp4', kind: 'video' }))).status).toBe(404);
  expect(mockRemoved).toEqual([]);
});

test('a server that ignores Range (200) is still read from its head only', async () => {
  const big = new Uint8Array(200_000);
  big.set(MP4, 0);
  fetchMock.mockResolvedValueOnce(new Response(big, { status: 200, headers: { 'content-length': String(big.length) } }));
  const res = await POST(req({ path: 'omni-uploads/u1/171-c.mp4', kind: 'video' }));
  expect(await res.json()).toMatchObject({ ok: true, size: 200_000 });
});
