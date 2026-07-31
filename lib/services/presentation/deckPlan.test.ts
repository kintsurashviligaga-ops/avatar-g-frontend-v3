/** @jest-environment node */
import {
  validateDeckRequest,
  normalizeSlides,
  fallbackOutline,
  wrapText,
  measureText,
  MAX_SLIDES,
  MIN_SLIDES,
  DEFAULT_SLIDES,
  MAX_BULLETS_PER_SLIDE,
  type DeckRequest,
} from './deckPlan';
import { buildSlideSvg, buildCoverSvg, escapeXml } from './slideSvg';
import { extractJsonArray } from './deckOutline';

describe('validation', () => {
  it('defaults to a Georgian dark deck of the default length', () => {
    const r = validateDeckRequest({ topic: 'ხელოვნური ინტელექტი' });
    expect(r.ok).toBe(true);
    expect(r.request).toMatchObject({ language: 'ka', theme: 'dark', slideCount: DEFAULT_SLIDES, withImages: false });
  });

  it('clamps the slide count instead of rejecting it — the user asked for a deck, not an error', () => {
    expect(validateDeckRequest({ topic: 'x y z', slideCount: 99 }).request?.slideCount).toBe(MAX_SLIDES);
    expect(validateDeckRequest({ topic: 'x y z', slideCount: 1 }).request?.slideCount).toBe(MIN_SLIDES);
    expect(validateDeckRequest({ topic: 'x y z', slideCount: NaN }).request?.slideCount).toBe(DEFAULT_SLIDES);
  });

  it('rejects an empty or oversized topic', () => {
    expect(validateDeckRequest({ topic: 'ab' }).ok).toBe(false);
    expect(validateDeckRequest({ topic: 'a'.repeat(2000) }).ok).toBe(false);
    expect(validateDeckRequest(null).ok).toBe(false);
  });
});

describe('outline normalization — a half-parsed deck must not render as blank slides', () => {
  it('keeps well-formed slides and bounds the bullets', () => {
    const slides = normalizeSlides(
      [{ title: 'T', bullets: Array.from({ length: 20 }, (_, i) => `b${i}`) }],
      5,
    );
    expect(slides[0]?.bullets).toHaveLength(MAX_BULLETS_PER_SLIDE);
  });

  it('strips bullet glyphs the model re-adds over the template', () => {
    const slides = normalizeSlides([{ title: 'T', bullets: ['- one', '• two', '3) three'] }], 3);
    expect(slides[0]?.bullets).toEqual(['one', 'two', 'three']);
  });

  it('drops slides with neither title nor bullets rather than rendering empty rectangles', () => {
    const slides = normalizeSlides([{ title: '', bullets: [] }, { title: 'Real', bullets: ['x'] }], 5);
    expect(slides).toHaveLength(1);
    expect(slides[0]?.title).toBe('Real');
  });

  it('promotes the first bullet to the title when the title is missing', () => {
    expect(normalizeSlides([{ bullets: ['only point'] }], 2)[0]?.title).toBe('only point');
  });

  it('never exceeds the requested count, and survives junk', () => {
    expect(normalizeSlides([{ title: 'a', bullets: ['x'] }, { title: 'b', bullets: ['y'] }], 1)).toHaveLength(1);
    expect(normalizeSlides('nope', 3)).toEqual([]);
    expect(normalizeSlides([null, 42, 'x'], 3)).toEqual([]);
  });

  it('the deterministic fallback always produces exactly the requested count', () => {
    for (const n of [3, 5, 12]) {
      const req = { topic: 'თემა', slideCount: n, language: 'ka', theme: 'dark', withImages: false } as DeckRequest;
      expect(fallbackOutline(req)).toHaveLength(n);
    }
  });
});

describe('JSON extraction from model output', () => {
  it('parses a bare array', () => {
    expect(extractJsonArray('[{"title":"a"}]')).toEqual([{ title: 'a' }]);
  });

  it('parses a fenced block', () => {
    expect(extractJsonArray('```json\n[{"title":"a"}]\n```')).toEqual([{ title: 'a' }]);
  });

  it('unwraps an object that carries the array', () => {
    expect(extractJsonArray('{"slides":[{"title":"a"}]}')).toEqual([{ title: 'a' }]);
  });

  it('finds an array buried in prose', () => {
    expect(extractJsonArray('Sure! Here it is:\n[{"title":"a"}]\nHope that helps.')).toEqual([{ title: 'a' }]);
  });

  it('returns null rather than guessing when there is no array', () => {
    expect(extractJsonArray('I cannot help with that.')).toBeNull();
    expect(extractJsonArray('')).toBeNull();
  });
});

