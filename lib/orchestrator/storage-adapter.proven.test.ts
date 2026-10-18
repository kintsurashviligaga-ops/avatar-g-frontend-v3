/** @jest-environment node */
// provenOwnSignedLink: did OUR storage mint this signed link for exactly the object it names, even if it has expired?
// (The Library re-signs a legacy manual save only on this proof.) Storage itself is the network here, mocked per test.
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

import { provenOwnSignedLink } from './storage-adapter';
import { TWIN_PRIVATE_BUCKET } from '../avatar/twinStorage';

const env = { SUPABASE_URL: 'https://proj.supabase.co' } as unknown as NodeJS.ProcessEnv;
const jwt = (claims: Record<string, unknown>) => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.c2ln`;
};
const link = (bucket: string, path: string, claimUrl = `${bucket}/${path}`, host = 'https://proj.supabase.co') =>
  `${host}/storage/v1/object/sign/${bucket}/${path}?token=${jwt({ url: claimUrl, iat: 1, exp: 2 })}`;
const answer = (status: number, body?: unknown) => jest.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
const EXPIRED = { statusCode: '400', error: 'InvalidJWT', message: '"exp" claim timestamp check failed' };

test('an expired link minted for its own object is proven (storage checked the signature before the age)', async () => {
  const fetchImpl = answer(400, EXPIRED);
  await expect(provenOwnSignedLink(link('uploads', 'remix/dub-1-a.mp4'), { env, fetchImpl })).resolves.toBe(true);
  expect(fetchImpl).toHaveBeenCalledWith(link('uploads', 'remix/dub-1-a.mp4'), expect.objectContaining({ headers: { Range: 'bytes=0-0' } }));
});

test('a link storage still honours is proven; a percent-encoded path matches its decoded claim', async () => {
  await expect(provenOwnSignedLink(link('renders', 'films/a%20b.mp4', 'renders/films/a b.mp4'), { env, fetchImpl: answer(206) })).resolves.toBe(true);
});

test('a forged token, a token for another object, or any other refusal proves nothing', async () => {
  await expect(provenOwnSignedLink(link('uploads', 'x.mp4'), { env, fetchImpl: answer(400, { error: 'InvalidSignature', message: 'signature verification failed' }) })).resolves.toBe(false);
  await expect(provenOwnSignedLink(link('uploads', 'victim.mp4', 'uploads/mine.mp4'), { env, fetchImpl: answer(400, EXPIRED) })).resolves.toBe(false);
  await expect(provenOwnSignedLink(link('uploads', 'x.mp4'), { env, fetchImpl: answer(404) })).resolves.toBe(false);
  await expect(provenOwnSignedLink(link('uploads', 'x.mp4'), { env, fetchImpl: jest.fn(async () => { throw new Error('ECONNRESET'); }) })).resolves.toBe(false);
});

test('never probed: not our host, not a media bucket, the twin bucket, public, no token, not a JWT', async () => {
  const fetchImpl = answer(400, EXPIRED);
  const refused = [
    link('uploads', 'x.mp4', undefined, 'https://other.supabase.co'),
    link('avatars', 'u/face.jpg'),
    link(TWIN_PRIVATE_BUCKET, 'u/voice.webm'),
    link('job-artifacts', 'editing-output/x.mp4'),
    'https://proj.supabase.co/storage/v1/object/public/uploads/x.mp4',
    'https://proj.supabase.co/storage/v1/object/sign/uploads/x.mp4',
    'https://proj.supabase.co/storage/v1/object/sign/uploads/x.mp4?token=OLD',
    'https://cdn.example.com/x.mp4',
  ];
  for (const u of refused) await expect(provenOwnSignedLink(u, { env, fetchImpl })).resolves.toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
});
