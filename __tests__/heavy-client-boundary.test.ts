/** @jest-environment node */
/**
 * three.js never rides in the first load of the front doors — /{lang} and /{lang}/dashboard — and enters only through a
 * next/dynamic boundary of a 3D view itself.
 *
 * `next build` proves it once (the three/R3F chunks are referenced only from react-loadable-manifest); this keeps it
 * proven. It walks the real import graph from every file Next loads for those two routes — static imports and
 * re-exports are edges; `import type` is not (it compiles away); `import()` (next/dynamic or raw) starts a new chunk —
 * and holds four lines:
 *  1. the routes' static graph reaches no three / three-stdlib / @react-three package, no module that imports one, and
 *     nothing of the long-form video pipeline (lib/video/longform — server-side today);
 *  2. a lazy chunk that contains three.js is ENTERED AT the 3D view (the module that itself imports three/R3F), so no
 *     studio surface drags three in statically behind its own next/dynamic — OmniStudio is fetched on every dashboard
 *     visit, so three.js inside it would be first-load in all but name;
 *  3. every next/dynamic that opens such a chunk is `ssr: false` (three touches window/WebGL on import);
 *  4. …and has a `loading` placeholder, so the layout does not jump when ~245 kB of gzip lands.
 * Value imports used only as types are counted as edges (an over-approximation: a false alarm, never a miss).
 */
import ts from 'typescript';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

const HEAVY_PACKAGES = ['three', 'three-stdlib', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
const isHeavyPackage = (pkg: string) => HEAVY_PACKAGES.includes(pkg);
const LONGFORM = /^lib\/video\/longform\//;

// Every segment file Next can load for /[locale] and /[locale]/dashboard (root → locale → dashboard).
const ENTRIES = ['app', 'app/[locale]', 'app/[locale]/dashboard']
  .flatMap((d) => ['layout', 'template', 'page', 'loading', 'error', 'not-found', 'global-error'].map((n) => join(ROOT, d, `${n}.tsx`)))
  .filter((f) => existsSync(f));

type DynamicOpts = { ssrFalse: boolean; loading: boolean };
type Edge = { kind: 'static' | 'lazy'; spec: string; file: string | null; pkg: string | null; dynamic: DynamicOpts | null };

const EXTS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];
const isCode = (f: string) => EXTS.some((e) => f.endsWith(e)) && !f.endsWith('.d.ts');

function resolveSpec(from: string, spec: string): { file: string | null; pkg: string | null } {
  let base: string | null = null;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = resolve(dirname(from), spec);
  if (base === null) {
    const parts = spec.split('/');
    return { file: null, pkg: spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]! };
  }
  if (existsSync(base) && statSync(base).isFile()) return { file: base, pkg: null };
  for (const e of EXTS) if (existsSync(base + e)) return { file: base + e, pkg: null };
  for (const e of EXTS) if (existsSync(join(base, `index${e}`))) return { file: join(base, `index${e}`), pkg: null };
  return { file: null, pkg: null };
}

const edgeCache = new Map<string, Edge[]>();
function edgesOf(file: string): Edge[] {
  const hit = edgeCache.get(file);
  if (hit) return hit;
  const edges: Edge[] = [];
  if (isCode(file)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (kind: Edge['kind'], spec: string, dynamic: DynamicOpts | null = null) => edges.push({ kind, spec, ...resolveSpec(file, spec), dynamic });
    // The local name(s) next/dynamic's default export is bound to (`import dynamic from 'next/dynamic'`).
    const dynamicNames = new Set<string>();
    const wrapped = new Map<ts.Node, DynamicOpts>();
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const clause = st.importClause;
        if (st.moduleSpecifier.text === 'next/dynamic' && clause?.name) dynamicNames.add(clause.name.text);
        if (clause?.isTypeOnly) continue;
        const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : null;
        if (clause && !clause.name && named && named.length > 0 && named.every((e) => e.isTypeOnly)) continue;
        add('static', st.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
        if (st.isTypeOnly) continue;
        const named = st.exportClause && ts.isNamedExports(st.exportClause) ? st.exportClause.elements : null;
        if (named && named.length > 0 && named.every((e) => e.isTypeOnly)) continue;
        add('static', st.moduleSpecifier.text);
      }
    }
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && dynamicNames.has(node.expression.text)) {
          const opts = node.arguments[1];
          const prop = (name: string) => (opts && ts.isObjectLiteralExpression(opts)
            ? opts.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name.getText(sf) === name)
            : undefined);
          const ssr = prop('ssr');
          const found: DynamicOpts = {
            ssrFalse: Boolean(ssr && ts.isPropertyAssignment(ssr) && ssr.initializer.kind === ts.SyntaxKind.FalseKeyword),
            loading: Boolean(prop('loading')),
          };
          const markImports = (n: ts.Node) => {
            if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) wrapped.set(n, found);
            ts.forEachChild(n, markImports);
          };
          if (node.arguments[0]) markImports(node.arguments[0]);
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
          add('lazy', node.arguments[0].text, wrapped.get(node) ?? null);
        } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
          add('static', node.arguments[0].text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  edgeCache.set(file, edges);
  return edges;
}

