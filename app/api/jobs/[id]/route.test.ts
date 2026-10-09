/** @jest-environment node */
/**
 * GET /api/jobs/<id> is read only.
 *
 * ⚠️ It used to "auto-process" a queued `generate_video` row: an unbilled Runway render of the row's own prompt and
 * image for whoever polled it, and a signed-in user can write their own `jobs` rows. Pinned: polling never renders
 * and never writes, `autoProcess` or not.
 */
const generateVideo = jest.fn();
jest.mock('../../../../lib/ai/runway', () => ({ generateVideo: (...args: unknown[]) => generateVideo(...args) }));

const updateJob = jest.fn();
const ROW = {
  id: 'job-1',
  user_id: 'user-1',
  type: 'generate_video',
  status: 'queued',
  input_json: { prompt: 'a free render', duration: 10 },
};
jest.mock('../../../../lib/jobs/jobs', () => ({
  getJob: jest.fn(async () => ROW),
  updateJob: (...args: unknown[]) => updateJob(...args),
}));
jest.mock('../../../../lib/supabase/auth', () => ({ requireAuthenticatedUser: jest.fn(async () => ({ id: 'user-1' })) }));
jest.mock('../../../../lib/supabase/server', () => ({
  createRouteHandlerClient: () => ({ from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({}) }) }) }) }),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

beforeEach(() => {
  generateVideo.mockReset();
  updateJob.mockReset();
});

test.each(['', '?autoProcess=1'])('polling a queued generate_video row (%s) renders nothing and writes nothing', async (qs) => {
  const res = await GET(new NextRequest(`https://myavatar.ge/api/jobs/job-1${qs}`), { params: { id: 'job-1' } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ job: ROW });
  expect(generateVideo).not.toHaveBeenCalled();
  expect(updateJob).not.toHaveBeenCalled();
});
