/** @jest-environment node */
import { MediaRefError, REFERENCE_URL_TTL_SEC, resolveStudioMedia, type Signer } from './media';

const ME = '11111111-1111-4111-8111-111111111111';
const signed: Array<{ path: string; ttl: number }> = [];
const sign: Signer = async (path, ttl) => { signed.push({ path, ttl }); return `https://proj.supabase.co/storage/v1/object/sign/uploads/${path}?token=t`; };

beforeEach(() => { signed.length = 0; });

describe('resolveStudioMedia — the caller’s own uploads become signed URLs, nothing else changes', () => {
  test('single and list media fields holding my paths are signed; URLs and other fields pass through', async () => {
    const out = (await resolveStudioMedia({
      prompt: 'ზღვა',
      image_url: `omni-uploads/${ME}/a.jpg`,
      video_url: 'https://cdn.example.com/v.mp4',
      image_urls: [`omni-uploads/${ME}/b.png`, 'https://cdn.example.com/c.jpg'],
      duration: 5,
    }, ME, sign)) as Record<string, unknown>;
    expect(out.prompt).toBe('ზღვა');
    expect(out.duration).toBe(5);
    expect(out.image_url).toMatch(/^https:\/\/proj\.supabase\.co\/.*a\.jpg\?token=t$/);
    expect(out.video_url).toBe('https://cdn.example.com/v.mp4');
    expect(out.image_urls).toEqual([expect.stringMatching(/b\.png\?token=t$/), 'https://cdn.example.com/c.jpg']);
    expect(signed.map((s) => s.ttl)).toEqual([REFERENCE_URL_TTL_SEC, REFERENCE_URL_TTL_SEC]);
  });

  test('ANOTHER user’s upload path is refused, never signed', async () => {
    const theirs = 'omni-uploads/22222222-2222-4222-8222-222222222222/secret.jpg';
    await expect(resolveStudioMedia({ image_url: theirs }, ME, sign)).rejects.toMatchObject({ field: 'image_url', reason: 'not_owner' });
    await expect(resolveStudioMedia({ image_urls: ['https://x/1.jpg', theirs] }, ME, sign)).rejects.toMatchObject({ field: 'image_urls.1' });
    expect(signed).toEqual([]);
  });

  test('path tricks do not escape the caller’s prefix', async () => {
    for (const p of [`omni-uploads/${ME}/../${'2'.repeat(8)}/x.jpg`, `uploads/${ME}/x.jpg`, `omni-uploads/${ME}x/y.jpg`, `/omni-uploads/other/${ME}/y.jpg`]) {
      await expect(resolveStudioMedia({ image_url: p }, ME, sign)).rejects.toBeInstanceOf(MediaRefError);
    }
    expect(signed).toEqual([]);
  });

  test('a path that cannot be signed (deleted object, storage down) is reported, not passed on', async () => {
    const failing: Signer = async () => null;
    await expect(resolveStudioMedia({ video_url: `omni-uploads/${ME}/v.mp4` }, ME, failing)).rejects.toMatchObject({ reason: 'unavailable' });
  });

  test('non-object params are returned as they are (the model schema rejects them later)', async () => {
    expect(await resolveStudioMedia(null, ME, sign)).toBeNull();
    expect(await resolveStudioMedia(['x'], ME, sign)).toEqual(['x']);
  });
});
