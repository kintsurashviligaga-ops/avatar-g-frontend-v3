/**
 * @jest-environment node
 *
 * PHASE 47 §1 — Storage-backed film status tracker.
 *
 * The pure model (token-id derivation, snapshot folding, master merge) is locked
 * down here, plus the fail-open async helpers in their DEFAULT no-Redis state:
 * without Upstash env the store degrades to a process-local Map so the status
 * endpoint stays coherent and the render is never blocked by tracking I/O.
 *
 * `server-only` is mocked because this runs outside the Next.js server runtime.
 */
jest.mock('server-only', () => ({}));

import {
  deriveFilmTokenId,
  buildFilmSnapshot,
  mergeMaster,
  putFilmStatus,
  getFilmStatus,
  recordFilmAssembling,
  recordFilmMaster,
  recordFilmFailed,
  consumeFilmBilling,
  filmStatusPersistenceEnabled,
  type FilmStatusRecord,
} from './filmStatusStore';

describe('deriveFilmTokenId — stable, namespaced identity hash', () => {
  const tuple = { sessionId: 's-123', createdAt: 1_700_000_000_000, seed: 42 };

  test('is deterministic for the same identity tuple', () => {
    expect(deriveFilmTokenId(tuple)).toBe(deriveFilmTokenId({ ...tuple }));
  });

  test('is prefixed and fixed-width hex (collision-resistant double-FNV)', () => {
    const id = deriveFilmTokenId(tuple);
    expect(id).toMatch(/^f[0-9a-f]{16}$/);
  });

  test('diverges when any component of the tuple changes', () => {
    const base = deriveFilmTokenId(tuple);
    expect(deriveFilmTokenId({ ...tuple, seed: 43 })).not.toBe(base);
    expect(deriveFilmTokenId({ ...tuple, sessionId: 's-124' })).not.toBe(base);
    expect(deriveFilmTokenId({ ...tuple, createdAt: tuple.createdAt + 1 })).not.toBe(base);
  });
});

describe('buildFilmSnapshot — pure phase + clip folding', () => {
  const baseClips = [
    { ordinal: 2, status: 'succeeded' as const, url: 'data:video/mp4;base64,AAA' },
    { ordinal: 1, status: 'queued' as const, url: null },
  ];

  test('rendering while clips are still in flight', () => {
    const snap = buildFilmSnapshot({
      tokenId: 't1', clips: baseClips, audioStatus: 'pending', readyToStitch: false, filmStatus: 'processing', now: 1000,
    });
    expect(snap.phase).toBe('rendering');
    expect(snap.masterUrl).toBeNull();
    expect(snap.updatedAt).toBe(1000);
  });

  test('sorts clips by ordinal and maps hasUrl without storing the URL', () => {
    const snap = buildFilmSnapshot({
      tokenId: 't1', clips: baseClips, audioStatus: 'pending', readyToStitch: false, filmStatus: 'processing',
    });
    expect(snap.clips.map((c) => c.ordinal)).toEqual([1, 2]);
    expect(snap.clips.find((c) => c.ordinal === 2)?.hasUrl).toBe(true);
    expect(snap.clips.find((c) => c.ordinal === 1)?.hasUrl).toBe(false);
    // The multi-MB data URL must never be persisted into the snapshot.
    expect(JSON.stringify(snap)).not.toContain('base64');
  });

  test('ready when every clip landed + audio terminal', () => {
    const snap = buildFilmSnapshot({
      tokenId: 't1',
      clips: [{ ordinal: 1, status: 'succeeded', url: 'x' }],
      audioStatus: 'succeeded',
      readyToStitch: true,
      filmStatus: 'succeeded',
    });
    expect(snap.phase).toBe('ready');
    expect(snap.audioReady).toBe(true);
  });

  test('failed when the union reports a terminal leg failure', () => {
    const snap = buildFilmSnapshot({
      tokenId: 't1',
      clips: [{ ordinal: 1, status: 'failed', url: null }],
      audioStatus: 'skipped',
      readyToStitch: false,
      filmStatus: 'failed',
    });
    expect(snap.phase).toBe('failed');
    expect(snap.error).toMatch(/failed/i);
  });

  test('assembled takes precedence — a landed master is never demoted', () => {
    const snap = buildFilmSnapshot({
      tokenId: 't1',
      clips: [{ ordinal: 1, status: 'succeeded', url: 'x' }],
      audioStatus: 'succeeded',
      readyToStitch: true,
      filmStatus: 'succeeded',
      masterUrl: 'https://cdn/master.mp4',
    });
    expect(snap.phase).toBe('assembled');
    expect(snap.masterUrl).toBe('https://cdn/master.mp4');
  });
});

