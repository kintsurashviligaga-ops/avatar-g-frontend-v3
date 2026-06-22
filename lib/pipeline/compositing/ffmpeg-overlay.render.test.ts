import { writeFileSync } from 'fs';

// Break the transitive env/supabase import chain (ESM-only @t3-oss) so the pure
// SVG + resvg render path is testable in jest. buildOverlaySvg/renderOverlayPng
// never touch storage — only overlayMasterUrl does.
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));

// eslint-disable-next-line import/first
import { buildOverlaySvg, renderOverlayPng } from './ffmpeg-overlay';

// Smoke test: prove the cinematic caption framework renders real glyphs (not tofu)
// for Georgian + English, in both aspect ratios, and writes PNGs for visual review.
describe('cinematic overlay render (v330)', () => {
  const cases = [
    { name: 'en-16x9', m: { overlayText: 'AI Music Video', website: 'MyAvatar.ge', lang: 'en' as const }, w: 1920, h: 1080 },
    { name: 'ka-16x9', m: { overlayText: 'მუსიკალური ვიდეო', website: 'MyAvatar.ge' }, w: 1920, h: 1080 },
    { name: 'ka-9x16', m: { overlayText: 'ქართული სიმღერა', website: 'MyAvatar.ge' }, w: 1080, h: 1920 },
    { name: 'b2b-en', m: { overlayText: 'Premium Suite', website: 'MyAvatar.ge', priceTag: '₾2,400/mo', cta: 'Book a demo', specs: ['4K cinematic render', 'Georgian voice clone', '9 live agents'] }, w: 1920, h: 1080 },
  ];

  test.each(cases)('renders %s without tofu', async ({ name, m, w, h }) => {
    const svg = buildOverlaySvg(m, w, h);
    expect(svg).toContain('xml:lang');
    // Georgian cases must route to the Georgian lang + native case (no uppercase mangling).
    if (name.startsWith('ka')) expect(svg).toContain('xml:lang="ka"');
    const png = await renderOverlayPng(m, w, h);
    expect(png).not.toBeNull();
    expect(png!.length).toBeGreaterThan(2000); // a real rasterised layer, not empty
    try { writeFileSync(`/tmp/ovl_${name}.png`, png!); } catch { /* artifact write is best-effort */ }
  });
});
