import { SAID_MAX_CHARS, judgeSince, judgeUtterance, saidOf } from './spokenYes';

describe('judgeUtterance', () => {
  it.each([
    'yes', 'Yes.', 'yeah, go ahead', 'ok', 'Okay, start it', 'sure', 'yes please', 'do it', 'let\'s go', 'sounds good',
    'why not', 'no problem, go ahead', 'yes, start the video now', 'yes, 4 credits is fine', 'alright then',
    'კი', 'კი.', 'Კი', 'ჰო', 'დიახ', 'კი, დაიწყე', 'ჰო, გააკეთე', 'კარგი, გაუშვი', 'კი, რა თქმა უნდა', 'რატომაც არა',
    'თანახმა ვარ', 'აბა, დაიწყე', 'კი, მადლობა',
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
    'hmm', 'thanks', 'მადლობა', 'спасибо', 'the price', 'credits', 'video',
  ])('%s → unclear', (s) => {
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

  it('nothing heard is unclear, never yes', () => {
    expect(judgeSince([], 0)).toEqual({ verdict: 'unclear', said: '' });
    expect(judgeSince([u('make a song', 300)], 200).verdict).toBe('unclear');
  });
});
