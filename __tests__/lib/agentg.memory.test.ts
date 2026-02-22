import {
  isAgentGMemoryEnabled,
  readAgentGMemory,
  writeAgentGMemory,
  deleteAgentGMemory,
} from '@/lib/agentg/memory';

describe('Agent G memory feature flag safety', () => {
  const originalFlag = process.env.AGENT_G_MEMORY_ENABLED;

  afterEach(() => {
    process.env.AGENT_G_MEMORY_ENABLED = originalFlag;
  });

  test('defaults to disabled when env is missing', () => {
    delete process.env.AGENT_G_MEMORY_ENABLED;
    expect(isAgentGMemoryEnabled()).toBe(false);
  });

  test('enables only on truthy flag values', () => {
    process.env.AGENT_G_MEMORY_ENABLED = 'true';
    expect(isAgentGMemoryEnabled()).toBe(true);

    process.env.AGENT_G_MEMORY_ENABLED = 'false';
    expect(isAgentGMemoryEnabled()).toBe(false);
  });

  test('safe wrappers short-circuit when disabled', async () => {
    process.env.AGENT_G_MEMORY_ENABLED = 'false';

    await expect(readAgentGMemory({ userId: 'web:test', channel: 'web' })).resolves.toBeNull();
    await expect(
      writeAgentGMemory({
        userId: 'web:test',
        channel: 'web',
        locale: 'ka',
        styleProfile: { shortReplies: true },
        lastEmotion: 'neutral',
      })
    ).resolves.toBe(false);
    await expect(deleteAgentGMemory({ userId: 'web:test', channel: 'web' })).resolves.toBe(false);
  });
});
