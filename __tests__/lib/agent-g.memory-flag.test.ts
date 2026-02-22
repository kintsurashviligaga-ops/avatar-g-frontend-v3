import {
  __memoryFlagForTests,
  getUserMemory,
  recordEvent,
  upsertUserMemory,
} from '@/lib/agent-g/memory';
import { createServiceRoleClient } from '@/lib/supabase/server';

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(),
  })),
}));

describe('agent-g memory feature flag', () => {
  const originalFlag = process.env.AGENT_G_MEMORY_ENABLED;

  afterEach(() => {
    process.env.AGENT_G_MEMORY_ENABLED = originalFlag;
    jest.clearAllMocks();
  });

  test('is disabled by default', () => {
    delete process.env.AGENT_G_MEMORY_ENABLED;
    expect(__memoryFlagForTests()).toBe(false);
  });

  test('short-circuits reads and writes when disabled', async () => {
    process.env.AGENT_G_MEMORY_ENABLED = 'false';

    await expect(getUserMemory('telegram', '123')).resolves.toEqual({ memory: {}, style: {} });
    await expect(upsertUserMemory('telegram', '123', { memory: { a: 1 } })).resolves.toEqual({
      memory: {},
      style: {},
    });
    await expect(recordEvent('telegram', '123', 'message', { text: 'hi' })).resolves.toBe(false);

    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
