import { resolveAvatarVideo } from './video-config';

describe('resolveAvatarVideo', () => {
  test('no sources → orb fallback (no video, no talking layer)', () => {
    const c = resolveAvatarVideo({ idle: '', talk: '', poster: '' });
    expect(c.hasVideo).toBe(false);
    expect(c.hasTalkingLayer).toBe(false);
    expect(c.idleUrl).toBe('');
    expect(c.poster).toBeUndefined();
  });

  test('idle only → video on, talking layer off', () => {
    const c = resolveAvatarVideo({ idle: 'https://cdn/idle.mp4', talk: '', poster: '' });
    expect(c.hasVideo).toBe(true);
    expect(c.hasTalkingLayer).toBe(false);
    expect(c.idleUrl).toBe('https://cdn/idle.mp4');
  });

  test('idle + talk → both layers active', () => {
    const c = resolveAvatarVideo({ idle: 'https://cdn/idle.mp4', talk: 'https://cdn/talk.mp4' });
    expect(c.hasVideo).toBe(true);
    expect(c.hasTalkingLayer).toBe(true);
    expect(c.talkUrl).toBe('https://cdn/talk.mp4');
  });

  test('talk WITHOUT idle → no talking layer (idle is required base)', () => {
    const c = resolveAvatarVideo({ idle: '', talk: 'https://cdn/talk.mp4' });
    expect(c.hasVideo).toBe(false);
    expect(c.hasTalkingLayer).toBe(false);
  });

  test('trims stray whitespace/newlines from pasted env values', () => {
    const c = resolveAvatarVideo({
      idle: '  https://cdn/idle.mp4\n',
      talk: '\thttps://cdn/talk.mp4 ',
      poster: '  https://cdn/poster.jpg  ',
    });
    expect(c.idleUrl).toBe('https://cdn/idle.mp4');
    expect(c.talkUrl).toBe('https://cdn/talk.mp4');
    expect(c.poster).toBe('https://cdn/poster.jpg');
  });

  test('blank/whitespace poster collapses to undefined', () => {
    const c = resolveAvatarVideo({ idle: 'https://cdn/idle.mp4', poster: '   ' });
    expect(c.poster).toBeUndefined();
  });

  test('falls back to process.env when no source provided', () => {
    const prev = process.env.NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL;
    process.env.NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL = 'https://env/idle.mp4';
    try {
      expect(resolveAvatarVideo().idleUrl).toBe('https://env/idle.mp4');
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL;
      else process.env.NEXT_PUBLIC_AVATAR_IDLE_VIDEO_URL = prev;
    }
  });
});
