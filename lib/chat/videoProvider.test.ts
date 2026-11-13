/** @jest-environment node */
import {
  hasVideoProvider,
  videoProviderUnavailableMessage,
  videoProviderConnectionFailedMessage,
} from './videoProvider';

describe('hasVideoProvider (Google only, v5.1 M-14)', () => {
  test('an LTX key (any alias) or a Replicate token alone is no video route any more', () => {
    for (const env of [{ LTX_VIDEO_API_KEY: 'k' }, { LTX_API_KEY: 'k' }, { LTX2_API_KEY: 'k' }, { REPLICATE_API_TOKEN: 'r8' }]) {
      expect(hasVideoProvider(env as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  test('nothing configured → the halt condition', () => {
    expect(hasVideoProvider({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('videoProviderUnavailableMessage', () => {
  // The owner's plain-copy rule (2026-10-10, Omnichannel A3): „temporarily unavailable", never provider/API/config words.
  test('Georgian is the canonical copy: plain „temporarily unavailable"', () => {
    expect(videoProviderUnavailableMessage('ka')).toBe('ვიდეოს შექმნა დროებით მიუწვდომელია. სცადე ცოტა ხანში.');
  });

  test('falls back to Georgian for an unknown locale', () => {
    expect(videoProviderUnavailableMessage('zz')).toContain('დროებით მიუწვდომელია');
  });

  test('localizes en + ru', () => {
    expect(videoProviderUnavailableMessage('en')).toMatch(/temporarily unavailable/i);
    expect(videoProviderUnavailableMessage('ru')).toMatch(/временно недоступно/i);
  });

  test('no technical words in any language', () => {
    for (const loc of ['ka', 'en', 'ru']) {
      const text = videoProviderUnavailableMessage(loc) + ' ' + videoProviderConnectionFailedMessage(loc);
      expect(text).not.toMatch(/API|provider|провайдер|პროვაიდერ|ცვლად|переменн|config/i);
    }
  });
});

describe('videoProviderConnectionFailedMessage', () => {
  test('Georgian is the canonical runtime-failure copy and keeps the balance promise', () => {
    expect(videoProviderConnectionFailedMessage('ka')).toBe(
      'ვიდეოს სერვისთან კავშირი ვერ დამყარდა. ბალანსი დაცულია.',
    );
  });

  test('is distinct from the config-missing "unavailable" message', () => {
    expect(videoProviderConnectionFailedMessage('ka')).not.toBe(videoProviderUnavailableMessage('ka'));
  });

  test('promises balance protection in en + ru', () => {
    expect(videoProviderConnectionFailedMessage('en')).toMatch(/balance is protected/i);
    expect(videoProviderConnectionFailedMessage('ru')).toMatch(/Баланс сохранён/i);
  });

  test('falls back to Georgian for an unknown locale', () => {
    expect(videoProviderConnectionFailedMessage('zz')).toContain('ბალანსი დაცულია');
  });
});
