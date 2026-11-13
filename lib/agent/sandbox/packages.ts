/**
 * lib/agent/sandbox/packages.ts — which packages a Python or Node.js code run may install (v5.1 Phase 4, PREPARED, NOT
 * WIRED). Pure. Today every run is deny-all: no network, so only the standard library and what the image ships with.
 *
 * Installing packages means opening the network to the package registries, and only to them, for the install phase
 * only. That is a policy change GG decides (it is listed in docs/v5.1-phase4/00-phase4-architecture.md). This file is
 * the part that can be decided in code without it:
 *
 *   - only names on an allowlist (common data, plotting, parsing and document libraries); anything else is refused by
 *     name, never "best effort";
 *   - every package pinned to an exact version the allowlist names (no ranges, no "latest", no URLs, no git, no local
 *     paths, no extra index), so a run is reproducible and a typo-squat or a hijacked new release cannot get in;
 *   - at most PKG_MAX packages; installs never run package scripts (npm --ignore-scripts, pip --only-binary=:all:);
 *   - the install phase may reach only INSTALL_EGRESS; the code phase that follows is deny-all again, as today.
 */
export type PkgEcosystem = 'pip' | 'npm';
export const PKG_MAX = 10;

/** The only hosts the install phase may reach. The code phase never reaches any. */
export const INSTALL_EGRESS: Readonly<Record<PkgEcosystem, readonly string[]>> = {
  pip: ['pypi.org', 'files.pythonhosted.org'],
  npm: ['registry.npmjs.org'],
};

/**
 * name → the exact versions allowed. A version bump is a reviewed change to this list.
 * TODO(before turn-on): these pins were written offline (the registry was not reachable from the build container) and
 * must be checked against PyPI / npm, and a reviewed constraints file (pip) / lockfile (npm) must pin the transitive
 * dependencies too: today only the top-level package is pinned.
 */
export const PKG_ALLOW: Readonly<Record<PkgEcosystem, Readonly<Record<string, readonly string[]>>>> = {
  pip: {
    numpy: ['2.3.4'],
    pandas: ['2.3.3'],
    matplotlib: ['3.10.7'],
    openpyxl: ['3.1.5'],
    'python-docx': ['1.2.0'],
    pillow: ['12.0.0'],
    requests: ['2.32.5'],
    beautifulsoup4: ['4.14.2'],
    lxml: ['6.0.2'],
    'pypdf': ['6.1.3'],
  },
  npm: {
    lodash: ['4.17.21'],
    'date-fns': ['4.1.0'],
    papaparse: ['5.5.3'],
    cheerio: ['1.1.2'],
    'chart.js': ['4.5.1'],
    exceljs: ['4.4.0'],
    marked: ['16.4.1'],
    zod: ['4.1.12'],
  },
};

export interface PkgRequest { name: string; version: string }
export type PkgCheck =
  | { ok: true; ecosystem: PkgEcosystem; packages: PkgRequest[]; command: string[]; egress: readonly string[] }
  | { ok: false; error: string };

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** "pandas==2.3.3" (pip) or "lodash@4.17.21" (npm) → name and exact version; null for anything else. */
export function parsePkg(eco: PkgEcosystem, spec: string): PkgRequest | null {
  const s = spec.trim().toLowerCase();
  const m = eco === 'pip' ? /^([a-z0-9._-]+)==([0-9][0-9a-z.]*)$/.exec(s) : /^((?:@[a-z0-9-]+\/)?[a-z0-9._-]+)@([0-9][0-9a-z.-]*)$/.exec(s);
  if (!m) return null;
  const name = eco === 'pip' ? m[1]!.replace(/_/g, '-') : m[1]!;
  if (!NAME.test(name.replace(/^@[a-z0-9-]+\//, ''))) return null;
  return { name, version: m[2]! };
}

/** Check a run's package list and give the exact install command (no shell string: an argv). */
export function checkPackages(eco: PkgEcosystem, specs: unknown): PkgCheck {
  if (eco !== 'pip' && eco !== 'npm') return { ok: false, error: 'packages: pip or npm' };
  if (!Array.isArray(specs)) return { ok: false, error: 'packages: a list' };
  if (specs.length === 0) return { ok: true, ecosystem: eco, packages: [], command: [], egress: [] };
  if (specs.length > PKG_MAX) return { ok: false, error: `packages: at most ${PKG_MAX}` };
  const seen = new Set<string>();
  const packages: PkgRequest[] = [];
  for (const raw of specs) {
    if (typeof raw !== 'string' || raw.length > 120) return { ok: false, error: 'packages: each one a short "name==version" (pip) or "name@version" (npm)' };
    const p = parsePkg(eco, raw);
    if (!p) return { ok: false, error: `${raw.slice(0, 60)}: pin an exact version (${eco === 'pip' ? 'name==1.2.3' : 'name@1.2.3'}); no ranges, URLs or paths` };
    const allowed = PKG_ALLOW[eco][p.name];
    if (!allowed) return { ok: false, error: `${p.name}: not on the allowed list` };
    if (!allowed.includes(p.version)) return { ok: false, error: `${p.name}: only ${allowed.join(', ')}` };
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    packages.push(p);
  }
  const pins = packages.map((p) => (eco === 'pip' ? `${p.name}==${p.version}` : `${p.name}@${p.version}`));
  const command = eco === 'pip'
    ? ['pip', 'install', '--no-input', '--disable-pip-version-check', '--only-binary=:all:', '--target', '/vercel/sandbox/.pkgs', ...pins]
    : ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', '/vercel/sandbox/.pkgs', ...pins];
  return { ok: true, ecosystem: eco, packages, command, egress: INSTALL_EGRESS[eco] };
}

/**
 * GG 2026-11-13 12:34Z (approved): network to npm / PyPI ONLY during the explicit install step, ONLY for the pinned
 * allowlisted packages; the Python / Node run step stays deny-all. This is the whole run as two phases. A run with no
 * packages is a single deny-all phase, exactly as today. The plan is refused (never "run without the packages") if
 * the package list does not pass checkPackages.
 */
export type SandboxPhase =
  | { phase: 'install'; argv: string[]; egress: readonly string[]; wallSec: number }
  | { phase: 'run'; egress: readonly []; wallSec: number };

export const INSTALL_WALL_SEC = 90;

export function twoPhasePlan(eco: PkgEcosystem, specs: unknown, runWallSec: number): { ok: true; phases: SandboxPhase[] } | { ok: false; error: string } {
  const pk = checkPackages(eco, specs ?? []);
  if (!pk.ok) return pk;
  const run: SandboxPhase = { phase: 'run', egress: [], wallSec: runWallSec };
  if (pk.packages.length === 0) return { ok: true, phases: [run] };
  return { ok: true, phases: [{ phase: 'install', argv: pk.command, egress: pk.egress, wallSec: INSTALL_WALL_SEC }, run] };
}
