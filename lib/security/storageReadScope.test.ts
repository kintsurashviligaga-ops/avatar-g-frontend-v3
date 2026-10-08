/** @jest-environment node */
/**
 * Guards for the 2026-10-08 P0: Production's `storage.objects` had a SELECT policy for role `public` with
 * `USING (true)` ("Public read music 1q2q05_0", made in the dashboard), so the public anon key could list and download
 * every object in every bucket, `uploads` included. Migration 20261008d narrows it to the `music` bucket.
 * Source-shape guards: comments are stripped first, so a comment quoting the bad pattern neither trips nor satisfies them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const FIX = '20261008d_storage_read_scope.sql';

const stripSqlComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const sqlOf = (file: string) => stripSqlComments(readFileSync(join(MIGRATIONS, file), 'utf8')).toLowerCase();

describe('20261008d: the open storage read policy', () => {
  const sql = sqlOf(FIX);

  test('narrows the dashboard policy to the music bucket, only where it exists', () => {
    expect(sql).toMatch(/if exists \(select 1 from pg_policies[\s\S]*?policyname = 'public read music 1q2q05_0'\)/);
    expect(sql).toMatch(/alter policy "public read music 1q2q05_0" on storage\.objects using \(bucket_id = 'music'\);/);
  });

  test('refuses to finish while any SELECT policy anon or authenticated can use is still USING (true)', () => {
    expect(sql).toMatch(/cmd in \('select', 'all'\)/);
    expect(sql).toMatch(/roles && array\['public', 'anon', 'authenticated'\]::name\[\]/);
    expect(sql).toMatch(/raise exception '20261008d: storage\.objects policy % still lets anyone read every bucket'/);
  });
});

describe('every migration', () => {
  test('never grants a storage.objects SELECT (or ALL) policy that is USING (true)', () => {
    const offenders = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => {
        const policies = sqlOf(f).match(/create policy[\s\S]*?;/g) ?? [];
        return policies.some(
          (p) => /on storage\.objects/.test(p) && /for (select|all)/.test(p) && /using\s*\(\s*true\s*\)/.test(p),
        );
      });
    expect(offenders).toEqual([]);
  });
});
