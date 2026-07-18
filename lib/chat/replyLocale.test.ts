import { detectReplyLocale } from './replyLocale';

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
