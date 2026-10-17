/** @jest-environment node */
// renewLibraryLink: a fresh link for a Library media object of OUR project that a server-kept record names (a film's
// delivered stitch, read back for a scene redo). The fake service client signs anything it is asked for, so every link
// handed back untouched below was left alone by the guard, not by a missing object.
jest.mock('server-only', () => ({}));

const signed: Array<{ bucket: string; path: string; ttl: number }> = [];
let failSigning = false;
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, ttl: number) => {
          if (failSigning) return { data: null, error: { message: 'down' } };
          signed.push({ bucket, path, ttl });
          return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=MINTED` }, error: null };
        },
      }),
    },
  }),
}));

import { renewLibraryLink } from './storage-adapter';
import { TWIN_PRIVATE_BUCKET } from '../avatar/twinStorage';

const env = { SUPABASE_URL: 'https://proj.supabase.co' } as unknown as NodeJS.ProcessEnv;
const ours = (bucket: string, path: string) => `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=EXPIRED`;

beforeEach(() => {
  signed.length = 0;
  failSigning = false;
});

test('an expired link to a film’s narration (renders) gets a fresh one for the same object', async () => {
  await expect(renewLibraryLink(ours('renders', 'film-vo/abc.mp3'), 900, env)).resolves.toBe(
    'https://proj.supabase.co/storage/v1/object/sign/renders/film-vo/abc.mp3?token=MINTED',
  );
  expect(signed).toEqual([{ bucket: 'renders', path: 'film-vo/abc.mp3', ttl: 900 }]);
  await expect(renewLibraryLink(ours('uploads', 'u1/music.mp3'), 900, env)).resolves.toMatch(/token=MINTED$/);
});

test('anything that is not a signed Library link of our project comes back as given, and nothing is signed', async () => {
  const left = [
    'https://clips.example/1.mp4',
    `https://other.supabase.co/storage/v1/object/sign/renders/x.mp4?token=t`,
    'https://proj.supabase.co/storage/v1/object/public/renders/x.mp4',
    ours(TWIN_PRIVATE_BUCKET, 'u1/voice.webm'),
    ours('avatars', 'u1/face.png'),
    ours('job-artifacts', 'editing-output/u1/x.mp4'),
    'not a url',
  ];
  for (const u of left) await expect(renewLibraryLink(u, 900, env)).resolves.toBe(u);
  expect(signed).toEqual([]);
});

test('a link that cannot be signed right now is handed back as it was', async () => {
  failSigning = true;
  const u = ours('renders', 'film-vo/abc.mp3');
  await expect(renewLibraryLink(u, 900, env)).resolves.toBe(u);
});
