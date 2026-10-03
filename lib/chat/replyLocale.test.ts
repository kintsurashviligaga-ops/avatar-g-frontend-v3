import { detectReplyLocale, isReplyLocale, replyLocaleForText, resolveReplyLocale, type ReplyLocale } from './replyLocale';

const user = (content: string) => ({ role: 'user', content });

describe('detectReplyLocale — 3-script chat reply-language (ka/en/ru)', () => {
  it('detects each script from the latest message', () => {
    expect(detectReplyLocale([user('привет, как дела?')])).toBe('ru'); // Cyrillic → ru (was the missing case)
    expect(detectReplyLocale([user('რა ამბავია?')])).toBe('ka');
    expect(detectReplyLocale([user('what is the weather?')])).toBe('en');
  });

  it('uses the LATEST message when the language switches mid-conversation', () => {
    const convo = [user('რა ხდება?'), { role: 'assistant', content: 'პასუხი' }, user('теперь по-русски')];
    expect(detectReplyLocale(convo)).toBe('ru');
  });

  it('detects from PROSE only — a Georgian question about English code stays ka', () => {
    expect(detectReplyLocale([user('ახსენი ეს კოდი:\n```js\nconst handler = (req, res) => res.send("hello world lots of latin");\n```')])).toBe('ka');
    expect(detectReplyLocale([user('что делает `useEffect`?')])).toBe('ru'); // inline code stripped → Cyrillic wins
  });

  it('falls back to ka when no message carries a decisive script', () => {
    expect(detectReplyLocale([user('12345 !!! ???')])).toBe('ka');
    expect(detectReplyLocale([])).toBe('ka');
    expect(detectReplyLocale(null as unknown as [])).toBe('ka');
  });

  it('handles multimodal (parts) content', () => {
    expect(detectReplyLocale([{ role: 'user', content: [{ type: 'text', text: 'опиши это фото' }, { type: 'image', image: 'https://x/y.jpg' }] }])).toBe('ru');
  });
});

// ─── With the UI locale as a hint ────────────────────────────────────────────

const assistant = (content: string) => ({ role: 'assistant', content });
const UI_LOCALES: readonly ReplyLocale[] = ['ka', 'en', 'ru'];

describe('isReplyLocale', () => {
  it('accepts exactly ka / en / ru', () => {
    for (const l of UI_LOCALES) expect(isReplyLocale(l)).toBe(true);
    for (const bad of ['KA', 'En', 'fr', 'ka-GE', '', ' ka', null, undefined, 1, {}, ['ka']]) {
      expect([bad, isReplyLocale(bad)]).toEqual([bad, false]);
    }
  });
});

describe('replyLocaleForText — short or ambiguous text follows the UI locale', () => {
  it.each(UI_LOCALES)('UI %s: "ok", "?", emoji, digits, one word and product names stay in the UI locale', (ui) => {
    for (const text of ['ok', 'OK!', '?', '???', '👍', '🙂🙏', '12345', 'lol', 'Hello', 'thanks!', 'iPhone 15 Pro', 'iPhone 15 Pro?', 'GPT-5', '', '   ']) {
      expect([text, replyLocaleForText(text, ui)]).toEqual([text, ui]);
    }
  });

  it('a single Georgian or Cyrillic letter is not enough to leave the UI locale (≥ 2 letters decide)', () => {
    expect(replyLocaleForText('ok я', 'ka')).toBe('ka');
    expect(replyLocaleForText('ა', 'en')).toBe('en');
    expect(replyLocaleForText('ок', 'ka')).toBe('ru'); // two Cyrillic letters
  });

  it('tolerates a non-string text', () => {
    expect(replyLocaleForText(undefined as unknown as string, 'ru')).toBe('ru');
    expect(replyLocaleForText(42 as unknown as string, 'ka')).toBe('ka');
  });
});

