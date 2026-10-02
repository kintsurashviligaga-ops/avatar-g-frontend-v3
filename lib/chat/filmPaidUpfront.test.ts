/** @jest-environment node */
/**
 * The up-front payment marker, the poll-snapshot fold and the assemble waiver — the lifecycle that decides whether a paid
 * film is charged once (right) or twice / never (both were possible).
 *
 * ⚠️ TWO BUGS THIS GUARDS. (1) The status poll wrote `putFilmStatus(buildFilmSnapshot(...))` every tick — a bare overwrite that
 * erased `freeFilmWaived` + `payerUid` (so a free film billed the stitch) and the finished `masterUrl` (a late tick hid it).
 * (2) A paid film's waiver must be spent by the FIRST assemble WITHOUT burning the master's re-stitch waiver, or every
 * lip-synced music video (two assembles of one film) would be charged twice.
 */
import {
  buildFilmSnapshot,
  consumeFilmBilling,
  foldFilmSnapshot,
  getFilmPaid,
  getFilmStatus,
  isFilmPaidUpstream,
  putFilmStatus,
  recordFilmMaster,
  recordFilmPaid,
  recordFreeFilmWaiver,
  restoreFilmBilling,
  type FilmPaidRecord,
  type FilmStatusRecord,
} from './filmStatusStore';

const rec = (over: Partial<FilmStatusRecord> = {}): FilmStatusRecord => ({
  tokenId: 'tok', phase: 'rendering', clips: [], audioReady: false, masterUrl: null, updatedAt: 1, error: null, ...over,
});
const paidRec = (over: Partial<FilmPaidRecord> = {}): FilmPaidRecord => ({ tokenId: 'tok', uid: 'u1', credits: 75, ref: 'r', consumed: false, at: 1, ...over });
const snap = (over: Partial<Parameters<typeof buildFilmSnapshot>[0]> = {}) =>
  buildFilmSnapshot({ tokenId: 'tok', clips: [{ ordinal: 1, status: 'queued', url: null }], audioStatus: 'pending', readyToStitch: false, filmStatus: 'processing', ...over });

let n = 0;
const fresh = () => `film-test-${++n}`;

describe('foldFilmSnapshot — a poll tick must not erase who paid or the finished master', () => {
  test('no previous record → the snapshot as it is', () => {
    const s = snap();
    expect(foldFilmSnapshot(null, s)).toEqual(s);
  });

  test('the waiver evidence survives a tick: freeFilmWaived, payerUid, billingConsumed', () => {
    const prev = rec({ freeFilmWaived: true, payerUid: 'u1', billingConsumed: false });
    const out = foldFilmSnapshot(prev, snap());
    expect(out).toMatchObject({ freeFilmWaived: true, payerUid: 'u1', billingConsumed: false });
    expect(isFilmPaidUpstream(out, null, 'u1')).toBe(true); // the free film is still waived at the stitch
  });

  test('the snapshot owns the clip view; the rest is carried over', () => {
    const out = foldFilmSnapshot(rec({ payerUid: 'u1' }), snap({ clips: [{ ordinal: 1, status: 'succeeded', url: 'https://x/1.mp4' }, { ordinal: 2, status: 'queued', url: null }] }));
    expect(out.clips.map((c) => [c.ordinal, c.status, c.hasUrl])).toEqual([[1, 'succeeded', true], [2, 'queued', false]]);
  });

  test('a finished master is never hidden or demoted by a slower tick', () => {
    const prev = rec({ phase: 'assembled', masterUrl: 'https://x/master.mp4', qa: { pass: true, score: 9, grade: 'A', issues: [] } });
    const out = foldFilmSnapshot(prev, snap({ readyToStitch: true }));
    expect(out.masterUrl).toBe('https://x/master.mp4');
    expect(out.phase).toBe('assembled');
    expect(out.qa?.score).toBe(9);
  });

  test('a stitch in flight is not demoted to "ready" by a tick, but a terminal failure still shows', () => {
    const prev = rec({ phase: 'assembling' });
    expect(foldFilmSnapshot(prev, snap({ readyToStitch: true })).phase).toBe('assembling');
    expect(foldFilmSnapshot(prev, snap({ filmStatus: 'failed' })).phase).toBe('failed');
  });
});

