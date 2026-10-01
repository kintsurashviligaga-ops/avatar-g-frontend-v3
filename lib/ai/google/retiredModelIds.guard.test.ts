/** @jest-environment node */
/**
 * Repo guard: no retired Gemini model id (gemini-1.0-*, gemini-1.5-*, gemini-2.0-*) is written as a string literal in
 * shipped source, or as a value in .env.example.
 *
 * Why a source scan and not only the registry tests: on 2026-09-29 production chat burned a 404 ("models/gemini-2.0-flash
 * is no longer available") on every turn because a retired id sat in a per-route list the registry never saw. The same
 * sweep then found 1.5 / 2.0 ids in the agent router, a health-check script, a model picker and the env template. Model
 * ids belong in lib/ai/google/models.ts (or an env read with a current default); this test catches a new hard-coded one
 * wherever it lands.
 *
 * Test files are skipped (they use retired ids as negative fixtures), and so are comments (history notes like
 * "gemini-2.0-flash was retired" are fine). _graveyard/ is archived, unshipped code.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SOURCE_DIRS = ['app', 'apps', 'commercial', 'components', 'hooks', 'lib', 'scripts', 'services', 'store', 'types', 'workers'];
const SOURCE_EXT = /\.[cm]?[jt]sx?$/;
const SKIP_PATH = /(?:^|[\\/])(?:node_modules|\.next|__tests__|__mocks__)(?:[\\/]|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** A quoted retired id: 'gemini-2.0-flash', "models/gemini-1.5-pro", `gemini-1.0-pro-vision`. */
const RETIRED_LITERAL = /(['"`])(?:models\/)?gemini-(?:1\.0|1\.5|2\.0)-[A-Za-z0-9._-]*\1/i;
/** An env template value: GEMINI_MODEL_PRO=gemini-1.5-pro-latest. */
const RETIRED_ENV_VALUE = /^\s*[A-Z0-9_]+\s*=\s*["']?(?:models\/)?gemini-(?:1\.0|1\.5|2\.0)-/i;

/** The code part of a source line: comment-only lines dropped, a trailing ` // …` comment cut off. */
function codeOf(line: string): string {
  const t = line.trimStart();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  return line.replace(/(^|\s)\/\/.*$/, '');
}

function offendingLines(text: string): number[] {
  const hits: number[] = [];
  text.split('\n').forEach((line, i) => {
    if (RETIRED_LITERAL.test(codeOf(line))) hits.push(i + 1);
  });
  return hits;
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (SKIP_PATH.test(full)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && SOURCE_EXT.test(e.name)) out.push(full);
  }
}

describe('the guard itself', () => {
  it('flags a quoted retired id in code and ignores comments and current ids', () => {
    expect(offendingLines(`const MODEL = 'gemini-2.0-flash';`)).toEqual([1]);
    expect(offendingLines(`model: "models/gemini-1.5-pro-latest",`)).toEqual([1]);
    expect(offendingLines('type M = `gemini-1.0-pro-vision`;')).toEqual([1]);
    expect(offendingLines(`// 'gemini-2.0-flash-live-001' was retired`)).toEqual([]);
    expect(offendingLines(` * \`gemini-2.0-flash-lite\` used to be the last step`)).toEqual([]);
    expect(offendingLines(`const a = 'gemini-3.8-flash'; // was 'gemini-2.0-flash'`)).toEqual([]);
    expect(offendingLines(`const b = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'];`)).toEqual([]);
    expect(offendingLines(`const RE = /^gemini-(?:1\\.0|1\\.5|2\\.0)(?:-|$)/i;`)).toEqual([]);
  });

  it('flags a retired env template value and ignores commented / empty ones', () => {
    expect(RETIRED_ENV_VALUE.test('GEMINI_MODEL_PRO=gemini-1.5-pro-latest')).toBe(true);
    expect(RETIRED_ENV_VALUE.test('GEMINI_CHAT_MODELS="gemini-2.0-flash,gemini-3.8-flash"')).toBe(true);
    expect(RETIRED_ENV_VALUE.test('GEMINI_MODEL_PRO=')).toBe(false);
    expect(RETIRED_ENV_VALUE.test('GEMINI_MODEL_FLASH=gemini-2.5-flash')).toBe(false);
  });
});

describe('retired Gemini model ids in the repo', () => {
  it('no shipped source file hard-codes one', () => {
    const files: string[] = [];
    for (const d of SOURCE_DIRS) walk(path.join(ROOT, d), files);
    // A wrong ROOT would scan nothing and pass vacuously.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith(path.join('app', 'api', 'chat', 'gemini', 'route.ts')))).toBe(true);

    const offenders: string[] = [];
    for (const f of files) {
      for (const n of offendingLines(fs.readFileSync(f, 'utf8'))) offenders.push(`${path.relative(ROOT, f)}:${n}`);
    }
    expect(offenders).toEqual([]);
  });

  it('.env.example does not ship one as a value', () => {
    const text = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const offenders = text
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !line.trimStart().startsWith('#') && RETIRED_ENV_VALUE.test(line))
      .map(({ n }) => `.env.example:${n}`);
    expect(offenders).toEqual([]);
  });
});