describe('replyLocaleForText — product codes are terms, not English words', () => {
  it('letters glued to digits ("i5", "A4", "13400F") never count as the English "i" / "a"', () => {
    for (const ui of ['ka', 'ru'] as const) {
      for (const text of ['Core i5 13400F', 'i5 vs i7', 'A4 paper', 'RTX 4070 Ti', 'M3 Pro 16GB']) {
        expect([text, ui, replyLocaleForText(text, ui)]).toEqual([text, ui, ui]);
      }
    }
  });

  it('a real English sentence around a product code is still English', () => {
    expect(replyLocaleForText('is the i5 good for gaming?', 'ka')).toBe('en');
  });
});

describe('replyLocaleForText — Georgian or Cyrillic letters win over the UI hint', () => {
  it.each(UI_LOCALES)('UI %s: Georgian text is ka, Cyrillic text is ru', (ui) => {
    expect(replyLocaleForText('გამარჯობა, როგორ ხარ?', ui)).toBe('ka');
    expect(replyLocaleForText('Привет, как дела?', ui)).toBe('ru');
  });

  it('Latin words beside Georgian are names, terms or pasted text — the request is Georgian', () => {
    expect(replyLocaleForText('თარგმნე: The quick brown fox jumps over the lazy dog', 'ka')).toBe('ka');
    expect(replyLocaleForText('თარგმნე: The quick brown fox jumps over the lazy dog', 'ru')).toBe('ka');
    expect(replyLocaleForText('რა ღირს iPhone 15 Pro?', 'en')).toBe('ka');
    expect(replyLocaleForText('сколько стоит iPhone 15 Pro?', 'ka')).toBe('ru');
  });

  it('Georgian Mtavruli capitals count as Georgian', () => {
    expect(replyLocaleForText('ᲒᲐᲛᲐᲠᲯᲝᲑᲐ', 'ru')).toBe('ka');
  });
});

describe('replyLocaleForText — Latin text', () => {
  it('Georgian typed in Latin letters is ka with a Georgian UI', () => {
    for (const text of ['gamarjoba rogor xar', 'Gamarjoba, rogor khar?', 'me minda', 'madloba dzalian', 'ra xdeba?', 'momwere leqsi']) {
      expect([text, replyLocaleForText(text, 'ka')]).toEqual([text, 'ka']);
    }
  });

  it('…but only with a Georgian UI (an English or Russian UI does not read translit as Georgian)', () => {
    expect(replyLocaleForText('gamarjoba rogor xar', 'en')).toBe('en');
    expect(replyLocaleForText('gamarjoba rogor xar', 'ru')).toBe('ru');
  });

  it('weak translit words alone ("me", "da") are not Georgian', () => {
    expect(replyLocaleForText('da', 'ka')).toBe('ka'); // one word → UI anyway
    expect(replyLocaleForText('me too', 'ka')).toBe('en'); // "me" is an English function word here
  });

  it('an English sentence (two words or more with a function word) is en, whatever the UI', () => {
    for (const ui of UI_LOCALES) {
      expect([ui, replyLocaleForText('how are you today?', ui)]).toEqual([ui, 'en']);
      expect([ui, replyLocaleForText('thank you', ui)]).toEqual([ui, 'en']);
      expect([ui, replyLocaleForText("I'm looking for a good camera", ui)]).toEqual([ui, 'en']);
    }
  });

  it('two Latin words with no English function word are not English', () => {
    expect(replyLocaleForText('Samsung Galaxy', 'ka')).toBe('ka');
    expect(replyLocaleForText('Samsung Galaxy', 'ru')).toBe('ru');
  });

  it('with an English UI an English sentence wraps whatever it quotes', () => {
    expect(replyLocaleForText('translate to English: გამარჯობა', 'en')).toBe('en');
    expect(replyLocaleForText('what does привет mean?', 'en')).toBe('en');
    // …while the same sentence under a Georgian UI is still decided by its Georgian letters.
    expect(replyLocaleForText('translate to English: გამარჯობა', 'ka')).toBe('ka');
  });
});

