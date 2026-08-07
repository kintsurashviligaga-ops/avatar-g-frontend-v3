/** @jest-environment node */
/**
 * A UI primitive nobody renders is worse than no primitive at all.
 *
 * ⚠️ THIS IS THE THIRD TIME IN ONE DAY THAT SOMETHING BUILT WAS NEVER WIRED IN. ResultActions solved the
 * cross-origin download bug and no studio imported it. GenerationProgress had every kind and stage list
 * and two studios used it. A chat-history panel sat behind a trigger with `className="hidden"` and I
 * improved it for an hour before noticing nobody could open it.
 *
 * The cost is not the dead file. It is that the next person to "improve the cards" improves one of these
 * and ships nothing — which is exactly what happened to me with the history panel. GlassCard and GlowCard
 * were deleted for that reason; components/ui/card.tsx is the real one and 21 files use it.
 *
 * This walks components/ui and fails on an exported component that nothing outside its own file renders.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const uiDir = __dirname;

/** Every .tsx in components/ui that exports a component (PascalCase export). */
const primitives = readdirSync(uiDir)
  .filter((f) => f.endsWith('.tsx'))
  .flatMap((f) => {
    const src = readFileSync(join(uiDir, f), 'utf8');
    const names = [...src.matchAll(/export (?:default )?function ([A-Z]\w+)/g)].map((m) => m[1]!);
    return names.map((name) => ({ file: f, name }));
  });

/** Files that could render a primitive — the app, not tests and not the primitive's own file. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next' || e.name === '.claude' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

const corpus = [...sourceFiles(join(root, 'components')), ...sourceFiles(join(root, 'app'))]
  .map((p) => ({ path: p, src: readFileSync(p, 'utf8') }));

describe('components/ui primitives are actually used', () => {
  it('found primitives to check', () => {
    expect(primitives.length).toBeGreaterThan(3);
  });

  /**
   * ⚠️ WHAT IS LEFT AFTER THE CLEAROUT, AND IT MAY ONLY SHRINK.
   *
   * Twenty-one exported primitives were rendered nowhere — an entire design system built and never
   * adopted. Fifteen files are gone: GlassCard, GlowCard, AnimatedCounter, CommandInput, CreditBalance,
   * EmptyState, GlowButton, GridBackground, LoadingScreen, Modal, NeonBadge, NeonButton, NoiseOverlay,
   * RocketLogo and the whole tabs set. Verified dead twice over — nothing renders them as JSX and
   * nothing imports their module.
   *
   * They were deleted rather than kept "in case": git remembers them, and "we might need it" is the
   * exact reasoning that let twenty-one accumulate. Anyone who needs a Modal later will write a better
   * one against the current design than the one that sat here unused.
   *
   * Adding a twenty-second is what this stops.
   */
  const QUARANTINE = [
    // Skeleton.tsx itself IS used — three files import it — so the module stays and only these two
    // named exports are unrendered. Deleting a live file to remove two exports is the wrong trade; they
    // are cheap, they belong to a component that is real, and a loading skeleton for a page not yet
    // written is the one case where "not used yet" is a plausible answer rather than an excuse.
    'Skeleton.tsx:CardSkeleton',
    'Skeleton.tsx:DashboardSkeleton',
  ];

  const dead = () => primitives
    .filter(({ file, name }) =>
      !corpus.some((c) => !c.path.endsWith('/' + file) && new RegExp('<' + name + '[\\s/>]').test(c.src)))
    .map((d) => `${d.file}:${d.name}`);

  it('no NEW unused primitive has appeared', () => {
    // Names, not a count — a failure says WHICH one to wire in or delete.
    expect(dead().filter((d) => !QUARANTINE.includes(d))).toEqual([]);
  });

  it('the quarantine list has no stale entries', () => {
    // Someone wired one in? Then take it off the list, so the list keeps meaning what it says.
    const now = dead();
    expect(QUARANTINE.filter((q) => !now.includes(q))).toEqual([]);
  });
});
