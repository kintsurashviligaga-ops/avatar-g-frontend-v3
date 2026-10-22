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
import { SoundtrackUnreadable, describeSoundtrackRefusal, isSoundtrackUnreadable } from './soundtrackUnreadable';

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
          if (isSoundtrackUnreadable(err)) ctx.bag.soundtrackUnreadable = err.lane;
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
  test('unverified contracted audio with exact picture frames cannot commit and compensates once', async () => {
    const log: string[] = [];
    const bag: Record<string, unknown> = {};
    const qa = validateMaster({
      sizeBytes: 6_000_000, expectedDurSec: 24, actualDurSec: 24, audioExpected: true, audioPresent: null,
      width: 1920, height: 1080, expectedFrames: 720, actualFrames: 720,
    });
    const saga = await runSaga(steps(async () => {
      if (!qa.pass) throw new MasterQaRejected(qa);
      return { url: 'https://r/master.mp4', qa };
    }, log), { sagaId: 'audio_probe_unavailable', bag });
    expect(saga.ok).toBe(false);
    expect(saga.failedStep).toBe('dispatch');
    expect(log).toEqual(['debit', 'refund:audio_probe_unavailable']);
    expect(bag.qcRejected).toEqual(['audio_stream_unverified']);
    expect(bag.tempUrl).toBeUndefined();
  });

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

  test('an unreadable soundtrack (round 3 P1) fails dispatch BEFORE any encode: one compensation, the lane on the bag, no QC report', async () => {
    const log: string[] = [];
    const bag: Record<string, unknown> = {};
    const saga = await runSaga(steps(async () => { throw new SoundtrackUnreadable('music'); }, log), { bag });
    expect(saga.ok).toBe(false);
    expect(log).toEqual(['debit', expect.stringMatching(/^refund:/)]);
    expect(bag.soundtrackUnreadable).toBe('music');
    expect(bag.qcRejected).toBeUndefined();
    expect(isSoundtrackUnreadable({ code: 'music_unreadable', lane: 'voice' })).toBe(true);
    expect(isSoundtrackUnreadable(new Error('Command failed: ffmpeg …'))).toBe(false);
    expect(new SoundtrackUnreadable('sfx').message).toMatch(/^sound-effects lane: music_unreadable — /);
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

  test('every audio lane is probed for an audio stream after the download and before the encode is built (round 3 P1)', () => {
    const probe = assembler.indexOf("for (const [lane, file] of [['music', music], ['voice', voice], ['sfx', sfx]] as const) {");
    const throwAt = assembler.indexOf('if (file && !(await probeHasAudio(bin, file))) throw new SoundtrackUnreadable(lane);');
    const graph = assembler.indexOf('const g = m.globalRender ?? {};');
    expect(probe).toBeGreaterThan(0);
    expect(throwAt).toBeGreaterThan(probe);
    expect(graph).toBeGreaterThan(throwAt);
    expect(route).toMatch(/if \(isSoundtrackUnreadable\(err\)\) ctx\.bag\.soundtrackUnreadable = err\.lane;/);
    const fail = route.indexOf('if (!saga.ok) {');
    const bad = route.indexOf("error: 'music_unreadable', reason: 'music_unreadable', lane: badLane");
    const qc = route.indexOf("error: 'qc_rejected', reason: 'qc_rejected', codes: qcRejected, qa: qcReport");
    expect(bad).toBeGreaterThan(fail);
    expect(qc).toBeGreaterThan(bad);
    expect(route).toMatch(/await recordFilmFailed\(filmTokenId, `music_unreadable: \$\{badLane\}`\);/);
    expect(route).toMatch(/\{ status: 422 \},/);
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

  test('a failed single clip hands back the waiver of a film paid upstream, as the multi-clip saga does', () => {
    const catchAt = route.indexOf('} catch (err) {', route.indexOf('const scRef = `assemble-single:'));
    // settleWaiver(false) hands back a durable lease (settle_film_waiver) or, on the cache path, calls restoreFilmBilling.
    const restore = route.indexOf('await settleWaiver(false);', catchAt);
    const gate = route.indexOf('if (isFinalCutRejected(err)) {', catchAt);
    expect(catchAt).toBeGreaterThan(0);
    expect(restore).toBeGreaterThan(catchAt);
    expect(restore).toBeLessThan(gate); // before every answer of the catch
    // the saga's compensate still does the same for the multi-clip path
    expect(route).toMatch(/compensate: async \(_r, ctx\) => \{[\s\S]{0,900}?await settleWaiver\(false\);\s*if \(skipBilling \|\| uid === null\) return;/);
  });

  test('a film paid upstream is never told "not charged": the failure messages say no EXTRA charge was made', () => {
    expect(route).toMatch(/Nothing was delivered and \$\{attemptChargeNote\(filmAlreadyBilled\)\} — please try again\./);
    expect(route).not.toMatch(/Nothing was delivered and this attempt was not charged/);
    expect(route).toMatch(/describeSoundtrackRefusal\(badLane, filmAlreadyBilled\)/);
    expect(describeSoundtrackRefusal('music')).toMatch(/this attempt was not charged/);
    expect(describeSoundtrackRefusal('music', true)).toMatch(/no extra charge was made for this attempt/);
    expect(describeSoundtrackRefusal('music', true)).not.toMatch(/was not charged/);
  });

  test('every clip and audio link must be an http(s) URL, refused before any probe, charge or status write', () => {
    const check = route.indexOf("error: 'invalid_media_url'");
    expect(check).toBeGreaterThan(0);
    for (const later of ['await keepLiveClips(handedOver)', 'await lockTokens(uid, assembleCost, 900)', 'await recordFilmAssembling(filmTokenId)', 'await probeDimensions(clipUrl)']) {
      expect(route.indexOf(later)).toBeGreaterThan(check);
    }
    expect(route).toMatch(/body\.customAudioUrl, body\.musicUrl, body\.voiceoverUrl, body\.sfxUrl,\s*\.\.\.\(Array\.isArray\(body\.dialogueStems\) \? body\.dialogueStems\.map\(\(s\) => s\?\.url\) : \[\]\),\s*\];\s*if \(links\.some\(\(v\) => typeof v === 'string' && v\.length > 0 && !isWebLink\(v\)\)\)/);
    expect(route).toMatch(/return u\.protocol === 'https:' \|\| u\.protocol === 'http:';/);
  });
});
