/** @jest-environment node */
/**
 * Video Core v1.0 §7/§8 — a master that fails a CRITICAL quality check is REJECTED by /api/video/assemble, not delivered
 * with a grade. Two layers, both pinned here:
 *
 *   1. The saga flow, on the real runner (lib/orchestrator/saga): the dispatch step throws MasterQaRejected the way the
 *      route does (keeping the report on the bag), so `commit` never runs, `reserve-credits` is compensated EXACTLY once
 *      (the attempt's single refund), and the result says which step failed. A retry is a new saga with its own
 *      compensation — the refund ref is per sagaId, so a replay cannot refund twice.
 *   2. The route's source (the handler is ~1,000 lines behind a dozen provider imports; a source pin is the honest
 *      level, T2): the dispatch step keeps the rejected report, the failure branch answers `qc_rejected` and records the
 *      film as FAILED, and no success path (recordFilmMaster, recordCompletedFilm, the 200 response) is reachable
 *      from it — they all sit after the `!saga.ok` return.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSaga, type SagaStep } from './saga';
import { validateMaster, MasterQaRejected, isMasterQaRejected, type QaReport } from './masterQa';

const rejected: QaReport = validateMaster({
  sizeBytes: 6_000_000, expectedDurSec: 29.7, actualDurSec: 29.7, audioExpected: true, audioPresent: true, width: 1920, height: 1080,
  expectedFrames: 891, actualFrames: 890,
});

/** The route's three steps, with the side effects counted instead of performed. */
function steps(assemble: () => Promise<{ url: string; qa: QaReport }>, log: string[]): SagaStep[] {
  return [
    {
      name: 'reserve-credits',
      run: async (ctx) => { log.push('debit'); ctx.bag.debited = true; return 'lock'; },
      compensate: async (_r, ctx) => { log.push(`refund:${ctx.sagaId}`); },
    },
    {
      name: 'dispatch',
      run: async (ctx) => {
        let res: { url: string; qa: QaReport };
        try {
          res = await assemble();
        } catch (err) {
          if (isMasterQaRejected(err)) { ctx.bag.qa = err.qa; ctx.bag.qcRejected = err.issueCodes; }
          throw err;
        }
        ctx.bag.tempUrl = res.url;
        ctx.bag.qa = res.qa;
        return res.url;
      },
      compensate: async () => { log.push('purge'); },
    },
    { name: 'commit', run: async () => { log.push('commit'); return null; } },
  ];
}

describe('the saga on a rejected master (real runner)', () => {
  test('890 of 891 frames → dispatch fails, commit never runs, the reservation is refunded exactly once, the report is kept', async () => {
    const log: string[] = [];
    const bag: Record<string, unknown> = {};
    const saga = await runSaga(steps(async () => { throw new MasterQaRejected(rejected); }, log), { sagaId: 'saga_t1', bag });
    expect(saga.ok).toBe(false);
    expect(saga.failedStep).toBe('dispatch');
    expect(saga.error).toMatch(/master rejected by QC .* frame_count_mismatch: master holds 890 frames, the contracted final is 891 \(-1\)/);
    expect(saga.completedSteps).toEqual(['reserve-credits']);
    expect(saga.compensatedSteps).toEqual(['reserve-credits']);
    expect(log).toEqual(['debit', 'refund:saga_t1']);
    expect(log.filter((l) => l.startsWith('refund:'))).toHaveLength(1);
    expect(log).not.toContain('commit');
    expect(bag.tempUrl).toBeUndefined(); // nothing to deliver
    expect(bag.qcRejected).toEqual(['frame_count_mismatch']);
    expect((bag.qa as QaReport).pass).toBe(false);
  });

  test('a retry is a new attempt: its own debit, its own single refund — the first refund is never repeated', async () => {
    const log: string[] = [];
    await runSaga(steps(async () => { throw new MasterQaRejected(rejected); }, log), { sagaId: 'saga_a' });
    await runSaga(steps(async () => { throw new MasterQaRejected(rejected); }, log), { sagaId: 'saga_b' });
    expect(log).toEqual(['debit', 'refund:saga_a', 'debit', 'refund:saga_b']);
  });

  test('a passing master commits: no refund, the URL and the report on the bag', async () => {
    const log: string[] = [];
    const bag: Record<string, unknown> = {};
    const ok = validateMaster({ sizeBytes: 6_000_000, expectedDurSec: 29.7, actualDurSec: 29.7, audioExpected: true, audioPresent: true, width: 1920, height: 1080, expectedFrames: 891, actualFrames: 891 });
    const saga = await runSaga(steps(async () => ({ url: 'https://r/master.mp4', qa: ok }), log), { bag });
    expect(saga.ok).toBe(true);
    expect(log).toEqual(['debit', 'commit']);
    expect(bag.tempUrl).toBe('https://r/master.mp4');
    expect(bag.qcRejected).toBeUndefined();
  });

  test('any other dispatch failure still compensates once, with no QC report attached', async () => {
    const log: string[] = [];
    const bag: Record<string, unknown> = {};
    const saga = await runSaga(steps(async () => { throw new Error('dispatch stalled — aborted after 270000ms'); }, log), { bag });
    expect(saga.ok).toBe(false);
    expect(log).toEqual(['debit', expect.stringMatching(/^refund:/)]);
    expect(bag.qcRejected).toBeUndefined();
  });
});

