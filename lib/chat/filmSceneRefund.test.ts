/** @jest-environment node */
/**
 * R3-A — a scene Google accepted and then failed is given back once, on the server's own record and Google's own word.
 * The decision logic here with its store and Google mocked; the store's SQL (one settlement per scene, the cap by the
 * film's net debit, owner binding, service-role only) on a real Postgres: lib/chat/filmSceneRefund.pg.test.ts.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/engine', () => ({ pollVeoClip: jest.fn() }));
jest.mock('./filmBilling', () => ({ pendingFilmScenes: jest.fn(), settleFilmScene: jest.fn() }));

import { filmSceneShares, sceneVerdict, settleFailedFilmScenes, veoOperationOfTaskRef, type SceneRefundDeps } from './filmSceneRefund';
import type { VeoPollOutcome } from '../veo/types';

const OP = 'projects/p/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/abc';
const veoRef = (op: string, provider = 'gemini-veo') =>
  Buffer.from(JSON.stringify({ v: 1, provider, providerTaskId: `${op}::9:16`, sessionId: 's' })).toString('base64url');

describe('the operation comes from the server’s own task ref', () => {
  test('a gemini-veo task ref → its operation (the aspect suffix dropped)', () => {
    expect(veoOperationOfTaskRef(veoRef(OP))).toBe(OP);
    expect(veoOperationOfTaskRef(Buffer.from(JSON.stringify({ provider: 'gemini-veo', providerTaskId: 'models/veo/operations/x' })).toString('base64url')))
      .toBe('models/veo/operations/x');
  });

  test.each([
    ['another engine', veoRef(OP, 'ltx')],
    ['not base64 JSON', 'task-1'],
    ['empty', ''],
    ['null', null],
    ['no operation', Buffer.from(JSON.stringify({ provider: 'gemini-veo', providerTaskId: '::16:9' })).toString('base64url')],
  ])('%s → null (nothing recorded, nothing ever refunded for it)', (_name, ref) => {
    expect(veoOperationOfTaskRef(ref)).toBeNull();
  });

  test('the start records only QUEUED Veo scenes, each at the share', () => {
    const shares = filmSceneShares([
      { ordinal: 1, taskRef: veoRef(`${OP}1`), status: 'queued' },
      { ordinal: 2, taskRef: null, status: 'failed' },
      { ordinal: 3, taskRef: veoRef(`${OP}3`, 'runway'), status: 'queued' },
      { ordinal: 4, taskRef: veoRef(`${OP}4`), status: 'queued' },
    ], 25);
    expect(shares).toEqual([{ ordinal: 1, operation: `${OP}1`, credits: 25 }, { ordinal: 4, operation: `${OP}4`, credits: 25 }]);
    expect(filmSceneShares([{ ordinal: 1, taskRef: veoRef(OP), status: 'queued' }], 0)).toEqual([]);
  });
});

describe('only Google’s TERMINAL verdict on a finished operation counts', () => {
  test.each<[string, VeoPollOutcome, 'failed' | 'rendered' | 'unknown']>([
    ['a safety refusal', { state: 'filtered', reason: 'blocked', supportCodes: ['58061214'] }, 'failed'],
    ['a finished operation with an error', { state: 'failed', reason: 'Internal error', code: 13, finished: true }, 'failed'],
    ['a finished operation with no video', { state: 'failed', reason: 'no video', finished: true }, 'failed'],
    ['still running (or a 429 / 5xx, which polls as processing)', { state: 'processing' }, 'unknown'],
    ['an unknown or expired operation', { state: 'failed', reason: 'operation expired or unknown', code: 404 }, 'unknown'],
    ['no configuration on this deployment', { state: 'failed', reason: 'Vertex AI is not configured' }, 'unknown'],
    ['a bad name', { state: 'failed', reason: 'not a Veo operation name' }, 'unknown'],
    ['rendered (Google billed it; a hosting miss is ours, the scene stays paid)', { state: 'succeeded', videos: [] }, 'rendered'],
  ])('%s → %s', (_name, outcome, verdict) => {
    expect(sceneVerdict(outcome)).toBe(verdict);
  });
});

describe('settleFailedFilmScenes', () => {
  function deps(pending: Array<{ ordinal: number; operation: string }> | null, answers: Record<string, VeoPollOutcome>, settle = jest.fn(async () => 25)) {
    const poll = jest.fn(async (op: string) => answers[op] ?? { state: 'processing' as const });
    return { pending: jest.fn(async () => pending), poll, settle } satisfies SceneRefundDeps & Record<string, unknown>;
  }

  test('a scene Google failed → its share back once; the operation asked about is the RECORDED one', async () => {
    const d = deps([{ ordinal: 2, operation: 'recorded-op-2' }], { 'recorded-op-2': { state: 'filtered', reason: 'x', supportCodes: [] } });
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [2], d)).toBe(25);
    expect(d.poll).toHaveBeenCalledWith('recorded-op-2');
    expect(d.settle).toHaveBeenCalledWith('u1', 'f0123456789abcdef', 2, true);
  });

  test('a scene Google rendered is settled as kept (nothing back), and is never asked about again', async () => {
    const d = deps([{ ordinal: 1, operation: 'op-1' }], { 'op-1': { state: 'succeeded', videos: [] } }, jest.fn(async () => 0));
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [1], d)).toBe(0);
    expect(d.settle).toHaveBeenCalledWith('u1', 'f0123456789abcdef', 1, false);
  });

  test('no verdict yet (running, 429, no config, expired) → nothing settled; the next poll asks again', async () => {
    const d = deps([{ ordinal: 1, operation: 'op-1' }], { 'op-1': { state: 'failed', reason: 'operation expired or unknown', code: 404 } });
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [1], d)).toBe(0);
    expect(d.settle).not.toHaveBeenCalled();
    d.poll.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [1], d)).toBe(0);
    expect(d.settle).not.toHaveBeenCalled();
  });

  test('a hint the record does not hold (a forged token, a scene already settled) → Google is not even asked', async () => {
    const d = deps([{ ordinal: 1, operation: 'op-1' }], {});
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [7], d)).toBe(0);
    expect(d.poll).not.toHaveBeenCalled();
    expect(d.settle).not.toHaveBeenCalled();
  });

  test('anonymous, no hint, no record or no store → nothing is read and nothing given back', async () => {
    const d = deps(null, {});
    expect(await settleFailedFilmScenes('anonymous', 'f0123456789abcdef', [1], d)).toBe(0);
    expect(await settleFailedFilmScenes(undefined, 'f0123456789abcdef', [1], d)).toBe(0);
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [], d)).toBe(0);
    expect(d.pending).not.toHaveBeenCalled();
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [1], d)).toBe(0); // store says nothing (null)
    expect(d.poll).not.toHaveBeenCalled();
  });

  test('a store that fails mid-settle gives nothing back and does not throw', async () => {
    const d = deps([{ ordinal: 1, operation: 'op-1' }], { 'op-1': { state: 'filtered', reason: 'x', supportCodes: [] } },
      jest.fn(async () => { throw new Error('connection reset'); }));
    expect(await settleFailedFilmScenes('u1', 'f0123456789abcdef', [1], d)).toBe(0);
  });
});
