/**
 * Links a stranger's page renders (the share page's download href, video / audio / img src, og:image) are https or
 * nothing: the owner can write any string into `user_creations.url` through the anon key.
 */
import { isPublicMediaUrl, publicMediaUrl, withPublicMediaUrls } from './publicMediaUrl';

describe('publicMediaUrl', () => {
  it('keeps an https link exactly as stored (a signed link\'s token included)', () => {
    const signed = 'https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/renders/u/v.mp4?token=eyJ.a%2Bb.c';
    expect(publicMediaUrl(signed)).toBe(signed);
    expect(publicMediaUrl('  https://replicate.delivery/x.png ')).toBe('https://replicate.delivery/x.png');
  });

  it.each([
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'data:image/png;base64,AAAA',
    'vbscript:msgbox(1)',
    'blob:https://myavatar.ge/1234',
    'http://example.com/v.mp4',
    'ftp://example.com/v.mp4',
    '//evil.example/v.mp4',
    '/api/files/x',
    'https://user:pass@evil.example/v.mp4',
    '',
    'not a url',
  ])('refuses %j', (value) => {
    expect(publicMediaUrl(value)).toBeNull();
    expect(isPublicMediaUrl(value)).toBe(false);
  });

  it('refuses non-strings and very long values', () => {
    for (const v of [null, undefined, 42, {}, ['https://a.b/c']]) expect(publicMediaUrl(v)).toBeNull();
    expect(publicMediaUrl(`https://a.example/${'x'.repeat(5000)}`)).toBeNull();
  });

  it('withPublicMediaUrls nulls only the unsafe link and keeps the rest of the row', () => {
    const row = { id: 'c1', title: 'Mine', url: 'javascript:alert(1)', thumbnail_url: 'https://a.example/t.jpg' };
    expect(withPublicMediaUrls(row)).toEqual({ id: 'c1', title: 'Mine', url: null, thumbnail_url: 'https://a.example/t.jpg' });
  });
});