describe('the route and the assembler, on the source (T2)', () => {
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const route = code(readFileSync(join(process.cwd(), 'app/api/video/assemble/route.ts'), 'utf8'));
  const assembler = code(readFileSync(join(process.cwd(), 'lib/orchestrator/ffmpeg-assembly.ts'), 'utf8'));
  const finalCut = code(readFileSync(join(process.cwd(), 'lib/video/finalCut.ts'), 'utf8'));

  test('the assembler throws MasterQaRejected on a failed gate BEFORE the master is hosted', () => {
    const gate = assembler.indexOf('throw new MasterQaRejected(qa);');
    const host = assembler.indexOf("const url = await uploadBufferAndSign(RENDER_BUCKET, objectPath, data, 'video/mp4', 604_800);");
    expect(gate).toBeGreaterThan(0);
    expect(host).toBeGreaterThan(gate);
    expect(assembler).toMatch(/if \(!qa\.pass\) \{[\s\S]{0,400}throw new MasterQaRejected\(qa\);/);
  });

  test('the single-clip cut counts its own frames before hosting and throws on a mismatch', () => {
    const count = finalCut.indexOf('const actualFrames = await countDecodedFrames(bin, out).catch(() => null);');
    const host = finalCut.indexOf('const url = await uploadBufferAndSign(RENDER_BUCKET, path, buf');
    expect(count).toBeGreaterThan(0);
    expect(host).toBeGreaterThan(count);
    // Round 3 (P0): a count that could not be read throws as well — `null` is not a pass.
    expect(finalCut).toMatch(/if \(actualFrames === null \|\| actualFrames !== expectedFrames\) \{\s*throw new FinalCutRejected\(actualFrames, expectedFrames\);/);
    expect(finalCut).not.toMatch(/delivering unverified/);
    expect(finalCut).toMatch(/`final cut: frame_count_unverified — the cut's frames could not be counted, the contracted final is \$\{expectedFrames\}/);
    expect(finalCut).toMatch(/`final cut: frame_count_mismatch — the cut holds \$\{actualFrames\} frames, the contracted final is \$\{expectedFrames\}/);
  });

  test('the single-clip path answers the same qc_rejected after rolling the reservation back, before the assemble_failed fallback', () => {
    const refund = route.indexOf("else if (scDebited) await refundCredits(uid, assembleCost, `${scRef}:refund`).catch(() => {});");
    const release = route.indexOf('await releaseIdempotencyKey(idemOwner, `assemble:${idemKey}`).catch(() => {});', refund);
    const gate = route.indexOf('if (isFinalCutRejected(err)) {', release);
    const fallback = route.indexOf("return NextResponse.json({ error: 'assemble_failed'", gate);
    expect(refund).toBeGreaterThan(0);
    expect(release).toBeGreaterThan(refund);
    expect(gate).toBeGreaterThan(release);
    expect(fallback).toBeGreaterThan(gate);
    expect(route.slice(gate, fallback)).toMatch(/recordFilmFailed\(filmTokenId, `qc_rejected: \$\{err\.issueCodes\.join\(','\)\}`\)/);
    expect(route.slice(gate, fallback)).toMatch(/error: 'qc_rejected', reason: 'qc_rejected', codes: \[\.\.\.err\.issueCodes\], qa: null, single: true/);
    expect(route.slice(gate, fallback)).toMatch(/\{ status: 502 \}/);
  });

  test('the dispatch step keeps the rejected report on the bag and rethrows', () => {
    expect(route).toMatch(/if \(isMasterQaRejected\(err\)\) \{\s*ctx\.bag\.qa = err\.qa;\s*ctx\.bag\.qcRejected = err\.issueCodes;\s*\}\s*throw err;/);
  });

  test("the failure branch answers qc_rejected, records the film as FAILED, and sits before every success path", () => {
    const fail = route.indexOf('if (!saga.ok) {');
    const qc = route.indexOf("error: 'qc_rejected', reason: 'qc_rejected', codes: qcRejected, qa: qcReport");
    const recordFailed = route.indexOf('await recordFilmFailed(filmTokenId, `qc_rejected: ${qcRejected.join(\',\')}`);');
    const master = route.indexOf('if (filmTokenId && resultUrl) await recordFilmMaster(filmTokenId, resultUrl, qaSummary, uid);');
    const library = route.indexOf('await recordCompletedFilm({');
    const ok200 = route.indexOf('return NextResponse.json({ url: resultUrl, qa,');
    expect(fail).toBeGreaterThan(0);
    expect(qc).toBeGreaterThan(fail);
    expect(recordFailed).toBeGreaterThan(fail);
    expect(recordFailed).toBeLessThan(qc);
    for (const success of [master, library, ok200]) expect(success).toBeGreaterThan(qc);
    expect(route).toMatch(/\{ status: 502 \},\s*\);\s*\}\s*\n\s*if \(filmTokenId\) await recordFilmFailed\(filmTokenId, sagaErr \|\| 'assembly failed'\);/);
  });

  test('the idempotency claim is released on every saga failure (a rejected attempt can be retried at once)', () => {
    expect(route).toMatch(/if \(!saga\.ok\) \{\s*await releaseIdempotencyKey\(idemOwner, `assemble:\$\{idemKey\}`\);/);
  });
});