describe('mergeMaster — stamp a finished master', () => {
  test('synthesizes a minimal assembled record when none exists', () => {
    const rec = mergeMaster(null, 't9', 'https://cdn/m.mp4', null, 5);
    expect(rec).toEqual<FilmStatusRecord>({
      tokenId: 't9', phase: 'assembled', clips: [], audioReady: false, masterUrl: 'https://cdn/m.mp4', qa: null, payerUid: null, billingConsumed: false, updatedAt: 5, error: null,
    });
  });

  test('stamps the payer uid and leaves the billing waiver unspent', () => {
    const rec = mergeMaster(null, 't9', 'https://cdn/m.mp4', null, 5, 'user-abc');
    expect(rec.payerUid).toBe('user-abc');
    expect(rec.billingConsumed).toBe(false);
  });

  test('a re-stamp preserves the original payer + a spent waiver (null uid does not erase them)', () => {
    const prev: FilmStatusRecord = {
      tokenId: 't9', phase: 'assembled', clips: [], audioReady: false, masterUrl: 'https://cdn/a.mp4', payerUid: 'user-abc', billingConsumed: true, updatedAt: 1, error: null,
    };
    const rec = mergeMaster(prev, 't9', 'https://cdn/b.mp4', null, 9, null);
    expect(rec.payerUid).toBe('user-abc'); // not clobbered to null
    expect(rec.billingConsumed).toBe(true); // spent stays spent
  });

  test('preserves prior clips while promoting to assembled', () => {
    const prev: FilmStatusRecord = {
      tokenId: 't9', phase: 'ready', clips: [{ ordinal: 1, status: 'succeeded', hasUrl: true }], audioReady: true, masterUrl: null, updatedAt: 1, error: null,
    };
    const rec = mergeMaster(prev, 't9', 'https://cdn/m.mp4', null, 9);
    expect(rec.phase).toBe('assembled');
    expect(rec.masterUrl).toBe('https://cdn/m.mp4');
    expect(rec.clips).toHaveLength(1);
  });

  test('carries the Supervisor QA verdict onto the assembled record', () => {
    const qa = { pass: false, score: 50, grade: 'F', issues: ['silent_master'] };
    const rec = mergeMaster(null, 't9', 'https://cdn/m.mp4', qa, 7);
    expect(rec.qa).toEqual(qa);
  });
});

describe('store helpers — fail-open in the default no-Redis state', () => {
  test('persistence is reported disabled without Upstash env', () => {
    expect(filmStatusPersistenceEnabled()).toBe(false);
  });

  test('put → get round-trips via the in-process fallback', async () => {
    const rec: FilmStatusRecord = {
      tokenId: 'mem-1', phase: 'rendering', clips: [], audioReady: false, masterUrl: null, updatedAt: 1, error: null,
    };
    await putFilmStatus(rec);
    expect(await getFilmStatus('mem-1')).toEqual(rec);
  });

  test('getFilmStatus returns null for an unknown token', async () => {
    expect(await getFilmStatus('does-not-exist')).toBeNull();
  });

  test('recordFilmAssembling promotes phase to assembling', async () => {
    await putFilmStatus({ tokenId: 'mem-2', phase: 'ready', clips: [], audioReady: true, masterUrl: null, updatedAt: 1, error: null });
    await recordFilmAssembling('mem-2');
    expect((await getFilmStatus('mem-2'))?.phase).toBe('assembling');
  });

  test('recordFilmMaster stamps the master and flips to assembled', async () => {
    await putFilmStatus({ tokenId: 'mem-3', phase: 'assembling', clips: [], audioReady: true, masterUrl: null, updatedAt: 1, error: null });
    await recordFilmMaster('mem-3', 'https://cdn/final.mp4');
    const rec = await getFilmStatus('mem-3');
    expect(rec?.phase).toBe('assembled');
    expect(rec?.masterUrl).toBe('https://cdn/final.mp4');
  });

  test('recordFilmMaster binds the payer uid; consumeFilmBilling spends the one-shot waiver', async () => {
    // A paid product ad stamps its token with the payer uid, waiver unspent.
    await recordFilmMaster('mem-bill', 'https://cdn/ad.mp4', null, 'payer-1');
    let rec = await getFilmStatus('mem-bill');
    expect(rec?.payerUid).toBe('payer-1');
    expect(rec?.billingConsumed).not.toBe(true); // still spendable → assemble may waive ONCE

    // The ad's own assemble spends it.
    await consumeFilmBilling('mem-bill');
    rec = await getFilmStatus('mem-bill');
    expect(rec?.billingConsumed).toBe(true); // spent → any replay now bills normally
    expect(rec?.masterUrl).toBe('https://cdn/ad.mp4'); // master intact for status recovery
    expect(rec?.payerUid).toBe('payer-1');

    // Idempotent: a second consume is a no-op and never throws.
    await expect(consumeFilmBilling('mem-bill')).resolves.toBeUndefined();
    // Unknown token: fail-open no-op.
    await expect(consumeFilmBilling('nope')).resolves.toBeUndefined();
  });

  test('recordFilmFailed records the reason without clobbering an assembled master', async () => {
    await putFilmStatus({ tokenId: 'mem-4', phase: 'assembled', clips: [], audioReady: true, masterUrl: 'https://cdn/x.mp4', updatedAt: 1, error: null });
    await recordFilmFailed('mem-4', 'editor crashed');
    const rec = await getFilmStatus('mem-4');
    // An already-assembled film must not be demoted by a late failure write.
    expect(rec?.phase).toBe('assembled');
    expect(rec?.masterUrl).toBe('https://cdn/x.mp4');
  });

  test('recordFilmFailed marks a non-assembled film failed', async () => {
    await putFilmStatus({ tokenId: 'mem-5', phase: 'rendering', clips: [], audioReady: false, masterUrl: null, updatedAt: 1, error: null });
    await recordFilmFailed('mem-5', 'no clips landed');
    const rec = await getFilmStatus('mem-5');
    expect(rec?.phase).toBe('failed');
    expect(rec?.error).toBe('no clips landed');
  });
});
