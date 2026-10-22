/** @jest-environment node */
/**
 * Provider boundary ratchet. MASTER TASK v3.1 (2026-10-22) narrows PROJECT_MASTER R7: Vertex AI and server-side Google
 * Cloud TTS are the only AI transports, so ElevenLabs and the Gemini Developer API (generativelanguage.googleapis.com)
 * now count as forbidden vendors next to Replicate, OpenAI, HeyGen, Runway, … No NEW runtime code may reach one, and
 * the code that still does can only go away.
 *
 * Many files still reach a forbidden vendor — AI_GOOGLE_ONLY and VIDEO_GOOGLE_ONLY are constants now, so the rest sit
 * behind MEDIA_GOOGLE_ONLY or run live. v3.1 Phase 1 removes them (strict Vertex transport, then the non-Google
 * fallbacks, one switch at a time); this test only stops the lists growing. It
 * reads the code itself, not comments: a vendor counts when a string or template literal names its API host, or when
 * a value import / require / import() loads its SDK (`import type` compiles away and is not counted).
 *
 * Two ratchets, each held both ways (a new entry fails; a stale entry fails too, so each list only shrinks):
 *  1. Files, against __tests__/provider-boundary.allowlist.json: no runtime file outside a vendor's list references
 *     that vendor (route it through a Vertex engine instead).
 *  2. Routes, against __tests__/provider-reachability.baseline.json: no app/api route reaches a vendor through its
 *     value-import closure unless its baseline line names it. That closure is what a request can get to, so a shared
 *     helper that starts calling a vendor shows up on every route that imports it.
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

/** Runtime code only: what Next, the workers and the services ship. */
const SOURCES = ['app', 'lib', 'components', 'workers', 'services', 'hooks', 'store', 'types', 'middleware.ts'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const NOT_RUNTIME = /(\.test\.|\.spec\.|\/__tests__\/|\/__mocks__\/|\/testing\/)/;

/** Forbidden AI vendors: API hosts (matched inside string literals) and SDK packages. Vertex and Cloud TTS are not here. */
const VENDORS: Record<string, { hosts: RegExp; sdks?: string[] }> = {
  gemini_developer_api: { hosts: /\bgenerativelanguage\.googleapis\.com\b/, sdks: ['@google/generative-ai'] },
  elevenlabs: { hosts: /\bapi\.elevenlabs\.io\b/, sdks: ['elevenlabs', '@elevenlabs/elevenlabs-js'] },
  replicate: { hosts: /(^|[/.])replicate\.(com|delivery)\b/, sdks: ['replicate'] },
  openai: { hosts: /\bapi\.openai\.com\b/, sdks: ['openai', '@ai-sdk/openai'] },
  openrouter: { hosts: /\bopenrouter\.ai\b/ },
  anthropic: { hosts: /\bapi\.anthropic\.com\b/, sdks: ['@anthropic-ai/sdk', '@ai-sdk/anthropic'] },
  heygen: { hosts: /\b(api|upload|files2?)\.heygen\.(com|ai)\b/ },
  runway: { hosts: /\bapi\.(dev\.)?runwayml\.com\b/ },
  kling: { hosts: /\bapi\.klingai\.com\b/ },
  higgsfield: { hosts: /\b(api|cdn)\.higgsfield\.ai\b/ },
  liveavatar: { hosts: /\bapi\.liveavatar\.com\b/ },
  ltx: { hosts: /\bapi\.(ltx\.(studio|video)|lightricks\.com)\b/ },
  luma: { hosts: /\bapi\.lumalabs\.ai\b/ },
  stability: { hosts: /\bapi\.stability\.ai\b/ },
  worldlabs: { hosts: /\bapi\.worldlabs\.ai\b/ },
  xai: { hosts: /\bapi\.x\.ai\b/ },
  deepseek: { hosts: /\bapi\.deepseek\.com\b/ },
  atlascloud: { hosts: /\bapi\.atlascloud\.ai\b/ },
  nanobananaapi: { hosts: /\bapi\.nanobananaapi\.ai\b/ },
  cartesia: { hosts: /\bapi\.cartesia\.ai\b/ },
  deepgram: { hosts: /\bapi\.deepgram\.com\b/ },
  udio: { hosts: /\budioapi\.pro\b/ },
  pollinations: { hosts: /\bpollinations\.ai\b/ },
  tavily: { hosts: /\b(api\.)?tavily\.com\b/ },
  fal: { hosts: /\b(queue\.)?fal\.(run|ai)\b/, sdks: ['@fal-ai/client', '@fal-ai/serverless-client'] },
};

function walk(p: string, out: string[]): string[] {
  if (!existsSync(p)) return out;
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) if (n !== 'node_modules' && !n.startsWith('.')) walk(join(p, n), out);
  } else if (EXTS.some((e) => p.endsWith(e)) && !p.endsWith('.d.ts') && !NOT_RUNTIME.test(rel(p))) {
    out.push(p);
  }
  return out;
}

