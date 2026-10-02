/** @jest-environment node */
/**
 * The single-clip assemble charges under a ref that is unique PER ATTEMPT, and rolls back under `${ref}:refund`.
 *
 * ⚠️ It used to charge `assemble-single:${idemKey}` — a hash of the composition — and roll back under a different
 * fixed ref. deduct_credits answers a replayed ref with success and NO new debit, so:
 *   · after one attempt was charged and refunded (a failed stitch), every retry of the same composition was
 *     "charged" without a debit and rendered free;
 *   · a replay of a successful attempt that then failed paid back the first attempt's legitimate charge.
 * Structural (the handler is ~960 lines of ffmpeg behind a dozen provider imports): what this catches is the ref
 * being keyed on the composition again, or the rollback drifting from the charge.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');

test('the charge ref carries a fresh UUID per attempt', () => {
  expect(src).toMatch(/const scRef = `assemble-single:\$\{idemKey\}:\$\{crypto\.randomUUID\(\)\}`;/);
  expect(src).toMatch(/await deductCredits\(uid, assembleCost, scRef\)/);
  expect(src).not.toMatch(/deductCredits\(uid, assembleCost, `assemble-single:\$\{idemKey\}`\)/);
});

test('every rollback refunds exactly that attempt’s ref, as `${ref}:refund`', () => {
  const rollbacks = src.match(/refundCredits\(uid, assembleCost, `\$\{scRef\}:refund`\)/g) ?? [];
  expect(rollbacks.length).toBe(2); // the "nothing produced" branch and the catch
  expect(src).not.toMatch(/assemble-single-rollback:/);
});
