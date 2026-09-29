/** @jest-environment node */
/**
 * Guards for the 2026-09-29 P0: the public anon key could mint credits and read every profile.
 *
 * These are source-shape guards, so they follow the two rules that bit this repo before:
 *   1. strip comments first — a fix's own comment quoting the bad pattern must not trip (or satisfy) a guard;
 *   2. assert what the code DOES (the call, the import), not a name that happens to appear.
 * The live proof is scripts/check-db-exposure.mjs, run against the real database.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const stripSqlComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\s\/\/[^\n'"`]*$/gm, '');

const MIGRATIONS = 'supabase/migrations';
const P0 = '20260929a_p0_lockdown_public_access.sql';

/** Migrations written on or after the P0 must never re-open what it closed. */
const guardedMigrations = () =>
  readdirSync(join(ROOT, MIGRATIONS)).filter((f) => f.endsWith('.sql') && f >= P0).sort();

describe('the P0 lockdown migration', () => {
  const sql = stripSqlComments(read(`${MIGRATIONS}/${P0}`)).toLowerCase();

  test('revokes EXECUTE on every money function from public, anon and authenticated', () => {
    for (const fn of ['add_credits', 'refund_credits', 'credit_wallet_gel', 'deduct_credits', 'consume_free_film',
      'consume_free_avatar_chat', 'restore_free_film', 'restore_free_avatar_chat', 'promote_agent_config', 'rollback_agent_config']) {
      expect(sql).toContain(`'${fn}'`);
    }
    expect(sql).toMatch(/revoke execute on function %s from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function %s to service_role/);
  });

  test('drops every policy that granted USING (true) to everyone', () => {
    for (const [policy, table] of [
      ['service role full access profiles', 'profiles'],
      ['service role full access credits', 'credit_ledger'],
      ['service role full access jobs', 'jobs'],
      ['service role full access job_steps', 'job_steps'],
      ['service role full access artifacts', 'artifacts'],
      ['service role full access intelligence', 'project_intelligence'],
      ['service role can update avatar_builder_jobs', 'avatar_builder_jobs'],
      ['service role can update image_architect_jobs', 'image_architect_jobs'],
    ]) {
      expect(sql).toMatch(new RegExp(`drop policy if exists "${policy}"\\s+on public\\.${table};`));
    }
  });

  test('leaves exactly ONE credit_wallet_gel — two overloads made every 3-argument call ambiguous (PGRST203)', () => {
    expect(sql).toContain('drop function if exists public.credit_wallet_gel(uuid, numeric, text);');
    expect(sql).toContain('drop function if exists public.credit_wallet_gel(uuid, numeric, text, text);');
    const creates = sql.match(/create\s+(?:or\s+replace\s+)?function\s+public\.credit_wallet_gel\s*\(/g) ?? [];
    expect(creates).toHaveLength(1);
    // Every TypeScript caller reads a numeric balance back; `returns void` made them all see null.
    expect(sql).toMatch(/create function public\.credit_wallet_gel\([\s\S]*?\)\s*returns integer/);
    // Idempotent on the top-up ref atomically, and the ledger trigger moves the balance (no UPDATE here).
    expect(sql).toContain('on conflict (ref) do nothing;');
    const body = sql.slice(sql.indexOf('create function public.credit_wallet_gel'), sql.indexOf('revoke execute on function public.credit_wallet_gel'));
    expect(body).not.toMatch(/update\s+public\.profiles/);
  });

  test('takes client writes off the money tables and turns RLS on for music_jobs', () => {
    for (const t of ['profiles', 'credit_ledger', 'wallet_topups']) {
      expect(sql).toMatch(new RegExp(`revoke insert, update, delete, truncate on public\\.${t}\\s+from anon, authenticated;`));
    }
    expect(sql).toContain('alter table public.music_jobs enable row level security;');
  });
});

describe('every migration from the P0 on', () => {
  test.each(guardedMigrations())('%s: no USING/WITH CHECK (true) policy unless it is TO service_role', (file) => {
    const statements = stripSqlComments(read(`${MIGRATIONS}/${file}`)).toLowerCase().split(';');
    for (const st of statements) {
      if (!/create\s+policy/.test(st)) continue;
      if (/(using|with\s+check)\s*\(\s*true\s*\)/.test(st)) expect(st).toMatch(/\bto\s+service_role\b/);
    }
  });

  test.each(guardedMigrations())('%s: every SECURITY DEFINER function has its EXECUTE revoked from public', (file) => {
    const sql = stripSqlComments(read(`${MIGRATIONS}/${file}`)).toLowerCase();
    const defs = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\$\$/g)];
    for (const [, name, head] of defs) {
      if (!/security\s+definer/.test(head ?? '')) continue;
      expect(sql).toMatch(new RegExp(`revoke\\s+(?:all|execute)\\s+on\\s+function\\s+(?:public\\.)?${name}\\b[\\s\\S]*?from\\s+public`));
    }
  });
});

describe('application code never calls a money RPC through a session client', () => {
  const MONEY_RPCS = ['refund_credits', 'credit_wallet_gel', 'deduct_credits', 'consume_free_film',
    'consume_free_avatar_chat', 'restore_free_film', 'restore_free_avatar_chat', 'add_credits'];
  /** The service-role modules allowed to call them. Everything else goes through these helpers. */
  const ALLOWED = new Set(['lib/orchestrator/ledger.ts', 'lib/billing/wallet-ledger.ts', 'lib/admin/users.ts']);

  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
      return /\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) ? [rel] : [];
    });

  const offenders = () => {
    const found: string[] = [];
    for (const f of ['app', 'lib', 'components', 'hooks'].filter((d) => existsSync(join(ROOT, d))).flatMap(walk)) {
      const code = stripTsComments(read(f));
      for (const fn of MONEY_RPCS) {
        if (new RegExp(`\\.rpc\\(\\s*['"\`]${fn}['"\`]`).test(code) && (!ALLOWED.has(f) || fn === 'add_credits')) {
          found.push(`${f} → ${fn}`);
        }
      }
    }
    return found;
  };

  test('only the service-role ledger modules call money RPCs, and nobody calls add_credits', () => {
    expect(offenders()).toEqual([]);
  });

  test('the allowed modules really are service-role: they import createServiceRoleClient or take it from the caller', () => {
    for (const f of ['lib/orchestrator/ledger.ts', 'lib/billing/wallet-ledger.ts']) {
      expect(stripTsComments(read(f))).toMatch(/import\s*\{[^}]*\bcreateServiceRoleClient\b[^}]*\}\s*from\s*['"]@\/lib\/supabase\/server['"]/);
    }
  });

  test('the render drainer refunds through the ledger, not from the row’s claim', () => {
    const code = stripTsComments(read('app/api/cron/drain-renders/route.ts'));
    expect(code).toMatch(/import\s*\{[^}]*\brefundDebitByRef\b[^}]*\}\s*from\s*['"]@\/lib\/orchestrator\/ledger['"]/);
    expect(code).not.toMatch(/\brefundCredits\s*\(/);
  });
});
