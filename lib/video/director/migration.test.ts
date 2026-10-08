/** @jest-environment node */
/**
 * supabase/migrations/20261008b_director_runs.sql against what runServer.ts writes: every column the store reads or
 * updates exists, the four run states match run.ts, and the table is service-role only (RLS on, no policy, every client
 * privilege revoked) — the record holds Veo operation names the browser must never see.
 */
import fs from 'fs';
import path from 'path';

const SQL = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261008b_director_runs.sql'), 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const STORE = fs.readFileSync(path.join(process.cwd(), 'lib/video/director/runServer.ts'), 'utf8');
const RUN = fs.readFileSync(path.join(process.cwd(), 'lib/video/director/run.ts'), 'utf8');

describe('20261008b director_runs', () => {
  const table = SQL.slice(SQL.indexOf('CREATE TABLE IF NOT EXISTS public.director_runs'), SQL.indexOf(');'));

  it('has every column the store writes or filters on', () => {
    for (const col of ['id', 'user_id', 'state', 'version', 'record', 'updated_at']) {
      expect(table).toMatch(new RegExp(`\\n\\s+${col}\\s`));
      expect(STORE).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('allows exactly the run states run.ts can write', () => {
    const states = RUN.match(/export type DirectorRunState = ([^;]+);/)?.[1]?.match(/'[^']+'/g) ?? [];
    expect(states).toHaveLength(4);
    for (const s of states) expect(table).toContain(s);
  });

  it('is service-role only', () => {
    expect(SQL).toMatch(/ALTER TABLE public\.director_runs ENABLE ROW LEVEL SECURITY/);
    expect(SQL).toMatch(/REVOKE ALL ON public\.director_runs FROM anon, authenticated/);
    expect(SQL).not.toMatch(/CREATE POLICY/i);
    expect(SQL).not.toMatch(/GRANT\s/i);
  });
});
