import { replyLanguageNote, spokenLanguageOf, withReplyLanguage, withReplyLanguageField } from './replyLanguage';

describe('spokenLanguageOf', () => {
  test.each([
    ['9,16 ფორმატის სურათი', 'Georgian'],
    ['კი', 'Georgian'],
    ['ცხენის სურათი, make it', 'Georgian'],
    ['كي?', 'Georgian'],
    ['की', 'Georgian'],
    ['대자.', 'Georgian'],
    ['Сделай картинку', 'Russian'],
    ['make a picture of a horse', 'English'],
    ['Yes.', 'English'],
    ["it's fine, go ahead", 'English'],
  ])('%s → %s', (text, lang) => {
    expect(spokenLanguageOf(text)).toBe(lang);
  });

  test.each(['', '   ', '9:16', 'Da-adasture.', 'ok', 'Okay', 'video', 'hello', 'start', 'Ki.', null, undefined, 42])(
    'tells nothing: %p', (text) => {
      expect(spokenLanguageOf(text)).toBeNull();
    },
  );
});

describe('withReplyLanguage', () => {
  test('a note ends with the line; unchanged with no language yet', () => {
    expect(withReplyLanguage('[App] Done.', 'Georgian')).toBe(`[App] Done.\n${replyLanguageNote('Georgian')}`);
    expect(withReplyLanguage('[App] Done.', null)).toBe('[App] Done.');
    expect(replyLanguageNote('Russian')).toContain('in Russian');
  });
});

describe('withReplyLanguageField', () => {
  const answers = [
    { id: 'a', name: 'prepare_generation', response: { ok: true, summary: 'Ready' } },
    { id: 'b', name: 'end_call', response: { error: 'not_supported' } },
    { id: 'c', name: 'x', response: { ok: true, reply_in: 'kept' } },
  ];

  test('each answer names the language; one that already does keeps its own; the input is not changed', () => {
    const out = withReplyLanguageField(answers, 'Georgian');
    expect(out[0]!.response).toEqual({ ok: true, summary: 'Ready', reply_in: replyLanguageNote('Georgian') });
    expect(out[1]!.response).toEqual({ error: 'not_supported', reply_in: replyLanguageNote('Georgian') });
    expect(out[2]!.response).toEqual({ ok: true, reply_in: 'kept' });
    expect(answers[0]!.response).toEqual({ ok: true, summary: 'Ready' });
  });

  test('no language yet: the answers as they were', () => {
    expect(withReplyLanguageField(answers, null)).toEqual(answers);
  });
});
