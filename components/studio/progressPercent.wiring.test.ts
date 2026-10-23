/**
 * Pins MASTER TASK v3.1 §3.3 in OmniStudio's own waits (Phase 2 PR 3): a wait prints a percent and a short label,
 * never a drawn bar beside it, and never 100 before the asset. The storyboard board, the storyboard being built and a
 * film bubble each had a width-animated bar under their number; the bars are gone and the numbers are held under 100.
 *
 * The one bar left is the composer's attachment upload, which Phase 2 PR 4 moves onto the same loader. This count may
 * only go down.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');

describe('OmniStudio waits print a number, not a bar', () => {
  test('one width-animated bar is left, the attachment upload (PR 4)', () => {
    const bars = src.match(/transition-\[width\]/g) ?? [];
    expect(bars.length).toBeLessThanOrEqual(1);
    if (bars.length === 1) {
      const at = src.indexOf('transition-[width]');
      expect(src.slice(at - 400, at)).toContain('aria-label={`${a.name');
    }
  });

  test('the storyboard board counts frames into a held number', () => {
    expect(src).toContain('const boardPct = useRisingPct(prog * 100, streaming);');
    expect(src).toContain('data-testid="storyboard-progress"');
  });

  test('the storyboard being built prints the eased number and no clock', () => {
    const at = src.indexOf('data-testid="storyboard-building-progress"');
    expect(at).toBeGreaterThan(0);
    const block = src.slice(at, at + 600);
    expect(block).toContain('easedPct(elapsed, 150)');
    expect(block).not.toContain('fmtClock');
  });

  test('a film bubble holds its percent under 100 and a failed one prints none', () => {
    const at = src.indexOf('data-testid="video-progress-pct"');
    expect(at).toBeGreaterThan(0);
    const head = src.slice(at - 400, at + 400);
    expect(head).toContain("!m.text?.startsWith('⚠️')");
    expect(head).toContain('Math.min(99, Math.max(0, Math.round(m.videoProgress)))');
  });
});
