// Same seam as ffmpeg-overlay.render.test: the SVG + resvg path never touches storage.
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));

// eslint-disable-next-line import/first
import { buildTextLayerSvg, renderTextLayerPng, wrapCaption } from './ffmpeg-overlay';

const lineCount = (svg: string) => (svg.match(/<text /g) ?? []).length / 2; // a shadow + a fill per line

describe('caption wrapping — the export draws what the editor previewed', () => {
  it('keeps a short caption on one line', () => {
    expect(wrapCaption('ზაფხული თბილისში', 58, 640)).toEqual(['ზაფხული თბილისში']);
  });

  it('breaks a long caption at spaces so no line is wider than the frame', () => {
    const lines = wrapCaption('ეს არის ძალიან გრძელი წარწერა, რომელიც ერთ ხაზზე ვერ ჩაეტევა ვერტიკალურ ვიდეოში', 58, 634);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect([...l].length * 0.6 * 58).toBeLessThanOrEqual(634);
  });

  it('keeps a typed line break and splits a word wider than the frame', () => {
    expect(wrapCaption('ერთი\nორი', 40, 600)).toEqual(['ერთი', 'ორი']);
    const long = wrapCaption('x'.repeat(60), 40, 240);
    expect(long.length).toBeGreaterThan(1);
    expect(long.every((l) => l.length * 0.66 * 40 <= 240)).toBe(true);
  });

  it('cuts past four lines with an ellipsis', () => {
    const lines = wrapCaption(Array.from({ length: 40 }, () => 'სიტყვა').join(' '), 58, 400);
    expect(lines).toHaveLength(4);
    expect(lines[3]!.endsWith('…')).toBe(true);
  });

  it('breaks at the same words at any size — the small preview matches the 1280 px export', () => {
    const text = 'ზაფხული თბილისში — ძველი ქალაქის ღამე და წვიმიანი ქუჩები';
    expect(wrapCaption(text, 58, 616)).toEqual(wrapCaption(text, 58 * 0.31, 616 * 0.31));
  });

  it('stacks a bottom subtitle UP from the bottom margin and centres a title block', () => {
    const text = 'ეს არის ძალიან გრძელი წარწერა, რომელიც ერთ ხაზზე ვერ ჩაეტევა';
    const bottom = buildTextLayerSvg({ text, position: 'bottom-center', fontSize: 58, fontColor: '#FFFFFF' }, 720, 1280);
    expect(lineCount(bottom)).toBeGreaterThan(1);
    const ys = [...bottom.matchAll(/<text x="\d+" y="(\d+)" font-family[^>]*fill="#FFFFFF"/g)].map((m) => Number(m[1]));
    expect(ys[ys.length - 1]).toBeLessThan(1280);
    expect(ys[0]).toBeLessThan(ys[ys.length - 1]!);
    const centre = buildTextLayerSvg({ text, position: 'center', fontSize: 87, fontColor: '#FFFFFF' }, 720, 1280);
    const cy = [...centre.matchAll(/<text x="\d+" y="(\d+)" font-family[^>]*fill="#FFFFFF"/g)].map((m) => Number(m[1]));
    const mid = (cy[0]! + cy[cy.length - 1]!) / 2;
    expect(Math.abs(mid - 640)).toBeLessThan(87);
  });

  it('rasterises a wrapped Georgian caption', async () => {
    const png = await renderTextLayerPng({ text: 'ზაფხული თბილისში — ძველი ქალაქის ღამე და წვიმიანი ქუჩები', position: 'bottom-center', fontSize: 58, fontColor: '#FFFFFF' }, 720, 1280);
    expect(png).not.toBeNull();
    expect(png!.length).toBeGreaterThan(2000);
  });
});
