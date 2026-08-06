/** @jest-environment node */
/**
 * The standalone studios must offer what the in-chat panel already does.
 *
 * ⚠️ THE SHARED PIECES EXISTED AND ALMOST NOTHING USED THEM. An inventory of components/studio/ui/
 * found GenerationProgress wired into 2 of 9 studios and ResultActions into none — while the in-chat
 * ServiceParamsPanel drove the SAME routes with a full stage/percentage/remaining card. So the identical
 * render showed a rich progress card in chat and a 1px indeterminate bar with one static label on its own
 * page, for a job measured in minutes. Against that, a bar is indistinguishable from a hang, and the
 * reasonable response — reload, or press it again — either loses the render or pays for a second one.
 *
 * This asserts the parity rather than the pixels: a studio that shows progress uses the shared card, and
 * a studio that can fail offers a way to retry.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..');
const src = (f: string) => readFileSync(join(dir, f), 'utf8');

/** Studios migrated to the shared progress card. Grow this list; never shrink it. */
const WITH_PROGRESS = [
  'MontageStudio.tsx', 'DubbingStudio.tsx', 'SlidesStudio.tsx',
  'Model3dStudio.tsx', 'LipsyncStudio.tsx',
];

describe('progress parity', () => {
  it.each(WITH_PROGRESS)('%s uses the shared GenerationProgress card', (f) => {
    expect(src(f)).toContain('<GenerationProgress');
  });

  it.each(WITH_PROGRESS)('%s drives it from a real elapsed clock', (f) => {
    // A card with a frozen `elapsed` is the same lie as the bar it replaced.
    expect(src(f)).toMatch(/setElapsed\(\(Date\.now\(\) - t0\) \/ 1000\)/);
  });

  it.each(WITH_PROGRESS)('%s resets the clock when the run ends', (f) => {
    // Otherwise the next run starts its estimate from the previous run's total.
    expect(src(f)).toMatch(/if \(!busy\) \{ setElapsed\(0\); return; \}/);
  });
});

describe('retry parity', () => {
  const WITH_RETRY = ['MontageStudio.tsx', 'DubbingStudio.tsx', 'SlidesStudio.tsx', 'Model3dStudio.tsx'];

  it.each(WITH_RETRY)('%s offers a retry beside the error', (f) => {
    const s = src(f);
    const at = s.indexOf('{error && (');
    expect(at).toBeGreaterThan(-1);
    // In the same block as the error, not somewhere else on the page.
    expect(s.slice(at, at + 700)).toContain('<SecondaryButton onClick={submit}');
  });

  it.each(WITH_RETRY)('%s disables the retry while a run is in flight', (f) => {
    const s = src(f);
    const at = s.indexOf('<SecondaryButton onClick={submit}');
    expect(s.slice(at, at + 120)).toContain('disabled={busy}');
  });
});
