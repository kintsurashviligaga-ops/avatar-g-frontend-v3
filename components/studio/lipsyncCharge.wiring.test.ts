/** @jest-environment node */
/**
 * Gap C2 (Agent G PART 5): a film's lip-sync pass is its own /api/video/lipsync charge (the avatar price, reserved when the
 * job starts, refunded when the render fails), and the film's quote never showed it. Pinned on OmniStudio's source: the
 * studio is one large client component, and these are the connections no component test can see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
/** Source without comments: the explanations quote the code they replaced. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('the lip-sync charge is shown where the film is confirmed', () => {
  test('one value, from the pure helper, on the same condition renderFilm uses to run the pass', () => {
    expect(code).toContain("const filmLipsyncCredits = lipsyncAddOnCredits({ mode: videoMode, lipsyncOn: videoLipsync, hasDialogue: videoSpeech.trim().length > 0 });");
    // renderFilm's own condition, unchanged — the helper mirrors it (lib/video/createPanel.test.ts pins the helper's cases).
    expect(code).toContain('const wantsLipsync = (isMusicVideo && videoLipsync) || (!isMusicVideo && hasDialogue);');
  });

  test('the create screen\'s Generate and the storyboard\'s Generate both carry it; a director run (no pass) carries none', () => {
    expect(code).toMatch(/onTopUp: \(\) => window\.dispatchEvent\(new CustomEvent\('myavatar:open-credits'\)\),\s*lipsyncCredits: filmLipsyncCredits,/);
    expect(code).toContain('lipsyncCredits={directorRunsOn ? 0 : filmLipsyncCredits}');
    expect(code).toContain('data-testid="storyboard-lipsync-addon"');
  });

  test('the film\'s own price is untouched: the storyboard button still shows videoQuote alone', () => {
    expect(code).toMatch(/price=\{videoQuote\(\{ seconds: storyboard\.scenes\.length \* \(storyboard\.clipSec \?\? FILM_CLIP_SEC\), tier: veoPlan\.tier, mode: videoMode \}\)\}/);
  });

  test('the music video\'s Lip-sync switch names its price', () => {
    expect(code).toContain("creditsLabel(quoteCredits({ tool: 'avatar' }), locale)");
  });
});

describe('the pass itself says what happened to the money', () => {
  test('both lip-sync legs go through one runner that re-reads the balance and reports a 402 as no_credits', () => {
    expect(code).toContain('async function runLipsyncJob(');
    expect(code).toMatch(/if \(r\.status === 402 \|\| j\.code === 'insufficient_credits'\) return \{ url: null, noCredits: true \};/);
    expect(code).toMatch(/function heygenSingerPerformance\([\s\S]*?\): Promise<LipsyncOutcome> \{[\s\S]*?return runLipsyncJob\(/);
    expect(code).toMatch(/function heygenSpeakingHead\([\s\S]*?\): Promise<LipsyncOutcome> \{[\s\S]*?return runLipsyncJob\(/);
  });

  test('a short balance is named as such on both legs, never as "engine unavailable"', () => {
    expect(code).toMatch(/if \(sung\.noCredits\) \{\s*patchLipsyncCard\('skipped', lipsyncSkipReason\('no_credits', locale\)\);/);
    expect(code).toMatch(/if \(composited === NO_LIPSYNC_CREDITS\) \{ patchLipsyncCard\('skipped', lipsyncSkipReason\('no_credits', locale\)\); \}/);
  });

  test('a paid singer clip the montage could not use is named as saved in the Library (the route files it there)', () => {
    for (const r of ['short_result', 'no_clips', 'composite_failed']) {
      expect(code).toContain(`lipsyncSkipReason('${r}', locale, { saved: true })`);
    }
  });
});
