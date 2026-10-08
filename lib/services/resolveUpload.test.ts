/** @jest-environment node */
// resolveUploadRef signs a bare upload path with the service role, so only the caller's own path is signed.
jest.mock('server-only', () => ({}));
jest.mock('../orchestrator/storage-adapter', () => ({
  createSignedAssetUrl: jest.fn(async (bucket: string, path: string) => `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`),
}));

import { resolveUploadRef } from './resolveUpload';
import { createSignedAssetUrl } from '../orchestrator/storage-adapter';

const ME = '11111111-2222-4333-8444-555555555555';

beforeEach(() => jest.clearAllMocks());

test('the caller’s own upload path is signed for the requested lifetime', async () => {
  await expect(resolveUploadRef(`omni-uploads/${ME}/clip.mp4`, ME, 604_800)).resolves.toMatch(/token=t$/);
  expect(createSignedAssetUrl).toHaveBeenCalledWith('uploads', `omni-uploads/${ME}/clip.mp4`, 604_800);
});

test('another account’s path comes back unsigned, for the validator to refuse', async () => {
  for (const p of ['omni-uploads/someone-else/clip.mp4', 'someone-else/clip.mp4', 'clips/1.mp4']) {
    await expect(resolveUploadRef(p, ME)).resolves.toBe(p);
  }
  expect(createSignedAssetUrl).not.toHaveBeenCalled();
});

test('anything with a scheme is handed back untouched; empty is empty', async () => {
  for (const v of ['https://cdn.example.com/a.mp4', 'data:video/mp4;base64,AA', 'file:///etc/passwd']) {
    await expect(resolveUploadRef(v, ME)).resolves.toBe(v);
  }
  await expect(resolveUploadRef('', ME)).resolves.toBe('');
  await expect(resolveUploadRef(42, ME)).resolves.toBe('');
  expect(createSignedAssetUrl).not.toHaveBeenCalled();
});
