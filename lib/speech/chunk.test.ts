/** @jest-environment node */
/**
 * lib/speech/chunk — every character of a message lands in exactly one speech chunk, in order (§5.2, §5.3.1).
 */
import {
  SPEECH_CHUNK_MAX_CHARS,
  SPEECH_CHUNK_MIN_CHARS,
  SPEECH_CHUNK_RAMP,
  chunkIndexAt,
  chunkSpeech,
  speechSentences,
  type SpeechChunk,
} from './chunk';
import { SPEECH_MAX_CHARS } from './contract';

const spoken = (s: string) => s.replace(/\s+/g, ' ').trim();
const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const sentences = (s: string) => speechSentences(s).map((x) => spoken(s.slice(x.start, x.end)));
const texts = (s: string, max?: number) => chunkSpeech(s, { maxChars: max }).map((c) => c.text);

/** The invariant every caller relies on; returns a reason, or null when it holds. */
function coverageFault(source: string, chunks: readonly SpeechChunk[], max: number): string | null {
  if (!spoken(source)) return chunks.length ? 'blank text has chunks' : null;
  if (!chunks.length) return 'no chunks';
  if (chunks[0]!.start !== 0) return `first starts at ${chunks[0]!.start}`;
  if (chunks[chunks.length - 1]!.end !== source.length) return `last ends at ${chunks[chunks.length - 1]!.end}`;
  for (const [i, c] of chunks.entries()) {
    if (c.index !== i) return `chunk ${i} has index ${c.index}`;
    if (i && c.start !== chunks[i - 1]!.end) return `gap or overlap before chunk ${i}`;
    if (c.end <= c.start) return `chunk ${i} is empty`;
    if (c.text !== spoken(source.slice(c.start, c.end))) return `chunk ${i} text is not its span`;
    if (!c.text) return `chunk ${i} says nothing`;
    if (c.text.length > max) return `chunk ${i} is ${c.text.length} > ${max}`;
    if (c.start && isHigh(source.charCodeAt(c.start - 1))) return `chunk ${i} splits a surrogate pair`;
  }
  return null;
}

describe('sentences', () => {
  test.each([
    ['English abbreviations', 'Mr. Smith met Dr. Jones, e.g. at noon. They talked.', ['Mr. Smith met Dr. Jones, e.g. at noon.', 'They talked.']],
    ['Russian abbreviations', 'Это т.е. пример, см. рис. 3. Второе предложение.', ['Это т.е. пример, см. рис. 3. Второе предложение.']],
    ['Russian, ending after a word', 'Москва, ул. Тверская и т.д. Конец! Ещё?', ['Москва, ул. Тверская и т.д. Конец!', 'Ещё?']],
    ['Georgian abbreviations', 'ხილი, ბოსტნეული და ა.შ. ყველაფერი აქ არის. მეორე წინადადება.', ['ხილი, ბოსტნეული და ა.შ. ყველაფერი აქ არის.', 'მეორე წინადადება.']],
    ['Georgian year and initial', '1987 წ. ი. ჭავჭავაძე იქ იყო. დიახ.', ['1987 წ. ი. ჭავჭავაძე იქ იყო.', 'დიახ.']],
    ['decimals', 'The price is 3.5 lari, or 0.75 more. Next one.', ['The price is 3.5 lari, or 0.75 more.', 'Next one.']],
    ['initials', 'J. R. R. Tolkien wrote it. Then he rested.', ['J. R. R. Tolkien wrote it.', 'Then he rested.']],
    ['a numbered list', 'Steps:\n1. Open it.\n2. Close it.', ['Steps:', '1. Open it.', '2. Close it.']],
    ['closing quotes and brackets', 'She said "Go!" Then (quietly.) she left.', ['She said "Go!"', 'Then (quietly.)', 'she left.']],
    ['ellipsis and ?!', 'Wait... what?! Yes… fine. 好。 OK', ['Wait...', 'what?!', 'Yes…', 'fine.', '好。', 'OK']],
    ['a file name or URL is not an end', 'Open report.pdf or example.com/a.b now. Done.', ['Open report.pdf or example.com/a.b now.', 'Done.']],
    ['the last sentence without a terminator', 'First sentence. and the last words', ['First sentence.', 'and the last words']],
  ])('%s', (_why, source, expected) => {
    expect(sentences(source)).toEqual(expected);
  });

  test('a blank line is a paragraph end; a single line break is a sentence end', () => {
    const s = 'One.\nTwo\n\n\nThree';
    expect(speechSentences(s).map((x) => [spoken(s.slice(x.start, x.end)), x.hardEnd])).toEqual([
      ['One.', false],
      ['Two', true],
      ['Three', true],
    ]);
  });

  test('leading whitespace joins the first sentence, trailing whitespace the last', () => {
    const s = '  \n\n Hello. World.  \n';
    const spans = speechSentences(s);
    expect(spans[0]!.start).toBe(0);
    expect(spans[spans.length - 1]!.end).toBe(s.length);
    expect(sentences(s)).toEqual(['Hello.', 'World.']);
  });
});

