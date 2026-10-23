/** @jest-environment node */
/**
 * No progress bar is left in the studio (MASTER TASK v3.1 §3.3, Phase 2 PR 4).
 *
 * A wait shows a percent and a short label: the loading card (ui/GenerationProgress) or, on a surface with its own
 * frame, ui/controls' ProgressLine and ResultCard's caption. A drawn bar beside the number was a second reading of
 * the same guess, and the studio had nine of them, each with its own height, colour and easing.
 *
 * This walks every .tsx under components/studio and fails on a bar: a width-animated fill, an indeterminate sweep
 * (the panels' old ProgressBar, the shell's top bar), the retired ProgressBar, or a fill whose width is set from a
 * number. Media scrubbers draw where the playhead
 * is, not how far a job has got; they are the only fills allowed, by file and by the value they draw.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', '..');
const studio = __dirname;

function tsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) tsx(p, out);
    else if (e.name.endsWith('.tsx') && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = tsx(studio).map((p) => ({ path: relative(root, p), src: readFileSync(p, 'utf8') }));

/** Playback position and buffer, drawn as a fill: not progress. `path` and the expression inside `width: `${…}%``. */
const SCRUBBERS: { path: string; value: string }[] = [
  { path: 'components/studio/SurgicalEditor.tsx', value: 'progress * 100' }, // the clip's playhead on the timeline
  { path: 'components/studio/TrackPlayer.tsx', value: 'pct' }, // the track's playhead
  { path: 'components/studio/ChatVideoPlayer.tsx', value: 'buffered' }, // how much of the video has loaded
  { path: 'components/studio/ChatVideoPlayer.tsx', value: 'pct' }, // the video's playhead
];

describe('the studio draws no progress bar', () => {
  it('found the studio', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ['no width-animated fill', /transition-\[width\]/],
    ['no indeterminate sweep', /animate-progress-indeterminate|mya-loadbar/],
    ['no ProgressBar (retired for ProgressLine)', /<ProgressBar\b/],
  ])('%s', (_what, pattern) => {
    expect(files.filter((f) => pattern.test(f.src)).map((f) => f.path)).toEqual([]);
  });

  it('no fill sized by a number, other than the media scrubbers', () => {
    const fills = files.flatMap((f) =>
      [...f.src.matchAll(/width:\s*`\$\{([^`]*)\}%`/g)].map((m) => ({ path: f.path, value: m[1]!.trim() })));
    const bars = fills.filter((x) => !SCRUBBERS.some((s) => s.path === x.path && s.value === x.value));
    expect(bars).toEqual([]);
  });

  it('every scrubber on the list still exists, so the list keeps meaning what it says', () => {
    const fills = files.flatMap((f) =>
      [...f.src.matchAll(/width:\s*`\$\{([^`]*)\}%`/g)].map((m) => `${f.path}:${m[1]!.trim()}`));
    expect(SCRUBBERS.map((s) => `${s.path}:${s.value}`).filter((s) => !fills.includes(s))).toEqual([]);
  });
});
