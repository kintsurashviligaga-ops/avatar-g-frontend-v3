/** @jest-environment node */
/**
 * POST /api/pipeline/remix — a THROW after the reservation gives the credits back.
 *
 * ⚠️ Before: nothing guarded the stretch between deductCredits and the response, so any throw there (the continuity
 * cut, the segment build, the summary) escaped as a bare 500 with the reservation still taken — credits lost on a
 * failed remix. The continuity module is made to throw here; everything paid is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-42' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({ checkRateLimit: jest.fn(async () => null), RATE_LIMITS: { AI: {} } }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({
    execute: jest.fn(async () => ({ success: true, assetUrl: 'https://x.supabase.co/clip-2-darker.mp4', predictionStatus: 'succeeded' })),
    poll: jest.fn(),
  })),
}));
jest.mock('../../../../lib/chat/remixContinuity', () => ({
  assembleContinuityCut: jest.fn(() => { throw new Error('continuity exploded'); }),
  summarizeContinuity: jest.fn(),
}));
jest.mock('../../../../lib/orchestrator/ffmpeg-assembly', () => ({ assembleWithFfmpeg: jest.fn() }));
jest.mock('../../../../lib/orchestrator/jobs', () => ({ recordCompletedFilm: jest.fn(async () => undefined) }));
jest.mock('../../../../lib/orchestrator/ledger', () => ({
  deductCredits: jest.fn(async () => ({ ok: true })),
  refundDebitByRef: jest.fn(async () => ({ ok: true, refunded: 15 })),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { deductCredits, refundDebitByRef } from '../../../../lib/orchestrator/ledger';

const BODY = {
  originalPrompt: 'A lighthouse keeper keeps the lamp burning through a storm — a cinematic film',
  editRequest: 'make scene 2 darker',
  landedClips: [1, 2, 3].map((ordinal) => ({ ordinal, url: `https://x.supabase.co/clip-${ordinal}.mp4` })),
  clipSec: 8,
};

test('the reservation is refunded through the ledger and the answer says so', async () => {
  const res = await POST(new NextRequest('https://myavatar.ge/api/pipeline/remix', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(BODY),
  }));
  expect(deductCredits).toHaveBeenCalledTimes(1);
  const ref = (deductCredits as jest.Mock).mock.calls[0][2];
  expect(refundDebitByRef).toHaveBeenCalledWith('user-42', ref);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ success: false, error: 'remix_failed', refunded: true });
});
