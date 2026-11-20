/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));
jest.mock('../../orchestrator/ledger', () => ({}));
jest.mock('../../orchestrator/jobs', () => ({}));
jest.mock('../../orchestrator/storage-adapter', () => ({}));
jest.mock('../../ai/lyriaMusic', () => ({}));
jest.mock('../../audio/trackDuration', () => ({}));
import { ownsProducerPath, producerPath } from './live';

describe('ownsProducerPath', () => {
  it('reads only the caller\'s own Music Producer folder', () => {
    expect(producerPath('u1', 'abc', 'mp3')).toBe('music-producer/u1/abc.mp3');
    expect(ownsProducerPath('music-producer/u1/abc.mp3', 'u1')).toBe(true);
    expect(ownsProducerPath('music-producer/u2/abc.mp3', 'u1')).toBe(false);
    expect(ownsProducerPath('music-producer/u1/../u2/abc.mp3', 'u1')).toBe(false);
    expect(ownsProducerPath('u1/abc.mp3', 'u1')).toBe(false);
  });
});
