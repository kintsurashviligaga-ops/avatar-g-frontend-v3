/** @jest-environment node */
/**
 * POST /api/upload — the data-URL upload stores images, video and audio only (415 otherwise), at most 50 MB (413).
 * It used to store any content type the client named, up to 60 MB.
 */
let mockUser: { id: string } | null = { id: 'u1' };
const mockStored: Array<{ bucket: string; path: string; contentType: string }> = [];
jest.mock('../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ user: mockUser }) }));
jest.mock('../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: async (bucket: string, path: string, _b64: string, contentType: string) => {
    mockStored.push({ bucket, path, contentType });
    return `https://p.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`;
  },
}));
// A 50 MB body is too heavy to build in a unit test: shrink the cap, keep everything else real.
jest.mock('../../../lib/uploads/policy', () => ({ ...jest.requireActual('../../../lib/uploads/policy'), UPLOAD_MAX_BYTES: 30 }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const req = (body: unknown) =>
  new NextRequest('https://myavatar.ge/api/upload', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const b64 = (n: number) => Buffer.alloc(n, 1).toString('base64');

beforeEach(() => {
  mockUser = { id: 'u1' };
  mockStored.length = 0;
});

test('signed out → 401', async () => {
  mockUser = null;
  expect((await POST(req({ dataUrl: `data:image/png;base64,${b64(4)}` }))).status).toBe(401);
});

test.each([
  ['data:text/html;base64,', undefined],
  ['data:image/svg+xml;base64,', undefined],
  ['data:application/octet-stream;base64,', undefined],
  ['data:image/png;base64,', 'text/html'],
])('%s (claimed %s) → 415, nothing stored', async (head, contentType) => {
  const res = await POST(req({ dataUrl: `${head}${b64(4)}`, contentType }));
  expect(res.status).toBe(415);
  expect(mockStored).toEqual([]);
});

test('over the cap → 413, nothing stored', async () => {
  const res = await POST(req({ dataUrl: `data:video/mp4;base64,${b64(31)}` }));
  expect(res.status).toBe(413);
  expect(mockStored).toEqual([]);
});

test('a video within the cap is stored owner-scoped under its own type', async () => {
  const res = await POST(req({ dataUrl: `data:video/quicktime;base64,${b64(30)}` }));
  expect(res.status).toBe(200);
  expect(mockStored).toEqual([{ bucket: 'uploads', path: expect.stringMatching(/^u1\/\d+-[a-z0-9]+\.mov$/), contentType: 'video/quicktime' }]);
});
