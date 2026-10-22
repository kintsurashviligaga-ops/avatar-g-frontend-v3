import { extractPersonaDirective } from './avatar';

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
