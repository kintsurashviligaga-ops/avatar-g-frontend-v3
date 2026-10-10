/** @jest-environment node */
/**
 * ONE PRICE A USER CAN SEE (Agent G PART 5, gap C4 of docs/handoffs/agent-g/part-0-report.md).
 *
 * What a user is shown and charged comes from lib/credits/pricing (creditCostFor), lib/credits/videoPricing (films),
 * lib/credits/quote (the Generate buttons) and lib/billing (plans, the BOG / card top-ups). Older tables still sit in
 * the repo with prices that disagree with those (a 15-credit video, $9.99 / $29.99 plans, 25 / 75 / 149 ₾ and
 * $3.99 – $39.99 packs). None of them reaches a screen today: the modules below have no importer outside themselves.
 * Deleting them, and choosing which pack list is the product's, is the owner's call (owner action 7); until then this
 * ratchet keeps any page, route or prompt from picking one up again.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SCAN = ['app', 'components', 'lib', 'hooks', 'store'];

/** Legacy price tables and the dead UI that renders them (repo paths without extension; a directory covers its files). */
const DEAD_PRICES = [
  'lib/monetization/credits', // CREDIT_COSTS 10/5/15/8/20, SUBSCRIPTION_TIERS $9.99/$29.99
  'hooks/useCredits', // the client "deduct" over it
  'hooks/useSubscription', // the plan hook over it
  'components/dashboard/omni', // MainDashboard's side panel: $19 / $49 plans, $3.99 – $39.99 packs
];

const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.(test|spec)\.(ts|tsx)$/;
function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SOURCE.test(e.name) && !TEST.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
}
const SPEC = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const repoPath = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/');
const deadOf = (rel: string): string | undefined =>
  DEAD_PRICES.find((d) => rel === d || rel.startsWith(`${d}/`) || rel.startsWith(`${d}.`));

/** `importer → dead module` for every live file that reaches one, plus who imports a named export from a module. */
function scan(): { dead: string[]; named: (mod: string, name: string) => string[] } {
  const files: string[] = [];
  for (const d of SCAN) walk(path.join(ROOT, d), files);
  const dead = new Set<string>();
  const sources = files.map((file) => ({ file, from: repoPath(file), src: fs.readFileSync(file, 'utf8') }));
  for (const { file, from, src } of sources) {
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1]!;
      const target = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? repoPath(path.resolve(path.dirname(file), spec)) : null;
      const hit = target ? deadOf(target.replace(/\.(ts|tsx|js)$/, '')) : undefined;
      // A dead module importing another dead one (useCredits → monetization/credits) is their own business.
      if (hit && !deadOf(from)) dead.add(`${from} → ${hit}`);
    }
  }
  const named = (mod: string, name: string) => sources
    .filter(({ from, src }) => from !== `${mod}.ts` && new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]@/${mod}['"]`).test(src))
    .map(({ from }) => from);
  return { dead: [...dead].sort(), named };
}

test('the listed modules exist (the list names real code)', () => {
  for (const d of DEAD_PRICES) {
    const there = ['', '.ts', '.tsx'].some((ext) => fs.existsSync(path.join(ROOT, d + ext)));
    expect({ module: d, there }).toEqual({ module: d, there: true });
  }
});

test('no live page, route or prompt imports a legacy price table', () => {
  expect(scan().dead).toEqual([]);
});

test('the pack lists nothing sells stay unsold: the assistant quotes the Credits window\'s packs, not these', () => {
  const { named } = scan();
  // 25 / 75 / 149 ₾ — never wired to a checkout (the retired /api/billing/topup only named it in a comment).
  expect(named('lib/billing/pricingConfig', 'CREDIT_PACKS')).toEqual([]);
  // 9 / 29 / 89 ₾ — the assistant quoted these while the Credits window sells BOG_TOPUP_PACKS_GEL.
  expect(named('lib/credits/pricing', 'CREDIT_PACKAGES')).toEqual([]);
});
