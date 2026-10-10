/** @jest-environment node */
/**
 * The pure rules of Agent G on WhatsApp: which language to answer in, what counts as a link code or a control word,
 * how a model's markdown becomes WhatsApp text, and how a long answer is split under the 4,096-character limit.
 */
import {
  WA_COPY,
  WHATSAPP_STYLE_NOTE,
  WHATSAPP_SUPPORT_EMAIL,
  chunkForWhatsApp,
  linkPage,
  maskNumber,
  parseCommand,
  parseConnectCode,
  studioLink,
  toWhatsAppText,
  waLang,
} from './whatsapp-text';

describe('waLang', () => {
  test('the script the person wrote in decides', () => {
    expect(waLang('აქ ხარ?')).toBe('ka');
    expect(waLang('Ты здесь?')).toBe('ru');
    expect(waLang('are you there?')).toBe('en');
  });
  test('no letters → the number decides (995 = Georgia), else English', () => {
    expect(waLang('👍', '995555123456')).toBe('ka');
    expect(waLang('👍', '14155550123')).toBe('en');
  });
});

describe('parseConnectCode', () => {
  test.each([
    ['connect ABCD2345', 'ABCD2345'],
    ['/connect abcd2345', 'ABCD2345'],
    ['Connect: ABCD2345', 'ABCD2345'],
    ['link - ABCD2345', 'ABCD2345'],
    ['დაკავშირება ABCD2345', 'ABCD2345'],
    ['подключить ABCD2345', 'ABCD2345'],
    ['  ABCD2345  ', 'ABCD2345'],
  ])('%s → %s', (text, code) => {
    expect(parseConnectCode(text)).toBe(code);
  });

  test.each([
    'hello',
    'abcd2345', // a bare code must be typed as shown
    'connect ABCD0123', // 0 and 1 are not in the alphabet
    'connect ABC',
    'please connect ABCD2345 now',
    'ABCD23456',
  ])('%s → null', (text) => {
    expect(parseConnectCode(text)).toBeNull();
  });
});

describe('parseCommand', () => {
  test('exact control words only', () => {
    expect(parseCommand('unlink')).toBe('unlink');
    expect(parseCommand('გათიშვა')).toBe('unlink');
    expect(parseCommand('Help')).toBe('help');
    expect(parseCommand('დახმარება')).toBe('help');
    expect(parseCommand('STOP')).toBe('alerts_off');
    expect(parseCommand('stop!')).toBe('alerts_off');
    expect(parseCommand('alerts on')).toBe('alerts_on');
    expect(parseCommand('stop the video please')).toBeNull();
    expect(parseCommand('how do I unlink?')).toBeNull();
  });
});

describe('toWhatsAppText', () => {
  test('headings, bold, links and bullets become WhatsApp formatting', () => {
    const md = '## Plan\n**Step one** and __two__\n* first\n* second\nSee [the docs](https://x.ge/d) or https://y.ge\n~~old~~';
    expect(toWhatsAppText(md)).toBe('*Plan*\n*Step one* and *two*\n• first\n• second\nSee the docs (https://x.ge/d) or https://y.ge\n~old~');
  });
  test('a link whose text is its URL is printed once; an image becomes its URL', () => {
    expect(toWhatsAppText('[https://a.ge](https://a.ge) ![x](https://b.ge/i.png)')).toBe('https://a.ge https://b.ge/i.png');
  });
  test('blank-line runs collapse', () => {
    expect(toWhatsAppText('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('chunkForWhatsApp', () => {
  test('short text is one message', () => {
    expect(chunkForWhatsApp('hello')).toEqual(['hello']);
  });
  test('long text splits on paragraph boundaries, every part under the limit', () => {
    const para = 'x'.repeat(1500);
    const parts = chunkForWhatsApp([para, para, para, para].join('\n\n'), 4000);
    expect(parts.length).toBe(2);
    expect(parts.every((p) => p.length <= 4000)).toBe(true);
    expect(parts.join('').replace(/\s/g, '').length).toBe(6000);
  });
  test('a single unbroken run is hard-split', () => {
    const parts = chunkForWhatsApp('y'.repeat(9000), 4000);
    expect(parts.map((p) => p.length)).toEqual([4000, 4000, 1000]);
  });
});

test('maskNumber never prints the whole number', () => {
  expect(maskNumber('995555123456')).toBe('+995 ••• ••456');
  expect(maskNumber('123')).toBe('•••');
});

test('studioLink opens the right tool with the request typed in (capped), on the person’s language', () => {
  const link = studioLink('https://myavatar.ge/', 'ka', 'image', '  დამიხატე კატა  ');
  const u = new URL(link);
  expect(u.pathname).toBe('/ka/dashboard');
  expect(u.searchParams.get('mode')).toBe('image');
  expect(u.searchParams.get('prompt')).toBe('დამიხატე კატა');
  expect(new URL(studioLink('https://myavatar.ge', 'en', 'video', 'z'.repeat(900))).searchParams.get('prompt')).toHaveLength(500);
});

test('linkPage points at the Settings card', () => {
  expect(linkPage('https://myavatar.ge/', 'ru')).toBe('https://myavatar.ge/ru/settings#whatsapp');
});

test('every language has every line', () => {
  const keys = Object.keys(WA_COPY.ka).sort();
  expect(Object.keys(WA_COPY.en).sort()).toEqual(keys);
  expect(Object.keys(WA_COPY.ru).sort()).toEqual(keys);
  for (const lang of ['ka', 'en', 'ru'] as const) {
    expect(WA_COPY[lang].notLinked('https://p')).toContain('https://p');
    expect(WA_COPY[lang].notLinked('https://p')).toMatch(/connect/);
    expect(WA_COPY[lang].studio('image', 'https://s')).toContain('https://s');
  }
});

describe('WHATSAPP_STYLE_NOTE: a service channel, not a general assistant (Meta Terms §4.7 until Meta answers)', () => {
  test('keeps Agent G to MyAvatar.ge, says it cannot search the web, and names a person to reach', () => {
    expect(WHATSAPP_STYLE_NOTE).toMatch(/only with MyAvatar\.ge/);
    expect(WHATSAPP_STYLE_NOTE).toMatch(/not a general-purpose assistant/);
    expect(WHATSAPP_STYLE_NOTE).toMatch(/cannot search the web/);
    expect(WHATSAPP_STYLE_NOTE).toContain(WHATSAPP_SUPPORT_EMAIL);
    // …and still never claims media from this chat.
    expect(WHATSAPP_STYLE_NOTE).toMatch(/cannot generate, attach or send/);
  });
});