describe('chunks', () => {
  test('defaults: 600 characters, between 40 and the route limit', () => {
    expect(SPEECH_CHUNK_MAX_CHARS).toBe(600);
    expect(SPEECH_CHUNK_MIN_CHARS).toBe(40);
    expect(SPEECH_CHUNK_MAX_CHARS).toBeLessThanOrEqual(SPEECH_MAX_CHARS);
  });

  test.each([[''], ['   '], ['\n\n\t ']])('blank text %j has no chunks', (s) => {
    expect(chunkSpeech(s)).toEqual([]);
    expect(chunkSpeech(undefined as unknown as string)).toEqual([]);
  });

  test('sentences are packed up to the limit, and the whitespace between them is kept in the spans', () => {
    const s = 'Short sentence one.   Short sentence two.\tShort sentence three.';
    const chunks = chunkSpeech(s);
    expect(chunks).toEqual([
      { index: 0, start: 0, end: s.length, text: 'Short sentence one. Short sentence two. Short sentence three.' },
    ]);
    expect(texts(s, 40)).toEqual(['Short sentence one. Short sentence two.', 'Short sentence three.']);
  });

  test('two paragraphs never share a chunk, however short', () => {
    expect(texts('Short one.\n\nShort two.')).toEqual(['Short one.', 'Short two.']);
    expect(texts('Short one.\nShort two.')).toEqual(['Short one. Short two.']);
  });

  test('a long sentence is cut after a clause mark, never inside a word', () => {
    const clause = 'this clause has several plain words';
    const s = `${Array.from({ length: 6 }, () => clause).join(', ')}.`;
    const chunks = chunkSpeech(s, { maxChars: 80 });
    expect(coverageFault(s, chunks, 80)).toBeNull();
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks.slice(0, -1)) expect(c.text.endsWith(',')).toBe(true);
    expect(chunks[chunks.length - 1]!.text.endsWith('words.')).toBe(true);
  });

  test('with no clause mark, it is cut at a space', () => {
    const s = `${'word '.repeat(60)}end.`;
    const chunks = chunkSpeech(s, { maxChars: 50 });
    expect(coverageFault(s, chunks, 50)).toBeNull();
    for (const c of chunks) expect(c.text).toMatch(/^(word )*(word|end\.)$/);
  });

  test('only a run with no space at all is cut at the limit, and never inside a surrogate pair', () => {
    expect(texts('x'.repeat(150), 40).map((t) => t.length)).toEqual([40, 40, 40, 30]);
    const emoji = '😀'.repeat(60);
    const chunks = chunkSpeech(emoji, { maxChars: 41 });
    expect(coverageFault(emoji, chunks, 41)).toBeNull();
    expect(chunks.map((c) => c.text).join('')).toBe(emoji);
    // Leading whitespace is not counted as room: the first piece still carries the first 40 letters.
    const padded = `${' '.repeat(30)}${'x'.repeat(100)}`;
    expect(coverageFault(padded, chunkSpeech(padded, { maxChars: 40 }), 40)).toBeNull();
    expect(texts(padded, 40)).toEqual(['x'.repeat(40), 'x'.repeat(40), 'x'.repeat(20)]);
  });

  test('leadSentence: a short first sentence is its own chunk, so the first audio comes back sooner', () => {
    const s = 'Hi there. This is the rest of the reply. It goes on a little.';
    expect(chunkSpeech(s, { leadSentence: true }).map((c) => c.text)).toEqual([
      'Hi there.',
      'This is the rest of the reply. It goes on a little.',
    ]);
    expect(texts(s)).toEqual([s]);
    // A first sentence longer than leadMax is packed as usual.
    expect(chunkSpeech(s, { leadSentence: true, leadMax: 5 }).map((c) => c.text)).toEqual([s]);
  });

  describe('ramp: the chunks grow, so each request is small next to the audio already on its way', () => {
    const SENT = 'ეს არის პასუხის კიდევ ერთი წინადადება, რომელიც ცოტა გრძელია.';
    const reply = `გამარჯობა! ${Array.from({ length: 30 }, () => SENT).join(' ')}`;
    const ramped = (src: string, extra: Parameters<typeof chunkSpeech>[1] = {}) =>
      chunkSpeech(src, { leadSentence: true, ramp: SPEECH_CHUNK_RAMP, ...extra });

    test('GG, Production 2026-10-24: "გამარჯობა!" is no longer followed by a 600-character request', () => {
      const lens = ramped(reply).map((c) => c.text.length);
      expect(texts(reply).length).toBeLessThan(lens.length);
      expect(chunkSpeech(reply, { leadSentence: true }).map((c) => c.text.length)[1]).toBeGreaterThan(500); // the old cut
      expect(lens[0]).toBe('გამარჯობა!'.length);
      for (let k = 1; k < lens.length; k++) {
        const before = lens[k - 1]! + (k >= 2 ? lens[k - 2]! : 0);
        expect(lens[k]).toBeLessThanOrEqual(Math.min(SPEECH_CHUNK_MAX_CHARS, Math.max(SPEECH_CHUNK_MIN_CHARS + SENT.length, Math.floor(SPEECH_CHUNK_RAMP * before))));
      }
      // It grows: the last full chunks are far longer than the second one, and none passes the limit.
      expect(Math.max(...lens)).toBeGreaterThan(lens[1]! * 4);
      expect(Math.max(...lens)).toBeLessThanOrEqual(SPEECH_CHUNK_MAX_CHARS);
      expect(coverageFault(reply, ramped(reply), SPEECH_CHUNK_MAX_CHARS)).toBeNull();
    });

    test('a sentence longer than its chunk may hold is cut after a clause mark that fits', () => {
      const src = 'Hi. One, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve, thirteen.';
      const out = ramped(src).map((c) => c.text);
      expect(out[0]).toBe('Hi.');
      expect(out[1]!.length).toBeLessThanOrEqual(SPEECH_CHUNK_MIN_CHARS);
      expect(out[1]!.endsWith(',')).toBe(true);
      expect(out.join(' ')).toBe(src);
    });

    test('a sentence only a little over is read whole: no tail under 40 characters is cut off', () => {
      const src = 'EV market. Summary. Sales grew fast in 2025, driven by tax cuts. Findings. Georgia leads.';
      const out = ramped(src).map((c) => c.text);
      expect(out).toContain('Sales grew fast in 2025, driven by tax cuts.');
      expect(out.join(' ')).toBe(src);
    });

    test('with leadSentence, a long first sentence is cut at a clause mark within leadMax', () => {
      const first = `${Array.from({ length: 20 }, (_, i) => `part number ${i + 1}`).join(', ')}.`;
      const src = `${first} The end.`;
      expect(first.length).toBeGreaterThan(220);
      const out = ramped(src).map((c) => c.text);
      expect(out[0]!.length).toBeLessThanOrEqual(220);
      expect(out[0]!.endsWith(',')).toBe(true);
      expect(out.join(' ')).toBe(src);
      // Without the ramp it was one chunk.
      expect(chunkSpeech(src, { leadSentence: true }).map((c) => c.text)).toEqual([src]);
    });

    test('a sentence with no clause mark that fits is read whole, up to maxChars', () => {
      const long = `${'word '.repeat(30).trim()}.`;
      const src = `Hi. ${long}`;
      expect(ramped(src).map((c) => c.text)).toEqual(['Hi.', long]);
      const huge = `${'word '.repeat(200).trim()}.`;
      const out = ramped(`Hi. ${huge}`).map((c) => c.text);
      expect(out[0]).toBe('Hi.');
      for (const t of out) expect(t.length).toBeLessThanOrEqual(SPEECH_CHUNK_MAX_CHARS);
      expect(out.slice(1).join(' ')).toBe(huge);
    });

    test('a paragraph still ends a chunk, and the next one keeps growing from the chunks before it', () => {
      const src = `Hi.\n\n${SENT} ${SENT}\n\n${SENT} ${SENT} ${SENT}`;
      const out = ramped(src);
      expect(coverageFault(src, out, SPEECH_CHUNK_MAX_CHARS)).toBeNull();
      for (const c of out) expect(src.slice(c.start, c.end).trim()).not.toMatch(/\n\n/);
    });
  });

  test('maxChars is clamped to [40, the route limit]', () => {
    const s = `${'word '.repeat(600)}end.`;
    for (const c of chunkSpeech(s, { maxChars: 5 })) expect(c.text.length).toBeLessThanOrEqual(SPEECH_CHUNK_MIN_CHARS);
    expect(chunkSpeech(s, { maxChars: 5 }).length).toBeGreaterThan(60);
    const big = chunkSpeech(s, { maxChars: 1e9 });
    expect(coverageFault(s, big, SPEECH_MAX_CHARS)).toBeNull();
    expect(Math.max(...big.map((c) => c.text.length))).toBeGreaterThan(SPEECH_CHUNK_MAX_CHARS);
  });

  test('a ka/en/ru reply with paragraphs and a list is covered exactly, in order', () => {
    const s = [
      'გამარჯობა! ეს არის პასუხი, რომელიც 3.5 წუთში იკითხება და ა.შ. მეორე წინადადება აქ არის.',
      '',
      'Here is the English part. Mr. Smith says hi.',
      '',
      'Список:\n1. Первый пункт, т.е. начало.\n2. Второй пункт.',
      '',
      'ბოლო სიტყვები ტერმინატორის გარეშე',
    ].join('\n');
    const chunks = chunkSpeech(s, { maxChars: 120 });
    expect(coverageFault(s, chunks, 120)).toBeNull();
    expect(chunks.map((c) => c.text)).toEqual([
      'გამარჯობა! ეს არის პასუხი, რომელიც 3.5 წუთში იკითხება და ა.შ. მეორე წინადადება აქ არის.',
      'Here is the English part. Mr. Smith says hi.',
      'Список: 1. Первый пункт, т.е. начало. 2. Второй пункт.',
      'ბოლო სიტყვები ტერმინატორის გარეშე',
    ]);
  });

  test('chunkIndexAt finds the chunk holding an offset', () => {
    const s = 'One.\n\nTwo.\n\nThree.';
    const chunks = chunkSpeech(s);
    expect(chunks.map((c) => c.text)).toEqual(['One.', 'Two.', 'Three.']);
    expect(chunkIndexAt(chunks, 0)).toBe(0);
    expect(chunkIndexAt(chunks, chunks[1]!.start - 1)).toBe(0);
    expect(chunkIndexAt(chunks, chunks[1]!.start)).toBe(1);
    expect(chunkIndexAt(chunks, chunks[2]!.start + 2)).toBe(2);
    expect(chunkIndexAt(chunks, s.length + 10)).toBe(2);
    expect(chunkIndexAt([], 3)).toBe(-1);
  });
});

