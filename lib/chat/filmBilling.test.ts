/** @jest-environment node */
/**
 * Video Core v1.0 final hardening, Phase 1 — the one billing decision /api/video/assemble takes for a film
 * (lib/chat/filmBilling.ts decideFilmWaiver), driven with every store it reads stubbed, plus the film start's duplicate key.
 *
 * The rule under test: a film's payment is the LEDGER's word (its debit under `filmpay:<token>`), its remaining stitches are
 * the durable table's, and Redis is only a cache. Whatever cannot be established STOPS — nothing is charged, nothing is
 * rendered — and a film the ledger says is paid is never billed again on a cache's silence (defect 44).
 * The same paths on a real Postgres + PostgREST: lib/chat/filmBilling.pg.test.ts.
 */
jest.mock('server-only', () => ({}));
// Every store is injected below; the real ledger and status store are never reached from this file.
jest.mock('../orchestrator/ledger', () => ({ netDebitedForRef: jest.fn(async () => null) }));
jest.mock('./filmStatusStore', () => ({}));

import {
  decideFilmWaiver, filmChargeRef, filmStartKey, FILM_START_WINDOW_SEC, FILM_WAIVER_LEASE_SEC,
  type CacheWaiver, type FilmWaiverDeps, type LeaseAnswer,
} from './filmBilling';

const TOKEN = 'f0123456789abcdef';
const LEASE = 'lease-1';

function deps(over: Partial<{ lease: LeaseAnswer[]; record: 'recorded' | 'exists' | 'unavailable'; held: number | null; cache: CacheWaiver | Error }> = {}) {
  const leases = [...(over.lease ?? [{ state: 'none' as const }])];
  const d = {
    lease: jest.fn(async () => (leases.length > 1 ? leases.shift()! : leases[0]!)),
    record: jest.fn(async () => over.record ?? 'recorded'),
    held: jest.fn(async () => (over.held === undefined ? 0 : over.held)),
    cache: jest.fn(async () => {
      if (over.cache instanceof Error) throw over.cache;
      return over.cache ?? 'none';
    }),
  };
  return d as typeof d & FilmWaiverDeps;
}

describe('the durable table answers first', () => {
  test('a free waiver → waive on the durable lease; the ledger and the cache are not even asked', async () => {
    const d = deps({ lease: [{ state: 'leased', kind: 'paid' }] });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'waive', via: 'durable', leaseId: LEASE, kind: 'paid' });
    expect(d.held).not.toHaveBeenCalled();
    expect(d.cache).not.toHaveBeenCalled();
  });

  test('another stitch of this film holds the waiver → busy (the route answers 409, nothing charged)', async () => {
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, deps({ lease: [{ state: 'busy' }] }))).toEqual({ action: 'busy' });
  });

  test('every stitch the payment covers was delivered → bill this one as before', async () => {
    const d = deps({ lease: [{ state: 'spent' }] });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'bill' });
    expect(d.cache).not.toHaveBeenCalled();
  });
});

describe('no durable row: the ledger says whether this user paid for this film', () => {
  test('paid, row lost at start → the row is written from the LEDGER’s numbers and leased (self-heal)', async () => {
    const d = deps({ lease: [{ state: 'none' }, { state: 'leased', kind: 'paid' }], held: 75 });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'waive', via: 'durable', leaseId: LEASE, kind: 'paid' });
    expect(d.held).toHaveBeenCalledWith('u1', filmChargeRef(TOKEN));
    expect(d.record).toHaveBeenCalledWith({ uid: 'u1', tokenId: TOKEN, kind: 'paid', credits: 75, ref: 'filmpay:f0123456789abcdef' });
    expect(d.cache).not.toHaveBeenCalled();
  });

  test('a partly refunded film (one dead scene handed back at dispatch) is still a paid film: its net is what is recorded', async () => {
    const d = deps({ lease: [{ state: 'none' }, { state: 'leased', kind: 'paid' }], held: 50 });
    expect((await decideFilmWaiver('u1', TOKEN, LEASE, d)).action).toBe('waive');
    expect(d.record).toHaveBeenCalledWith(expect.objectContaining({ credits: 50 }));
  });

  test('the ledger cannot be read → STOP (ledger_unreadable): never bill, never render on a guess', async () => {
    const d = deps({ held: null, cache: 'none' });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'stop', reason: 'ledger_unreadable' });
    expect(d.cache).not.toHaveBeenCalled();
  });

  test('a token that is not a film token is never looked up in the ledger', async () => {
    const d = deps();
    expect(await decideFilmWaiver('u1', 'not-a-token', LEASE, d)).toEqual({ action: 'bill' });
    expect(d.held).not.toHaveBeenCalled();
  });
});

