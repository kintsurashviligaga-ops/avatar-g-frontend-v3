/** @jest-environment node */
/**
 * Provider boundary ratchet: Google and ElevenLabs are the only AI vendors (PROJECT_MASTER R7), so no NEW runtime file
 * may call another one, and the files that still do can only go away.
 *
 * Many files still reach a non-Google vendor (Replicate, OpenAI, HeyGen, Runway, …) — most behind VIDEO_GOOGLE_ONLY /
 * AI_GOOGLE_ONLY, some live (image, avatar, music: certification §L, owner action 9). Removing them is the owner's
 * call; this test only stops the list growing. It reads the code itself, not comments: a vendor counts when a string
 * or template literal names its API host, or when a value import / require / import() loads its SDK (`import type`
 * compiles away and is not counted).
 *
 * Two lines are held against __tests__/provider-boundary.allowlist.json:
 *  1. no runtime file outside the list for a vendor references that vendor (a new file → fail; route it through a
 *     Google / ElevenLabs engine instead);
 *  2. every listed file still references it (a stale entry → fail; delete the line, so the list only shrinks).
 */
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

/** Runtime code only: what Next, the workers and the services ship. */
const SOURCES = ['app', 'lib', 'components', 'workers', 'services', 'hooks', 'store', 'types', 'middleware.ts'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const NOT_RUNTIME = /(\.test\.|\.spec\.|\/__tests__\/|\/__mocks__\/|\/testing\/)/;

/** Non-Google, non-ElevenLabs AI vendors: API hosts (matched inside string literals) and SDK packages. */
const VENDORS: Record<string, { hosts: RegExp; sdks?: string[] }> = {
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

/** The vendors one source text reaches: hosts in string / template literals, SDKs in value imports. */
function vendorsIn(fileName: string, text: string): Set<string> {
  const found = new Set<string>();
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const literal = (s: string) => {
    for (const [name, v] of Object.entries(VENDORS)) if (v.hosts.test(s)) found.add(name);
  };
  const sdk = (spec: string) => {
    const pkg = sdkOf(spec);
    for (const [name, v] of Object.entries(VENDORS)) if (v.sdks?.includes(pkg)) found.add(name);
  };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n)) {
      if (!n.importClause?.isTypeOnly && ts.isStringLiteral(n.moduleSpecifier)) sdk(n.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(n)) {
      if (!n.isTypeOnly && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) sdk(n.moduleSpecifier.text);
      return;
    }
    if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteralLike(n.arguments[0]!)) {
      const callee = n.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require')) {
        sdk((n.arguments[0] as ts.StringLiteralLike).text);
      }
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literal(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) literal(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function scan(): Record<string, string[]> {
  const byVendor: Record<string, string[]> = Object.fromEntries(Object.keys(VENDORS).map((k) => [k, []]));
  const files = SOURCES.flatMap((s) => walk(join(ROOT, s), [])).sort();
  for (const f of files) for (const v of vendorsIn(f, readFileSync(f, 'utf8'))) byVendor[v]!.push(rel(f));
  return byVendor;
}

const ALLOWLIST: Record<string, string[]> = JSON.parse(
  readFileSync(join(ROOT, '__tests__/provider-boundary.allowlist.json'), 'utf8'),
).files;

describe('provider boundary (R7: Google + ElevenLabs only)', () => {
  const actual = scan();

  test('the scanner sees hosts in code and SDK value imports, not comments or type imports', () => {
    expect([...vendorsIn('a.ts', "const u = 'https://api.replicate.com/v1/predictions';")]).toEqual(['replicate']);
    expect([...vendorsIn('a.ts', 'const u = `https://api.openai.com/v1/${p}`;')]).toEqual(['openai']);
    expect([...vendorsIn('a.ts', "import OpenAI from 'openai';")]).toEqual(['openai']);
    expect([...vendorsIn('a.ts', "const A = await import('@anthropic-ai/sdk');")]).toEqual(['anthropic']);
    expect([...vendorsIn('a.ts', "const R = require('replicate/lib');")]).toEqual(['replicate']);
    expect(vendorsIn('a.ts', '// was https://api.replicate.com/v1, now Veo').size).toBe(0);
    expect(vendorsIn('a.ts', "import type OpenAI from 'openai';").size).toBe(0);
    expect(vendorsIn('a.ts', "fetch('https://generativelanguage.googleapis.com/v1beta'); fetch('https://api.elevenlabs.io/v1')").size).toBe(0);
  });

  test('every vendor in the allowlist is one the scanner knows', () => {
    expect(Object.keys(ALLOWLIST).filter((v) => !(v in VENDORS))).toEqual([]);
  });

  test('no new runtime file reaches a non-Google, non-ElevenLabs AI vendor', () => {
    const added = Object.entries(actual).flatMap(([v, files]) =>
      files.filter((f) => !(ALLOWLIST[v] ?? []).includes(f)).map((f) => `${v}: ${f}`),
    );
    // A new line here means new code calls a forbidden vendor. Route it through a Google / ElevenLabs engine instead;
    // only the owner can widen R7.
    expect(added).toEqual([]);
  });

  test('the allowlist only shrinks: every listed file still reaches its vendor', () => {
    const stale = Object.entries(ALLOWLIST).flatMap(([v, files]) =>
      files.filter((f) => !(actual[v] ?? []).includes(f)).map((f) => `${v}: ${f}`),
    );
    // A line here is good news: that file no longer reaches the vendor. Delete it from the allowlist.
    expect(stale).toEqual([]);
  });
});