describe('replyLocaleForText — only the user\'s OWN words count', () => {
  it('fenced and inline code are ignored', () => {
    expect(replyLocaleForText('```js\nconsole.log("how are you today, this is the code");\n```', 'ka')).toBe('ka');
    expect(replyLocaleForText('`how are you doing today`', 'ru')).toBe('ru');
    expect(replyLocaleForText('ეს რას აკეთებს?\n```\nif (user.is(admin)) { return the(value) }\n```', 'en')).toBe('ka');
  });

  it('quoted passages are ignored (straight, curly, „low“ and «guillemet» quotes)', () => {
    for (const text of ['"how are you today?"', '“how are you today?”', '„how are you today?“', '«how are you today?»']) {
      expect([text, replyLocaleForText(text, 'ka')]).toEqual([text, 'ka']);
    }
    expect(replyLocaleForText('«Привет, как дела?»', 'en')).toBe('en');
  });

  it('"> " quoted lines are ignored', () => {
    expect(replyLocaleForText('> how are you today and what is the plan\nok', 'ka')).toBe('ka');
    expect(replyLocaleForText('  > Привет, как дела?\n👍', 'en')).toBe('en');
  });

  it('links are ignored (a URL full of English words is not an English message)', () => {
    expect(replyLocaleForText('https://example.com/how-are-you-the-best-guide-for-you', 'ka')).toBe('ka');
    expect(replyLocaleForText('http://ru.example.com/как-дела', 'en')).toBe('en');
    expect(replyLocaleForText('ნახე ეს https://example.com/how-to-do-it', 'en')).toBe('ka');
  });

  it('the user\'s prose outside the code still decides', () => {
    expect(replyLocaleForText('can you explain this code?\n```\nconst ა = 1; // ქართული კომენტარი\n```', 'ka')).toBe('en');
  });
});

describe('resolveReplyLocale', () => {
  it('without a valid uiLocale it is the legacy dominant-script detection', () => {
    const msgs = [user('ok')];
    expect(resolveReplyLocale(msgs)).toBe(detectReplyLocale(msgs));
    expect(resolveReplyLocale(msgs)).toBe('en'); // legacy: Latin dominates
    for (const bad of [undefined, null, '', 'fr', 'KA', 42]) {
      expect([bad, resolveReplyLocale(msgs, bad)]).toEqual([bad, 'en']);
    }
    expect(resolveReplyLocale([])).toBe('ka');
    // With a UI hint the same "ok" follows the UI instead.
    expect(resolveReplyLocale(msgs, 'ka')).toBe('ka');
    expect(resolveReplyLocale(msgs, 'ru')).toBe('ru');
  });

  it('uses the LATEST USER message, never a newer assistant one', () => {
    const convo = [user('how are you today?'), assistant('მადლობა, კარგად ვარ! რით დაგეხმარო?')];
    expect(resolveReplyLocale(convo, 'ka')).toBe('en');
    // The legacy detector read the assistant turn (the latest message).
    expect(resolveReplyLocale(convo)).toBe('ka');

    const ru = [user('გამარჯობა'), assistant('Hello! How can I help you today?'), user('Привет, как дела?'), assistant('Хорошо!')];
    expect(resolveReplyLocale(ru, 'en')).toBe('ru');
  });

  it('only the latest user message decides — an ambiguous one follows the UI, not an older user turn', () => {
    const convo = [user('Привет, как дела?'), assistant('Хорошо, спасибо!'), user('ok')];
    expect(resolveReplyLocale(convo, 'ka')).toBe('ka');
    expect(resolveReplyLocale(convo, 'en')).toBe('en');
  });

  it('reads multimodal (parts) content', () => {
    const msg = { role: 'user', content: [{ type: 'image', image: 'https://x/y.jpg' }, { type: 'text', text: 'опиши это фото' }] };
    expect(resolveReplyLocale([msg], 'en')).toBe('ru');
    // An image-only turn has no words: the UI locale.
    expect(resolveReplyLocale([{ role: 'user', content: [{ type: 'image', image: 'https://x/y.jpg' }] }], 'ru')).toBe('ru');
  });

  it('no user message, or no message list at all, is the UI locale', () => {
    expect(resolveReplyLocale([], 'ru')).toBe('ru');
    expect(resolveReplyLocale([assistant('Hello, how are you today?')], 'ka')).toBe('ka');
    expect(resolveReplyLocale(null as unknown as [], 'en')).toBe('en');
    expect(resolveReplyLocale([null as unknown as { content: string }, user('gamarjoba rogor xar')], 'ka')).toBe('ka');
  });
});