describe('every character exactly once, for any text', () => {
  /** mulberry32: a small seeded generator, so a failure always reproduces. */
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const PIECES = [
    'გამარჯობა', 'სიტყვა', 'და', 'ა.შ.', 'მაგ.', 'წ.', 'hello', 'world', 'Mr.', 'e.g.', 'I', 'привет', 'мир', 'т.е.',
    'г.', '3.5', '1.', '2020.', '😀', '👩‍👩‍👧', 'x'.repeat(70), 'ა'.repeat(130), '"quoted."', '(aside)', '…', '...',
    '.', ',', ';', ':', '—', '!', '?', '?!', ' ', ' ', ' ', ' ', '  ', '\t', '\n', '\n\n', ' \n \n ', ' ',
  ];

  test('400 random texts, any limit, with and without a lead sentence and the ramp', () => {
    const next = rng(20261024);
    for (let n = 0; n < 400; n++) {
      const len = Math.floor(next() * 220);
      let s = next() < 0.25 ? ' \n'.repeat(Math.floor(next() * 40)) : '';
      for (let i = 0; i < len; i++) s += PIECES[Math.floor(next() * PIECES.length)];
      const max = SPEECH_CHUNK_MIN_CHARS + Math.floor(next() * 300);
      const leadSentence = next() < 0.5;
      const ramp = next() < 0.5 ? SPEECH_CHUNK_RAMP : undefined;
      const opts = { maxChars: max, leadSentence, ramp };
      const fault = coverageFault(s, chunkSpeech(s, opts), max);
      if (fault) throw new Error(`case ${n} (max ${max}, lead ${leadSentence}, ramp ${ramp}): ${fault}\n${JSON.stringify(s)}`);
      expect(chunkSpeech(s, opts)).toEqual(chunkSpeech(s, opts));
    }
  });
});