/** Modules and packages reachable from `roots` through static edges only — one chunk's worth of code. */
function staticClosure(roots: string[]) {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    for (const e of edgesOf(f)) {
      if (e.kind !== 'static') continue;
      if (e.pkg) packages.add(e.pkg);
      if (e.file && !files.has(e.file)) queue.push(e.file);
    }
  }
  return { files, packages };
}
const importsHeavyDirectly = (f: string) => edgesOf(f).some((e) => e.kind === 'static' && e.pkg !== null && isHeavyPackage(e.pkg));

/** Every lazy edge reachable from the entries through any edges, with the module it sits in. */
function lazyEdges() {
  const seen = new Set<string>();
  const out: Array<{ from: string; edge: Edge }> = [];
  const queue = [...ENTRIES];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const e of edgesOf(f)) {
      if (e.kind === 'lazy') out.push({ from: f, edge: e });
      if (e.file && !seen.has(e.file)) queue.push(e.file);
    }
  }
  return out;
}

test('the walker sees the real routes (both pages and the root layouts)', () => {
  expect(ENTRIES.map(rel)).toEqual(expect.arrayContaining([
    'app/layout.tsx', 'app/[locale]/layout.tsx', 'app/[locale]/page.tsx', 'app/[locale]/dashboard/page.tsx',
  ]));
});

test('1 · the first load of /{lang} and /{lang}/dashboard holds no three.js, no 3D view, no long-form pipeline', () => {
  const first = staticClosure(ENTRIES);
  expect(first.files.size).toBeGreaterThan(20); // a real walk, not an empty one
  expect([...first.packages].filter(isHeavyPackage)).toEqual([]);
  expect([...first.files].filter(importsHeavyDirectly).map(rel)).toEqual([]);
  expect([...first.files].map(rel).filter((f) => LONGFORM.test(f))).toEqual([]);
});

describe('every lazy chunk that carries three.js', () => {
  const heavy = lazyEdges()
    .filter(({ edge }) => edge.file !== null)
    .map(({ from, edge }) => ({ from: rel(from), to: rel(edge.file!), dynamic: edge.dynamic, chunk: staticClosure([edge.file!]) }))
    .filter(({ chunk }) => [...chunk.packages].some(isHeavyPackage));

  test('the known 3D views are found (the walk reaches them; a new one joins the rules below automatically)', () => {
    expect(heavy.map(({ from, to }) => `${from} → ${to}`)).toEqual(expect.arrayContaining([
      'components/studio/ServiceParamsPanel.tsx → components/studio/GlbViewer.tsx',
      'components/studio/scene/SceneDock.tsx → components/studio/scene/SceneCanvas.tsx',
    ]));
  });

  test('2 · is entered AT the 3D view — no surface (OmniStudio is fetched on every dashboard visit) drags three in statically', () => {
    expect(heavy.filter(({ to }) => !importsHeavyDirectly(join(ROOT, to))).map(({ from, to }) => `${from} → ${to}`)).toEqual([]);
    const omni = lazyEdges().find(({ edge }) => edge.file && rel(edge.file) === 'components/studio/OmniStudio.tsx');
    expect(omni).toBeDefined();
    expect([...staticClosure([omni!.edge.file!]).packages].filter(isHeavyPackage)).toEqual([]);
  });

  test('3 · is opened by next/dynamic with ssr: false (three touches window/WebGL on import)', () => {
    expect(heavy.filter(({ dynamic }) => !dynamic?.ssrFalse).map(({ from, to }) => `${from} → ${to}`)).toEqual([]);
  });

  test('4 · shows a `loading` placeholder while its ~245 kB (gzip) downloads, so nothing jumps when it lands', () => {
    expect(heavy.filter(({ dynamic }) => !dynamic?.loading).map(({ from, to }) => `${from} → ${to}`)).toEqual([]);
  });
});
