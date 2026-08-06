/** @jest-environment node */
/**
 * The free-tier mark: what it says, where it sits, and — the part that is worth real money — WHO gets it.
 *
 * ⚠️ THIS REPLACES A GUARD ON AN IMAGE ASSET. The mark used to be `public/logo.png` overlaid in the
 * bottom-right; that file is a JPEG wearing a .png filename, so it had no alpha and burnt an opaque black
 * rectangle onto every clip. It is now rendered text, so there is no asset to be the wrong format.
 *
 * ⚠️ AND IT GUARDS THE ENTITLEMENT, WHICH IS THE BIT THAT COSTS MONEY IF IT REGRESSES. The agent queue
 * accepted `watermark` from the POST body, so `{"prompts":[…],"watermark":false}` bought an unmarked
 * render for nothing. The decision must come from the payment record, at render time.
 */
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), uploadBufferAndSign: jest.fn() }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line import/first
import { buildOverlaySvg } from '../pipeline/compositing/ffmpeg-overlay';

const root = join(__dirname, '..', '..');
const WATERMARK_TEXT = 'MYAVATAR.GE';

describe('the mark itself', () => {
  // Measured off a real production master (720x1136): band top y=1027, accent bar 4px wide at x=36,
  // cap height 22px. These are the numbers the renderer has to keep reproducing.
  const W = 720;
  const H = 1136;
  const svg = buildOverlaySvg({ overlayText: WATERMARK_TEXT, lang: 'en' }, W, H);

  it('says MYAVATAR.GE', () => {
    expect(svg).toContain(WATERMARK_TEXT);
  });

  it('puts the band at the BOTTOM-LEFT, not the corner', () => {
    // safeX = 5% of width — the accent bar's x. A mark that drifted right would fail here.
    const accent = svg.match(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*ltAccent/);
    expect(accent).toBeTruthy();
    const [, x, y, w, h] = (accent as RegExpMatchArray).map(Number);
    expect(x).toBe(Math.round(W * 0.05)); // 36
    expect(y).toBe(1027); // h - safeY - blockHeight, matching the reference frame exactly
    expect(w).toBe(4);
    expect(h).toBe(47);
  });

  it('lays a left→right fading scrim behind it so the text reads over any footage', () => {
    expect(svg).toContain('id="ltScrim"');
    expect(svg).toMatch(/stop-opacity="0\.72"[\s\S]*stop-opacity="0"/);
  });

  it('scales with the frame — the same call on a landscape master moves the band', () => {
    const wide = buildOverlaySvg({ overlayText: WATERMARK_TEXT, lang: 'en' }, 1920, 1080);
    const accent = wide.match(/<rect x="(\d+)" y="(\d+)"[^>]*ltAccent/);
    expect(Number((accent as RegExpMatchArray)[1])).toBe(96); // 5% of 1920
    expect(Number((accent as RegExpMatchArray)[2])).toBeLessThan(1080);
  });
});

describe('addWatermark', () => {
  const src = readFileSync(join(root, 'lib/video/remixOps.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export async function addWatermark'));

  it('renders text instead of reading an image off disk', () => {
    // existsSync on a public/ path is the pattern that shipped unmarked clips whenever the file fell
    // out of the lambda bundle. There is no file to lose now.
    expect(fn).not.toContain('existsSync');
    expect(fn).not.toContain('public/');
  });

  it('does not take a mark override from its caller', () => {
    expect(fn).toMatch(/export async function addWatermark\(videoUrl: string\)/);
  });
});

describe('the routes that draw it', () => {
  const config = readFileSync(join(root, 'next.config.js'), 'utf8');

  // Miss either dependency and the fail-open returns null: every clip ships unmarked, no error anywhere.
  it.each(['/api/video/remix', '/api/agent/video-queue/drain'])('%s traces ffmpeg AND @resvg', (route) => {
    const line = config.split('\n').find((l) => l.includes(`'${route}'`));
    expect(line).toBeDefined();
    expect(line).toContain('ffmpeg-static');
    expect(line).toContain('@resvg');
  });
});

describe('who gets marked is decided by the server', () => {
  it('the enqueue route never reads `watermark` from the request body', () => {
    const route = readFileSync(join(root, 'app/api/agent/video-queue/route.ts'), 'utf8');
    // Comments are stripped first — the note explaining WHY it is gone names the old expression, and a
    // test that trips over its own documentation teaches people to delete the documentation.
    const code = route
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    expect(code).not.toMatch(/body\.watermark/);
  });

  it('the drain asks the entitlement, not the stored row', () => {
    const queue = readFileSync(join(root, 'lib/agent/videoQueue.ts'), 'utf8');
    expect(queue).toContain('await shouldWatermark(userId)');
    expect(queue).not.toMatch(/if \(item\.watermark\)/);
  });
});
