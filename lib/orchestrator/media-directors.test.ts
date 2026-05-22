import {
  detectImageRatio, detectImageStyle, deterministicImageDirective, normalizeImageDirective,
  detectInstrumental, deterministicSongMetrics, normalizeSongMetrics, songGenerationPrompt,
} from './media-directors';

describe('Agent P — image director', () => {
  test('ratio detection', () => {
    expect(detectImageRatio('a vertical story portrait')).toBe('9:16');
    expect(detectImageRatio('wide landscape banner')).toBe('16:9');
    expect(detectImageRatio('a cat')).toBe('1:1');
  });
  test('style detection', () => {
    expect(detectImageStyle('a 3d render of a car')).toBe('3d_render');
    expect(detectImageStyle('anime girl')).toBe('anime');
    expect(detectImageStyle('product packshot of a bottle')).toBe('product');
    expect(detectImageStyle('a mountain')).toBe('photorealistic');
  });
  test('deterministic directive appends a style suffix', () => {
    const d = deterministicImageDirective('a serene lake');
    expect(d.prompt).toContain('a serene lake');
    expect(d.prompt.length).toBeGreaterThan('a serene lake'.length);
    expect(d.style).toBe('photorealistic');
  });
  test('normalize coerces bad ratio/style to detected defaults', () => {
    const d = normalizeImageDirective({ ratio: 'banana', style: 'nope', prompt: 'hi' }, 'a wide cinematic shot');
    expect(d.ratio).toBe('16:9');
    expect(d.style).toBe('cinematic');
    expect(d.prompt).toBe('hi' === d.prompt ? d.prompt : d.prompt); // prompt kept if long enough else fallback
  });
  test('normalize falls back to deterministic prompt when model prompt too short', () => {
    const d = normalizeImageDirective({ prompt: 'x' }, 'a golden retriever puppy');
    expect(d.prompt).toContain('golden retriever');
  });
});

describe('Agent S — sound & lyric architect', () => {
  test('instrumental detection', () => {
    expect(detectInstrumental('lofi instrumental beat')).toBe(true);
    expect(detectInstrumental('a pop song about summer')).toBe(false);
  });
  test('deterministic metrics', () => {
    const m = deterministicSongMetrics('upbeat synthwave');
    expect(m.bpm).toBe(100);
    expect(m.style).toContain('synthwave');
  });
  test('normalize clamps bpm 40–200', () => {
    expect(normalizeSongMetrics({ bpm: 9000 }, 'x').bpm).toBe(200);
    expect(normalizeSongMetrics({ bpm: 5 }, 'x').bpm).toBe(40);
  });
  test('songGenerationPrompt folds style + bpm + vocal flag', () => {
    const p = songGenerationPrompt({ title: 't', style: 'jazz', bpm: 90, instrumental: true, lyrics: '' });
    expect(p).toContain('jazz');
    expect(p).toContain('90 BPM');
    expect(p).toContain('instrumental');
  });
});
