import { isAgentGVoiceEnabled } from '@/lib/agent-g/voice/stt';

describe('agent-g voice feature flag', () => {
  const original = process.env.AGENT_G_VOICE_ENABLED;

  afterEach(() => {
    process.env.AGENT_G_VOICE_ENABLED = original;
  });

  test('defaults to disabled', () => {
    delete process.env.AGENT_G_VOICE_ENABLED;
    expect(isAgentGVoiceEnabled()).toBe(false);
  });

  test('enabled only when true', () => {
    process.env.AGENT_G_VOICE_ENABLED = 'true';
    expect(isAgentGVoiceEnabled()).toBe(true);

    process.env.AGENT_G_VOICE_ENABLED = 'false';
    expect(isAgentGVoiceEnabled()).toBe(false);
  });
});
