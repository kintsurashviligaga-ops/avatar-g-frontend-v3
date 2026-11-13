/**
 * lib/agent/appBuilder/spec.ts — the App Builder's input and its build plan (v5.1 Phase 4, PREPARED, NOT WIRED). Pure.
 *
 * Agent G writes a small web app (a calculator, a landing page, a quiz) as files; the App Builder checks them, lays them
 * on a fixed template, builds them in the code sandbox, and saves the built site to the user's workspace under
 * apps/<id>/, where a preview link serves it. Nothing here builds, uploads or serves; it only decides what is allowed and
 * what the sandbox will be told to do.
 *
 *   template   'static' (plain HTML/CSS/JS, no build) or 'vite-react' (React + Vite, built in the sandbox). The template
 *              owns package.json, the Vite config and the lockfile: the app's files can never replace them, so the
 *              build cannot be pointed at other scripts or registries. Extra npm packages go through the same allowlist
 *              as code runs (lib/agent/sandbox/packages).
 *   files      at most APP_MAX_FILES, APP_MAX_FILE_BYTES each, APP_MAX_TOTAL_BYTES in all; only under src/ or public/
 *              (plus index.html); only text extensions on the list; no path tricks.
 *   secrets    a file that looks like it carries a key (Google, OpenAI-style, private key, JWT, Supabase service role) is
 *              refused: a built site is public to whoever has the link.
 *   plan       install (registries only, no scripts) → build (deny-all) → collect dist/ (at most APP_MAX_DIST_FILES).
 */
import { checkPackages } from '@/lib/agent/sandbox/packages';

export type AppTemplate = 'static' | 'vite-react';
export const APP_TEMPLATES: readonly AppTemplate[] = ['static', 'vite-react'];
export const APP_MAX_FILES = 40;
export const APP_MAX_FILE_BYTES = 128 * 1024;
export const APP_MAX_TOTAL_BYTES = 512 * 1024;
export const APP_MAX_DIST_FILES = 200;
export const APP_BUILD_WALL_SEC = 120;

const TEXT_EXT = /\.(html|css|js|jsx|ts|tsx|json|svg|md|txt)$/i;
const TEMPLATE_OWNED = new Set(['package.json', 'package-lock.json', 'vite.config.ts', 'vite.config.js', 'tsconfig.json', '.npmrc', 'node_modules']);
const SECRET = [
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI-style secret key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // a JWT (e.g. a Supabase service-role key)
  /service_role/i,
];

export interface AppFile { path: string; text: string }
export interface AppSpec { id: string; title: string; template: AppTemplate; files: AppFile[]; packages: string[] }
export type AppCheck = { ok: true; app: AppSpec; bytes: number } | { ok: false; error: string };

const bytesOf = (s: string) => Buffer.byteLength(s, 'utf8');

/** A safe relative path inside the app, or null. */
export function appPath(v: unknown): string | null {
  if (typeof v !== 'string' || !v || v.length > 200) return null;
  if (v.startsWith('/') || v.includes('\\') || v.includes('\0')) return null;
  const parts = v.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.'))) return null;
  if (!/^[A-Za-z0-9._/-]+$/.test(v)) return null;
  if (TEMPLATE_OWNED.has(parts[0]!)) return null;
  if (v !== 'index.html' && parts[0] !== 'src' && parts[0] !== 'public') return null;
  return TEXT_EXT.test(v) ? v : null;
}

export function checkAppSpec(input: unknown): AppCheck {
  const r = (input ?? {}) as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^app_[a-z0-9]{6,32}$/.test(r.id)) return { ok: false, error: 'id' };
  const title = typeof r.title === 'string' ? r.title.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : '';
  if (!title || title.length > 120) return { ok: false, error: 'title (≤ 120 characters)' };
  if (!APP_TEMPLATES.includes(r.template as AppTemplate)) return { ok: false, error: `template: ${APP_TEMPLATES.join(' or ')}` };
  const template = r.template as AppTemplate;
  if (!Array.isArray(r.files) || r.files.length === 0) return { ok: false, error: 'files: a non-empty list' };
  if (r.files.length > APP_MAX_FILES) return { ok: false, error: `files: at most ${APP_MAX_FILES}` };
  const files: AppFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const [i, f] of r.files.entries()) {
    const raw = (f ?? {}) as Record<string, unknown>;
    const path = appPath(raw.path);
    if (!path) return { ok: false, error: `file ${i + 1}: a text file under src/ or public/ (or index.html); not ${String(raw.path).slice(0, 60)}` };
    if (seen.has(path)) return { ok: false, error: `${path}: twice` };
    if (typeof raw.text !== 'string') return { ok: false, error: `${path}: text` };
    const b = bytesOf(raw.text);
    if (b > APP_MAX_FILE_BYTES) return { ok: false, error: `${path}: at most ${APP_MAX_FILE_BYTES / 1024} KB` };
    if (SECRET.some((re) => re.test(raw.text as string))) return { ok: false, error: `${path}: looks like it contains a key or secret; a built app is public to anyone with the link` };
    total += b;
    seen.add(path);
    files.push({ path, text: raw.text });
  }
  if (total > APP_MAX_TOTAL_BYTES) return { ok: false, error: `files: at most ${APP_MAX_TOTAL_BYTES / 1024} KB in all` };
  if (!seen.has('index.html')) return { ok: false, error: 'index.html is needed' };
  if (template === 'static' && files.some((f) => /\.(tsx?|jsx)$/.test(f.path))) return { ok: false, error: 'static apps take plain HTML, CSS and JS (use vite-react for JSX/TS)' };
  const packages = r.packages === undefined ? [] : r.packages;
  if (template === 'static' && Array.isArray(packages) && packages.length > 0) return { ok: false, error: 'static apps install no packages' };
  const pk = checkPackages('npm', packages);
  if (!pk.ok) return { ok: false, error: pk.error };
  return { ok: true, app: { id: r.id, title, template, files, packages: pk.packages.map((p) => `${p.name}@${p.version}`) }, bytes: total };
}

export type BuildPhase =
  | { phase: 'write'; files: number }
  | { phase: 'install'; argv: string[]; egress: readonly string[] }
  | { phase: 'build'; argv: string[]; egress: readonly [] }
  | { phase: 'collect'; from: string; to: string; maxFiles: number };

/** What the sandbox does, in order. A static app has nothing to install or build: its files are the site. */
export function buildPlan(app: AppSpec): BuildPhase[] {
  const to = `apps/${app.id}/dist`;
  if (app.template === 'static') return [{ phase: 'write', files: app.files.length }, { phase: 'collect', from: '.', to, maxFiles: APP_MAX_DIST_FILES }];
  const extra = checkPackages('npm', app.packages);
  const pins = extra.ok ? extra.packages.map((p) => `${p.name}@${p.version}`) : [];
  return [
    { phase: 'write', files: app.files.length },
    // The template's own lockfile first (npm ci), then the allowlisted extras; never a package script.
    { phase: 'install', argv: ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], egress: ['registry.npmjs.org'] },
    ...(pins.length ? [{ phase: 'install' as const, argv: ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-save', ...pins], egress: ['registry.npmjs.org'] as const }] : []),
    { phase: 'build', argv: ['npx', '--no-install', 'vite', 'build', '--outDir', 'dist', '--emptyOutDir'], egress: [] },
    { phase: 'collect', from: 'dist', to, maxFiles: APP_MAX_DIST_FILES },
  ];
}
