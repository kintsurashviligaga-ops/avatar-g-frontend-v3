/** @jest-environment node */
import { buildVoiceReplyPrompt, trimForSpeech, voiceFallbackReply, normalizeVoiceLocale, detectSpokenLocale } from './voicePrompt';

describe('normalizeVoiceLocale', () => {
  it('defaults to ka; honors en/ru', () => {
    expect(normalizeVoiceLocale('ka')).toBe('ka');
    expect(normalizeVoiceLocale('en')).toBe('en');
    expect(normalizeVoiceLocale('ru')).toBe('ru');
    expect(normalizeVoiceLocale('fr')).toBe('ka');
    expect(normalizeVoiceLocale(undefined)).toBe('ka');
  });
});

describe('detectSpokenLocale — answer in the language actually spoken (VECTOR 2)', () => {
  it('detects the dominant script regardless of the UI-locale fallback', () => {
    expect(detectSpokenLocale('რა ამინდია დღეს?', 'en')).toBe('ka');   // Georgian speech, en UI
    expect(detectSpokenLocale('Какая сегодня погода?', 'ka')).toBe('ru'); // THE reported bug: Russian in a ka session
    expect(detectSpokenLocale('What is the weather today?', 'ka')).toBe('en'); // English in a ka session
  });
  it('falls back to the UI locale when the transcript has no decisive letters', () => {
    expect(detectSpokenLocale('', 'ka')).toBe('ka');
    expect(detectSpokenLocale('123 456 — !!', 'ru')).toBe('ru');
    expect(detectSpokenLocale('   ', 'en')).toBe('en');
  });
  it('picks the majority script when languages are mixed (a Latin brand name inside Georgian stays ka)', () => {
    expect(detectSpokenLocale('გადმომიწერე MyAvatar-ზე ინფორმაცია', 'ka')).toBe('ka');
    expect(detectSpokenLocale('открой Instagram сейчас', 'ka')).toBe('ru');
  });

  it('a SHORT native command whose Latin brand name out-counts the native letters still stays native (review fix)', () => {
    // regression: raw letter-count made these flip to 'en' (Instagram=9 Latin > 7 Georgian). Native must win.
    expect(detectSpokenLocale('გახსენი Instagram', 'en')).toBe('ka');
    expect(detectSpokenLocale('დამირეკე Facebook Messenger', 'en')).toBe('ka');
    expect(detectSpokenLocale('открой Instagram', 'ka')).toBe('ru');
    expect(detectSpokenLocale('включи YouTube', 'ka')).toBe('ru');
    // a genuinely English utterance (no native script) still answers in English
    expect(detectSpokenLocale('open Instagram please', 'ka')).toBe('en');
  });
});

describe('buildVoiceReplyPrompt', () => {
  it('uses the Georgian short-spoken persona + the user turn', () => {
    const { system, user } = buildVoiceReplyPrompt('რა ამინდია?', 'ka');
    expect(system).toMatch(/MyAvatar/);
    expect(system).toMatch(/1-2/);          // short-reply directive (VECTOR 2 — tightened for voice latency)
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

  it('VECTOR 2 — Georgian persona enforces the short-reply latency constraint (1-2 sentences, ≤20 words)', () => {
    const { system } = buildVoiceReplyPrompt('რა ამინდია?', 'ka');
    expect(system).toMatch(/1-2/);            // at most 1-2 sentences
    expect(system).toMatch(/20\s*სიტყვ/);    // up to 20 words (ქართული: "20 სიტყვამდე")
    // every locale carries the tight constraint so voice replies stay low-latency
    for (const l of ['ka', 'en', 'ru'] as const) {
      expect(buildVoiceReplyPrompt('x', l).system).toMatch(/1-2|20/);
    }
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

  it('VECTOR 2 — honors the tighter Georgian spoken-char cap the voice route passes (320)', () => {
    // /api/voice/chat passes speechCap=320 for ka so eleven_v3 synthesizes a small payload → lower latency.
    expect(trimForSpeech('ა'.repeat(1000), 320).length).toBe(320);
    expect(trimForSpeech('ა'.repeat(1000), 520).length).toBe(520); // en/ru cap
  });
});

describe('voiceFallbackReply', () => {
  it('never returns empty (no silence on an LLM miss)', () => {
    (['ka', 'en', 'ru'] as const).forEach((l) => expect(voiceFallbackReply(l).length).toBeGreaterThan(0));
  });
});
