/** @jest-environment node */
// The film status tracker: a reload or a second device recovers the finished master, but only the account that paid
// for it gets the link, and the billing fields never leave the server.

jest.mock('server-only', () => ({}));

let caller: { id: string } | null = null;
jest.mock('../../../../../lib/supabase/server', () => ({
  authedClientFromRequest: async () => ({ supabase: {}, user: caller }),
}));
const getFilmStatus = jest.fn();
jest.mock('../../../../../lib/chat/filmStatusStore', () => ({
  getFilmStatus: (...a: unknown[]) => getFilmStatus(...a),
  filmStatusPersistenceEnabled: () => true,
}));
const reSignIfInternal = jest.fn(async (url: string) => `${url}&fresh=1`);
jest.mock('../../../../../lib/orchestrator/storage-adapter', () => ({
  reSignIfInternal: (url: string, ttl: number) => reSignIfInternal(url, ttl),
}));
import { GET } from './route';

const PAYER = '11111111-1111-4111-8111-111111111111';
const MASTER = 'https://ours.supabase.co/storage/v1/object/sign/renders/film/master.mp4?token=t';
const RECORD = {
  tokenId: 'fabc', phase: 'assembled', clips: [{ ordinal: 0, status: 'succeeded', hasUrl: true }], audioReady: true,
  masterUrl: MASTER, qa: { pass: true, score: 91, grade: 'A', issues: [] }, payerUid: PAYER, billingConsumed: true,
  freeFilmWaived: true, updatedAt: 1, error: null,
};

const get = async (tokenId = 'fabc') => {
  const res = await GET(new Request(`https://myavatar.ge/api/video/status/${tokenId}`), { params: { tokenId } });
  return { res, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  jest.clearAllMocks();
  caller = null;
  getFilmStatus.mockResolvedValue({ ...RECORD });
});

describe('GET /api/video/status/[tokenId]', () => {
  it('gives the account that paid for the film a fresh link to its master', async () => {
    caller = { id: PAYER };
    const { res, json } = await get();
    expect(res.status).toBe(200);
    expect(json.masterUrl).toBe(`${MASTER}&fresh=1`);
    expect(reSignIfInternal).toHaveBeenCalledWith(MASTER, 604_800);
    expect(json).toEqual(expect.objectContaining({ phase: 'assembled', qa: RECORD.qa, durable: true }));
  });

  it.each([
    ['a signed-out caller', null],
    ['another account', { id: '22222222-2222-4222-8222-222222222222' }],
  ])('%s holding the token id sees the phase, never the link', async (_who, who) => {
    caller = who;
    const { res, json } = await get();
    expect(res.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({ phase: 'assembled', masterUrl: null }));
    expect(reSignIfInternal).not.toHaveBeenCalled();
  });

  it('a record with no payer hands its link to nobody', async () => {
    caller = { id: PAYER };
    getFilmStatus.mockResolvedValue({ ...RECORD, payerUid: null });
    expect((await get()).json.masterUrl).toBeNull();
  });

  it('never sends the payer’s account id or the billing flags, not even to the payer', async () => {
    caller = { id: PAYER };
    const { json } = await get();
    expect(json).not.toHaveProperty('payerUid');
    expect(json).not.toHaveProperty('billingConsumed');
    expect(json).not.toHaveProperty('freeFilmWaived');
  });

  it('answers an unknown film honestly so the client keeps polling', async () => {
    getFilmStatus.mockResolvedValue(null);
    const { res, json } = await get('fnope');
    expect(res.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({ tokenId: 'fnope', phase: 'unknown', masterUrl: null }));
  });
});