const sdkOf = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);

/** `import type X` and `import { type A, type B }` both compile away; a bare `import './x'` does not. */
const typeOnly = (n: ts.ImportDeclaration) => {
  const c = n.importClause;
  if (!c) return false;
  if (c.isTypeOnly) return true;
  const named = c.namedBindings;
  return !c.name && !!named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly);
};

/** One source text: the vendors it reaches (hosts in string / template literals, SDKs it loads) and the modules it loads. */
function scanSource(fileName: string, text: string): { vendors: Set<string>; imports: string[] } {
  const vendors = new Set<string>();
  const imports: string[] = [];
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const literal = (s: string) => {
    for (const [name, v] of Object.entries(VENDORS)) if (v.hosts.test(s)) vendors.add(name);
  };
  const load = (spec: string) => {
    imports.push(spec);
    const pkg = sdkOf(spec);
    for (const [name, v] of Object.entries(VENDORS)) if (v.sdks?.includes(pkg)) vendors.add(name);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      if (!typeOnly(n) && ts.isStringLiteral(n.moduleSpecifier)) load(n.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(n)) {
      if (!n.isTypeOnly && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) load(n.moduleSpecifier.text);
      return;
    }
    if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteralLike(n.arguments[0]!)) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')) {
        load((n.arguments[0] as ts.StringLiteralLike).text);
      }
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literal(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) literal(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { vendors, imports };
}

const vendorsIn = (fileName: string, text: string) => scanSource(fileName, text).vendors;

const scanned = new Map<string, ReturnType<typeof scanSource>>();
const scanFile = (f: string) => {
  let s = scanned.get(f);
  if (!s) scanned.set(f, (s = scanSource(f, readFileSync(f, 'utf8'))));
  return s;
};

function scan(): Record<string, string[]> {
  const byVendor: Record<string, string[]> = Object.fromEntries(Object.keys(VENDORS).map((k) => [k, []]));
  const files = SOURCES.flatMap((s) => walk(join(ROOT, s), [])).sort();
  for (const f of files) for (const v of scanFile(f).vendors) byVendor[v]!.push(rel(f));
  return byVendor;
}

/** `@/x` and relative specifiers to a runtime file in the repo; packages and anything unresolvable to null. */
const CANDIDATES = ['', ...EXTS, ...EXTS.map((e) => `/index${e}`)];
function resolveImport(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of CANDIDATES) {
    const p = base + c;
    if (EXTS.some((e) => p.endsWith(e)) && existsSync(p) && statSync(p).isFile()) return NOT_RUNTIME.test(rel(p)) ? null : p;
  }
  return null;
}

const deps = new Map<string, string[]>();
const depsOf = (f: string) => {
  let d = deps.get(f);
  if (!d) deps.set(f, (d = [...new Set(scanFile(f).imports.map((s) => resolveImport(s, f)).filter((p): p is string => !!p))]));
  return d;
};

/** Every app/api route that reaches a forbidden vendor, with the vendors its value-import closure reaches. */
function routeReach(): Record<string, string[]> {
  const routes = walk(join(ROOT, 'app/api'), []).filter((f) => /\/route\.(ts|js)$/.test(f)).sort();
  const out: Record<string, string[]> = {};
  for (const r of routes) {
    const seen = new Set([r]);
    const stack = [r];
    const hit = new Set<string>();
    while (stack.length) {
      const f = stack.pop()!;
      for (const v of scanFile(f).vendors) hit.add(v);
      for (const d of depsOf(f)) {
        if (!seen.has(d)) {
          seen.add(d);
          stack.push(d);
        }
      }
    }
    if (hit.size) out[rel(r)] = [...hit].sort();
  }
  return out;
}

const ALLOWLIST: Record<string, string[]> = JSON.parse(
  readFileSync(join(ROOT, '__tests__/provider-boundary.allowlist.json'), 'utf8'),
).files;
const BASELINE: Record<string, string[]> = JSON.parse(
  readFileSync(join(ROOT, '__tests__/provider-reachability.baseline.json'), 'utf8'),
).routes;

