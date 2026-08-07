/** @jest-environment node */
/**
 * A payout decision must be auditable, single-valued, and never reported as done when it isn't.
 *
 * ⚠️ ALL THREE FAILED AT ONCE, ON A TABLE THAT DOES NOT EXIST. `payout_requests` is read and written by
 * five routes and has never been created — so every one of them has been failing since it was written.
 * The admin approve route did `const { data: updated } = await supabase...`, dropping `error` on the
 * floor, and then returned 200. For a payout that is the worst possible lie: the money decision is
 * reported as made while nothing was recorded anywhere.
 *
 * The update was also unconditional on status, so a double-click or a reject-then-approve race silently
 * overwrote the earlier decision, and nothing recorded WHO decided.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routes = ['approve', 'reject'] as const;
const src = (n: string) => readFileSync(join(__dirname, n, 'route.ts'), 'utf8');
const migration = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'supabase/migrations/20260807a_payout_requests.sql'), 'utf8');

describe.each(routes)('payout %s', (n) => {
  it('surfaces a failed update instead of returning 200', () => {
    expect(src(n)).toMatch(/const \{ data: updated, error: updateError \}/);
    expect(src(n)).toMatch(/if \(updateError\)/);
  });

  it('only acts on a PENDING request, so a replay changes nothing', () => {
    expect(src(n)).toContain(".eq('status', 'pending')");
    // maybeSingle, not single: the guarded update legitimately matches no row on the second call.
    expect(src(n)).toContain('.maybeSingle()');
  });

  it('answers 409 rather than pretending, when nothing was pending', () => {
    expect(src(n)).toMatch(/status: 409/);
  });

  it('records who decided and when', () => {
    // Spelled out rather than derived: `${n}d_by` gives "rejectd_by" and would have failed the code for
    // the test's own grammar.
    const col = n === 'approve' ? 'approved' : 'rejected';
    const s = src(n);
    expect(s).toContain(`${col}_by: user.id`);
    expect(s).toContain(`${col}_at: new Date().toISOString()`);
  });
});

describe('the payout_requests migration', () => {
  it('is service-role only — these rows are money owed to people', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(/REVOKE ALL ON public\.payout_requests FROM anon, authenticated/);
  });

  it('allows one open request per affiliate', () => {
    // Without this an affiliate queues five pending rows for one balance and each is approved separately.
    expect(migration).toContain('payout_requests_one_open_idx');
    expect(migration).toMatch(/WHERE status = 'pending'/);
  });

  it('refuses to store a decision with no author', () => {
    expect(migration).toContain('payout_decision_has_author');
  });

  it('keeps money in integer cents', () => {
    // 0.1 + 0.2 is not 0.3, and this is somebody's payout.
    expect(migration).toMatch(/amount_cents\s+integer NOT NULL CHECK \(amount_cents > 0\)/);
    expect(migration).not.toMatch(/amount\s+(float|real|double)/i);
  });

  it('verifies itself when applied', () => {
    expect(migration).toContain('VERIFY OK');
  });
});
