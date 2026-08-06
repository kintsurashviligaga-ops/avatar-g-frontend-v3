/** @jest-environment node */
/**
 * The watermark asset must have an alpha channel, and it must reach the lambdas that use it.
 *
 * ⚠️ THIS TEST EXISTS BECAUSE THE SHIPPED MARK WAS AN OPAQUE BLACK BOX. `public/logo.png` is a JPEG
 * carrying a .png filename — `mjpeg / yuvj420p`, no alpha — so overlaying it pasted a solid rectangle into
 * the corner of every watermarked clip. It encoded cleanly, the route returned 200, and nothing anywhere
 * reported a problem; it was only found by pulling a real production output down and LOOKING at a frame.
 *
 * Two ways that regresses, both silent:
 *   1. someone re-exports the asset from a tool that flattens transparency → the box is back;
 *   2. the tracing entry loses the file → `existsSync` is false in the lambda, addWatermark fail-opens,
 *      and every clip ships unmarked with no error at all.
 *
 * Both are cheap to assert and impossible to notice by reading a diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const png = readFileSync(join(root, 'public/watermark.png'));

describe('watermark asset', () => {
  it('is a real PNG, not a JPEG wearing a .png filename', () => {
    // PNG signature: \x89 P N G \r \n \x1a \n
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  });

  it('carries an alpha channel', () => {
    // IHDR colour type lives at byte 25. 6 = truecolour+alpha, 4 = greyscale+alpha. 2 (truecolour) and
    // 0 (greyscale) have NO transparency and would reinstate the box.
    expect([4, 6]).toContain(png[25]);
  });

  it('is tight-cropped — not mostly empty padding', () => {
    // The old asset was 1024x1536 with 805px of dead space stacked above and below the ink, which is why
    // the burnt-in block dwarfed the artwork. A near-square-ish mark means the crop is still in place.
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(w).toBeGreaterThan(0);
    expect(h / w).toBeLessThan(1.5);
  });
});

describe('the mark reaches the lambdas that draw it', () => {
  const config = readFileSync(join(root, 'next.config.js'), 'utf8');

  // Every route whose handler can reach addWatermark(). Adding a third caller without a tracing entry is
  // the silent failure this guards.
  it.each(['/api/video/remix', '/api/agent/video-queue/drain'])('%s traces the asset + ffmpeg', (route) => {
    const line = config.split('\n').find((l) => l.includes(`'${route}'`));
    expect(line).toBeDefined();
    expect(line).toContain('./public/watermark.png');
    expect(line).toContain('ffmpeg-static');
  });
});

describe('the overlay filter', () => {
  const src = readFileSync(join(root, 'lib/video/remixOps.ts'), 'utf8');
  const filter = src.slice(src.indexOf('export async function addWatermark'));

  it('converts the mark to rgba before scaling', () => {
    // Without this the transparency is dropped during the scale and the overlay pastes a block.
    expect(filter).toContain('[1:v]format=rgba[lg]');
  });

  it('bounds the mark on BOTH axes', () => {
    // Width alone let a portrait mark cover a third of the height of a 16:9 clip.
    expect(filter).toContain("w='min(iw*0.12,ih*0.18*mdar)'");
  });

  it('keeps shortest=1 — the still input is infinite without it', () => {
    expect(filter).toContain('shortest=1');
  });
});
