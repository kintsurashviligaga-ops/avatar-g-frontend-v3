/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { documentSpecSchema, documentFileName } from './spec';
import { niceStep, renderDocumentPdf, wrapText } from './pdf';

const GEO = 'საქართველოს ეკონომიკა 2026 წელს: ზრდა, ინფლაცია და ტურიზმი';

const spec = documentSpecSchema.parse({
  title: 'ქართული ანგარიში',
  subtitle: GEO,
  locale: 'ka',
  sections: [
    { heading: 'შესავალი', blocks: [{ type: 'paragraph', text: `${GEO}. `.repeat(40) }] },
    { heading: 'მთავარი პუნქტები', blocks: [{ type: 'bullets', items: ['პირველი პუნქტი', 'Second point', 'Третий пункт'] }] },
    {
      heading: 'ცხრილი',
      blocks: [{ type: 'table', columns: ['ქალაქი', 'მოსახლეობა', 'შენიშვნა'], rows: Array.from({ length: 40 }, (_, i) => [`ქალაქი ${i + 1}`, String(1000 * (i + 1)), 'გრძელი შენიშვნა რომელიც უჯრაში ორ ხაზად უნდა გადაიტანოს']) }],
    },
    { heading: 'გრაფიკი', blocks: [{ type: 'chart', kind: 'bar', title: 'შემოსავალი', labels: ['იან', 'თებ', 'მარ', 'აპრ'], values: [12, 18.5, -4, 30], unit: '₾' }] },
  ],
});

/** Every text-showing operator's hex string in the content streams, as raw glyph ids. */
async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe('renderDocumentPdf', () => {
  it('writes a real, multi-page PDF that pdf-lib can load back', async () => {
    const out = await renderDocumentPdf(spec, new Date('2026-10-30T00:00:00Z'));
    expect(Buffer.from(out.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(out.pages).toBeGreaterThanOrEqual(3);
    expect(await pageCount(out.bytes)).toBe(out.pages);
  });

  it('embeds FiraGO and keeps the title in the metadata', async () => {
    const out = await renderDocumentPdf(spec);
    const loaded = await PDFDocument.load(out.bytes);
    const baseFonts = loaded.context.enumerateIndirectObjects()
      .map(([, obj]) => (obj instanceof PDFDict ? obj.get(PDFName.of('BaseFont')) : undefined))
      .filter((n): n is PDFName => n instanceof PDFName)
      .map((n) => n.asString());
    expect(baseFonts.length).toBeGreaterThan(0);
    expect(baseFonts.every((n) => /FiraGO/.test(n))).toBe(true);
    expect(loaded.getTitle()).toBe('ქართული ანგარიში');
  });

  it('has a glyph for every Georgian, Latin and Cyrillic letter it was given', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit((await import('@pdf-lib/fontkit')).default);
    const { FIRAGO_REGULAR_B64 } = await import('@/lib/pipeline/compositing/font-data-firago');
    const font = await doc.embedFont(Buffer.from(FIRAGO_REGULAR_B64, 'base64'));
    // fontkit maps a missing character to glyph 0 (.notdef); every letter here must map to a real glyph.
    const fk = (font as unknown as { embedder: { font: { glyphForCodePoint(cp: number): { id: number } } } }).embedder.font;
    const letters = 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ' + 'ABCxyz' + 'АБВжзи' + '₾';
    for (const ch of Array.from(letters)) expect([ch, fk.glyphForCodePoint(ch.codePointAt(0)!).id]).not.toEqual([ch, 0]);
  });
});

describe('wrapText', () => {
  it('keeps every line inside the width and never splits a Georgian letter', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit((await import('@pdf-lib/fontkit')).default);
    const { FIRAGO_REGULAR_B64 } = await import('@/lib/pipeline/compositing/font-data-firago');
    const font = await doc.embedFont(Buffer.from(FIRAGO_REGULAR_B64, 'base64'));
    const long = `${'ა'.repeat(300)} ${GEO}`;
    const lines = wrapText(long, font, 11, 200);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 11)).toBeLessThanOrEqual(200);
    expect(lines.join('').replace(/\s/g, '')).toBe(long.replace(/\s/g, ''));
  });

  it('keeps explicit newlines', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrapText('a\nb', font, 11, 500)).toEqual(['a', 'b']);
  });
});

describe('documentSpecSchema', () => {
  it('refuses a table row with the wrong number of cells and a chart without one value per label', () => {
    expect(documentSpecSchema.safeParse({ title: 't', sections: [{ heading: 'h', blocks: [{ type: 'table', columns: ['a', 'b'], rows: [['1']] }] }] }).success).toBe(false);
    expect(documentSpecSchema.safeParse({ title: 't', sections: [{ heading: 'h', blocks: [{ type: 'chart', kind: 'bar', labels: ['a', 'b'], values: [1] }] }] }).success).toBe(false);
  });

  it('strips control characters and defaults the locale to Georgian', () => {
    const s = documentSpecSchema.parse({ title: 'a\u0007b', sections: [{ heading: 'h', blocks: [] }] });
    expect(s.title).toBe('ab');
    expect(s.locale).toBe('ka');
  });

  it('makes a safe file name', () => {
    expect(documentFileName('ანგარიში: 2026/10')).toBe('ანგარიში 2026 10.pdf');
    expect(documentFileName('   ')).toBe('document.pdf');
  });
});

describe('niceStep', () => {
  it('picks 1, 2 or 5 × 10ⁿ', () => {
    expect(niceStep(3584, 4)).toBe(1000);
    expect(niceStep(40, 4)).toBe(10);
    expect(niceStep(7, 4)).toBe(2);
    expect(niceStep(0.3, 4)).toBeCloseTo(0.1);
  });
});
