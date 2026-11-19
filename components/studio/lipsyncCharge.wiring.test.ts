/** @jest-environment node */
/**
 * Gap C2 (Agent G PART 5): a film's lip-sync pass was its own /api/video/lipsync charge, and the film's quote never showed
 * it. v5.1 M-14 removed the pass (and the route): the switch is always off, so its add-on prices to 0. Pinned on OmniStudio's source: the
 * studio is one large client component, and these are the connections no component test can see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'components/studio/OmniStudio.tsx'), 'utf8');
/** Source without comments: the explanations quote the code they replaced. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

describe('the lip-sync charge is shown where the film is confirmed', () => {
  test('one value, from the pure helper, on the same condition renderFilm uses to run the pass', () => {
    expect(code).toMatch(/const filmLipsyncCredits = lipsyncAddOnCredits\(\{\s*mode: videoMode, lipsyncOn: videoLipsync, hasDialogue: videoSpeech\.trim\(\)\.length > 0,\s*veoSpeaks: veoSpeaksTypedLine\(\{ speech: videoSpeech, sceneCount: sceneCountForSeconds\(videoDuration\), nativeAudio: veoPlan\.nativeAudio \}\),\s*\}\);/);
    // renderFilm runs the pass on the SAME helper (filmLipsyncRuns is what lipsyncAddOnCredits prices), with the same
    // "Veo says the typed line" test on the job's own snapshot (lib/video/createPanel.test.ts pins the helpers' cases).
    expect(code).toMatch(/const veoSpeaks = veoSpeaksTypedLine\(\{\s*speech: videoSpeech,\s*sceneCount: storyboardScenes\?\.length \|\| sceneScripts\?\.length \|\| sceneCountForSeconds\(videoDuration\),\s*nativeAudio: veo\.generateAudio,\s*\}\);/);
    expect(code).toContain("const wantsLipsync = filmLipsyncRuns({ mode: isMusicVideo ? 'musicvideo' : 'documentary', lipsyncOn: videoLipsync, hasDialogue, veoSpeaks });");
  });

  test('a restored storyboard\'s Generate carries it; a director run (no pass) carries none', () => {
    // The Video tool's create screen is ONE clip now (GG 2026-10-25 16:10Z): no lip-sync pass, so no add-on on it.
    expect(code).not.toContain('generate={{ lipsyncCredits: filmLipsyncCredits }}');
    expect(code).toContain('lipsyncCredits={directorRunsOn ? 0 : filmLipsyncCredits}');
    expect(code).toContain('data-testid="storyboard-lipsync-addon"');
  });

  test('the film\'s own price is untouched: the storyboard button still shows videoQuote alone', () => {
    expect(code).toMatch(/price=\{videoQuote\(\{ seconds: storyboard\.scenes\.length \* \(storyboard\.clipSec \?\? FILM_CLIP_SEC\), tier: veoPlan\.tier, mode: videoMode \}\)\}/);
  });

  test('the music video\'s Lip-sync switch names its price (the video panel, GG 2026-10-18)', () => {
    const panel = readFileSync(join(process.cwd(), 'components/studio/create/VideoCreatePanel.tsx'), 'utf8');
    expect(panel).toContain("const lipsyncPrice = creditsLabel(quoteCredits({ tool: 'avatar' }), locale);");
    expect(panel).toContain('sub={vc(VIDEO_COPY.lipsyncSub(lipsyncPrice), locale)}');
  });
});

describe('the pass is removed (v5.1 M-14, GG 2026-11-12)', () => {
  test('the switch is always off, so no lip-sync job starts and no add-on is charged', () => {
    expect(code).toContain('const videoLipsync = false;');
    expect(code).not.toContain("fetch('/api/video/lipsync");
    expect(code).not.toContain('async function runLipsyncJob(');
    expect(code).toContain("patchLipsyncCard('skipped', lipsyncSkipReason('not_requested', locale));");
  });
});
