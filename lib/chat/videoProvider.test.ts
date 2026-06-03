/** @jest-environment node */
import {
  hasReplicateToken,
  hasVideoProvider,
  computeVideoProviderStatus,
  videoProviderUnavailableMessage,
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
