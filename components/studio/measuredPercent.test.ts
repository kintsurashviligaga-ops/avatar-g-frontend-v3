/** @jest-environment node */
/**
 * Every percent in the studio is measured (MASTER TASK v3.1 §3.3, Phase 2): "The percentage must reflect server
 * progress or a documented milestone calculation. When progress is unknown, retain the last verified value/0% with a
 * short waiting state; do not manufacture time-driven precision."
 *
 * Until Phase 2 the studio eased a guess toward 95 by the clock wherever a route reported nothing (`easedPct` and its
 * per-kind targets, the result card's elapsed / cap, the image and photo-shoot heartbeats, the editor's export ticks,
 * the VFX card). This walks every .ts and .tsx under components/studio and fails if one comes back: the eased curve or
 * its targets by name, a card paced by elapsed seconds, or a timer whose callback writes a percent.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = sources(__dirname).map((p) => ({ path: relative(root, p), src: readFileSync(p, 'utf8') }));

/** The text of each `setInterval(…)` call, its parentheses balanced (strings and comments are not special-cased). */
function intervals(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\bsetInterval\(/g)) {
    let depth = 0;
    let i = m.index! + 'setInterval'.length;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) break;
    }
    out.push(src.slice(m.index!, i + 1));
  }
  return out;
}

describe('no percent in the studio is paced by the clock', () => {
  it('found the studio', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ['no eased curve', /\beasedPct\b/],
    ['no per-kind time targets', /\bPROGRESS_TARGET\b|\bRESULT_HOLD_PCT\b/],
    ['no card paced by elapsed seconds', /\b(elapsedSec|capSec|capSecFor)=\{/],
  ])('%s', (_what, pattern) => {
    expect(files.filter((f) => pattern.test(f.src)).map((f) => f.path)).toEqual([]);
  });

  it('no timer writes a percent', () => {
    const hits = files.flatMap((f) => intervals(f.src)
      .filter((call) => /\b\w*(Pct|pct)\b|onProgress|setProgress/.test(call))
      .map((call) => `${f.path}: ${call.slice(0, 80)}`));
    expect(hits).toEqual([]);
  });

  it('the timer check sees a timer that writes a percent', () => {
    const sample = 'const t = window.setInterval(() => setExportPct((prev) => (prev < 90 ? prev + 1 : prev)), 600);\n'
      + 'const hb = window.setInterval(() => {\n  onProgress({ pct: p });\n}, 6000);';
    expect(intervals(sample).filter((call) => /\b\w*(Pct|pct)\b|onProgress|setProgress/.test(call))).toHaveLength(2);
  });
});
