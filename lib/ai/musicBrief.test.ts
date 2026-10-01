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

describe('a template descriptor is boilerplate, not the user (lib/studio/templateContext)', () => {
  const FOLK = 'Georgian polyphonic folk: three-part choral harmony behind the lead voice, panduri and chonguri strings';

  it('the Georgian Folk brief carries the descriptor and keeps the user prompt and lyrics', () => {
    const b = buildMusicBrief({ prompt: 'a toast for a wedding in Telavi', style: 'folk', templateDescriptor: FOLK, vocalDescriptor: 'female vocals', lyrics: 'გაუმარჯოს!' });
    expect(b.prompt).toBe(`a toast for a wedding in Telavi Style: folk. ${FOLK}. female vocals.`);
    expect(b.lyrics).toBe('გაუმარჯოს!');
  });

  it('sits in the reserved suffix: a full-length brief is trimmed to make room, and the descriptor survives whole', () => {
    const b = buildMusicBrief({ prompt: 'x'.repeat(PROMPT_BUDGET), style: 'folk', templateDescriptor: FOLK });
    expect(b.prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect(b.prompt).toContain(`${FOLK}.`);
    expect(b.truncated.prompt).toBe(true);
  });

  it('is one line with one full stop, whatever whitespace or punctuation it arrived with', () => {
    const b = buildMusicBrief({ prompt: 'p', templateDescriptor: `  ${FOLK.replace(': ', ':\n')}. \n` });
    expect(b.prompt).toBe(`p ${FOLK}.`);
  });

  it('absent or blank → the brief is exactly what it was', () => {
    for (const templateDescriptor of [undefined, '', '   ']) {
      expect(buildMusicBrief({ prompt: 'ambient bed', style: 'ambient', templateDescriptor, instrumental: true }).prompt)
        .toBe('ambient bed Style: ambient. Instrumental, no vocals.');
    }
  });
});

describe('control directives are the lowest priority — trimmed before the user\'s own words (lib/ai/musicControls)', () => {
  const WEIRD = 'Make it experimental and unpredictable: an unconventional structure, unusual sounds and bold, inventive arrangement choices throughout.';
  const STRICT = 'Adhere strictly to the stated style: its signature instruments, rhythm and production from start to finish.';

  test('they ride after the style, the card\'s descriptor and the singer, in the order given', () => {
    const b = buildMusicBrief({ prompt: 'a toast in Telavi', style: 'georgian folk', templateDescriptor: 'Georgian polyphonic folk', vocalDescriptor: 'female vocals', directives: [WEIRD, STRICT] });
    expect(b.prompt).toBe(`a toast in Telavi Style: georgian folk. Georgian polyphonic folk. female vocals. ${WEIRD} ${STRICT}`);
    expect(b).not.toHaveProperty('directivesDropped');
  });

  test('an instrumental track keeps its one instruction, then the directives', () => {
    expect(buildMusicBrief({ prompt: 'rain', style: 'ambient', instrumental: true, directives: [WEIRD] }).prompt)
      .toBe(`rain Style: ambient. Instrumental, no vocals. ${WEIRD}`);
  });

  test('a brief that fills the budget keeps EVERY character of the user\'s words; the directives give way, whole', () => {
    const suffix = 'Style: jazz.';
    const prompt = 'u'.repeat(PROMPT_BUDGET - suffix.length - 1); // exactly what fits beside the suffix
    const b = buildMusicBrief({ prompt, style: 'jazz', directives: [WEIRD, STRICT] });
    expect(b.prompt).toBe(`${prompt} ${suffix}`);
    expect(b.truncated.prompt).toBe(false); // the user lost nothing
    expect(b.directivesDropped).toBe(2);
  });

  test('only what fits: a sentence is never cut in half — the long one is dropped, a shorter one still lands', () => {
    const short = 'Lean conventional.';
    const prompt = 'u'.repeat(PROMPT_BUDGET - 'Style: jazz.'.length - 1 - (short.length + 1) - 5);
    const b = buildMusicBrief({ prompt, style: 'jazz', directives: [WEIRD, short] });
    expect(b.prompt.endsWith(`Style: jazz. ${short}`)).toBe(true);
    expect(b.prompt).not.toContain('experimental');
    expect(b.prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    expect(b.directivesDropped).toBe(1);
  });

  test('blank directives are ignored; none at all is the brief exactly as before', () => {
    const base = buildMusicBrief({ prompt: 'jazz trio', style: 'jazz' });
    expect(buildMusicBrief({ prompt: 'jazz trio', style: 'jazz', directives: ['', '   '] })).toEqual(base);
    expect(buildMusicBrief({ prompt: 'jazz trio', style: 'jazz', directives: [] })).toEqual(base);
  });

  test('they are prompt text only — the lyrics keep their own field and budget', () => {
    const b = buildMusicBrief({ prompt: 'p', lyrics: 'L'.repeat(1400), directives: [WEIRD] });
    expect(b.lyrics).toHaveLength(1400);
    expect(b.lyrics).not.toContain('experimental');
    expect(b.prompt).toBe(`p ${WEIRD}`);
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
