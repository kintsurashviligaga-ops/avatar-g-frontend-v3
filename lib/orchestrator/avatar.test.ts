import {
  extractPersonaDirective, pickLighting, buildSessionConfig, LIGHTING_TEMPLATES,
} from './avatar';

describe('extractPersonaDirective (Agent V)', () => {
  test('empathetic on supportive text', () => {
    expect(extractPersonaDirective('I am so sorry, I understand this is difficult').expression).toBe('empathetic');
  });
  test('enthusiastic on excited text', () => {
    expect(extractPersonaDirective('This is amazing — we launch today!').expression).toBe('enthusiastic');
  });
  test('serious on urgent text', () => {
    expect(extractPersonaDirective('Urgent: a critical risk needs action').expression).toBe('serious');
  });
  test('professional default', () => {
    expect(extractPersonaDirective('The quarterly figures are summarized below.').expression).toBe('professional');
  });
  test('always returns gestures + posture + tone', () => {
    const p = extractPersonaDirective('hello there');
    expect(p.microGestures.length).toBeGreaterThan(0);
    expect(p.posture).toBeTruthy();
    expect(p.tone).toBeTruthy();
  });
});

describe('pickLighting (Agent M)', () => {
  test('maps explicit hints to templates', () => {
    expect(pickLighting('cinematic dramatic shot').key).toBe('cinematic');
    expect(pickLighting('corporate brand video').key).toBe('corporate');
    expect(pickLighting('warm home window').key).toBe('natural');
  });
  test('defaults to studio', () => {
    expect(pickLighting('').key).toBe('studio');
    expect(LIGHTING_TEMPLATES[pickLighting('').key]).toBeTruthy();
  });
});

describe('buildSessionConfig', () => {
  test('grounds with system prompt + capped memory + persona + lighting', () => {
    const cfg = buildSessionConfig({
      systemPrompt: 'You are Nika, a friendly host.',
      memory: Array.from({ length: 30 }, (_, i) => `fact ${i}`),
      script: 'Welcome! This is exciting!',
      lightingHint: 'cinematic',
    });
    expect(cfg.systemPrompt).toContain('Nika');
    expect(cfg.knowledge).toHaveLength(20); // capped
    expect(cfg.persona.expression).toBe('enthusiastic');
    expect(cfg.lighting.key).toBe('cinematic');
  });
  test('synthesizes a default system prompt when none supplied', () => {
    const cfg = buildSessionConfig({ script: 'Please relax and breathe slowly.' });
    expect(cfg.systemPrompt.length).toBeGreaterThan(0);
    expect(cfg.persona.expression).toBe('calm');
  });
});
