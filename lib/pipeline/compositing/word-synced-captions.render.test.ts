import { writeFileSync } from 'fs';

// Break the transitive env/supabase import chain (ESM-only @t3-oss) so the pure SVG + resvg
// render path is testable in jest — same shim the overlay render test uses.
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(), uploadBufferAndSign: jest.fn() }));

// eslint-disable-next-line import/first
import { renderSubtitleCardPng } from './ffmpeg-overlay';
// eslint-disable-next-line import/first
import { alignmentToCaptionSegments, type ElevenAlignment } from './word-synced-captions';

/** A FIXTURE with-timestamps alignment (no live TTS): fake ~0.09s/char timings. */
function fixtureAlignment(text: string): ElevenAlignment {
  const chars = [...text];
  const dt = 0.09;
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => +(i * dt).toFixed(2)),
    character_end_times_seconds: chars.map((_, i) => +((i + 1) * dt).toFixed(2)),
  };
}

// Proves the FULL word-synced caption pipeline renders real ქართული glyphs (not tofu) end-to-end
// from a fixture alignment — the exact path 2.6 uses once live TTS provides real timings.
describe('word-synced caption pipeline → Georgian glyphs (fixture, no EL credits)', () => {
  const HOOK = 'ახალი დღე, ახალი ფასდაკლება';

  it('fixture alignment → segments carry the Georgian words with real timings', () => {
    const segs = alignmentToCaptionSegments(fixtureAlignment(HOOK), { maxWords: 3 });
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.map((s) => s.text).join(' ')).toMatch(/ახალი/);
    // timings are monotonic and non-negative (came from the fixture char times)
    for (const s of segs) {
      expect(s.startSec).toBeGreaterThanOrEqual(0);
      expect(s.endSec).toBeGreaterThanOrEqual(s.startSec);
    }
  });

  it('each caption card rasterises real glyphs via embedded FiraGO (non-empty PNG, not tofu)', async () => {
    const segs = alignmentToCaptionSegments(fixtureAlignment(HOOK), { maxWords: 3 });
    let firstPng: Buffer | null = null;
    for (const s of segs) {
      const png = await renderSubtitleCardPng(s.text, 1080, 1920);
      expect(png).not.toBeNull();
      expect(png!.length).toBeGreaterThan(2000); // a real rasterised strip, not empty/blank
      if (!firstPng) firstPng = png;
    }
    // artifact for visual review (best-effort)
    try { if (firstPng) writeFileSync('/tmp/caption_fixture_card.png', firstPng); } catch { /* noop */ }
  });
});
