/** @jest-environment node */
import { FALLBACK_PER_SECOND_16x9, parsePer1kTokens, parsePerSecond16x9, videoTokensUsd } from './tokenPricing';

/** Verbatim from POST /estimate/bytedance/seedance-2.5/text-to-video, 2026-09-29. */
const LIVE =
  'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, '
  + '$0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at '
  + '1080p. Billable video tokens = ceil(output height × output width × (input video duration + generated video '
  + 'duration) × 24 / 1024). Image and audio references do not count as video input. Actual pricing depends on output '
  + 'dimensions and billable duration. Rates shown are before any applicable customer discount.';

describe('parsing the provider’s own numbers', () => {
  test('per-second 16:9 rates and per-1k-token rates come out of the live text', () => {
    expect(parsePerSecond16x9(LIVE)).toEqual({ '480p': 0.2056, '720p': 0.4622, '1080p': 1.1372 });
    expect(parsePer1kTokens(LIVE)).toEqual({ '480p': 0.0214, '720p': 0.0214, '1080p': 0.0234 });
  });
  test('unparseable or missing text → null (the recorded fallback is used instead)', () => {
    expect(parsePerSecond16x9('pricing changed')).toBeNull();
    expect(parsePerSecond16x9(null)).toBeNull();
    expect(parsePer1kTokens('')).toBeNull();
  });
});

describe('videoTokensUsd — never below cost', () => {
  test('720p 16:9, 5 s → the documented ~$0.4622/s', () => {
    // 1280×720×24/1024 = 21,600 tokens/s × $0.0214/1k = $0.46224/s × 5 s
    expect(videoTokensUsd({ duration: 5, resolution: '720p', aspect_ratio: '16:9' }, LIVE)).toBe(2.3112);
  });

  test('480p 16:9, 4 s', () => {
    expect(videoTokensUsd({ duration: 4, resolution: '480p', aspect_ratio: '16:9' }, LIVE)).toBeCloseTo(0.8224, 3);
  });

  test('1:1 is never priced below the 16:9 rate (its true pixel size is unpublished)', () => {
    expect(videoTokensUsd({ duration: 5, resolution: '720p', aspect_ratio: '1:1' }, LIVE)).toBe(2.311);
  });

  test('a wide 21:9 frame costs MORE than 16:9', () => {
    const wide = videoTokensUsd({ duration: 5, resolution: '720p', aspect_ratio: '21:9' }, LIVE)!;
    expect(wide).toBeGreaterThan(2.3112);
    expect(wide).toBe(3.0335);
  });

  test('the price scales with duration; defaults are 5 s / 720p / 16:9', () => {
    expect(videoTokensUsd({ duration: 10, resolution: '720p', aspect_ratio: '16:9' }, LIVE)).toBe(4.6224);
    expect(videoTokensUsd({}, LIVE)).toBe(2.3112);
  });

  test('without the description the recorded 2026-09-29 rates give the same answer', () => {
    expect(videoTokensUsd({ duration: 5, resolution: '720p', aspect_ratio: '16:9' }, null)).toBe(2.3112);
    expect(FALLBACK_PER_SECOND_16x9['720p']).toBe(0.4622);
  });

  test('a new, higher published rate is honoured', () => {
    const pricier = LIVE.replace('$0.4622 at 720p', '$0.9000 at 720p');
    expect(videoTokensUsd({ duration: 5, resolution: '720p', aspect_ratio: '16:9' }, pricier)).toBe(4.5);
  });

  test('an unusable duration → null (the saga then refuses to charge)', () => {
    expect(videoTokensUsd({ duration: 0 }, LIVE)).toBeNull();
    expect(videoTokensUsd({ duration: 'x' }, LIVE)).toBeNull();
  });
});
