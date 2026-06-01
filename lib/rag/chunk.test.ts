import { chunkText } from './chunk';

describe('chunkText', () => {
  it('returns no chunks for empty / whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \t ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    expect(chunkText('გამარჯობა, მსოფლიო.')).toEqual(['გამარჯობა, მსოფლიო.']);
  });

  it('packs multiple paragraphs into chunks no larger than chunkSize', () => {
    const para = 'ა'.repeat(120);
    const text = Array.from({ length: 10 }, () => para).join('\n\n');
    const chunks = chunkText(text, { chunkSize: 300, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
  });

  it('hard-slices an oversized paragraph into overlapping windows within chunkSize', () => {
    const long = 'b'.repeat(1000);
    const chunks = chunkText(long, { chunkSize: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(300);
    // Overlap means consecutive windows share their boundary characters.
    expect(chunks[0].slice(-50)).toEqual(chunks[1].slice(0, 50));
  });

  it('preserves all content when no overlap and paragraphs fit', () => {
    const text = 'alpha\n\nbeta\n\ngamma';
    const joined = chunkText(text, { chunkSize: 8, overlap: 0 }).join('\n\n');
    expect(joined).toContain('alpha');
    expect(joined).toContain('beta');
    expect(joined).toContain('gamma');
  });

  it('clamps chunkSize to a sane floor', () => {
    const chunks = chunkText('x'.repeat(500), { chunkSize: 10 });
    // floor is 200, so a 500-char blob becomes a few ~200-char windows.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