describe('provider boundary (v3.1: Vertex + Cloud TTS only)', () => {
  const actual = scan();
  const reach = routeReach();

  test('the scanner sees hosts in code and SDK value imports, not comments or type imports', () => {
    expect([...vendorsIn('a.ts', "const u = 'https://api.replicate.com/v1/predictions';")]).toEqual(['replicate']);
    expect([...vendorsIn('a.ts', 'const u = `https://api.openai.com/v1/${p}`;')]).toEqual(['openai']);
    expect([...vendorsIn('a.ts', "import OpenAI from 'openai';")]).toEqual(['openai']);
    expect([...vendorsIn('a.ts', "const A = await import('@anthropic-ai/sdk');")]).toEqual(['anthropic']);
    expect([...vendorsIn('a.ts', "const R = require('replicate/lib');")]).toEqual(['replicate']);
    expect([...vendorsIn('a.ts', "fetch('https://generativelanguage.googleapis.com/v1beta/models')")]).toEqual(['gemini_developer_api']);
    expect([...vendorsIn('a.ts', 'fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}`)')]).toEqual(['elevenlabs']);
    expect(vendorsIn('a.ts', '// was https://api.replicate.com/v1, now Veo').size).toBe(0);
    expect(vendorsIn('a.ts', "import type OpenAI from 'openai';").size).toBe(0);
    expect(vendorsIn('a.ts', "import { type ClientOptions } from 'openai';").size).toBe(0);
    expect(
      vendorsIn('a.ts', "fetch(`https://${loc}-aiplatform.googleapis.com/v1/projects/${p}`); fetch('https://texttospeech.googleapis.com/v1/text:synthesize')").size,
    ).toBe(0);
  });

  test('the import walk follows value imports, re-exports, import() and require(), not type-only imports', () => {
    const { imports } = scanSource(
      'a.ts',
      "import a from './a'; import type B from './b'; import { type C } from './c'; import { d, type D } from './d';" +
        " export * from './e'; export type { F } from './f'; const g = await import('./g'); const h = require('./h'); import './i';",
    );
    expect(imports).toEqual(['./a', './d', './e', './g', './h', './i']);
  });

  test('every vendor in the allowlist and the baseline is one the scanner knows', () => {
    expect(Object.keys(ALLOWLIST).filter((v) => !(v in VENDORS))).toEqual([]);
    expect([...new Set(Object.values(BASELINE).flat())].filter((v) => !(v in VENDORS))).toEqual([]);
  });

  test('no new runtime file reaches a forbidden AI vendor', () => {
    const added = Object.entries(actual).flatMap(([v, files]) =>
      files.filter((f) => !(ALLOWLIST[v] ?? []).includes(f)).map((f) => `${v}: ${f}`),
    );
    // A new line here means new code calls a forbidden vendor. Route it through a Vertex engine instead; only the
    // owner can widen the boundary.
    expect(added).toEqual([]);
  });

  test('the allowlist only shrinks: every listed file still reaches its vendor', () => {
    const stale = Object.entries(ALLOWLIST).flatMap(([v, files]) =>
      files.filter((f) => !(actual[v] ?? []).includes(f)).map((f) => `${v}: ${f}`),
    );
    // A line here is good news: that file no longer reaches the vendor. Delete it from the allowlist.
    expect(stale).toEqual([]);
  });

  test('no route reaches a forbidden vendor its baseline line does not name', () => {
    const added = Object.entries(reach).flatMap(([r, vs]) =>
      vs.filter((v) => !(BASELINE[r] ?? []).includes(v)).map((v) => `${r}: ${v}`),
    );
    // A new line here means a request to that route can now get to a forbidden vendor, directly or through a helper it
    // imports. Find the import that brought the vendor in and keep the route on Vertex.
    expect(added).toEqual([]);
  });

  test('the baseline only shrinks: every listed route still reaches its vendors', () => {
    const stale = Object.entries(BASELINE).flatMap(([r, vs]) =>
      vs.filter((v) => !(reach[r] ?? []).includes(v)).map((v) => `${r}: ${v}`),
    );
    // A line here is good news: that route no longer reaches the vendor. Delete it from the baseline (and the route's
    // key once its list is empty).
    expect(stale).toEqual([]);
  });
});
