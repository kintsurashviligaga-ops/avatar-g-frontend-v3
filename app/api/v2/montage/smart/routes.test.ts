/** @jest-environment node */
/**
 * The Smart Editor routes (Phase 8.7 PR B), mocked end to end: no ffmpeg, no Chirp, no wallet.
 *
 *   captions  404 with the flag off · quote = price only, no call · ✦2 per started minute of audio SENT, charged once,
 *             AFTER the words came back · nothing charged when no piece came back · balance checked first
 *   silence   free · plan returned in SOURCE seconds
 *   beat      free · grid from the song
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = { id: 'u1' };
let mockOpen = true;
jest.mock('../../../../../lib/api/guard', () => ({ applyApiGuards: jest.fn(async () => ({})) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { EXPENSIVE: {}, WRITE: {} } }));
jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: mockUser })) }));
jest.mock('../../../../../lib/server/serviceSwitches', () => ({ serviceOffResponse: jest.fn(async () => null) }));
jest.mock('../../../../../lib/orchestrator/ledger', () => ({
  hasSufficientBalance: jest.fn(async () => true),
  deductCreditsOnce: jest.fn(async () => ({ ok: true })),
}));
jest.mock('../../../../../lib/services/montage/beatAnalysis', () => ({
  analyzeTrack: jest.fn(async () => ({ probe: { durationSec: 30 }, grid: { bpm: 120, periodSec: 0.5, phaseSec: 0.1, confidence: 0.9 } })),
}));
jest.mock('../../../../../lib/services/montage/smart/server', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NextResponse } = require('next/server');
  return {
    smartOpenTo: jest.fn(async () => mockOpen),
    smartFail: (code: string, message: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, code, error: code, message, ...extra }, { status }),
    resolveMedia: jest.fn(async (raw: unknown) => (raw === 'https://evil.test/x.mp4' ? { ok: false, reason: 'not_yours' } : { ok: true, url: String(raw) })),
    liveSmartDeps: jest.fn(() => ({})),
    runCaptions: jest.fn(),
    detectSilences: jest.fn(async () => [{ startSec: 14, endSec: 15.5 }]),
  };
});

/* eslint-disable import/first */
import { NextRequest } from 'next/server';
import { POST as captions } from './captions/route';
import { POST as silence } from './silence/route';
import { POST as beat } from './beat/route';
import { deductCreditsOnce, hasSufficientBalance } from '../../../../../lib/orchestrator/ledger';
import { runCaptions } from '../../../../../lib/services/montage/smart/server';
/* eslint-enable import/first */

const post = (body: unknown) => new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const src = (over: Record<string, unknown> = {}) => ({ sourceId: 's1', url: 'https://cdn.test/a.mp4', startSec: 0, endSec: 75, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
  mockOpen = true;
});

describe('POST /api/v2/montage/smart/captions', () => {
  it('is 404 while MONTAGE_SMART_EDITOR keeps this user out, 401 signed out', async () => {
    mockOpen = false;
    expect((await captions(post({ lang: 'ka', sources: [src()] }))).status).toBe(404);
    mockUser = null;
    expect((await captions(post({ lang: 'ka', sources: [src()] }))).status).toBe(401);
    expect(runCaptions).not.toHaveBeenCalled();
  });

  it('a quote prices the audio (75 s → 2 started minutes → ✦4) and calls nothing', async () => {
    const res = await captions(post({ lang: 'ka', sources: [src()], quote: true }));
    expect(await res.json()).toEqual({ ok: true, credits: 4, billedSec: 75 });
    expect(runCaptions).not.toHaveBeenCalled();
    expect(deductCreditsOnce).not.toHaveBeenCalled();
  });

  it('charges once, AFTER the words, for the audio actually sent', async () => {
    (runCaptions as jest.Mock).mockResolvedValueOnce({ wordsBySource: { s1: [{ text: 'გამარჯობა', startSec: 0.2, endSec: 0.8 }] }, billedSec: 50, failedPieces: 0, pieces: 2 });
    const res = await captions(post({ lang: 'ka', sources: [src()] }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.charged).toBe(2); // 50 s sent → 1 started minute → ✦2
    expect(j.wordsBySource.s1[0].text).toBe('გამარჯობა');
    expect(hasSufficientBalance).toHaveBeenCalledWith('u1', 4);
    expect(deductCreditsOnce).toHaveBeenCalledTimes(1);
    expect((deductCreditsOnce as jest.Mock).mock.calls[0][2]).toMatch(/^montage-captions:/);
  });

  it('nothing back → 502 and no charge', async () => {
    (runCaptions as jest.Mock).mockResolvedValueOnce({ wordsBySource: { s1: [] }, billedSec: 0, failedPieces: 2, pieces: 2 });
    const res = await captions(post({ lang: 'en', sources: [src()] }));
    expect(res.status).toBe(502);
    expect(deductCreditsOnce).not.toHaveBeenCalled();
  });

  it('too little balance → 402 before any call', async () => {
    (hasSufficientBalance as jest.Mock).mockResolvedValueOnce(false);
    const res = await captions(post({ lang: 'ka', sources: [src()] }));
    expect(res.status).toBe(402);
    expect((await res.json()).credits).toBe(4);
    expect(runCaptions).not.toHaveBeenCalled();
  });

  it('refuses a bad language, too many seconds, and another account\'s clip', async () => {
    expect((await captions(post({ lang: 'de', sources: [src()] }))).status).toBe(400);
    expect((await captions(post({ lang: 'ka', sources: [src({ endSec: 301 })] }))).status).toBe(413);
    expect((await captions(post({ lang: 'ka', sources: [src({ url: 'https://evil.test/x.mp4' })] }))).status).toBe(403);
    expect(runCaptions).not.toHaveBeenCalled();
  });
});

describe('POST /api/v2/montage/smart/silence', () => {
  it('is free and answers in source seconds', async () => {
    const res = await silence(post({ url: 'https://cdn.test/a.mp4', startSec: 10, endSec: 40 }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.charged).toBe(0);
    expect(j.plan.cuts.length).toBeGreaterThan(0);
    for (const c of j.plan.cuts) {
      expect(c.startSec).toBeGreaterThanOrEqual(10);
      expect(c.endSec).toBeLessThanOrEqual(40);
    }
    expect(j.plan.cuts[0].startSec).toBeGreaterThan(14);
    expect(j.plan.cuts[0].endSec).toBeLessThan(15.5);
  });
  it('404 with the flag off', async () => {
    mockOpen = false;
    expect((await silence(post({ url: 'https://cdn.test/a.mp4', startSec: 0, endSec: 5 }))).status).toBe(404);
  });
});

describe('POST /api/v2/montage/smart/beat', () => {
  it('returns the song\'s grid, free', async () => {
    const res = await beat(post({ url: 'https://cdn.test/song.mp3' }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.grid.bpm).toBe(120);
    expect(j.durationSec).toBe(30);
  });
});
