/** @jest-environment node */
/**
 * lib/speech/locale — a read is voiced in its text's language, not the page's (GG, production 2026-10-24: English and
 * Russian replies on the Georgian studio were read as Georgian).
 */
import { speechLocaleOf } from './locale';
import { SpeechPlayer, type SpeechAudio } from './player';
import type { SpeechLocale } from './contract';

test.each<[string, SpeechLocale, SpeechLocale]>([
  ['Hello! How can I help you today?', 'ka', 'en'],
  ['Привет! Чем могу помочь?', 'ka', 'ru'],
  ['გამარჯობა! რით შემიძლია დაგეხმაროთ?', 'en', 'ka'],
  ['გამარჯობა! რით შემიძლია დაგეხმაროთ?', 'ru', 'ka'],
  ['Hello, how are you?', 'ru', 'en'],
])('%p on a %p page is read as %p', (text, page, voiced) => {
  expect(speechLocaleOf(text, page)).toBe(voiced);
});

test('a Georgian sentence full of English terms is still Georgian', () => {
  expect(speechLocaleOf('გამოიყენე React-ის useEffect hook და Next.js App Router.', 'en')).toBe('ka');
  expect(speechLocaleOf('Используй React useEffect и Next.js App Router.', 'ka')).toBe('ru');
});

test('an English reply that names a Georgian or Russian word once stays English', () => {
  expect(speechLocaleOf('Tbilisi (თბილისი) is the capital of Georgia, with about 1.2 million people.', 'ka')).toBe('en');
  expect(speechLocaleOf('The Russian word for thanks is спасибо, and people say it a lot.', 'ka')).toBe('en');
});

test('code and links say nothing of the language', () => {
  const ka = 'აი მაგალითი:\n```js\nconst answer = await fetch("https://example.com/api/items?page=1").then((r) => r.json());\n```\nნახე `useEffect` და https://nextjs.org/docs/app/building-your-application.';
  expect(speechLocaleOf(ka, 'en')).toBe('ka');
});

test('a text with no letters to speak of keeps the page\'s language', () => {
  for (const page of ['ka', 'en', 'ru'] as const) {
    expect(speechLocaleOf('👍', page)).toBe(page);
    expect(speechLocaleOf('12:30 — 14:00', page)).toBe(page);
    expect(speechLocaleOf('?', page)).toBe(page);
    expect(speechLocaleOf('', page)).toBe(page);
  }
});

test('the player asks for every chunk of a read in the text\'s language, decided once', () => {
  const asked: { text: string; locale: SpeechLocale }[] = [];
  const audio: SpeechAudio = { src: '', onended: null, onerror: null, play: () => Promise.resolve(), pause: () => {} };
  const player = new SpeechPlayer({
    synth: (text, locale) => { asked.push({ text, locale }); return new Promise<Blob | null>(() => {}); },
    createAudio: () => audio,
    createObjectURL: () => 'blob:x',
    revokeObjectURL: () => {},
  });
  // A Russian reply whose second sentence is only Latin letters: still one Russian voice for the whole read.
  player.play({ owner: 'omni:c:1', text: 'Это первое предложение ответа. Next.js App Router.', locale: 'ka', chunking: { maxChars: 32 } });
  expect(asked.length).toBe(2);
  expect(asked.map((a) => a.locale)).toEqual(['ru', 'ru']);
  player.dispose();
});
