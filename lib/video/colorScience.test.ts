/** @jest-environment node */
import { COLOR_SCIENCE_POSITIVE, withColorScience } from './colorScience';

describe('withColorScience — shared cross-provider grade', () => {
  test('appends the ARRI/8K colour-science tokens to a prompt', () => {
    const out = withColorScience('a hero walks through a neon market');
    expect(out).toContain('a hero walks through a neon market');
    expect(out).toContain('ARRI Alexa color science');
    expect(out).toContain('neutral white balance');
  });

  test('is idempotent — never doubles the grade if the prompt already carries it', () => {
    const once = withColorScience('a city at dawn');
    const twice = withColorScience(once);
    expect(twice).toBe(once.slice(0, 900));
    // exactly one occurrence of the signature token
    expect(twice.match(/ARRI Alexa/g)?.length).toBe(1);
  });

  test('clamps to max so the colour-science tokens ALWAYS survive (Runway 512-char bound)', () => {
    const huge = 'x'.repeat(2000);
    const out = withColorScience(huge, 512);
    expect(out.length).toBeLessThanOrEqual(512);
    expect(out).toContain('ARRI Alexa color science'); // the grade is never the part that gets trimmed
  });

  test('the shared constant names the mandated Hollywood-grade tokens', () => {
    expect(COLOR_SCIENCE_POSITIVE).toMatch(/professional colour grading/i);
    expect(COLOR_SCIENCE_POSITIVE).toMatch(/ARRI Alexa/i);
    expect(COLOR_SCIENCE_POSITIVE).toMatch(/8K/i);
  });
});
