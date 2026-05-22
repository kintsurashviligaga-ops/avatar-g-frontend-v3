import {
  AGENT_PROFILES,
  CAMERA_MOTION_VOCAB,
  agentASystemPrompt,
  getAgentProfile,
  type AgentId,
} from './profiles';

describe('AGENT_PROFILES registry', () => {
  const ids: AgentId[] = ['A', 'H', 'I', 'J', 'L'];

  test('defines all five swarm agents', () => {
    expect(Object.keys(AGENT_PROFILES).sort()).toEqual([...ids].sort());
  });

  test('every profile is internally consistent', () => {
    for (const id of ids) {
      const p = getAgentProfile(id);
      expect(p.id).toBe(id);
      expect(p.codeName.length).toBeGreaterThan(0);
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.provider.length).toBeGreaterThan(0);
      expect(p.role.length).toBeGreaterThan(0);
      expect(p.skills.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('Agent A is the Claude CEO orchestrator and is prompt-driven', () => {
    const a = getAgentProfile('A');
    expect(a.provider).toBe('anthropic');
    expect(a.model).toBeTruthy();
  });

  test('API-driven nodes (H/I/J/L) have null model', () => {
    for (const id of ['H', 'I', 'J', 'L'] as AgentId[]) {
      expect(getAgentProfile(id).model).toBeNull();
    }
  });
});

describe('agentASystemPrompt', () => {
  test('carries the strict JSON contract + camera vocabulary', () => {
    const p = agentASystemPrompt();
    expect(p).toContain('"segments"');
    expect(p).toContain('cameraMotion');
    for (const motion of CAMERA_MOTION_VOCAB) {
      expect(p).toContain(motion);
    }
  });

  test('mentions Agent A and its installed skills', () => {
    const p = agentASystemPrompt();
    expect(p).toMatch(/Agent A/);
    expect(p.toLowerCase()).toContain('sequence planning');
    expect(p.toLowerCase()).toContain('context filtering');
  });
});
