/** @jest-environment node */
/**
 * The licence a source publishes for its file (./commonsLicense): Wikimedia Commons' own API (file, transcode and page
 * addresses), and an HTTP `Link: rel="license"`. Offline: fetch and DNS are injected.
 */
import { commonsFileTitle, commonsLicense, isCommonsPage, licenseFromLinkHeader } from './commonsLicense';

const PUBLIC = async () => [{ address: '208.80.154.224', family: 4 }];
const FILE = 'https://upload.wikimedia.org/wikipedia/commons/c/c0/Big_Buck_Bunny_4K.webm';

function api(body: unknown, seen: string[] = []) {
  return (async (u: string) => {
    seen.push(u);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }) as unknown as typeof fetch;
}

const ANSWER = {
  query: {
    pages: [{
      imageinfo: [{
        url: FILE,
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm',
        extmetadata: {
          LicenseShortName: { value: 'CC BY 3.0' },
          Artist: { value: '<a href="https://peach.blender.org/">Blender Foundation</a> &amp; friends' },
        },
      }],
    }],
  },
};

describe('commonsFileTitle', () => {
  test.each([
    [FILE, 'File:Big Buck Bunny 4K.webm'],
    ['https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm', 'File:Big Buck Bunny 4K.webm'],
    ['https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm', 'File:Big Buck Bunny 4K.webm'],
    ['https://commons.m.wikimedia.org/wiki/File:A%C3%A9.ogg', 'File:Aé.ogg'],
  ])('%s', (url, title) => expect(commonsFileTitle(url)).toBe(title));

  test.each([
    'https://upload.wikimedia.org/wikipedia/en/c/c0/Local_non_free.mp4',
    'https://commons.wikimedia.org/wiki/Main_Page',
    'https://example.com/wikipedia/commons/c/c0/A.webm',
    'https://commons.wikimedia.org/wiki/File:A|b.webm',
  ])('not a Commons file: %s', (url) => expect(commonsFileTitle(url)).toBeNull());

  test('a page names a file; the file itself is not a page', () => {
    expect(isCommonsPage('https://commons.wikimedia.org/wiki/File:A.webm')).toBe(true);
    expect(isCommonsPage(FILE)).toBe(false);
  });
});

describe('commonsLicense: the licence Commons states, read from its API', () => {
  test('licence, author (markup stripped), the original file and its page', async () => {
    const seen: string[] = [];
    const r = await commonsLicense(FILE, { fetchImpl: api(ANSWER, seen), lookupImpl: PUBLIC });
    expect(r).toEqual({
      fileUrl: FILE,
      pageUrl: 'https://commons.wikimedia.org/wiki/File:Big_Buck_Bunny_4K.webm',
      license: 'CC BY 3.0',
      author: 'Blender Foundation & friends',
    });
    const q = new URL(seen[0]!);
    expect(q.origin + q.pathname).toBe('https://commons.wikimedia.org/w/api.php');
    expect(q.searchParams.get('titles')).toBe('File:Big Buck Bunny 4K.webm');
  });

  test('no licence, a missing page, a file off Commons, an error or junk → null', async () => {
    const io = { lookupImpl: PUBLIC };
    expect(await commonsLicense(FILE, { ...io, fetchImpl: api({ query: { pages: [{ missing: true }] } }) })).toBeNull();
    const noLicense = JSON.parse(JSON.stringify(ANSWER));
    delete noLicense.query.pages[0].imageinfo[0].extmetadata.LicenseShortName;
    expect(await commonsLicense(FILE, { ...io, fetchImpl: api(noLicense) })).toBeNull();
    const elsewhere = JSON.parse(JSON.stringify(ANSWER));
    elsewhere.query.pages[0].imageinfo[0].url = 'https://evil.example/x.webm';
    expect(await commonsLicense(FILE, { ...io, fetchImpl: api(elsewhere) })).toBeNull();
    const junk = (async () => new Response('<html>', { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await commonsLicense(FILE, { ...io, fetchImpl: junk })).toBeNull();
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    expect(await commonsLicense(FILE, { ...io, fetchImpl: down })).toBeNull();
    const never = jest.fn() as unknown as typeof fetch;
    expect(await commonsLicense('https://example.com/a.mp4', { ...io, fetchImpl: never })).toBeNull();
    expect(never).not.toHaveBeenCalled();
  });
});

describe('licenseFromLinkHeader', () => {
  test.each([
    ['<https://creativecommons.org/licenses/by/4.0/>; rel="license"', 'CC BY 4.0'],
    ['<https://creativecommons.org/licenses/by-sa/3.0/deed.en>; rel=license', 'CC BY-SA 3.0'],
    ['<https://creativecommons.org/publicdomain/zero/1.0/>; rel="license"', 'CC0 1.0'],
    ['<https://creativecommons.org/publicdomain/mark/1.0/>; rel="license"', 'Public Domain Mark 1.0'],
    ['<https://example.com/next>; rel="next", <https://example.com/terms>; rel="license"', 'https://example.com/terms'],
    ['<https://example.com/a>; rel="nofollow license"', 'https://example.com/a'],
  ])('%s → %s', (h, want) => expect(licenseFromLinkHeader(h)).toBe(want));

  test.each([null, '', '<https://example.com/next>; rel="next"', '<javascript:alert(1)>; rel="license"', 'garbage'])('%s → null', (h) => {
    expect(licenseFromLinkHeader(h)).toBeNull();
  });
});
