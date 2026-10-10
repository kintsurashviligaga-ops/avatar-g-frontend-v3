/**
 * The source rule for Agent G's audio extraction (./audioSource): video platforms, their CDNs and streams are refused
 * before anything is fetched; a direct file on a public host is a candidate; links are read out of a chat message the
 * way a person typed them; the MP3 gets a safe name.
 */
import { classifySource, findLinks, mp3NameFor, platformOf, platformOfUrl, withoutLinks } from './audioSource';

describe('classifySource: no platform, no stream, no way around it', () => {
  test.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'YouTube'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube'],
    ['https://m.youtube.com/shorts/abc', 'YouTube'],
    ['https://rr3---sn-4g5e6nzz.googlevideo.com/videoplayback?expire=1', 'YouTube'],
    ['https://www.tiktok.com/@a/video/1', 'TikTok'],
    ['https://v16-webapp.tiktokcdn.com/x.mp4', 'TikTok'],
    ['https://www.instagram.com/reel/abc/', 'Instagram'],
    ['https://scontent.cdninstagram.com/v/t50/x.mp4', 'Instagram'],
    ['https://fb.watch/abc/', 'Facebook'],
    ['https://video.xx.fbcdn.net/v/x.mp4', 'Facebook'],
    ['https://x.com/a/status/1', 'X'],
    ['https://video.twimg.com/ext_tw_video/1/pu/vid/x.mp4', 'X'],
    ['https://t.co/abc', 'X'],
    ['https://vimeo.com/123', 'Vimeo'],
    ['https://soundcloud.com/a/b', 'SoundCloud'],
    ['https://open.spotify.com/track/1', 'Spotify'],
    ['https://music.apple.com/us/album/1', 'Apple Music'],
    ['https://www.twitch.tv/videos/1', 'Twitch'],
    ['https://vk.com/video1_2', 'VK'],
    ['https://YOUTUBE.COM./watch?v=1', 'YouTube'],
  ])('%s → refused as %s', (url, platform) => {
    expect(classifySource(url)).toEqual({ ok: false, reason: 'platform', platform });
  });

  test('a look-alike host is not the platform, and the platform is not matched by a substring', () => {
    expect(platformOf('notyoutube.com')).toBeNull();
    expect(platformOf('youtube.com.example.org')).toBeNull();
    expect(platformOf('cdn.example.com')).toBeNull();
    expect(platformOfUrl('not a url')).toBeNull();
  });

  test.each([
    'https://cdn.example.com/live/master.m3u8',
    'https://cdn.example.com/live/index.m3u8?token=1',
    'https://cdn.example.com/dash/stream.mpd',
    'https://media.example.com/Video.ism/Manifest',
  ])('%s → a stream, refused', (url) => {
    expect(classifySource(url)).toEqual({ ok: false, reason: 'stream' });
  });

  test.each(['', 'ftp://example.com/a.mp4', 'file:///etc/passwd', 'https://user:pw@example.com/a.mp4', 'javascript:alert(1)', 'example.com/a.mp4', `https://example.com/${'a'.repeat(2100)}`])(
    '%s → invalid',
    (url) => expect(classifySource(url)).toEqual({ ok: false, reason: 'invalid_url' }),
  );

  test('a direct file on a public host is a candidate, normalised', () => {
    expect(classifySource('  https://Media.Example.com/clips/My%20Clip.mp4?x=1  ')).toEqual({
      ok: true, url: 'https://media.example.com/clips/My%20Clip.mp4?x=1', host: 'media.example.com',
    });
    expect(classifySource('https://upload.wikimedia.org/wikipedia/commons/a/ab/A.webm')).toMatchObject({ ok: true });
  });
});

describe('findLinks / withoutLinks: links the way people type them', () => {
  test('a sentence’s punctuation and quotes are not part of the link; a balanced ")" is', () => {
    expect(findLinks('ამ ვიდეოდან MP3 ამოიღე: https://youtu.be/abc.')).toEqual(['https://youtu.be/abc']);
    expect(findLinks('„https://example.com/a.mp4“ — this one!')).toEqual(['https://example.com/a.mp4']);
    expect(findLinks('see (https://example.com/a.mp4) and https://en.wikipedia.org/wiki/A_(b)')).toEqual([
      'https://example.com/a.mp4', 'https://en.wikipedia.org/wiki/A_(b)',
    ]);
    expect(findLinks('https://a.example/x.mp4 https://a.example/x.mp4')).toEqual(['https://a.example/x.mp4']);
    expect(findLinks('no link here, just http:// and text')).toEqual([]);
  });

  test('withoutLinks leaves what the user asked', () => {
    expect(withoutLinks('https://youtu.be/abc ამ ვიდეოდან MP3 ამოიღე')).toBe('ამ ვიდეოდან MP3 ამოიღე');
  });
});

describe('mp3NameFor', () => {
  test('the source’s own name, its extension swapped for .mp3', () => {
    expect(mp3NameFor({ url: 'https://example.com/media/Big%20Buck%20Bunny.mp4?dl=1' })).toBe('Big Buck Bunny.mp3');
    expect(mp3NameFor({ url: 'https://example.com/a.mp4', disposition: 'attachment; filename="Concert 2024.mov"' })).toBe('Concert 2024.mp3');
    expect(mp3NameFor({ disposition: "attachment; filename*=UTF-8''%E1%83%A1%E1%83%98%E1%83%9B%E1%83%A6%E1%83%94%E1%83%A0%E1%83%90.mp4" })).toBe('სიმღერა.mp3');
    expect(mp3NameFor({ name: 'clip.webm', url: 'omni-uploads/u/123-clip.webm' })).toBe('clip.mp3');
  });

  test('nothing that can escape a folder or a header survives, and it is never empty', () => {
    expect(mp3NameFor({ disposition: 'attachment; filename="../../etc/passwd\r\nX: y.mp4"' })).toBe('etc passwd X y.mp3');
    expect(mp3NameFor({ url: 'https://example.com/' })).toBe('audio.mp3');
    expect(mp3NameFor({})).toBe('audio.mp3');
    expect(mp3NameFor({ name: `${'a'.repeat(300)}.mp4` })).toHaveLength(104);
  });
});
