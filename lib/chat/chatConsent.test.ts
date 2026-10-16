/** @jest-environment node */
/**
 * GG's rule (Production 2026-10-16 18:21Z): once Agent G has clarified and the user agrees, generation starts. These pin
 * what counts as agreeing, and what the agreement carries (the frame it names, the photo the offer was built on).
 */
import {
  aspectFromText, isConsentToStart, latestThreadPhoto, namedMedium, offerUsesReference, orientationForAspect, quotedCredits,
} from './chatConsent';

// GG's own message on his iPhone, 22:19 Tbilisi.
const GG_YES = 'კი შექმენი სურათი 9:16 ფორმატის';
// The reply it got (shortened in the middle only): no generation, „open the Image tool".
const GG_REPLY = 'მე ჩატში პირდაპირ გენერირებას ვერ გავუშვებ — სურათის შესაქმნელად გახსენი ხელსაწყო „სურათი“ „+“ ღილაკით, მიამაგრე ეს ფოტო, პარამეტრებში პროპორციად აირჩიე 9:16 და დააჭირე შექმნას.\n\nპრომპტის ველში ჩასვი:\n\n„Vertical 9:16 professional portrait maintaining the exact face and features of the man in the reference image, wearing a crisp white dress shirt and a tailored black suit jacket, solid matte black background, studio lighting, photorealistic, ultra-detailed, 8k“\n\n(ფასი: 2 კრედიტი / 0.20 ₾).';

describe('isConsentToStart — what counts as "yes, start it"', () => {
  it('GG\'s „კი შექმენი სურათი 9:16 ფორმატის" is agreement, and it names 9:16', () => {
    expect(isConsentToStart(GG_YES)).toBe(true);
    expect(aspectFromText(GG_YES)).toBe('9:16');
  });

  it.each([
    'კი', 'ჰო', 'დიახ', 'კარგი', 'კარგია, დავწერე.', 'დაიწყე', 'კი, დაიწყე', 'ჰო გააკეთე ახლავე', 'კი გთხოვ', 'კი მინდა',
    'კი, ვერტიკალურად', 'yes', 'ok, go ahead', 'yes please make it', 'sure, 16:9', 'да', 'да, давай', 'хорошо, запускай',
  ])('„%s" agrees', (t) => {
    expect(isConsentToStart(t)).toBe(true);
  });

  it.each([
    'კი, მაგრამ ფონი თეთრი იყოს',       // a change: Agent G offers again
    'დამიხატე კატა ზღვაზე',              // a new order with its own subject
    'მინდა ვიდეო',                        // no yes in it
    'რა ღირს?',                           // a question
    'არა',                                // no
    'no, make it a cat instead',
    'yes but in watercolor',
    'да, но фон синий',
    '',
  ])('„%s" does not agree', (t) => {
    expect(isConsentToStart(t)).toBe(false);
  });

  it('a yes that names another medium is told apart (it is not a yes to a picture)', () => {
    expect(namedMedium('კი, ვიდეო გააკეთე')).toBe('video');
    expect(namedMedium('კი შექმენი სურათი')).toBe('image');
    expect(namedMedium('yes, the song')).toBe('music');
    expect(namedMedium('კი')).toBeNull();
  });
});

describe('aspectFromText — the frame the user named', () => {
  it('reads ratios and the words for them (ka · en · ru)', () => {
    expect(aspectFromText('16x9 გააკეთე')).toBe('16:9');
    expect(aspectFromText('კვადრატული')).toBe('1:1');
    expect(aspectFromText('вертикально')).toBe('9:16');
    expect(aspectFromText('4:5 for instagram')).toBe('4:5');
    expect(aspectFromText('7:3')).toBeNull(); // not a ratio the image route takes
  });

  it('in a PROMPT only digits count: „a vertical cliff" is not a 9:16 order', () => {
    expect(aspectFromText('a vertical cliff above the sea', { ratioOnly: true })).toBeNull();
    expect(aspectFromText('Vertical 9:16 professional portrait', { ratioOnly: true })).toBe('9:16');
  });

  it('maps a ratio to the film orientation', () => {
    expect(orientationForAspect('9:16')).toBe('vertical');
    expect(orientationForAspect('16:9')).toBe('landscape');
    expect(orientationForAspect('1:1')).toBe('square');
    expect(orientationForAspect('4:5')).toBe('portrait');
  });
});

describe('the offer\'s photo and price', () => {
  it('GG\'s offer leans on his photo („the man in the reference image") and quotes 2 credits', () => {
    expect(offerUsesReference(GG_REPLY)).toBe(true);
    expect(quotedCredits(GG_REPLY)).toBe(2);
  });

  it('an offer that names no photo uses none', () => {
    expect(offerUsesReference('„A cat sleeping on a sunny beach, watercolor“ — 2 credits. დავიწყო?')).toBe(false);
    expect(offerUsesReference('ამ ფოტოზე დაყრდნობით: „a man in a suit, studio light“ დავიწყო?')).toBe(true);
  });

  it('reads the price in ka · en · ru, or none', () => {
    expect(quotedCredits('ფასი: 4 კრედიტი (0.40 ₾)')).toBe(4);
    expect(quotedCredits('Price: 2 cr (0.20 ₾)')).toBe(2);
    expect(quotedCredits('Цена: 6 кредитов')).toBe(6);
    expect(quotedCredits('a 9:16 portrait')).toBeNull();
  });

  it('the thread photo is the user\'s latest attached picture, not an assistant result or an audio file', () => {
    const msgs = [
      { role: 'user', text: 'old', medias: [{ dataUrl: 'data:image/png;base64,OLD', mimeType: 'image/png' }] },
      { role: 'assistant', text: 'ok', medias: [{ dataUrl: 'data:image/png;base64,BOT', mimeType: 'image/png' }] },
      { role: 'user', text: 'this one', medias: [{ dataUrl: 'data:image/jpeg;base64,MINE', mimeType: 'image/jpeg' }, { dataUrl: 'data:audio/mpeg;base64,A', mimeType: 'audio/mpeg' }] },
      { role: 'assistant', text: 'offer' },
    ];
    expect(latestThreadPhoto(msgs)).toBe('data:image/jpeg;base64,MINE');
    expect(latestThreadPhoto(msgs.slice(0, 2))).toBe('data:image/png;base64,OLD');
    expect(latestThreadPhoto([{ role: 'user', text: 'hi' }])).toBeUndefined();
    // Further back than the window: not „the" photo any more.
    expect(latestThreadPhoto([msgs[0]!, ...Array.from({ length: 40 }, () => ({ role: 'assistant', text: 'x' }))])).toBeUndefined();
  });
});
