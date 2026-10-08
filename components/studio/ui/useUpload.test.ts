/**
 * uploadFileToStorage — the browser leg of the upload policy: only images / video / audio, typed from the file name when
 * the browser left `type` empty, size declared to the sign route, and the bytes PUT with the type the route approved.
 */
const mockPut = jest.fn();
jest.mock('../../../lib/supabase/browser', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => mockPut(...a) }) } }),
}));

import { uploadErrorText, uploadFileToStorage } from './useUpload';

const realFetch = global.fetch;
let signCalls: Array<Record<string, unknown>> = [];
let signStatus = 200;

beforeEach(() => {
  signCalls = [];
  signStatus = 200;
  mockPut.mockReset().mockResolvedValue({ error: null });
  global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    signCalls.push(body);
    return {
      status: signStatus,
      ok: signStatus === 200,
      json: async () => ({ bucket: 'uploads', path: 'omni-uploads/u1/1-a.mov', token: 'tok', contentType: body.contentType }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterAll(() => { global.fetch = realFetch; });

const file = (name: string, type: string, size = 10) => {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

test('a .mov the browser could not type is sent as video/quicktime, with its size, and PUT with that type', async () => {
  await expect(uploadFileToStorage(file('beach.mov', '', 12_000_000))).resolves.toEqual({ path: 'omni-uploads/u1/1-a.mov' });
  expect(signCalls).toEqual([{ contentType: 'video/quicktime', size: 12_000_000, name: 'beach.mov' }]);
  expect(mockPut.mock.calls[0][3]).toEqual({ contentType: 'video/quicktime' });
});

test('a non-media file is refused before any request, with its own message', async () => {
  await expect(uploadFileToStorage(file('page.html', 'text/html'))).resolves.toEqual({ error: 'type' });
  expect(signCalls).toEqual([]);
  expect(uploadErrorText('type', 'en')).toMatch(/not supported/);
});

test('over 50 MB is refused before any request', async () => {
  await expect(uploadFileToStorage(file('big.mp4', 'video/mp4', 50 * 1024 * 1024 + 1))).resolves.toEqual({ error: 'too-large' });
  expect(signCalls).toEqual([]);
});

test('the route’s 413 / 415 read as too-large / type, not as a broken file', async () => {
  signStatus = 413;
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'))).resolves.toEqual({ error: 'too-large' });
  signStatus = 415;
  await expect(uploadFileToStorage(file('a.mp4', 'video/mp4'))).resolves.toEqual({ error: 'type' });
});
