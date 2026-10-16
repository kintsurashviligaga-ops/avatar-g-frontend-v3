import { countSyllables, speechSeconds, sceneSpeechCapacity, checkSceneSpeech, reflowSpeech, speechFit, speechFitNote } from './speechTiming';

// GG's 2026-10-16 ad lines — the film whose scenes rushed and cut their speech (3 × 8 s, one line each).
const AD = [
  'წარმოგიდგენთ პირველ ქართულ ენოვან პლატფორმას მაი ავატარ ჯის ჩატს რომელიც ასრულებს ვიდეოპროდაქშენ სტუდიოს ყველა ფუნქციას.',
  'საიტის მთავარი პერსონაჟი კი არის ეიჯენტ ჯი, მას შეუძლია თქვენი დავალების ხმით მიღება და მისი ენდ-თუ-ენდ შესრულება.',
  'თქვენ შეგიძლიათ ჩატში ქართულად აგენტთან რეალურ დროში საუბარი, აკონტროლოთ იგი და მართოთ მთელი პროცესი.',
];

describe('speechTiming', () => {
  it('counts Georgian syllables exactly (one vowel letter = one syllable)', () => {
    expect(countSyllables('გამარჯობა')).toBe(4);
    expect(countSyllables(AD[0]!)).toBe(41);
    expect(countSyllables(AD[2]!)).toBe(36);
  });

  it('estimates English by vowel groups', () => {
    expect(countSyllables('Hello there')).toBe(3);
    expect(countSyllables('video studio')).toBe(4);
    expect(countSyllables('make')).toBe(1); // silent final e
  });

  it('an 8 s clip holds 7 s of speech', () => {
    expect(sceneSpeechCapacity(8)).toBeCloseTo(7, 5);
    expect(sceneSpeechCapacity(6)).toBeCloseTo(5, 5);
  });

  it('flags every line of the 2026-10-16 ad as too long for one 8 s scene', () => {
    const check = checkSceneSpeech(AD, 8);
    expect(check.overflow).toBe(true);
    expect(check.scenes.every((s) => s.overflow)).toBe(true);
    for (const s of check.scenes) expect(s.seconds).toBeGreaterThan(7.7);
    // ~26 s of speech: four 8 s scenes are needed, not three.
    expect(check.scenesNeeded).toBe(4);
  });

  it('a short line fits', () => {
    const check = checkSceneSpeech(['გამარჯობა, მე ვარ აგენტი ჯი.'], 8);
    expect(check.overflow).toBe(false);
    expect(check.scenesNeeded).toBe(1);
  });

  it('refuses to squeeze the ad into three scenes and spreads it over four', () => {
    expect(reflowSpeech(AD.join(' '), 3, 8)).toBeNull();
    const four = reflowSpeech(AD.join(' '), 4, 8);
    expect(four).not.toBeNull();
    expect(four).toHaveLength(4);
    // Every word kept, in order, nothing duplicated.
    expect(four!.join(' ')).toBe(AD.join(' '));
    // Every scene now fits its clip.
    expect(checkSceneSpeech(four!, 8).overflow).toBe(false);
  });

  it('prefers a sentence end as the cut', () => {
    const script = 'ეს არის პირველი წინადადება. ეს არის მეორე წინადადება.';
    expect(reflowSpeech(script, 2, 8)).toEqual(['ეს არის პირველი წინადადება.', 'ეს არის მეორე წინადადება.']);
  });

  it('pauses count: two sentences take longer than the same words as one', () => {
    expect(speechSeconds('ერთი ორი. სამი ოთხი.')).toBeGreaterThan(speechSeconds('ერთი ორი სამი ოთხი.'));
  });

  it('an empty script gives silent scenes', () => {
    expect(reflowSpeech('', 3, 8)).toEqual(['', '', '']);
  });
});

describe('speechFit (storyboard pre-render check)', () => {
  it('the 2026-10-16 ad does not fit 3 × 8 s and needs 4 scenes', () => {
    const fit = speechFit(AD.join(' '), 3, 8);
    expect(fit.fits).toBe(false);
    expect(fit.scenesNeeded).toBe(4);
    expect(speechFitNote(fit, 8, 'ka')).toContain('4 × 8 წმ = 32 წმ');
    expect(speechFitNote(fit, 8, 'en')).toMatch(/Add scenes \(4 × 8 s = 32 s\)/);
  });
  it('fits 4 × 8 s', () => {
    expect(speechFit(AD.join(' '), 4, 8).fits).toBe(true);
  });
});
