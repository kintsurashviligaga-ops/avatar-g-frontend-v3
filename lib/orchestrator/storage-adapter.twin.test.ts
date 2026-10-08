/** @jest-environment node */
// The generic signers never mint a URL for the private twin bucket — whatever shape the caller's input took.
// The fake service client signs ANY object it is asked for (as if it existed), so a null below can only come
// from the deny-list, not from a missing object.
jest.mock('server-only', () => ({}));

const signed: Array<{ bucket: string; path: string }> = [];
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string) => {
          signed.push({ bucket, path });
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=MINTED` }, error: null };
        },
        createSignedUrls: async (paths: string[]) => {
          for (const path of paths) signed.push({ bucket, path });
          return { data: paths.map((p) => ({ path: p, signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=MINTED` })), error: null };
        },
      }),
    },
  }),
}));

import { createSignedAssetUrl, createSignedAssetUrls, reSignIfInternal } from './storage-adapter';
import { TWIN_PRIVATE_BUCKET, twinVoicePath } from '../avatar/twinStorage';

const VICTIM = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VOICE = twinVoicePath(VICTIM, 'webm');

beforeEach(() => {
  signed.length = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sanity: an ordinary object IS signed (the fake signs anything — so the refusals below are the guard)', async () => {
  await expect(createSignedAssetUrl('uploads', 'audio-studio/1-abc.mp3')).resolves.toMatch(/token=MINTED/);
  expect(signed).toEqual([{ bucket: 'uploads', path: 'audio-studio/1-abc.mp3' }]);
});

test('createSignedAssetUrl refuses the twin bucket', async () => {
  await expect(createSignedAssetUrl(TWIN_PRIVATE_BUCKET, VOICE, 3600)).resolves.toBeNull();
  await expect(createSignedAssetUrl(` ${TWIN_PRIVATE_BUCKET.toUpperCase()} `, VOICE)).resolves.toBeNull();
  expect(signed).toEqual([]);
});

test('createSignedAssetUrls (the library re-sign) refuses the twin bucket, keeping one null per path', async () => {
  await expect(createSignedAssetUrls(TWIN_PRIVATE_BUCKET, [VOICE, twinVoicePath(VICTIM, 'm4a')])).resolves.toEqual([null, null]);
  expect(signed).toEqual([]);
});

test('reSignIfInternal never re-signs a client-supplied twin URL (any project host, signed or public, encoded)', async () => {
  const urls = [
    `https://zwksnayk.supabase.co/storage/v1/object/sign/${TWIN_PRIVATE_BUCKET}/${VOICE}?token=forged`,
    `https://anything.supabase.co/storage/v1/object/public/${TWIN_PRIVATE_BUCKET}/${VOICE}`,
    `https://zwksnayk.supabase.co/storage/v1/object/sign/tw%69ns/${VOICE}`,
  ];
  for (const u of urls) await expect(reSignIfInternal(u, 3600)).resolves.toBe(u); // handed back untouched, no token minted
  expect(signed).toEqual([]);
});

test('reSignIfInternal signs only OUR project host: another tenant’s URL never mints a link to our object at that path', async () => {
  const saved = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  try {
    const foreign = 'https://other.supabase.co/storage/v1/object/sign/uploads/omni-uploads/u/1.png?token=x';
    await expect(reSignIfInternal(foreign, 3600)).resolves.toBe(foreign);
    expect(signed).toEqual([]);
    await expect(reSignIfInternal('https://proj.supabase.co/storage/v1/object/sign/uploads/omni-uploads/u/1.png?token=x', 3600)).resolves.toMatch(/token=MINTED/);
    expect(signed).toEqual([{ bucket: 'uploads', path: 'omni-uploads/u/1.png' }]);
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved;
  }
});

test('reSignIfInternal never turns a public-shaped URL into a signed link (a guessed private path stays dead)', async () => {
  const saved = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  try {
    const pub = 'https://proj.supabase.co/storage/v1/object/public/uploads/omni-uploads/victim/1.png';
    await expect(reSignIfInternal(pub, 3600)).resolves.toBe(pub);
    expect(signed).toEqual([]);
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = saved;
  }
});
