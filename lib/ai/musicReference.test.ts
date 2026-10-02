/** @jest-environment node */
/** Which `audioReference` / `voiceReference` values the music route will act on — the policy itself, without a server. */
import { isAcceptableMusicReference, isOwnedUploadPath } from './musicReference';

const UID = '3f2c1d9e-7a64-4b0e-9d41-0c8e5a1b2c3d';
const OTHER = '9b1e4a7c-2d58-4f36-8a90-6e7d3c2b1a0f';

describe('storage paths', () => {
  test('the caller\'s own upload folder — in both shapes the upload routes mint', () => {
    expect(isOwnedUploadPath(`omni-uploads/${UID}/1700000000-ab12cd34.mp3`, UID)).toBe(true);
    expect(isOwnedUploadPath(`${UID}/1700000000-ab12cd.wav`, UID)).toBe(true);
  });

  test('another account\'s folder, a missing owner, or no user at all is refused', () => {
    expect(isOwnedUploadPath(`omni-uploads/${OTHER}/x.mp3`, UID)).toBe(false);
    expect(isOwnedUploadPath('omni-music/1700-abc.mp3', UID)).toBe(false);
    expect(isOwnedUploadPath(`omni-uploads/${UID}/x.mp3`, '')).toBe(false);
  });

  test('traversal, doubled slashes, backslashes, spaces and control characters are refused', () => {
    for (const p of [
      `omni-uploads/${UID}/../${OTHER}/x.mp3`,
      `omni-uploads/${UID}//x.mp3`,
      `omni-uploads\\${UID}\\x.mp3`,
      `omni-uploads/${UID}/a b.mp3`,
      `omni-uploads/${UID}/x.mp3\n`,
      `/omni-uploads/${UID}/x.mp3`,
    ]) expect(isOwnedUploadPath(p, UID)).toBe(false);
  });

  test('a prefix match must be on a whole folder: a user id that merely starts with the caller\'s is another account', () => {
    expect(isOwnedUploadPath(`omni-uploads/${UID}-evil/x.mp3`, UID)).toBe(false);
  });
});

describe('references', () => {
  test('empty means "none" — always fine', () => {
    expect(isAcceptableMusicReference('', UID, 'audio')).toBe(true);
    expect(isAcceptableMusicReference('', UID, 'voice')).toBe(true);
  });

  test('a cover URL (fetched by Replicate): any public host; internal targets are refused', () => {
    expect(isAcceptableMusicReference('https://cdn.example.com/a.mp3', UID, 'audio')).toBe(true);
    for (const u of ['http://localhost/a.mp3', 'http://127.0.0.1/a.mp3', 'http://10.1.2.3/a.mp3', 'http://169.254.169.254/', 'http://[::1]/a', 'file:///etc/passwd', 'ftp://example.com/a.mp3', 'javascript:alert(1)']) {
      expect(isAcceptableMusicReference(u, UID, 'audio')).toBe(false);
    }
  });

  test('a voice URL (fetched by us): our Supabase storage only, over https', () => {
    expect(isAcceptableMusicReference('https://zwksnayknzggdcenqqxy.supabase.co/storage/v1/object/sign/uploads/x.mp3?token=t', UID, 'voice')).toBe(true);
    for (const u of ['https://cdn.example.com/a.mp3', 'http://zwksnayknzggdcenqqxy.supabase.co/x.mp3', 'https://supabase.co.evil.example/x.mp3', 'http://169.254.169.254/']) {
      expect(isAcceptableMusicReference(u, UID, 'voice')).toBe(false);
    }
  });

  test('data URLs must declare audio and base64', () => {
    expect(isAcceptableMusicReference('data:audio/mpeg;base64,AAAA', UID, 'audio')).toBe(true);
    expect(isAcceptableMusicReference('data:audio/webm;codecs=opus;base64,AAAA', UID, 'voice')).toBe(true);
    expect(isAcceptableMusicReference('data:text/html;base64,AAAA', UID, 'audio')).toBe(false);
    expect(isAcceptableMusicReference('data:audio/mpeg,AAAA', UID, 'audio')).toBe(false);
  });

  test('a bare path goes through the ownership rule, for both kinds', () => {
    for (const kind of ['audio', 'voice'] as const) {
      expect(isAcceptableMusicReference(`omni-uploads/${UID}/x.mp3`, UID, kind)).toBe(true);
      expect(isAcceptableMusicReference(`omni-uploads/${OTHER}/x.mp3`, UID, kind)).toBe(false);
    }
  });
});
