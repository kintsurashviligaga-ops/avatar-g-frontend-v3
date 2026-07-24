import { likelyNeedsWebSearch, buildSearchPreamble } from './webSearch';

describe('likelyNeedsWebSearch — conservative live-info trigger', () => {
  it('does NOT fire on math / everyday questions (the "2+2 → [1] links" regression)', () => {
    for (const q of ['2+2 რამდენია?', '2+2', '15% of 200', 'how much is a cup of flour', 'რამდენი ხარ', 'გამარჯობა როგორ ხარ', 'write me a poem', 'დამიწერე ლექსი']) {
      expect(likelyNeedsWebSearch(q)).toBe(false);
    }
  });

  it('DOES fire on genuinely time-sensitive / live-fact lookups', () => {
    for (const q of ['what is the latest news', 'bitcoin price today', 'დღეს რა ამინდია', 'დოლარის კურსი', 'მსოფლიო ჩემპიონატის შედეგი', 'who won the 2026 world cup']) {
      expect(likelyNeedsWebSearch(q)).toBe(true);
    }
  });
});

describe('buildSearchPreamble — clean answers, no link dump', () => {
  const search = { answer: 'Argentina won.', results: [{ title: 'World Cup', url: 'https://example.com/wc', content: 'Argentina beat France.' }] };

  it('instructs NO citation markers / Sources list / raw URLs', () => {
    const p = buildSearchPreamble(search);
    expect(p).toMatch(/do NOT/i);
    expect(p).toMatch(/Sources/); // it names the thing to avoid
    expect(p).toMatch(/\[1\]/);   // explicitly forbids [1]-style markers
    // The RESULT lines must not re-introduce a raw URL for the model to paste back.
    expect(p).not.toContain('https://example.com/wc');
  });
});
