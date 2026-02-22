import { detectTone } from '@/lib/agent-g/tone';

describe('detectTone', () => {
  test('detects stressed tone from georgian keyword', () => {
    const result = detectTone('ძალიან ვნერვიულობ და მეშინია');
    expect(result.tone).toBe('stressed');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test('detects happy tone from gratitude keyword', () => {
    const result = detectTone('დიდი მადლობა, გილოცავ!');
    expect(result.tone).toBe('happy');
  });

  test('detects angry tone from punctuation and caps', () => {
    const result = detectTone('THIS IS BAD!!!');
    expect(result.tone).toBe('angry');
  });

  test('falls back to neutral for plain text', () => {
    const result = detectTone('okay, let us continue');
    expect(result.tone).toBe('neutral');
  });
});
