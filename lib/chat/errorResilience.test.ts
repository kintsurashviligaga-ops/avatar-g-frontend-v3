import { categorizeChatError, classifyChatError } from './errorResilience';

describe('categorizeChatError', () => {
  it('detects timeouts', () => {
    expect(categorizeChatError(new Error('Request timed out'))).toBe('timeout');
    expect(categorizeChatError('ETIMEDOUT')).toBe('timeout');
  });

  it('detects network faults', () => {
    expect(categorizeChatError(new TypeError('Failed to fetch'))).toBe('network');
    expect(categorizeChatError('NetworkError when attempting to fetch resource')).toBe('network');
    expect(categorizeChatError('connection reset')).toBe('network');
  });

  it('detects rate-limit / overload', () => {
    expect(categorizeChatError('HTTP 429 Too Many Requests')).toBe('rate');
    expect(categorizeChatError('model overloaded, capacity exceeded')).toBe('rate');
  });

  it('detects auth failures', () => {
    expect(categorizeChatError('401 Unauthorized')).toBe('auth');
    expect(categorizeChatError('Forbidden')).toBe('auth');
    expect(categorizeChatError('session expired')).toBe('auth');
  });

  it('detects server faults', () => {
    expect(categorizeChatError('500 server error')).toBe('server');
    expect(categorizeChatError('502 Bad Gateway')).toBe('server');
    expect(categorizeChatError('service unavailable')).toBe('server');
  });

  it('falls back to generic for unknown / empty', () => {
    expect(categorizeChatError('')).toBe('generic');
    expect(categorizeChatError(null)).toBe('generic');
    expect(categorizeChatError('weird unmatched thing')).toBe('generic');
  });
});

describe('classifyChatError', () => {
  it('returns a localized message for a known category', () => {
    const ka = classifyChatError(new Error('503 service unavailable'), 'ka');
    expect(ka.category).toBe('server');
    expect(ka.message).toMatch(/[Ⴀ-ჿ]/); // contains Georgian script
  });

  it('localizes per requested locale', () => {
    const ru = classifyChatError('Failed to fetch', 'ru');
    expect(ru.category).toBe('network');
    expect(ru.message).toMatch(/[А-Яа-я]/); // contains Cyrillic
  });

  it('uses a concise backend fallback only for generic errors', () => {
    const out = classifyChatError('unmatched', 'en', 'Insufficient balance');
    expect(out.category).toBe('generic');
    expect(out.message).toBe('Insufficient balance');
  });

  it('never surfaces giant or markup-laden blobs as the fallback', () => {
    const huge = 'x'.repeat(400);
    const out = classifyChatError('unmatched', 'en', huge);
    expect(out.message).not.toBe(huge);
    const html = classifyChatError('unmatched', 'en', '<html><body>error</body></html>');
    expect(html.message).not.toContain('<html>');
  });
});
