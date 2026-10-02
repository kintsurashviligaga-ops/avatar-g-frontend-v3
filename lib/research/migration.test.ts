/** @jest-environment node */
/**
 * Guards for supabase/migrations/20261003b_research_jobs.sql. The migration is applied by the owner, later, by hand — so
 * the code must not drift from it silently: a column the store writes that the table lacks would 4xx every start in
 * production. These read the SQL as text (comments stripped first — a comment quoting a bad pattern must not satisfy or trip
 * a guard) and compare it with what the code actually writes. lib/security/dbExposure.test.ts additionally runs over this
 * file automatically (no USING (true) policy; every SECURITY DEFINER function revoked from public).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESEARCH_CONTEXT_MAX_CHARS, RESEARCH_FILE_MAX_CHARS, RESEARCH_PROMPT_MAX_CHARS } from './context';
import { MAX_REPORT_CHARS } from './service';
import { createSupabaseResearchStore } from './store';
import { FakeDb } from './testing/fakeDb';
import { ACTIVE_RESEARCH_STATUSES, TERMINAL_RESEARCH_STATUSES } from './types';

jest.mock('server-only', () => ({}));

const FILE = '20261003b_research_jobs.sql';
const raw = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', FILE), 'utf8');
const sql = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').toLowerCase();

function columnsOf(table: string): string[] {
  const start = sql.indexOf(`create table if not exists public.${table} (`);
  expect(start).toBeGreaterThan(-1);
  const body = sql.slice(start, sql.indexOf('\n);', start));
  return [...body.matchAll(/^ {2}([a-z_]+)\s+(?:uuid|text|integer|boolean|jsonb|timestamptz)\b/gm)].map((m) => m[1]!);
}

describe('research_jobs matches what the store writes', () => {
  test('every column the store inserts exists in the table, and the table has no column the store never sets', async () => {
    const db = new FakeDb();
    await createSupabaseResearchStore(db as never).insert(
      { id: 'a', user_id: 'u', client_request_id: null, prompt: 'p', locale: 'en', context_files: [], context_chars: 0, agent: 'x', charge_credits: 120, charge_ref: 'research:a', deadline_at: new Date(0).toISOString() },
      new Date(0).toISOString(),
    );
    const written = Object.keys((db.ops.find((o) => o.op === 'insert')!.payload ?? {}) as Record<string, unknown>).sort();
    expect(columnsOf('research_jobs').sort()).toEqual(written);
  });

  test('the status check is exactly the statuses the code knows', () => {
    const m = /status\s+text not null default 'reserving'\s+check \(status in \(([^)]*)\)\)/.exec(sql);
    expect(m).not.toBeNull();
    const inSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(inSql).toEqual([...ACTIVE_RESEARCH_STATUSES, ...TERMINAL_RESEARCH_STATUSES].sort());
    expect(sql).toMatch(/refund_state\s+text check \(refund_state in \('pending', 'done', 'nothing_to_refund'\)\)/);
    expect(sql).toMatch(/locale\s+text not null default 'ka' check \(locale in \('ka', 'en', 'ru'\)\)/);
  });

  test('the table\'s bounds are never TIGHTER than the application\'s (a bounded value must always fit)', () => {
    expect(sql).toMatch(/prompt\s+text not null check \(char_length\(prompt\) between 1 and 4000\)/);
    expect(RESEARCH_PROMPT_MAX_CHARS).toBeLessThanOrEqual(4000);
    const ctx = /context_chars\s+integer not null default 0 check \(context_chars between 0 and (\d+)\)/.exec(sql);
    expect(Number(ctx![1])).toBeGreaterThanOrEqual(RESEARCH_CONTEXT_MAX_CHARS);
    const rep = /report_md\s+text check \(report_md is null or char_length\(report_md\) <= (\d+)\)/.exec(sql);
    expect(Number(rep![1])).toBeGreaterThan(MAX_REPORT_CHARS + 200);
    const file = /text_content\s+text not null check \(char_length\(text_content\) between 1 and (\d+)\)/.exec(sql);
    expect(Number(file![1])).toBeGreaterThanOrEqual(RESEARCH_FILE_MAX_CHARS);
  });
});

describe('who may touch it', () => {
  test('RLS is on for both tables; the owner may SELECT their own rows; there is no policy that writes', () => {
    for (const t of ['research_jobs', 'research_context_files']) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toMatch(new RegExp(`create policy ${t}_owner_select on public\\.${t}\\s+for select to authenticated using \\(auth\\.uid\\(\\) = user_id\\);`));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from anon;`));
      expect(sql).toMatch(new RegExp(`revoke insert, update, delete, truncate on public\\.${t} from authenticated;`));
    }
    const policies = sql.match(/create policy [a-z_]+ on public\.[a-z_]+\s+for (\w+)/g) ?? [];
    expect(policies.every((p) => p.endsWith('for select'))).toBe(true);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
  });

  test('it creates no SECURITY DEFINER function, and the trigger function is revoked from the client roles', () => {
    expect(sql).not.toMatch(/security\s+definer/);
    expect(sql).toContain('revoke all on function public.research_touch_updated_at() from public, anon, authenticated;');
  });

  test('money integrity is in the table: a unique ledger ref, an idempotency index, refund ≤ charge, a completed job has its report', () => {
    expect(sql).toMatch(/charge_ref\s+text not null unique/);
    expect(sql).toMatch(/create unique index if not exists research_jobs_user_request_uniq\s+on public\.research_jobs \(user_id, client_request_id\) where client_request_id is not null;/);
    expect(sql).toContain('check (refunded_credits <= charge_credits)');
    expect(sql).toContain("check (status <> 'completed' or report_md is not null)");
    expect(sql).toMatch(/provider_interaction_id\s+text unique/);
  });

  test('additive and re-runnable, and it ends with a VERIFY block inside one transaction', () => {
    expect(sql.trim().startsWith('begin;')).toBe(true);
    expect(sql.trim().endsWith('commit;')).toBe(true);
    expect(sql).toMatch(/do \$\$[\s\S]*verify failed[\s\S]*verify ok[\s\S]*\$\$;/);
    expect(sql).not.toMatch(/\bdrop table\b|\balter table public\.(profiles|credit_ledger|notifications)\b|\bdelete from\b|\btruncate table\b/);
    for (const stmt of sql.match(/create (?:unique )?index [^;]+;/g) ?? []) expect(stmt).toContain('if not exists');
    for (const stmt of sql.match(/create table [^(]+\(/g) ?? []) expect(stmt).toContain('if not exists');
  });
});
