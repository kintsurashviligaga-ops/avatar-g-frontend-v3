/** @jest-environment node */
/**
 * Schema drift ratchet: the code may only add Supabase calls to tables and functions that exist in Production.
 *
 * Production's `public` schema is far smaller than what the code asks for (2026-10-08: 124 of 160 `.from()` names
 * missing, docs/handoffs/2026-10-08-production-schema-drift.md). Supabase-js does not throw on a missing table, it
 * returns `{ data: null, error }`, so such a call fails silently in Production. Creating the tables is a database
 * change (the owner's call); this test only stops the gap growing. It reads the code itself: a name counts when
 * `.from()` / `.rpc()` gets a string literal, or an identifier bound in the same file to `const X = '<name>'`.
 * `.storage.from()` names a bucket and is skipped; a `.from()` on a capitalised receiver (`Array.from`) is not
 * Supabase.
 *
 * Held against __tests__/schema-drift.snapshot.json:
 *  1. every name the code calls is in Production (`production`) or a known gap (`missing`); a new missing name
 *     → fail (create it with a migration the owner approves, or don't call it);
 *  2. every known gap is still called and still absent from `production` (a stale entry → fail; delete it, so the
 *     list only shrinks);
 *  3. a file whose `.from()` / `.rpc()` name cannot be read statically is listed in `dynamic`; a new one → fail.
 *
 * When a migration lands in Production, re-read the schema and move the names from `missing` to `production`
 * (the queries are in the snapshot's `note`).
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

/** Runtime code only, as in provider-boundary.test.ts. */
const SOURCES = ['app', 'lib', 'components', 'workers', 'services', 'hooks', 'store', 'types', 'middleware.ts'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const NOT_RUNTIME = /(\.test\.|\.spec\.|\/__tests__\/|\/__mocks__\/|\/testing\/)/;

function walk(p: string, out: string[]): string[] {
  if (!existsSync(p)) return out;
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) if (n !== 'node_modules' && !n.startsWith('.')) walk(join(p, n), out);
  } else if (EXTS.some((e) => p.endsWith(e)) && !p.endsWith('.d.ts') && !NOT_RUNTIME.test(rel(p))) {
    out.push(p);
  }
  return out;
}

type Calls = { tables: Set<string>; functions: Set<string>; dynamic: boolean };

/** The table and function names one source text hands to Supabase. */
function callsIn(fileName: string, text: string): Calls {
  const calls: Calls = { tables: new Set(), functions: new Set(), dynamic: false };
  if (!/\.\s*(from|rpc)\s*\(/.test(text)) return calls;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const consts = new Map<string, string>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclarationList(n) && n.flags & ts.NodeFlags.Const) {
      for (const d of n.declarations) {
        let init = d.initializer;
        while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
        if (ts.isIdentifier(d.name) && init && ts.isStringLiteralLike(init)) consts.set(d.name.text, init.text);
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.arguments.length > 0) {
      const method = n.expression.name.text;
      const receiver = n.expression.expression;
      const skip =
        method === 'from' &&
        ((ts.isIdentifier(receiver) && /^[A-Z]/.test(receiver.text)) ||
          (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'storage') ||
          (ts.isIdentifier(receiver) && /storage$/i.test(receiver.text)));
      if ((method === 'from' || method === 'rpc') && !skip) {
        const arg = n.arguments[0]!;
        const name = ts.isStringLiteralLike(arg) ? arg.text : ts.isIdentifier(arg) ? consts.get(arg.text) : undefined;
        if (name === undefined) calls.dynamic = true;
        else (method === 'from' ? calls.tables : calls.functions).add(name);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return calls;
}

function scan() {
  const tables = new Set<string>();
  const functions = new Set<string>();
  const dynamic: string[] = [];
  for (const f of SOURCES.flatMap((s) => walk(join(ROOT, s), [])).sort()) {
    const c = callsIn(f, readFileSync(f, 'utf8'));
    c.tables.forEach((t) => tables.add(t));
    c.functions.forEach((t) => functions.add(t));
    if (c.dynamic) dynamic.push(rel(f));
  }
  return { tables, functions, dynamic };
}

const SNAPSHOT: {
  production: { tables: string[]; functions: string[] };
  missing: { tables: string[]; functions: string[] };
  dynamic: string[];
} = JSON.parse(readFileSync(join(ROOT, '__tests__/schema-drift.snapshot.json'), 'utf8'));

describe('schema drift (code vs the Production schema snapshot)', () => {
  const actual = scan();

  test('the scanner reads literal and same-file const names, skips buckets and non-Supabase from()', () => {
    const c = callsIn(
      'a.ts',
      [
        "const TABLE = 'studio_jobs';",
        "const EVENTS = 'provider_webhook_events' as const;",
        "sb.from('jobs').select('*'); sb.from(TABLE); sb.from(EVENTS);",
        "await supabase.rpc('deduct_credits', {});",
        "supabase.storage.from('uploads'); storage.from('renders');",
        "Array.from('abc'); Buffer.from('x');",
      ].join('\n'),
    );
    expect([...c.tables].sort()).toEqual(['jobs', 'provider_webhook_events', 'studio_jobs']);
    expect([...c.functions]).toEqual(['deduct_credits']);
    expect(c.dynamic).toBe(false);
    expect(callsIn('b.ts', 'async function f(t: string) { return sb.from(t).select(); }').dynamic).toBe(true);
    expect(callsIn('c.ts', '// sb.from(\'ghost\')').tables.size).toBe(0);
  });

  test('the snapshot lists each name once: Production and the known gaps do not overlap', () => {
    for (const kind of ['tables', 'functions'] as const) {
      const prod = new Set(SNAPSHOT.production[kind]);
      expect(SNAPSHOT.missing[kind].filter((n) => prod.has(n))).toEqual([]);
      expect(new Set(SNAPSHOT.missing[kind]).size).toBe(SNAPSHOT.missing[kind].length);
    }
  });

  test.each(['tables', 'functions'] as const)('no new %s missing in Production', (kind) => {
    const known = new Set([...SNAPSHOT.production[kind], ...SNAPSHOT.missing[kind]]);
    const added = [...actual[kind]].filter((n) => !known.has(n)).sort();
    // A name here is called by the code but absent from Production. Ship the migration with the owner's approval
    // (then move the name into `production`), or don't call it.
    expect(added).toEqual([]);
  });

  test.each(['tables', 'functions'] as const)('the known %s gaps only shrink: each is still called', (kind) => {
    const stale = SNAPSHOT.missing[kind].filter((n) => !actual[kind].has(n));
    // A name here is good news: no code calls it any more. Delete it from `missing`.
    expect(stale).toEqual([]);
  });

  test('no new file hands Supabase a name the scanner cannot read', () => {
    expect(actual.dynamic.filter((f) => !SNAPSHOT.dynamic.includes(f))).toEqual([]);
    expect(SNAPSHOT.dynamic.filter((f) => !actual.dynamic.includes(f))).toEqual([]);
  });
});
