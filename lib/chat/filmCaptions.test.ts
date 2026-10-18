/** @jest-environment node */
/**
 * Subtitles on a chat film are the user's choice (the owner's word, 2026-10-17 14:27Z: never always on). The narration's
 * words, timed by Scribe when the film started, are kept for the film's owner; the stitch burns them only when asked.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
jest.mock('server-only', () => ({}));

// eslint-disable-next-line import/first
import { recordFilmCaptions, readFilmCaptions } from './filmStatusStore';

const WORDS = [
  { text: 'წარმოგიდგენთ', startSec: 0.1, endSec: 0.9 },
  { text: 'ახალ', startSec: 1, endSec: 1.3 },
];

describe('the film’s timed narration words', () => {
  it('are read back by the film’s owner', async () => {
    await recordFilmCaptions('film:cap-1', 'user-1', WORDS);
    expect(await readFilmCaptions('film:cap-1', 'user-1')).toEqual(WORDS);
  });

  it('are never handed to another account', async () => {
    await recordFilmCaptions('film:cap-2', 'user-1', WORDS);
    expect(await readFilmCaptions('film:cap-2', 'user-2')).toBeNull();
  });

  it('nothing kept, nothing read; a word with broken times is dropped', async () => {
    expect(await readFilmCaptions('film:never', 'user-1')).toBeNull();
    await recordFilmCaptions('film:cap-3', 'user-1', [...WORDS, { text: 'x', startSec: 2, endSec: 1 }]);
    expect(await readFilmCaptions('film:cap-3', 'user-1')).toEqual(WORDS);
    await recordFilmCaptions('film:cap-4', 'user-1', []);
    expect(await readFilmCaptions('film:cap-4', 'user-1')).toBeNull();
  });
});

describe('the stitch burns them only when the user asked', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'app/api/video/assemble/route.ts'), 'utf8');
  const at = (needle: string) => {
    const i = src.indexOf(needle);
    expect(i).toBeGreaterThan(-1);
    return i;
  };

  it('reads them only on subtitles: true, for the signed-in owner of this film, when no alignment came with the body', () => {
    expect(src).toMatch(/if \(body\.subtitles === true && !body\.captionAlignment && filmTokenId && uid\) \{\s*const words = await readFilmCaptions\(filmTokenId, uid\)/);
    expect(src).toMatch(/if \(words\?\.length\) body\.captionAlignment = wordsToAlignment\(words\);/);
  });

  it('after the film’s ownership check, and before the idempotency key (a captioned stitch never replays an uncaptioned one)', () => {
    const read = at('await readFilmCaptions(filmTokenId, uid)');
    expect(read).toBeGreaterThan(at("error: 'film_not_owned'"));
    expect(read).toBeLessThan(at('const idemKey = await hashPayload('));
    expect(src).toMatch(/cap: body\.captionAlignment \? 1 : 0,/);
  });
});
