/** @jest-environment node */
import { makeMusicRegenSpec, musicRegenBilledSeconds, musicRegenBody, type MusicRegenSpec } from './musicRegen';

/**
 * The music RE-ROLL must re-run the request that produced the track. It used to POST only prompt / style /
 * instrumental / lyrics, so the route fell back to 30 s and the singer's gender vanished. Pinned here: the
 * spec keeps duration + tempo + voice, the body carries them under the route's own field names, and the toast
 * seconds follow the route's billing rule.
 */
describe('music re-roll spec → /api/ai/music body', () => {
  test('a 90 s female song at a fast tempo re-rolls as a 90 s female song at a fast tempo', () => {
    const spec = makeMusicRegenSpec({
      prompt: 'ზაფხულის ღამე ზღვაზე', genre: 'r&b', instrumental: false, lyrics: '[Verse]\nმთვარე წყალზე',
      durationSec: 90, tempo: 'fast', voiceType: 'female',
    });
    expect(musicRegenBody(spec)).toEqual({
      prompt: 'ზაფხულის ღამე ზღვაზე', style: 'r&b', instrumental: false,
      durationSec: 90, tempo: 'fast', voiceType: 'female', lyrics: '[Verse]\nმთვარე წყალზე',
    });
    expect(musicRegenBilledSeconds(spec)).toBe(90);
  });

  test('a FULL song (0) stays a full song and is billed at the 90 s tier, as the route bills it', () => {
    const spec = makeMusicRegenSpec({ prompt: 'epic', genre: 'rock', instrumental: false, durationSec: 0, tempo: 'medium', voiceType: 'duet' });
    expect(musicRegenBody(spec)).toMatchObject({ durationSec: 0, tempo: 'medium', voiceType: 'duet' });
    expect(musicRegenBilledSeconds(spec)).toBe(90);
  });

  test('an instrumental never carries a singer or lyrics — the original request did not send them either', () => {
    const spec = makeMusicRegenSpec({ prompt: 'rain piano', genre: 'ambient', instrumental: true, lyrics: 'la la', durationSec: 60, tempo: 'slow', voiceType: 'male' });
    expect(spec).toEqual({ kind: 'music', prompt: 'rain piano', genre: 'ambient', instrumental: true, durationSec: 60, tempo: 'slow' });
    expect(musicRegenBody(spec)).toEqual({ prompt: 'rain piano', style: 'ambient', instrumental: true, durationSec: 60, tempo: 'slow' });
    expect(musicRegenBilledSeconds(spec)).toBe(60);
  });

  test('a re-roll of a re-roll keeps every setting (the bubble stores the spec it was rolled from)', () => {
    const first = makeMusicRegenSpec({ prompt: 'p', genre: 'pop', instrumental: false, durationSec: 60, tempo: 'slow', voiceType: 'male' });
    const second = makeMusicRegenSpec(first);
    expect(second).toEqual(first);
    expect(musicRegenBody(second)).toEqual(musicRegenBody(first));
  });

  test('a spec persisted BEFORE these fields existed still re-rolls — the route applies its own defaults', () => {
    const legacy: MusicRegenSpec = { kind: 'music', prompt: 'old track', genre: 'jazz', instrumental: false, lyrics: 'words' };
    expect(musicRegenBody(legacy)).toEqual({ prompt: 'old track', style: 'jazz', instrumental: false, lyrics: 'words' });
    expect(musicRegenBilledSeconds(legacy)).toBe(30);
  });

  test('junk from storage is clamped or dropped, never forwarded', () => {
    const junk = {
      kind: 'music', prompt: 'p', genre: 'pop', instrumental: false,
      durationSec: 500, tempo: 'ludicrous', voiceType: 'robot', lyrics: '   ',
    } as unknown as MusicRegenSpec;
    expect(musicRegenBody(junk)).toEqual({ prompt: 'p', style: 'pop', instrumental: false, durationSec: 90 });
    expect(musicRegenBilledSeconds(junk)).toBe(90);

    const tooShort = { ...junk, durationSec: 3 } as MusicRegenSpec;
    expect(musicRegenBody(tooShort)).toMatchObject({ durationSec: 15 });
    expect(musicRegenBilledSeconds(tooShort)).toBe(15);

    const notANumber = { ...junk, durationSec: '90' } as unknown as MusicRegenSpec;
    expect(musicRegenBody(notANumber)).not.toHaveProperty('durationSec');
    expect(musicRegenBilledSeconds(notANumber)).toBe(30);
  });
});
