/**
 * Which language the mic listens in: what the user types (native script only), what the server heard before, a
 * Georgian UI, else auto-detect — never just the UI locale.
 */
import {
  SPEECH_LANG_KEY,
  isSpeechLang,
  loadLearnedSpeechLang,
  resolveSpeechLang,
  saveLearnedSpeechLang,
  transcriptSpeechLang,
  typedSpeechLang,
} from './speechLang';

describe('transcriptSpeechLang', () => {
  test('the script decides; a native script beats any amount of Latin (brand names ride inside native speech)', () => {
    expect(transcriptSpeechLang('გამარჯობა, როგორ ხარ?')).toBe('ka-GE');
    expect(transcriptSpeechLang('გახსენი Instagram და YouTube')).toBe('ka-GE');
    expect(transcriptSpeechLang('открой YouTube')).toBe('ru-RU');
    expect(transcriptSpeechLang("what's the weather")).toBe('en-US');
  });
  test('nothing decisive → null', () => {
    expect(transcriptSpeechLang('')).toBeNull();
    expect(transcriptSpeechLang('123 !!')).toBeNull();
    expect(transcriptSpeechLang(null)).toBeNull();
  });
});

test('typed text counts only in a native script: Latin is often transliterated Georgian', () => {
  expect(typedSpeechLang('gamarjoba rogor xar')).toBeNull();
  expect(typedSpeechLang('hello')).toBeNull();
  expect(typedSpeechLang('გამარჯობა')).toBe('ka-GE');
  expect(typedSpeechLang('привет')).toBe('ru-RU');
});

describe('resolveSpeechLang', () => {
  test('typed → learned → Georgian UI → auto', () => {
    expect(resolveSpeechLang({ locale: 'en', typed: 'ka-GE', learned: 'en-US' })).toBe('ka-GE');
    expect(resolveSpeechLang({ locale: 'ka', typed: null, learned: 'ru-RU' })).toBe('ru-RU');
    expect(resolveSpeechLang({ locale: 'ka' })).toBe('ka-GE');
    expect(resolveSpeechLang({ locale: undefined })).toBe('ka-GE');
    expect(resolveSpeechLang({ locale: 'en' })).toBe('auto');
    expect(resolveSpeechLang({ locale: 'ru' })).toBe('auto');
  });
});

describe('the remembered language', () => {
  beforeEach(() => window.localStorage.clear());

  test('round-trips through localStorage; junk reads as unknown', () => {
    expect(loadLearnedSpeechLang()).toBeNull();
    saveLearnedSpeechLang('ru-RU');
    expect(window.localStorage.getItem(SPEECH_LANG_KEY)).toBe('ru-RU');
    expect(loadLearnedSpeechLang()).toBe('ru-RU');
    window.localStorage.setItem(SPEECH_LANG_KEY, 'de-DE');
    expect(loadLearnedSpeechLang()).toBeNull();
  });

  test('blocked storage never throws', () => {
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadLearnedSpeechLang()).toBeNull();
    expect(() => saveLearnedSpeechLang('ka-GE')).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });
});

test('isSpeechLang', () => {
  expect(isSpeechLang('ka-GE')).toBe(true);
  expect(isSpeechLang('auto')).toBe(false);
  expect(isSpeechLang(3)).toBe(false);
});
