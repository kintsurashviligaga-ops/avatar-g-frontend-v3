import { LIVE_AVATAR_MAX_MS, LIVE_AVATAR_TICKET_MS, defaultLiveAvatar, liveAvatarEnabled, normalizeLiveAvatar } from './liveAvatar';

describe('liveAvatar', () => {
  it('takes only the prebuilt names that open on Vertex', () => {
    expect(normalizeLiveAvatar(' kira ')).toBe('Kira');
    expect(normalizeLiveAvatar('LEO')).toBe('Leo');
    expect(normalizeLiveAvatar('Aria')).toBeNull(); // 1007 "Unsupported avatar name"
    expect(normalizeLiveAvatar(42)).toBeNull();
  });

  it('matches the voice: Kira for a female voice, Ben for a male one', () => {
    expect(defaultLiveAvatar('female')).toBe('Kira');
    expect(defaultLiveAvatar(null)).toBe('Kira');
    expect(defaultLiveAvatar('male')).toBe('Ben');
  });

  it('is off unless switched on', () => {
    expect(liveAvatarEnabled(undefined)).toBe(false);
    expect(liveAvatarEnabled('0')).toBe(false);
    expect(liveAvatarEnabled('1')).toBe(true);
    expect(liveAvatarEnabled(' ON ')).toBe(true);
  });

  it('the ticket outlives the screen\'s cap', () => {
    expect(LIVE_AVATAR_TICKET_MS).toBeGreaterThan(LIVE_AVATAR_MAX_MS);
  });
});
