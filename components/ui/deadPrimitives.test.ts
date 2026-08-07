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
   * ⚠️ A QUARANTINE, NOT A CLEAN BILL. Nineteen exported primitives are rendered nowhere — an entire
   * design system that was built and never adopted. They are listed rather than deleted because some may
   * be intentional (a Skeleton kept for a page not written yet) and deciding that one by one is its own
   * change, not a footnote to a card cleanup.
   *
   * The list may only SHRINK. Wiring one in or deleting it is the work; adding a twentieth is the thing
   * this stops. GlassCard and GlowCard were the first two out — both were card components, which is how
   * this was found: "improve the cards" turned up two nobody could see.
   */
  const QUARANTINE = [
    'AnimatedCounter.tsx:AnimatedCounter', 'CommandInput.tsx:CommandInput', 'CreditBalance.tsx:CreditBalance',
    'EmptyState.tsx:EmptyState', 'GlowButton.tsx:GlowButton', 'GridBackground.tsx:GridBackground',
    'LoadingScreen.tsx:LoadingScreen', 'Modal.tsx:Modal', 'NeonBadge.tsx:NeonBadge', 'NeonButton.tsx:NeonButton',
    'NoiseOverlay.tsx:NoiseOverlay', 'RocketLogo.tsx:RocketLogo', 'Skeleton.tsx:CardSkeleton',
    'Skeleton.tsx:DashboardSkeleton', 'tabs.tsx:Tabs', 'tabs.tsx:TabsContent', 'tabs.tsx:TabsList',
    'tabs.tsx:TabsOld', 'tabs.tsx:TabsTrigger',
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