describe('isFilmPaidUpstream — the one predicate /assemble uses', () => {
  test('the up-front payment waives for the payer, once', () => {
    expect(isFilmPaidUpstream(null, paidRec(), 'u1')).toBe(true);
    expect(isFilmPaidUpstream(null, paidRec({ consumed: true }), 'u1')).toBe(false);
  });
  test('never for another user or a guest', () => {
    expect(isFilmPaidUpstream(null, paidRec(), 'u2')).toBe(false);
    expect(isFilmPaidUpstream(null, paidRec(), null)).toBe(false);
  });
  test('a zero-credit marker is no payment', () => {
    expect(isFilmPaidUpstream(null, paidRec({ credits: 0 }), 'u1')).toBe(false);
  });
  test('the older waivers behave exactly as before: a master, or a spent free slot, for the payer, once', () => {
    expect(isFilmPaidUpstream(rec({ masterUrl: 'https://x/m.mp4', payerUid: 'u1' }), null, 'u1')).toBe(true);
    expect(isFilmPaidUpstream(rec({ freeFilmWaived: true, payerUid: 'u1' }), null, 'u1')).toBe(true);
    expect(isFilmPaidUpstream(rec({ freeFilmWaived: true, payerUid: 'u1', billingConsumed: true }), null, 'u1')).toBe(false);
    expect(isFilmPaidUpstream(rec({ masterUrl: 'https://x/m.mp4', payerUid: 'u1' }), null, 'u2')).toBe(false);
    expect(isFilmPaidUpstream(null, null, 'u1')).toBe(false);
    expect(isFilmPaidUpstream(rec({ payerUid: 'u1' }), null, 'u1')).toBe(false); // the default is to bill
  });
});

describe('the lifecycle of a PAID film: first stitch, lip-sync re-stitch, then billed again', () => {
  test('the payment is stored under its own key and survives every poll tick', async () => {
    const id = fresh();
    await recordFilmPaid(id, { uid: 'u1', credits: 75, ref: 'ref-1' });
    // ten poll ticks overwrite the status record…
    for (let i = 0; i < 10; i++) await putFilmStatus(foldFilmSnapshot(await getFilmStatus(id), snap({ tokenId: id })));
    // …and the payment is still there, unconsumed.
    expect(await getFilmPaid(id)).toMatchObject({ uid: 'u1', credits: 75, ref: 'ref-1', consumed: false });
  });

  test('assemble #1 spends the PAYMENT waiver and leaves the master waiver for the re-stitch; #3 is billed', async () => {
    const id = fresh();
    await recordFilmPaid(id, { uid: 'u1', credits: 75, ref: 'ref-1' });

    // #1 — waived by the payment; consuming spends the payment only.
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(true);
    await consumeFilmBilling(id);
    expect((await getFilmPaid(id))?.consumed).toBe(true);
    expect((await getFilmStatus(id))?.billingConsumed).not.toBe(true);
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(false); // a replay of #1 is billed

    // the stitch succeeds → the master is stamped
    await recordFilmMaster(id, 'https://x/master.mp4', null, 'u1');

    // #2 — the lip-sync / composite re-stitch of the SAME film is waived once more (as for any paid master)…
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(true);
    await consumeFilmBilling(id);
    // #3 — …and only then is a further assemble billed.
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(false);
  });

  test('a FAILED first stitch hands the payment waiver back, so the retry is not charged twice', async () => {
    const id = fresh();
    await recordFilmPaid(id, { uid: 'u1', credits: 75, ref: 'ref-1' });
    await consumeFilmBilling(id);
    expect((await getFilmPaid(id))?.consumed).toBe(true);
    await restoreFilmBilling(id); // no master was produced
    expect((await getFilmPaid(id))?.consumed).toBe(false);
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(true);
  });

  test('a failed RE-stitch hands back the master waiver — and does NOT re-arm the spent payment', async () => {
    const id = fresh();
    await recordFilmPaid(id, { uid: 'u1', credits: 75, ref: 'ref-1' });
    await consumeFilmBilling(id); // #1 uses the payment
    await recordFilmMaster(id, 'https://x/master.mp4', null, 'u1');
    await consumeFilmBilling(id); // #2 uses the master waiver
    await restoreFilmBilling(id); // #2's stitch failed
    expect((await getFilmStatus(id))?.billingConsumed).toBe(false); // retry of #2 is waived again
    expect((await getFilmPaid(id))?.consumed).toBe(true);           // but the payment is not a second free stitch
  });

  test('the free-film waiver still works through a poll tick and is spent on its own record', async () => {
    const id = fresh();
    await recordFreeFilmWaiver(id, 'u1');
    await putFilmStatus(foldFilmSnapshot(await getFilmStatus(id), snap({ tokenId: id }))); // a tick
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(true);
    await consumeFilmBilling(id);
    expect((await getFilmStatus(id))?.billingConsumed).toBe(true);
    expect(isFilmPaidUpstream(await getFilmStatus(id), await getFilmPaid(id), 'u1')).toBe(false);
  });
});
