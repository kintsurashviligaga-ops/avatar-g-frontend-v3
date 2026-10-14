/** @jest-environment node */
/**
 * Structural guard for /api/video/assemble's billing (the handler is ~1,000 lines of ffmpeg behind a dozen provider imports):
 * there is NO flat stitch price any more, and the route honours the up-front payment through the one shared predicate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

test('no flat 20-credit stitch price survives', () => {
  expect(code).not.toMatch(/ASSEMBLE_COST/);
  expect(code).not.toMatch(/=\s*20;\s*\/\/ credits/);
});

test('the fallback stitch is the film quote for the seconds actually handed over', () => {
  expect(code).toMatch(/const assembleCost = videoCredits\(\{\s*seconds: filmSecondsFromClips\(segments\.map/);
});

test('"already paid" is decided by the shared predicate over the status record AND the payment record', () => {
  expect(code).toMatch(/Promise\.all\(\[getFilmStatus\(billedTokenForCheck\), getFilmPaid\(billedTokenForCheck\)\]\)/);
  // …and the DURABLE waiver (database / ledger) is consulted first, handed to the predicate, and handed back on a failed stitch.
  expect(code).toMatch(/const durable = await consumeFilmWaiver\(billedTokenForCheck, uid\)/);
  expect(code).toMatch(/filmAlreadyBilled = isFilmPaidUpstream\(prior, paid, uid, durable\)/);
  expect((code.match(/restoreFilmWaiver\(billedTokenForCheck, uid\)/g) ?? []).length).toBe(2);
});

test('the waiver is spent only by the request that won the duplicate claim (a 409 loser must not hold it)', () => {
  const claim = code.indexOf("claimIdempotencyKey(idemOwner, `assemble:${idemKey}`, 60)");
  const conflict = code.indexOf("error: 'duplicate_request'");
  expect(claim).toBeGreaterThan(0);
  expect(conflict).toBeGreaterThan(claim);
  expect(code.indexOf('await consumeFilmWaiver(')).toBeGreaterThan(conflict);
  expect(code.indexOf('await consumeFilmBilling(')).toBeGreaterThan(conflict);
});

test("a film token whose status names another payer is refused before any claim, charge or stamp", () => {
  const guard = code.indexOf('isFilmOwnedByAnother(');
  expect(guard).toBeGreaterThan(0);
  expect(guard).toBeLessThan(code.indexOf("claimIdempotencyKey(idemOwner, `assemble:${idemKey}`, 60)"));
  expect(code).toMatch(/error: 'film_not_owned'[^]*status: 403/);
});

test('a twin arriving after the 60 s claim, while the first stitch still runs, is refused rather than billed', () => {
  const inFlight = code.indexOf("durable === 'spent' && filmTokenId && isStitchInFlight(prior)");
  expect(inFlight).toBeGreaterThan(code.indexOf('await consumeFilmWaiver('));
  expect(inFlight).toBeLessThan(code.indexOf('await consumeFilmBilling('));
});

test('every charge and refund in the route uses that one amount', () => {
  const uses = code.match(/assembleCost/g) ?? [];
  expect(uses.length).toBeGreaterThanOrEqual(7);
  expect(code).not.toMatch(/deductCredits\(uid, \d+,/);
});
