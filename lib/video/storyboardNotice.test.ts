/**
 * The storyboard's planning line (Phase 2 PR 6, GG's decision of 2026-10-23): it says planning, with the board's own
 * scene count and length, in the user's language; it never says generation started, and gives no ETA (§3.3).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { storyboardPlanningNotice } from './storyboardNotice';

describe('storyboardPlanningNotice', () => {
  it('carries the real count and length in each language', () => {
    expect(storyboardPlanningNotice('ka', 6, 30)).toContain('6 სცენა · 30 წმ');
    expect(storyboardPlanningNotice('en', 6, 30)).toContain('6 scenes · 30 s');
    expect(storyboardPlanningNotice('ru', 6, 30)).toContain('6 сцен · 30 с');
    expect(storyboardPlanningNotice('en', 12, 60)).toContain('12 scenes · 60 s');
  });

  it('says planning, not started, and gives no wait', () => {
    for (const l of ['ka', 'en', 'ru']) {
      const text = storyboardPlanningNotice(l, 2, 10);
      expect(text).not.toMatch(/დაიწყო \(|generation started|генерация началась|Veo|წუთი|minute|минут|~|≈/i);
    }
    expect(storyboardPlanningNotice('en', 2, 10)).toMatch(/^🎬 \*\*Planning the storyboard/);
    expect(storyboardPlanningNotice('ru', 2, 10)).toMatch(/Планирую раскадровку/);
    expect(storyboardPlanningNotice('ka', 2, 10)).toMatch(/სტორიბორდს ვგეგმავ/);
  });

  it('counts Russian scenes and English singulars properly', () => {
    expect(storyboardPlanningNotice('ru', 1, 8)).toContain('1 сцена');
    expect(storyboardPlanningNotice('ru', 2, 16)).toContain('2 сцены');
    expect(storyboardPlanningNotice('ru', 11, 60)).toContain('11 сцен');
    expect(storyboardPlanningNotice('ru', 22, 60)).toContain('22 сцены');
    expect(storyboardPlanningNotice('en', 1, 8)).toContain('1 scene · 8 s');
  });

  it('an unknown locale reads Georgian, the product default', () => {
    expect(storyboardPlanningNotice('de', 3, 24)).toBe(storyboardPlanningNotice('ka', 3, 24));
  });
});

describe('OmniStudio uses it (wiring)', () => {
  const studio = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
  const start = studio.indexOf('const createStoryboard = useCallback(');
  const body = studio.slice(start, studio.indexOf('}, [videoStyle, locale, videoDuration', start));

  it('the old fixed Georgian line is gone', () => {
    expect(start).toBeGreaterThan(0);
    expect(studio).not.toContain('ვიდეოს გენერაცია დაიწყო (3 სცენა · 24 წმ)');
    expect(studio).not.toContain('სავარაუდო დრო: ~5–10 წუთი');
  });

  it('the planning line is posted with the board\'s count and length, and corrected to what the plan returned', () => {
    expect(body).toContain('text: storyboardPlanningNotice(locale, sceneCount, planSec)');
    expect(body).toContain('storyboardPlanningNotice(locale, planned.length, planSec)');
    // Posted after the count and length are known, not before.
    expect(body.indexOf('const sceneCount =')).toBeLessThan(body.indexOf('storyboardPlanningNotice(locale, sceneCount'));
  });
});
