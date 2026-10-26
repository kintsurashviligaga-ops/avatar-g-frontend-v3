import { SAID_MAX_CHARS, judgeSince, judgeUtterance, lastSaidSince, saidOf } from './spokenYes';
import { liveTranscriptionVocabulary } from './voicePrompt';

describe('judgeUtterance', () => {
  it.each([
    'yes', 'Yes.', 'yeah, go ahead', 'ok', 'Okay, start it', 'sure', 'yes please', 'do it', 'let\'s go', 'sounds good',
    'why not', 'no problem, go ahead', 'yes, start the video now', 'yes, 4 credits is fine', 'alright then',
    'კი', 'კი.', 'Კი', 'ჰო', 'დიახ', 'კი, დაიწყე', 'ჰო, გააკეთე', 'კარგი, გაუშვი', 'კი, რა თქმა უნდა', 'რატომაც არა',
    'თანახმა ვარ', 'აბა, დაიწყე', 'კი, მადლობა', 'დავიწყოთ', 'კი, დავიწყოთ', 'შექმენი', 'გავაკეთოთ',
    'да', 'Да.', 'да, давай', 'давай', 'конечно', 'хорошо, запускай', 'да, конечно, поехали', 'ок', 'почему бы и нет',
    'без проблем', 'согласен',
  ])('%s → yes', (s) => {
    expect(judgeUtterance(s)).toBe('yes');
  });

  it.each([
    'no', 'No, wait', 'not yet', 'wait', 'stop', 'cancel', 'hang on', 'never mind', 'don\'t', 'yes... no wait',
    'ok but not now', 'later',
    'არა', 'ჯერ არა', 'მოიცა', 'მოიცადე', 'გააუქმე', 'არ დაიწყო', 'კი არა', 'ნუ', 'მერე',
    'нет', 'да нет', 'не надо', 'подожди', 'стоп', 'отмена', 'потом', 'не сейчас',
  ])('%s → no', (s) => {
    expect(judgeUtterance(s)).toBe('no');
  });

  it.each([
    '', '   ', 'how much is it?', 'ok, how long will it take?', 'რა ღირს?', 'сколько стоит?',
    'yes, make it blue', 'yes, a video of cats', 'make a song about the sea', 'კი, ოღონდ ლურჯი', 'да, но синий',
    'hmm', 'thanks', 'მადლობა', 'спасибо', 'the price', 'credits', 'video', 'შექმენი ძაღლი', 'დავიწყოთ?',
  ])('%s → unclear', (s) => {
    expect(judgeUtterance(s)).toBe('unclear');
  });

  // ⚠️ GG 2026-10-26 07:13Z, myavatar.ge: the spoken „დაადასტურე" came back as „da-adasture." and started nothing.
  it.each([
    'da-adasture.', 'da adasture', 'daadasture', 'Dadasture', 'ki', 'Ki.', "k'i", 'kii', 'diakh', 'diax', 'diah', 'ho',
    'kho', 'kargi', 'kai', 'gaakete', 'gaushvi', 'daitsqe', 'ki, gaakete', 'ki batono', 'ra tkma unda', 'ratomats ara',
    'ok ki', 'ki please', 'kargi, gaushvi', 'ki, da-adasture',
  ])('Georgian in Latin letters: %s → yes', (s) => {
    expect(judgeUtterance(s)).toBe('yes');
  });

  it.each([
    'ara', 'Ara.', 'ki ara', 'ar daitsqo', 'moitsa', 'moitsade', 'mere', 'nu', 'ki, moitsa', 'da-adasture ara', 'ara?',
  ])('Georgian in Latin letters: %s → no', (s) => {
    expect(judgeUtterance(s)).toBe('no');
  });

  it.each([
    'ki?', 'da-adasture?', 'da', 'kreta', 'ki, oghond lurji', 'how much?', 'make a donkey', 'okay, create a donkey',
    'yes, make it blue', 'thanks', 'hello there',
  ])('Georgian in Latin letters: %s → unclear', (s) => {
    expect(judgeUtterance(s)).toBe('unclear');
  });

  it('never throws on what is not text', () => {
    expect(judgeUtterance(undefined as unknown as string)).toBe('unclear');
    expect(judgeUtterance(42 as unknown as string)).toBe('unclear');
  });
});

describe('saidOf', () => {
  it('collapses whitespace and cuts the evidence', () => {
    expect(saidOf('  კი,   დაიწყე  ')).toBe('კი, დაიწყე');
    expect(saidOf('y'.repeat(400))).toHaveLength(SAID_MAX_CHARS);
    expect(saidOf(null as unknown as string)).toBe('');
  });
});

describe('judgeSince', () => {
  const u = (text: string, at: number) => ({ text, at });

  it('counts only what was said after the price or the plan', () => {
    expect(judgeSince([u('yes', 100)], 200)).toEqual({ verdict: 'unclear', said: '' });
    expect(judgeSince([u('yes', 100), u('ok go', 250)], 200)).toEqual({ verdict: 'yes', said: 'ok go' });
  });

  it('a later no or hesitation cancels a yes', () => {
    expect(judgeSince([u('yes', 300), u('wait', 400)], 200)).toEqual({ verdict: 'no', said: 'wait' });
    expect(judgeSince([u('კი', 300), u('მოიცა', 400)], 200).verdict).toBe('no');
  });

  it('a later yes answers an earlier no', () => {
    expect(judgeSince([u('нет', 300), u('ладно, давай', 400)], 200)).toEqual({ verdict: 'yes', said: 'ладно, давай' });
  });

  it('a question after the yes leaves it standing', () => {
    expect(judgeSince([u('yes', 300), u('how long will it take?', 400)], 200)).toEqual({ verdict: 'yes', said: 'yes' });
  });

  it('a yes heard in Latin letters starts what the price was told for (GG 2026-10-26 07:13Z)', () => {
    expect(judgeSince([u('da-adasture.', 300)], 200)).toEqual({ verdict: 'yes', said: 'da-adasture.' });
    expect(judgeSince([u('ki', 300), u('ara', 400)], 200).verdict).toBe('no');
  });

  it('nothing heard is unclear, never yes', () => {
    expect(judgeSince([], 0)).toEqual({ verdict: 'unclear', said: '' });
    expect(judgeSince([u('make a song', 300)], 200).verdict).toBe('unclear');
  });

  it('a yes heard in Korean letters counts; „대자." does not (GG 2026-10-26 09:29Z)', () => {
    expect(judgeSince([u('끼', 300)], 200)).toEqual({ verdict: 'yes', said: '끼' });
    expect(judgeSince([u('대자.', 300)], 200)).toEqual({ verdict: 'unclear', said: '' });
  });
});

describe('lastSaidSince', () => {
  const u = (text: string, at: number) => ({ text, at });
  it('the newest words said since the price, for the note when nothing counted', () => {
    expect(lastSaidSince([u('a cup', 100), u('대자.', 300), u('  ', 400)], 200)).toBe('대자.');
    expect(lastSaidSince([u('a cup', 100)], 200)).toBe('');
    expect(lastSaidSince([], 0)).toBe('');
  });
});

describe('the Georgian answers the Live transcription is biased toward (lib/voice/voicePrompt)', () => {
  it('are each a yes or a no to this judge, so the hint and the gate agree', () => {
    for (const w of liveTranscriptionVocabulary()) expect(judgeUtterance(w)).not.toBe('unclear');
  });
});
