/** @jest-environment node */
import {
  hasReplicateToken,
  hasVideoProvider,
  computeVideoProviderStatus,
  selectVideoPrimaryProvider,
  videoProviderUnavailableMessage,
  videoProviderConnectionFailedMessage,
} from './videoProvider';

describe('hasReplicateToken', () => {
  test('true only for a non-empty REPLICATE_API_TOKEN', () => {
    expect(hasReplicateToken({ REPLICATE_API_TOKEN: 'r8_live' })).toBe(true);
    expect(hasReplicateToken({ REPLICATE_API_TOKEN: '   ' })).toBe(false);
    expect(hasReplicateToken({})).toBe(false);
  });
});

describe('hasVideoProvider', () => {
  test('true when LTX (any alias) is present', () => {
    expect(hasVideoProvider({ LTX_VIDEO_API_KEY: 'k' })).toBe(true);
    expect(hasVideoProvider({ LTX_API_KEY: 'k' })).toBe(true);
    expect(hasVideoProvider({ LTX2_API_KEY: 'k' })).toBe(true);
  });

  test('true when only Replicate is present (LTX absent)', () => {
    expect(hasVideoProvider({ REPLICATE_API_TOKEN: 'r8' })).toBe(true);
  });

  test('false when NEITHER provider is configured — the halt condition', () => {
    expect(hasVideoProvider({})).toBe(false);
    expect(hasVideoProvider({ LTX2_API_KEY: '', REPLICATE_API_TOKEN: '  ' })).toBe(false);
  });
});

describe('computeVideoProviderStatus', () => {
  test('reports per-provider presence and the names-only checked env', () => {
    const s = computeVideoProviderStatus({ LTX2_API_KEY: 'k' });
    expect(s.ready).toBe(true);
    expect(s.ltx).toBe(true);
    expect(s.replicate).toBe(false);
    expect(s.checkedEnv.ltx).toContain('LTX2_API_KEY');
    expect(s.checkedEnv.replicate).toContain('REPLICATE_API_TOKEN');
  });

  test('unconfigured env → not ready', () => {
    expect(computeVideoProviderStatus({}).ready).toBe(false);
  });
});

describe('selectVideoPrimaryProvider', () => {
  test('LTX wins as PRIMARY whenever its key is present — even if Replicate is also set', () => {
    expect(selectVideoPrimaryProvider({ LTX_VIDEO_API_KEY: 'k' })).toEqual({
      primary: 'ltx',
      reason: 'ltx-key-present',
    });
    // LTX still wins over a co-provisioned Replicate token (LTX is the director).
    expect(selectVideoPrimaryProvider({ LTX2_API_KEY: 'k', REPLICATE_API_TOKEN: 'r8' })).toEqual({
      primary: 'ltx',
      reason: 'ltx-key-present',
    });
  });

  test('Replicate is promoted to PRIMARY when no LTX key exists — the silent-skip-trap fix', () => {
    // This is the exact case that used to pass the hasVideoProvider pre-flight and
    // then skip every clip AFTER reserving a founder slot / GEL.
    expect(selectVideoPrimaryProvider({ REPLICATE_API_TOKEN: 'r8' })).toEqual({
      primary: 'replicate',
      reason: 'ltx-key-absent',
    });
  });

  test('no provider → null halt (the pipeline must not spend)', () => {
    expect(selectVideoPrimaryProvider({})).toEqual({ primary: null, reason: 'no-provider' });
    expect(selectVideoPrimaryProvider({ LTX_API_KEY: '   ', REPLICATE_API_TOKEN: '' })).toEqual({
      primary: null,
      reason: 'no-provider',
    });
  });

  test('decision stays consistent with hasVideoProvider across every env shape', () => {
    const envs: NodeJS.ProcessEnv[] = [
      {},
      { LTX_VIDEO_API_KEY: 'k' },
      { LTX_API_KEY: 'k' },
      { LTX2_API_KEY: 'k' },
      { REPLICATE_API_TOKEN: 'r8' },
      { LTX2_API_KEY: 'k', REPLICATE_API_TOKEN: 'r8' },
      { LTX2_API_KEY: '   ', REPLICATE_API_TOKEN: '  ' },
    ];
    for (const env of envs) {
      const decided = selectVideoPrimaryProvider(env).primary !== null;
      expect(decided).toBe(hasVideoProvider(env));
    }
  });
});

describe('videoProviderUnavailableMessage', () => {
  test('Georgian is the canonical copy and matches the product spec verbatim', () => {
    expect(videoProviderUnavailableMessage('ka')).toBe(
      'სისტემური ხარვეზი: ვიდეო პროვაიდერი მიუწვდომელია. გთხოვთ, შეავსოთ API ცვლადები.',
    );
  });

  test('falls back to Georgian for an unknown locale', () => {
    expect(videoProviderUnavailableMessage('zz')).toContain('სისტემური ხარვეზი');
  });

  test('localizes en + ru', () => {
    expect(videoProviderUnavailableMessage('en')).toMatch(/video provider is unavailable/i);
    expect(videoProviderUnavailableMessage('ru')).toMatch(/видео-провайдер недоступен/i);
  });
});

describe('videoProviderConnectionFailedMessage', () => {
  test('Georgian is the canonical runtime-failure copy and matches the spec verbatim', () => {
    expect(videoProviderConnectionFailedMessage('ka')).toBe(
      'ვიდეო პროვაიდერთან კავშირი ვერ დამყარდა. ბალანსი დაცულია.',
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