describe('text wrapping — resvg does no layout, so this is the only thing between text and the canvas edge', () => {
  it('keeps every line inside the width', () => {
    const text = 'The quick brown fox jumps over the lazy dog again and again and again';
    for (const line of wrapText(text, 34, 400, 10)) {
      expect(measureText(line, 34)).toBeLessThanOrEqual(400);
    }
  });

  it('hard-splits a single unbreakable word instead of letting it overflow', () => {
    const lines = wrapText('https://example.com/an/extremely/long/path/that/never/breaks', 34, 200, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, 34)).toBeLessThanOrEqual(200);
  });

  it('treats Georgian as wider than Latin — otherwise ka bullets overrun the slide', () => {
    // Same character count, different script.
    expect(measureText('ქართული', 34)).toBeGreaterThan(measureText('abcdefg', 34));
  });

  it('wraps Georgian without dropping characters', () => {
    const text = 'ხელოვნური ინტელექტი ცვლის ბიზნესს საქართველოში და მთელ მსოფლიოში';
    const joined = wrapText(text, 34, 500, 10).join(' ');
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('truncates with an ellipsis rather than pushing the slide off the canvas', () => {
    const lines = wrapText('word '.repeat(300), 34, 300, 3);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
  });

  it('is total on degenerate input', () => {
    expect(wrapText('', 34, 400)).toEqual([]);
    expect(wrapText('x', 0, 400)).toEqual([]);
    expect(wrapText('x', 34, 0)).toEqual([]);
  });
});

describe('SVG generation', () => {
  it('escapes & FIRST so the other entities are not double-escaped', () => {
    expect(escapeXml('R&D <tag> "q" \'a\'')).toBe('R&amp;D &lt;tag&gt; &quot;q&quot; &apos;a&apos;');
    // The specific regression: & inside an already-escaped entity.
    expect(escapeXml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });

  it('produces parseable markup for hostile slide text', () => {
    const svg = buildSlideSvg({ title: 'R&D <script>alert(1)</script>', bullets: ['a & b', '"quoted"'] });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');
  });

  it('narrows the text column when a visual takes the right half', () => {
    // Sized to fit the full-width column on one line but not the half-width one. A very long title would
    // saturate the 3-line title cap in BOTH layouts and prove nothing.
    const title = 'Quarterly results and outlook';
    const count = (s: string) => (s.match(/<text/g) ?? []).length;
    const wide = count(buildSlideSvg({ title, bullets: [] }, { hasImage: false }));
    const narrow = count(buildSlideSvg({ title, bullets: [] }, { hasImage: true }));
    expect(wide).toBe(1);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('renders a cover and numbers body slides', () => {
    expect(buildCoverSvg('სათაური', 'ქვესათაური', 'light')).toContain('<svg');
    expect(buildSlideSvg({ title: 'T', bullets: ['x'] }, { pageNumber: 3, totalPages: 9 })).toContain('3 / 9');
  });

  it('declares the Georgian-capable font family on every text node', () => {
    const svg = buildSlideSvg({ title: 'ქართული', bullets: ['ტექსტი'] });
    const texts = svg.match(/<text[^>]*>/g) ?? [];
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) expect(node).toContain('FiraGO');
  });
});

describe('slide visuals — the column that used to stay empty', () => {
  const uri = 'data:image/png;base64,AAAA';

  it('embeds the image when one is supplied', () => {
    const svg = buildSlideSvg({ title: 'T', bullets: ['x'] }, { imageDataUri: uri, hasImage: true });
    expect(svg).toContain('<image');
    expect(svg).toContain(uri);
  });

  it('draws NOTHING when there is no image — no empty <image> element', () => {
    const svg = buildSlideSvg({ title: 'T', bullets: ['x'] });
    expect(svg).not.toContain('<image');
  });

  it('crops rather than distorts the visual', () => {
    const svg = buildSlideSvg({ title: 'T', bullets: [] }, { imageDataUri: uri, hasImage: true });
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it('keeps the text column narrow so copy never runs under the picture', () => {
    const long = 'a '.repeat(40);
    const count = (s: string) => (s.match(/<text/g) ?? []).length;
    const wide = count(buildSlideSvg({ title: long, bullets: [] }));
    const withImg = count(buildSlideSvg({ title: long, bullets: [] }, { imageDataUri: uri, hasImage: true }));
    expect(withImg).toBeGreaterThanOrEqual(wide);
  });
});