describe('no durable record at all (database without 20261014a): Redis is a cache, never the payment’s only witness', () => {
  const noTable: LeaseAnswer[] = [{ state: 'unavailable' }];

  test('DEFECT 44 — paid film, Redis down / expired / another instance (cache silent) → STOP, not a second charge', async () => {
    const d = deps({ lease: noTable, held: 75, record: 'unavailable', cache: 'none' });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'stop', reason: 'waiver_unknown' });
  });

  test('Redis timing out mid-call (the cache throws) → the same safe stop', async () => {
    const d = deps({ lease: noTable, held: 75, record: 'unavailable', cache: new Error('ETIMEDOUT') });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'stop', reason: 'waiver_unknown' });
  });

  test('paid film, the cache still holds its waiver → waive on the cache (spent there, handed back on failure)', async () => {
    const d = deps({ lease: noTable, held: 75, record: 'unavailable', cache: 'waived' });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'waive', via: 'cache' });
  });

  test('paid film whose two stitches the cache PROVES were delivered → bill the third', async () => {
    const d = deps({ lease: noTable, held: 75, record: 'unavailable', cache: 'spent' });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'bill' });
  });

  test('an unpaid film (no debit under its ref) and no cache waiver → bill, exactly as before this change', async () => {
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, deps({ lease: noTable, held: 0 }))).toEqual({ action: 'bill' });
  });

  test('a free film the cache waived → waive', async () => {
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, deps({ lease: noTable, held: 0, cache: 'waived' }))).toEqual({ action: 'waive', via: 'cache' });
  });

  test('the table is there but the paid row cannot be written → fall to the cache, and still never bill a paid film blind', async () => {
    const d = deps({ lease: [{ state: 'none' }], held: 75, record: 'unavailable', cache: 'none' });
    expect(await decideFilmWaiver('u1', TOKEN, LEASE, d)).toEqual({ action: 'stop', reason: 'waiver_unknown' });
    expect(d.lease).toHaveBeenCalledTimes(1);
  });
});

describe('payment reuse: a payment covers ITS film for ITS payer only', () => {
  test('another user presenting the paid film’s token: their ledger has no debit under it → bill (the payer’s waiver is untouched)', async () => {
    const held = jest.fn(async (uid: string) => (uid === 'payer' ? 75 : 0));
    const d = { ...deps({ lease: [{ state: 'none' }] }), held };
    expect(await decideFilmWaiver('stranger', TOKEN, LEASE, d)).toEqual({ action: 'bill' });
    expect(held).toHaveBeenCalledWith('stranger', filmChargeRef(TOKEN));
    expect(d.record).not.toHaveBeenCalled();
  });

  test('the payer’s other film: a different token is a different ref', () => {
    expect(filmChargeRef('f0000000000000001')).not.toBe(filmChargeRef(TOKEN));
  });
});

describe('the lease outlives the route', () => {
  test('660 s > the stitch’s 600 s maxDuration, so a live render never loses its waiver to a twin', () => {
    expect(FILM_WAIVER_LEASE_SEC).toBeGreaterThan(600);
  });
});

describe('the film start’s duplicate key: one Generate press = one key', () => {
  const film = { sessionId: 's-1', message: 'A pier at midnight', totalSec: 24, tier: 'fast', musicVideo: false };

  test('the studio’s press id is the key, held for an hour (a client retrying its own timeout)', async () => {
    const id = '3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
    expect(await filmStartKey({ filmRequestId: id }, film)).toEqual({ key: `film-start:${id}`, windowSec: FILM_START_WINDOW_SEC.request });
    expect((await filmStartKey({ filmRequestId: id.toUpperCase() }, film)).key).toBe(`film-start:${id}`);
  });

  test('no (or a malformed) press id → a key derived from the film itself, held for the start’s own window', async () => {
    const a = await filmStartKey(undefined, film);
    const b = await filmStartKey({ filmRequestId: 'not-a-uuid' }, film);
    expect(a.key).toMatch(/^film-start:h:/);
    expect(a).toEqual(b);
    expect(a.windowSec).toBe(FILM_START_WINDOW_SEC.derived);
  });

  test('a different brief, length, tier, mode, session or approved board is a different start', async () => {
    const base = (await filmStartKey(undefined, film)).key;
    const variants = await Promise.all([
      filmStartKey(undefined, { ...film, message: 'A pier at dawn' }),
      filmStartKey(undefined, { ...film, totalSec: 32 }),
      filmStartKey(undefined, { ...film, tier: 'standard' }),
      filmStartKey(undefined, { ...film, musicVideo: true }),
      filmStartKey(undefined, { ...film, sessionId: 's-2' }),
      filmStartKey({ storyboardApproval: { revision: 2, fingerprint: 'abc' } }, film),
    ]);
    for (const v of variants) expect(v.key).not.toBe(base);
  });
});
