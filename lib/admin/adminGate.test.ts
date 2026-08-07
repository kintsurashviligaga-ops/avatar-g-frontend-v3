/** @jest-environment node */
/**
 * Every admin route must be gated the same way, and it must be a gate the user cannot grant themselves.
 *
 * ⚠️ THREE ROUTES CHECKED `profiles.role === 'admin'` AGAINST A COLUMN THAT DOES NOT EXIST. The select
 * errored, `profile` came back null, and the comparison was true for everyone — analytics, payments and
 * stats returned 403 to real admins and had been dead for as long as they existed. They failed CLOSED,
 * so nothing leaked; they simply never worked, and nobody noticed because an admin panel that shows
 * nothing looks a lot like an admin panel with nothing to show.
 *
 * ⚠️ AND A ROW-FLAG GATE WOULD HAVE BEEN WORSE IF IT HAD WORKED. A flag on the user's own profile row —
 * like user_metadata — is writable by the very person it describes unless RLS forbids it exactly.
 * The session-email allowlist has no such failure mode: the email comes from the signed cookie and the
 * list lives server-side.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const adminApi = join(root, 'app/api/admin');

/** Every route file under app/api/admin, at any depth. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

const files = existsSync(adminApi) ? routeFiles(adminApi) : [];
const rel = (f: string) => f.slice(root.length + 1);

/**
 * Source with comments stripped. The fix quotes the broken pattern verbatim in its own explanation, so
 * a raw scan matches the very comment that documents the repair — this is the third time in this
 * codebase that a guard written this way flagged itself.
 */
const codeOf = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

/**
 * The gates this project accepts.
 *
 * ⚠️ THE FIRST VERSION OF THIS MATCHED `isAdmin(` ANYWHERE IN THE FILE — and app/api/admin/payouts/
 * approve defined its OWN `async function isAdmin(userId, supabase)` that read `profiles.role`. So the
 * guard reported a payout-approval route as gated while it was gated on a flag the payee could write to
 * their own row. A test that accepts a local function with the right NAME is checking spelling, not
 * authorization.
 *
 * The gate must therefore be IMPORTED from a module that owns the allowlist — or be an explicit shared
 * secret (`x-admin-key`, for machine callers, not users) or a local email allowlist constant.
 */
const IMPORTED_GATE = /import\s*\{[^}]*\b(isAdmin|isAdminUser|isAdminEmail|assertAdminAccess|assertAdmin|requireAdmin|hasValidAdminKey)\b[^}]*\}\s*from\s*['"][^'"]*(adminGuard|admin\/guard)['"]/;
const LOCAL_SECRET = /x-admin-key|ADMIN_EMAILS/;
const isGated = (src: string) => IMPORTED_GATE.test(src) || LOCAL_SECRET.test(src);

describe('admin route gate', () => {
  it('finds the admin routes at all', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [rel(f), f]))('%s is gated', (_name, f) => {
    expect(isGated(readFileSync(f, 'utf8'))).toBe(true);
  });

  it('no admin route trusts a role flag on the user’s own row', () => {
    // The exact shape that was broken here, and that would be self-grantable if it were not.
    const offenders = files.filter((f) => /profile\??\.role\s*!==?\s*'admin'/.test(codeOf(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no admin route defines its OWN admin check', () => {
    // A local helper cannot be reviewed once and trusted everywhere; the six that existed all read a
    // self-grantable row flag. The allowlist lives in one module and is imported.
    const offenders = files.filter((f) => /(async )?function isAdmin\w*\s*\(/.test(codeOf(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('no admin route trusts user_metadata', () => {
    const offenders = files.filter((f) => /user_metadata[\s\S]{0,40}admin/i.test(codeOf(f)));
    expect(offenders.map(rel)).toEqual([]);
  });
});
