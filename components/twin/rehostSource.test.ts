/** @jest-environment node */
/**
 * The re-host read behind the "My twin" card: a lapsed signed URL (storage answers 400 with JSON) or a deleted twin must
 * surface as an error — never be re-hosted as the face of a paid render.
 */
import { RehostSourceError, fetchRehostSource, isTwinSignedUrl } from './rehostSource';

const TWIN_URL = 'https://proj.supabase.co/storage/v1/object/sign/twins/twins/u/twin-0123456789abcdef/front.jpg?token=T';

const answer = (status: number, body: BlobPart, type: string) =>
  jest.fn(async () => new Response(new Blob([body], { type }), { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

test('a 2xx image is returned as-is', async () => {
  const blob = await fetchRehostSource(TWIN_URL, 'image/jpeg', answer(200, new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'));
  expect(blob.type).toBe('image/jpeg');
  expect(blob.size).toBe(3);
});

test('⚠️ an expired signed URL (400 + JSON) is a status error, not a face', async () => {
  const f = answer(400, JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: '"exp" claim timestamp check failed' }), 'application/json');
  await expect(fetchRehostSource(TWIN_URL, 'image/jpeg', f)).rejects.toMatchObject({ name: 'RehostSourceError', reason: 'status', status: 400 });
});

test('a deleted twin (404) is a status error', async () => {
  await expect(fetchRehostSource(TWIN_URL, 'image/jpeg', answer(404, '{"error":"not_found"}', 'application/json'))).rejects.toBeInstanceOf(RehostSourceError);
});

test('a 200 whose body is JSON or HTML where an image was expected is a type error', async () => {
  await expect(fetchRehostSource(TWIN_URL, 'image/jpeg', answer(200, '{}', 'application/json'))).rejects.toMatchObject({ reason: 'type' });
  await expect(fetchRehostSource('/presets/a.jpg', 'image/jpeg', answer(200, '<html>', 'text/html; charset=utf-8'))).rejects.toMatchObject({ reason: 'type' });
});

test('a data: URL of the right kind passes; an untyped body is let through (nothing to judge it by)', async () => {
  await expect(fetchRehostSource('data:audio/mpeg;base64,AAAA', 'audio/mpeg')).resolves.toMatchObject({ type: 'audio/mpeg' });
  const untyped = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob([new Uint8Array(4)]) })) as unknown as typeof fetch;
  await expect(fetchRehostSource(TWIN_URL, 'image/jpeg', untyped)).resolves.toBeInstanceOf(Blob);
});

test('only signed URLs into the private twins bucket count as the twin face', () => {
  expect(isTwinSignedUrl(TWIN_URL)).toBe(true);
  expect(isTwinSignedUrl('/avatar-presets/anna.jpg')).toBe(false);
  expect(isTwinSignedUrl('https://proj.supabase.co/storage/v1/object/sign/uploads/x.jpg?token=T')).toBe(false);
  expect(isTwinSignedUrl(null)).toBe(false);
});
