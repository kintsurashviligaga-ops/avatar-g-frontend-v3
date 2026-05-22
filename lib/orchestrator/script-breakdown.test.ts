import {
  CAMERA_MOTIONS,
  MAX_SEGMENTS,
  buildScriptUserPrompt,
  deterministicBreakdown,
  extractJson,
  normalizeBreakdown,
  planSegmentCount,
  type ScriptSegment,
} from './script-breakdown';

describe('planSegmentCount', () => {
  test('30s → 5 shots', () => expect(planSegmentCount(30)).toBe(5));
  test('6s → 1 shot', () => expect(planSegmentCount(6)).toBe(1));
  test('rounds to nearest 6s', () => expect(planSegmentCount(20)).toBe(3));
  test('caps at MAX_SEGMENTS', () => expect(planSegmentCount(600)).toBe(MAX_SEGMENTS));
  test('non-finite / ≤0 → 1', () => {
    expect(planSegmentCount(0)).toBe(1);
    expect(planSegmentCount(-5)).toBe(1);
    expect(planSegmentCount(NaN)).toBe(1);
  });
});

describe('deterministicBreakdown', () => {
  test('produces the planned count with 6s each', () => {
    const segs = deterministicBreakdown('a calm ocean', 30);
    expect(segs).toHaveLength(5);
    expect(segs.every(s => s.durationSec === 6)).toBe(true);
    expect(segs.map(s => s.index)).toEqual([0, 1, 2, 3, 4]);
  });
  test('cycles through valid camera motions', () => {
    const segs = deterministicBreakdown('x', 30);
    expect(segs.every(s => (CAMERA_MOTIONS as readonly string[]).includes(s.cameraMotion))).toBe(true);
  });
  test('empty prompt still yields a usable shot', () => {
    const segs = deterministicBreakdown('   ', 6);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.prompt.length).toBeGreaterThan(0);
  });
});

describe('normalizeBreakdown', () => {
  test('accepts { segments: [...] } and re-indexes', () => {
    const raw = { segments: [
      { prompt: 'shot one', cameraMotion: 'zoom_in' },
      { description: 'shot two', camera_motion: 'pan_left' },
    ] };
    const out = normalizeBreakdown(raw, 'base', 12);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject<Partial<ScriptSegment>>({ index: 0, prompt: 'shot one', cameraMotion: 'zoom_in' });
    expect(out[1]).toMatchObject<Partial<ScriptSegment>>({ index: 1, prompt: 'shot two', cameraMotion: 'pan_left' });
  });
  test('accepts a bare array', () => {
    const out = normalizeBreakdown([{ prompt: 'only' }], 'base', 6);
    expect(out).toHaveLength(1);
    expect(out[0]!.cameraMotion).toBe('dolly'); // missing → coerced default
  });
  test('coerces invalid camera motion to dolly', () => {
    const out = normalizeBreakdown([{ prompt: 'p', cameraMotion: 'barrel_roll' }], 'base', 6);
    expect(out[0]!.cameraMotion).toBe('dolly');
  });
  test('drops empty shots', () => {
    const out = normalizeBreakdown([{ prompt: '' }, { prompt: 'keep' }], 'base', 12);
    expect(out).toHaveLength(1);
    expect(out[0]!.prompt).toBe('keep');
  });
  test('garbage / empty → deterministic fallback', () => {
    expect(normalizeBreakdown(null, 'base brief', 30)).toHaveLength(5);
    expect(normalizeBreakdown({ nope: true }, 'base brief', 12)).toHaveLength(2);
  });
  test('honors MAX_SEGMENTS cap', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ prompt: `s${i}` }));
    expect(normalizeBreakdown(many, 'base', 600).length).toBe(MAX_SEGMENTS);
  });
});

describe('extractJson', () => {
  test('parses bare JSON', () => {
    expect(extractJson('{"segments":[]}')).toEqual({ segments: [] });
  });
  test('parses fenced JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  test('parses JSON embedded in prose', () => {
    expect(extractJson('Here you go: {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  test('returns null on non-JSON', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('buildScriptUserPrompt', () => {
  test('embeds the exact shot count for the duration', () => {
    expect(buildScriptUserPrompt('a dog', 30)).toContain('EXACTLY 5');
    expect(buildScriptUserPrompt('a dog', 6)).toContain('EXACTLY 1');
  });
});
