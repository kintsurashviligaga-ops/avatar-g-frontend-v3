/** @jest-environment node */
import { researchLimits, resolveResearchAgent, utcDayStart } from './limits';
import { RESEARCH_AGENT_ID } from './pricing';

describe('researchLimits', () => {
  test('defaults: on, 60 a day platform-wide, 4 a day per account, 2 at once, the standard agent', () => {
    expect(researchLimits({})).toMatchObject({ enabled: true, globalDaily: 60, userDaily: 4, maxActive: 2, agent: RESEARCH_AGENT_ID });
  });

  test('RESEARCH_DAILY_CAP=0 is the kill switch (a real value, not "unset")', () => {
    expect(researchLimits({ RESEARCH_DAILY_CAP: '0' }).globalDaily).toBe(0);
    expect(researchLimits({ RESEARCH_DAILY_CAP: '25' }).globalDaily).toBe(25);
  });

  test('RESEARCH_ENABLED is an opt-out switch', () => {
    for (const v of ['0', 'false', 'off', 'no']) expect(researchLimits({ RESEARCH_ENABLED: v }).enabled).toBe(false);
    for (const v of [undefined, '', '1', 'true']) expect(researchLimits({ RESEARCH_ENABLED: v }).enabled).toBe(true);
  });

  test('a typo never unbinds the spend: junk, negatives, fractions and huge numbers keep the default', () => {
    for (const v of ['abc', '-3', '2.5', '1e3', '99999999', '12 a day', '']) {
      const l = researchLimits({ RESEARCH_DAILY_CAP: v, RESEARCH_USER_DAILY_CAP: v, RESEARCH_MAX_ACTIVE: v });
      expect(l.globalDaily).toBe(60);
      expect(l.userDaily).toBe(4);
      expect(l.maxActive).toBe(2);
    }
  });

  test('per-account numbers are clamped to their safe range', () => {
    expect(researchLimits({ RESEARCH_USER_DAILY_CAP: '0' }).userDaily).toBe(4); // 0 per account would be a silent kill switch — use the global one
    expect(researchLimits({ RESEARCH_USER_DAILY_CAP: '21' }).userDaily).toBe(4);
    expect(researchLimits({ RESEARCH_USER_DAILY_CAP: '20' }).userDaily).toBe(20);
    expect(researchLimits({ RESEARCH_MAX_ACTIVE: '3' }).maxActive).toBe(3);
    expect(researchLimits({ RESEARCH_MAX_ACTIVE: '4' }).maxActive).toBe(2);
    expect(researchLimits({ RESEARCH_MAX_ACTIVE: '0' }).maxActive).toBe(2);
  });

  test('the agent override accepts a deep-research id and refuses a Max id or anything else', () => {
    expect(resolveResearchAgent('deep-research-preview-11-2026')).toBe('deep-research-preview-11-2026');
    expect(resolveResearchAgent('deep-research-max-preview-04-2026')).toBe(RESEARCH_AGENT_ID);
    for (const v of ['antigravity-preview-05-2026', 'gemini-3.8-flash', '../deep-research', 'deep-research-', undefined, '']) {
      expect(resolveResearchAgent(v)).toBe(RESEARCH_AGENT_ID);
    }
  });
});

describe('utcDayStart', () => {
  test('midnight UTC of the day, whatever the time', () => {
    expect(utcDayStart(Date.UTC(2026, 9, 2, 23, 59, 59))).toBe('2026-10-02T00:00:00.000Z');
    expect(utcDayStart(Date.UTC(2026, 9, 2, 0, 0, 0))).toBe('2026-10-02T00:00:00.000Z');
  });
});
