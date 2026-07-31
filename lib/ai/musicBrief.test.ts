/** @jest-environment node */
import { buildMusicBrief, flattenMusicBrief, PROMPT_BUDGET, LYRICS_BUDGET } from './musicBrief';

describe("the user's own words must survive", () => {
  it('THE BUG: long lyrics used to be cut off the end of one concatenated string — now they are not', () => {
    const prompt = 'a'.repeat(1000);
    const lyrics = 'b'.repeat(1200);
    const b = buildMusicBrief({ prompt, lyrics, style: 'Cinematic', vocalDescriptor: 'female vocals' });
    // Both survive in full, because they no longer share one budget.
    expect(b.lyrics).toHaveLength(1200);
    expect(b.truncated.lyrics).toBe(false);
    // Old behaviour, for contrast: 1000 + '. Lyrics: ' + 1200 + '. Style: …' ≫ 1500 → the tail was lost.
    expect(prompt.length + lyrics.length).toBeGreaterThan(PROMPT_BUDGET);
  });

  it('keeps a brand name typed at the END of the brief', () => {
    const brief = `${'filler '.repeat(120)}for ACME Corporation`;
    const b = buildMusicBrief({ prompt: brief, style: 'Pop' });
    expect(b.prompt).toContain('ACME Corporation');
  });

  it('keeps the lyrics verbatim — no reformatting, no reordering', () => {
    const lyrics = '[Verse]\nმზე ამოდის\n[Chorus]\nგამარჯობა';
    expect(buildMusicBrief({ prompt: 'a song', lyrics }).lyrics).toBe(lyrics);
  });

  it('keeps non-Latin text intact', () => {
    const b = buildMusicBrief({ prompt: 'ქართული პოლიფონია, 120 BPM', lyrics: 'სიმღერა ჩემი' });
    expect(b.prompt).toContain('120 BPM');
    expect(b.lyrics).toBe('სიმღერა ჩემი');
  });
});

describe('boilerplate is trimmed before the user is', () => {
  it('reserves room for style/vocals so they cannot silently push out the brief', () => {
    const b = buildMusicBrief({ prompt: 'x'.repeat(PROMPT_BUDGET), style: 'Cinematic', vocalDescriptor: 'a duet' });
    expect(b.prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect(b.prompt).toContain('Style: Cinematic.');
    expect(b.prompt).toContain('a duet.');
    expect(b.truncated.prompt).toBe(true); // and it SAYS so rather than hiding it
  });

  it('an ordinary brief is not truncated at all', () => {
    const b = buildMusicBrief({ prompt: 'uplifting cinematic pop, 120 BPM', style: 'Pop', lyrics: 'hello world' });
    expect(b.truncated).toEqual({ prompt: false, lyrics: false });
  });
});

describe('instrumental is stated once and never contradicted', () => {
  it('drops lyrics and any vocal descriptor for an instrumental track', () => {
    const b = buildMusicBrief({ prompt: 'ambient bed', lyrics: 'these must not be sung', vocalDescriptor: 'female vocals', instrumental: true });
    expect(b.lyrics).toBeUndefined();
    expect(b.prompt).toContain('Instrumental, no vocals.');
    expect(b.prompt).not.toContain('female vocals');
  });

  it('a sung track carries the vocal descriptor and no instrumental instruction', () => {
    const b = buildMusicBrief({ prompt: 'a ballad', vocalDescriptor: 'male vocals', lyrics: 'la la' });
    expect(b.prompt).toContain('male vocals.');
    expect(b.prompt).not.toContain('Instrumental');
  });
});

describe('flatten — for engines that take a single string', () => {
  it('keeps the lyrics whole and trims the DESCRIPTION when space runs out', () => {
    const brief = buildMusicBrief({ prompt: 'p'.repeat(1400), lyrics: 'L'.repeat(200) });
    const flat = flattenMusicBrief(brief, 600);
    expect(flat).toContain('L'.repeat(200));      // the specific part survives whole
    expect(flat.length).toBeLessThanOrEqual(620); // and the generic part gave way
  });

  it('passes a short brief through untouched', () => {
    const brief = buildMusicBrief({ prompt: 'jazz trio', lyrics: 'blue moon' });
    expect(flattenMusicBrief(brief)).toBe('jazz trio\n\nLyrics:\nblue moon');
  });

  it('omits the lyrics block entirely when there are none', () => {
    expect(flattenMusicBrief(buildMusicBrief({ prompt: 'jazz trio' }))).toBe('jazz trio');
  });
});

describe('bounds and junk', () => {
  it('never exceeds either budget', () => {
    const b = buildMusicBrief({ prompt: 'x'.repeat(9000), lyrics: 'y'.repeat(9000), style: 'Rock' });
    expect(b.prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect((b.lyrics ?? '').length).toBeLessThanOrEqual(LYRICS_BUDGET);
    expect(b.truncated).toEqual({ prompt: true, lyrics: true });
  });

  it('is total on empty/absent input', () => {
    expect(buildMusicBrief({ prompt: '' }).prompt).toBe('');
    expect(buildMusicBrief({ prompt: '   ', lyrics: '   ' }).lyrics).toBeUndefined();
  });
});
