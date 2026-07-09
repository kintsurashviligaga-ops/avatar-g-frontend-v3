/** @jest-environment node */
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale } from './voicePrompt';

describe('normalizeVoiceLocale', () => {
  it('defaults to ka; honors en/ru', () => {
    expect(normalizeVoiceLocale('ka')).toBe('ka');
    expect(normalizeVoiceLocale('en')).toBe('en');
    expect(normalizeVoiceLocale('ru')).toBe('ru');
    expect(normalizeVoiceLocale('fr')).toBe('ka');
    expect(normalizeVoiceLocale(undefined)).toBe('ka');
  });
});

describe('buildVoiceReplyPrompt', () => {
  it('uses the Georgian short-spoken persona + the user turn', () => {
    const { system, user } = buildVoiceReplyPrompt('რა ამინდია?', 'ka');
    expect(system).toMatch(/MyAvatar/);
    expect(system).toMatch(/1-3/);          // short-reply directive
    expect(user).toContain('User: რა ამინდია?');
    expect(user.endsWith('Assistant:')).toBe(true);
  });
  it('includes only the last 6 history turns, trimmed', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as const, content: `turn ${i}` }));
    const { user } = buildVoiceReplyPrompt('now', 'en', history);
    expect(user).toContain('turn 9');
    expect(user).not.toContain('turn 3'); // dropped by the recency window
    expect(user).toContain('User: now');
  });
  it('ignores malformed history entries', () => {
    const { user } = buildVoiceReplyPrompt('hi', 'en', [{ role: 'x' as never, content: 'bad' }, { role: 'user', content: '  ' }]);
    expect(user).toBe('User: hi\nAssistant:');
  });
});

describe('trimForSpeech', () => {
  it('strips markdown / brackets / code fences / role label and caps length', () => {
    expect(trimForSpeech('Assistant: **Hi** there [pause] `code`')).toBe('Hi there  code'.replace(/\s{2,}/g, ' ').trim());
    expect(trimForSpeech('```js\nevil()\n```keep this')).toBe('keep this');
    expect(trimForSpeech(null)).toBe('');
    expect(trimForSpeech('x'.repeat(1000)).length).toBe(700);
  });
  it('keeps clean Georgian spoken text', () => {
    expect(trimForSpeech('დღეს მზიანი ამინდია.')).toBe('დღეს მზიანი ამინდია.');
  });
});

describe('voiceFallbackReply', () => {
  it('never returns empty (no silence on an LLM miss)', () => {
    (['ka', 'en', 'ru'] as const).forEach((l) => expect(voiceFallbackReply(l).length).toBeGreaterThan(0));
  });
});
