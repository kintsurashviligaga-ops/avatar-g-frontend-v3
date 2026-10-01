/** @jest-environment node */
import { makeMusicRegenSpec, musicRegenBilledSeconds, musicRegenBody, musicRequestTemplateId, type MusicRegenSpec } from './musicRegen';
import { parseMusicControls } from '@/lib/ai/musicControls';

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
      durationSec: 90, tempo: 'fast', vocalGender: 'female',
    });
    expect(musicRegenBody(spec)).toEqual({
      prompt: 'ზაფხულის ღამე ზღვაზე', style: 'r&b', styles: ['r&b'], instrumental: false,
      durationSec: 90, tempo: 'fast', vocalGender: 'female', lyrics: '[Verse]\nმთვარე წყალზე',
    });
    expect(musicRegenBilledSeconds(spec)).toBe(90);
  });

  test('a FULL song (0) stays a full song and is billed at the 90 s tier, as the route bills it', () => {
    const spec = makeMusicRegenSpec({ prompt: 'epic', genre: 'rock', instrumental: false, durationSec: 0, tempo: 'medium', vocalGender: 'duet' });
    expect(musicRegenBody(spec)).toMatchObject({ durationSec: 0, tempo: 'medium', vocalGender: 'duet' });
    expect(musicRegenBilledSeconds(spec)).toBe(90);
  });

  test('an instrumental never carries a singer or lyrics — the original request did not send them either', () => {
    const spec = makeMusicRegenSpec({ prompt: 'rain piano', genre: 'ambient', instrumental: true, lyrics: 'la la', durationSec: 60, tempo: 'slow', vocalGender: 'male' });
    expect(spec).toEqual({ kind: 'music', prompt: 'rain piano', genre: 'ambient', instrumental: true, durationSec: 60, tempo: 'slow' });
    expect(musicRegenBody(spec)).toEqual({ prompt: 'rain piano', style: 'ambient', styles: ['ambient'], instrumental: true, durationSec: 60, tempo: 'slow' });
    expect(musicRegenBilledSeconds(spec)).toBe(60);
  });

  test('a re-roll of a re-roll keeps every setting (the bubble stores the spec it was rolled from)', () => {
    const first = makeMusicRegenSpec({ prompt: 'p', genre: 'pop, jazz', instrumental: false, durationSec: 60, tempo: 'slow', vocalGender: 'auto', weirdness: 80, styleInfluence: 20 });
    const second = makeMusicRegenSpec(first);
    expect(second).toEqual(first);
    expect(musicRegenBody(second)).toEqual(musicRegenBody(first));
  });

  test('a spec persisted BEFORE these fields existed still re-rolls — the route applies its own defaults', () => {
    const legacy: MusicRegenSpec = { kind: 'music', prompt: 'old track', genre: 'jazz', instrumental: false, lyrics: 'words' };
    expect(musicRegenBody(legacy)).toEqual({ prompt: 'old track', style: 'jazz', styles: ['jazz'], instrumental: false, lyrics: 'words' });
    expect(musicRegenBilledSeconds(legacy)).toBe(30);
  });

  test('junk from storage is clamped or dropped, never forwarded', () => {
    const junk = {
      kind: 'music', prompt: 'p', genre: 'pop', instrumental: false,
      durationSec: 500, tempo: 'ludicrous', vocalGender: 'robot', voiceType: 'robot', lyrics: '   ', weirdness: '90', styleInfluence: NaN,
    } as unknown as MusicRegenSpec;
    expect(musicRegenBody(junk)).toEqual({ prompt: 'p', style: 'pop', styles: ['pop'], instrumental: false, durationSec: 90 });
    expect(musicRegenBilledSeconds(junk)).toBe(90);

    const tooShort = { ...junk, durationSec: 3 } as MusicRegenSpec;
    expect(musicRegenBody(tooShort)).toMatchObject({ durationSec: 15 });
    expect(musicRegenBilledSeconds(tooShort)).toBe(15);

    const notANumber = { ...junk, durationSec: '90' } as unknown as MusicRegenSpec;
    expect(musicRegenBody(notANumber)).not.toHaveProperty('durationSec');
    expect(musicRegenBilledSeconds(notANumber)).toBe(30);
  });
});

