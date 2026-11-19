import {
  CLIP_AVOID_MAX, CLIP_SEED_MAX, clipAdvancedBody, clipAdvancedServerOn, clipAdvancedUiOn, mergeClipNegative, normalizeClipAvoid,
  normalizeClipSeed, parseClipAdvanced, randomClipSeed,
} from './clipAdvanced';

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

test('both flags ship off and read only truthy words', () => {
  delete process.env.NEXT_PUBLIC_CLIP_ADVANCED; delete process.env.CLIP_ADVANCED;
  expect(clipAdvancedUiOn()).toBe(false);
  expect(clipAdvancedServerOn()).toBe(false);
  for (const v of ['0', 'off', 'false', 'nope', '']) {
    process.env.NEXT_PUBLIC_CLIP_ADVANCED = v; process.env.CLIP_ADVANCED = v;
    expect(clipAdvancedUiOn()).toBe(false);
    expect(clipAdvancedServerOn()).toBe(false);
  }
  for (const v of ['1', 'on', 'TRUE', ' yes ']) {
    process.env.NEXT_PUBLIC_CLIP_ADVANCED = v; process.env.CLIP_ADVANCED = v;
    expect(clipAdvancedUiOn()).toBe(true);
    expect(clipAdvancedServerOn()).toBe(true);
  }
});

test('avoid: whitespace folded, control characters dropped, the words kept', () => {
  expect(normalizeClipAvoid('  text\u0000 on\n\nscreen \t ')).toBe('text on screen');
  expect(normalizeClipAvoid('ეკრანზე ტექსტი')).toBe('ეკრანზე ტექსტი');
  expect(normalizeClipAvoid(7)).toBe('');
});

test('seed: a whole number in uint32, else null', () => {
  expect(normalizeClipSeed(0)).toBe(0);
  expect(normalizeClipSeed(CLIP_SEED_MAX)).toBe(CLIP_SEED_MAX);
  expect(normalizeClipSeed(' 4471 ')).toBe(4471);
  for (const v of [-1, CLIP_SEED_MAX + 1, 1.5, Number.NaN, '12a', '', null, undefined, {}]) expect(normalizeClipSeed(v)).toBeNull();
});

test('randomClipSeed stays in range', () => {
  expect(randomClipSeed(() => 0)).toBe(0);
  expect(randomClipSeed(() => 0.999999999999)).toBeLessThanOrEqual(CLIP_SEED_MAX);
});

test('parse: absent is none; present and wrong is refused', () => {
  expect(parseClipAdvanced({})).toEqual({ ok: true, value: { avoid: '', seed: null } });
  expect(parseClipAdvanced({ avoid: ' blur ', seed: 9 })).toEqual({ ok: true, value: { avoid: 'blur', seed: 9 } });
  expect(parseClipAdvanced({ avoid: 'x'.repeat(CLIP_AVOID_MAX) }).ok).toBe(true);
  expect(parseClipAdvanced({ avoid: 'x'.repeat(CLIP_AVOID_MAX + 1) })).toEqual({ ok: false, field: 'avoid', code: 'too_long' });
  expect(parseClipAdvanced({ avoid: 3 })).toEqual({ ok: false, field: 'avoid', code: 'invalid' });
  expect(parseClipAdvanced({ seed: 'abc' })).toEqual({ ok: false, field: 'seed', code: 'invalid' });
  expect(parseClipAdvanced(null)).toEqual({ ok: true, value: { avoid: '', seed: null } });
});

test('the body carries only the fields that are set', () => {
  expect(clipAdvancedBody(undefined)).toEqual({});
  expect(clipAdvancedBody({ avoid: '  ', seed: null })).toEqual({});
  expect(clipAdvancedBody({ avoid: 'blur', seed: 0 })).toEqual({ avoid: 'blur', seed: 0 });
  expect((clipAdvancedBody({ avoid: 'y'.repeat(999) }).avoid as string).length).toBe(CLIP_AVOID_MAX);
});

test('the user\'s negative words come after the derived ones', () => {
  expect(mergeClipNegative('subtitles, watermark', '')).toBe('subtitles, watermark');
  expect(mergeClipNegative('subtitles, watermark', 'blur')).toBe('subtitles, watermark, blur');
  expect(mergeClipNegative('', 'blur')).toBe('blur');
});
