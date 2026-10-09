/** @jest-environment node */
/**
 * Source-shape guards for the server auth boundary (2026-10-09 Supabase auth and security review).
 *
 * 1. A server route decides who the caller is with `auth.getUser()` (validated by Supabase Auth), never with
 *    `auth.getSession()`, which only decodes the cookie. app/api/avatar/generate used getSession() until 2026-10-09.
 * 2. The service-role key and the service-role client never appear in code that can ship to a browser.
 * 3. lib/supabase/server.ts stays `server-only`, so importing it from a client component fails the build.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('no server route trusts auth.getSession() for identity', () => {
  const offenders = walk(join(ROOT, 'app', 'api'))
    .filter((p) => /auth\.getSession\(\)/.test(stripComments(readFileSync(p, 'utf8'))))
    .map(rel);
  expect(offenders).toEqual([]);
});

test('the service-role key and client never appear in browser code', () => {
  const clientDirs = ['components', 'hooks'].map((d) => join(ROOT, d)).filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  const files = clientDirs.flatMap((d) => walk(d));
  // Any file marked 'use client' anywhere in app/ or lib/ ships to the browser too.
  for (const d of ['app', 'lib']) {
    for (const p of walk(join(ROOT, d))) {
      if (/^\s*['"]use client['"]/.test(readFileSync(p, 'utf8'))) files.push(p);
    }
  }
  const offenders = files
    .filter((p) => /SUPABASE_SERVICE_ROLE_KEY|createServiceRoleClient/.test(stripComments(readFileSync(p, 'utf8'))))
    .map(rel);
  expect(offenders).toEqual([]);
});

test('no NEXT_PUBLIC_ variable carries a service-role or secret key', () => {
  const offenders: string[] = [];
  for (const d of ['app', 'components', 'lib', 'hooks']) {
    let files: string[] = [];
    try {
      files = walk(join(ROOT, d));
    } catch {
      continue;
    }
    for (const p of files) {
      const m = stripComments(readFileSync(p, 'utf8')).match(/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET)[A-Z0-9_]*/g);
      if (m) offenders.push(`${rel(p)}: ${[...new Set(m)].join(',')}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('lib/supabase/server.ts is server-only', () => {
  const src = readFileSync(join(ROOT, 'lib', 'supabase', 'server.ts'), 'utf8');
  expect(src).toMatch(/^import 'server-only';/m);
});