describe('the granular controls ride with the re-roll (lib/ai/musicControls)', () => {
  test('styles, the singer and both sliders are resent — and the route reads them back as sent', () => {
    const spec = makeMusicRegenSpec({ prompt: 'p', genre: 'georgian folk, jazz', instrumental: false, durationSec: 30, tempo: 'medium', vocalGender: 'duet', weirdness: 92, styleInfluence: 10 });
    const body = musicRegenBody(spec);
    expect(body).toMatchObject({ style: 'georgian folk, jazz', styles: ['georgian folk', 'jazz'], vocalGender: 'duet', weirdness: 92, styleInfluence: 10 });
    expect(parseMusicControls(body)).toEqual({ styles: ['georgian folk', 'jazz'], vocalGender: 'duet', weirdness: 92, styleInfluence: 10 });
  });

  test('a song on Auto re-rolls on Auto — stored and resent, not dropped', () => {
    const spec = makeMusicRegenSpec({ prompt: 'p', genre: 'pop', instrumental: false, vocalGender: 'auto' });
    expect(spec.vocalGender).toBe('auto');
    expect(musicRegenBody(spec)).toMatchObject({ vocalGender: 'auto' });
  });

  test('a spec stored by an earlier build (`voiceType`) re-rolls with the same singer under the new field', () => {
    const older = { kind: 'music', prompt: 'p', genre: 'r&b', instrumental: false, durationSec: 60, tempo: 'fast', voiceType: 'male' } as unknown as MusicRegenSpec;
    const body = musicRegenBody(older);
    expect(body).toMatchObject({ vocalGender: 'male' });
    expect(body).not.toHaveProperty('voiceType');
    expect(body).not.toHaveProperty('weirdness'); // absent → the route's neutral 50
    expect(parseMusicControls(body).vocalGender).toBe('male');
  });

  test('sliders are clamped like the route clamps them; the style line is re-cleaned (three labels at most)', () => {
    const spec = makeMusicRegenSpec({ prompt: 'p', genre: 'a, b, c, d', instrumental: true, weirdness: 140, styleInfluence: -2.4 });
    expect(spec).toMatchObject({ genre: 'a, b, c', weirdness: 100, styleInfluence: 0 });
    expect(musicRegenBody(spec)).toMatchObject({ style: 'a, b, c', styles: ['a', 'b', 'c'] });
  });
});

describe('the template card rides with the request and its re-roll (lib/studio/templateContext adds its descriptor)', () => {
  const FOLK = { prompt: 'a wedding toast', genre: 'georgian folk', instrumental: false, durationSec: 60, tempo: 'medium', vocalGender: 'female' } as const;

  test('the id the request\'s own values select is the one the route will re-derive', () => {
    expect(musicRequestTemplateId(FOLK)).toBe('georgian-folk');
    expect(musicRequestTemplateId({ ...FOLK, vocalGender: 'male' })).toBeNull();
    // Auto names no singer, so it cannot select a card that does.
    expect(musicRequestTemplateId({ ...FOLK, vocalGender: 'auto' })).toBeNull();
    // A second style is an edit away from the card.
    expect(musicRequestTemplateId({ ...FOLK, genre: 'georgian folk, jazz' })).toBeNull();
    // An absent length is the route's 30 s default, so it cannot select a 60 s card.
    expect(musicRequestTemplateId({ genre: 'georgian folk', instrumental: false, tempo: 'medium', vocalGender: 'female' })).toBeNull();
    // An instrumental card matches whatever (absent) vocal was sent.
    expect(musicRequestTemplateId({ genre: 'lo-fi', instrumental: true, durationSec: 60, tempo: 'slow' })).toBe('lofi-chill');
    // An older spec's `voiceType` is read the way the route reads it.
    expect(musicRequestTemplateId({ genre: 'georgian folk', instrumental: false, durationSec: 60, tempo: 'medium', voiceType: 'female' })).toBe('georgian-folk');
  });

  test('a Georgian Folk track re-rolls WITH its template id', () => {
    const spec = makeMusicRegenSpec({ ...FOLK, templateId: 'georgian-folk' });
    expect(spec.templateId).toBe('georgian-folk');
    expect(musicRegenBody(spec)).toEqual({
      prompt: 'a wedding toast', style: 'georgian folk', styles: ['georgian folk'], instrumental: false, durationSec: 60, tempo: 'medium',
      vocalGender: 'female', templateId: 'georgian-folk',
    });
  });

  test('a stored id its own values no longer select — or a malformed one — is dropped, not re-sent', () => {
    expect(makeMusicRegenSpec({ ...FOLK, durationSec: 30, templateId: 'georgian-folk' })).not.toHaveProperty('templateId');
    expect(makeMusicRegenSpec({ ...FOLK, templateId: 'lofi-chill' })).not.toHaveProperty('templateId');
    expect(makeMusicRegenSpec({ ...FOLK, templateId: '../georgian-folk' })).not.toHaveProperty('templateId');
    expect(makeMusicRegenSpec({ ...FOLK, templateId: null })).not.toHaveProperty('templateId');
    const junk = { kind: 'music', ...FOLK, templateId: { evil: true } } as unknown as MusicRegenSpec;
    expect(musicRegenBody(junk)).not.toHaveProperty('templateId');
  });

  test('a spec without one (any older build, or no card lit) sends none', () => {
    expect(musicRegenBody(makeMusicRegenSpec(FOLK))).not.toHaveProperty('templateId');
  });
});
