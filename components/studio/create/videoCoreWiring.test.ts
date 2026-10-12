/** @jest-environment node */
/**
 * Video Core v1.0 — the studio's wiring of the duration contract, pinned on the source (OmniStudio is one 12,000-line client
 * component; a source pin is the cheapest way to say "this connection exists, and the old one is gone"). Evidence level T2.
 *
 * Each assertion is a way the contract could silently come undone: the nearest stop sold as the length again
 * (snapVideoSeconds back in the live tool or the storyboard hand-over), the chat step not opening the Video tool, the
 * panel's plan line unbound, a tap on the length picker keeping a stale request, the final length not reaching the render.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/** Source without comments: the fixes' own explanations quote the code they replaced. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const studio = code(read('components/studio/OmniStudio.tsx'));
const panel = code(read('components/studio/create/VideoCreatePanel.tsx'));
const pickers = code(read('components/studio/create/VideoPickers.tsx'));
const filmClient = code(read('lib/chat/filmStudioClient.ts'));
const route = code(read('app/api/video/assemble/route.ts'));
const assembler = code(read('lib/orchestrator/ffmpeg-assembly.ts'));

describe('no silent snap: the nearest stop is never sold as the length (AC-04)', () => {
  test('snapVideoSeconds is gone from the studio; the contract is read instead', () => {
    expect(studio).not.toMatch(/snapVideoSeconds/);
    expect(studio).toMatch(/from '@\/lib\/video\/durationContract'/);
    expect(studio).toMatch(/const \[videoRequestedSec, setVideoRequestedSec\] = useState<number \| null>\(null\)/);
  });
  test('the live tool plans the length through the contract and reports a refusal instead of changing the panel', () => {
    expect(studio).toMatch(/const v = planFinalDuration\(a\.durationSec, videoCaps\);/);
    expect(studio).toMatch(/applied\.durationRefused = v\.reason;/);
  });
  test('the Image Studio storyboard hand-over plans its length the same way, and a refused one is said', () => {
    expect(studio).toMatch(/const sbPlan = planFinalDuration\(Number\(sb\.duration\), videoCaps\);/);
    expect(studio).toMatch(/describeDurationBlock\(sbPlan, locale\)/);
  });
});

describe('chat → the Video tool, with the plan said (AC-01 · §3)', () => {
  test("the chat step 'open' is handled: mode, length through the contract, storyboard planned on that grid", () => {
    expect(studio).toMatch(/case 'open': \{/);
    expect(studio).toMatch(/const v = planFinalDuration\(step\.durationSec, videoCaps\);/);
    expect(studio).toMatch(/lengthNote = describeDurationPlan\(v\.plan, locale\);/);
    expect(studio).toMatch(/say\(`\$\{describeDurationBlock\(v, locale\)\}/);
    expect(studio).toMatch(/void createStoryboard\(text, routeRefs, routeOrientation, \{ nativeSec \}\);/);
  });
  test('no length in the words → the panel default, named — never the last project\'s length', () => {
    expect(studio).toMatch(/nativeSec = VIDEO_PANEL_DEFAULTS\.duration;/);
  });
  test('the storyboard takes the grid it is planned on, not the closure\'s stale length', () => {
    expect(studio).toMatch(/opts\?: \{ nativeSec\?: number \}\) => \{/);
    expect(studio).toMatch(/const planSec = opts\?\.nativeSec \?\? videoDuration;/);
    expect(studio).toMatch(/sceneCountForSeconds\(planSec\)/);
    expect(studio).toMatch(/clipSecForSeconds\(planSec\)/);
  });
});

describe('the panel says requested · rendered · final, and a pick on it drops the request', () => {
  test('OmniStudio binds the request to the panel and clears it on a pick', () => {
    expect(studio).toMatch(/onSeconds=\{\(s\) => \{ setVideoDuration\(s\); setVideoRequestedSec\(null\); \}\}/);
    expect(studio).toMatch(/requestedSec=\{videoRequestedSec\}/);
  });
  test('the panel and the length sheet draw the plan line from the one contract', () => {
    expect(panel).toMatch(/const requestPlan = activePlan\(p\.requestedSec, seconds, caps\);/);
    expect(panel).toMatch(/requestPlan\.deviation === 'trim' \? requestPlan : null/);
    expect(panel).toMatch(/data-testid="video-duration-plan"/);
    expect(panel).toMatch(/requestedSec=\{p\.requestedSec \?\? null\}/);
    expect(pickers).toMatch(/const requestPlan = activePlan\(requestedSec, seconds, caps\);/);
    expect(pickers).toMatch(/data-testid="video-duration-plan-sheet"/);
  });
});

describe('the final length reaches the render and the server cuts to it, or refuses (§4 · §8)', () => {
  test('the render snapshot carries finalDurationSec only when the request was planned on the grid that renders', () => {
    expect(studio).toMatch(/const nativeOfRender = renderSceneCount \* \(filmClipSec \?\? FILM_CLIP_SEC\);/);
    expect(studio).toMatch(/requestedPlan\.ok && requestedPlan\.plan\.nativeSec === nativeOfRender \? requestedPlan\.plan\.finalSec : undefined/);
    expect(studio).toMatch(/\.\.\.\(finalDurationSec !== undefined \? \{ finalDurationSec \} : \{\}\),/);
    expect(studio).toMatch(/\.\.\.\(typeof finalDurationSec === 'number' \? \{ finalDurationSec \} : \{\}\),/);
  });
  test('the film client posts it to the assembler', () => {
    expect(filmClient).toMatch(/finalDurationSec\?: number;/);
    expect(filmClient).toMatch(/\.\.\.\(typeof finalDurationSec === 'number' && finalDurationSec > 0 \? \{ finalDurationSec \} : \{\}\),/);
    expect(filmClient).toMatch(/opts\.joinTransitions \?\? null, opts\.finalDurationSec \?\? null\);/);
  });
  test('the route checks it against the clips BEFORE any charge, and answers 400 with the reason', () => {
    const check = route.indexOf('finalCutForAssemble(nativeTotalSec, body.finalDurationSec)');
    const charge = route.indexOf('await lockTokens(uid, assembleCost, 900)');
    const tracker = route.indexOf('await recordFilmAssembling(filmTokenId)');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(charge);
    expect(check).toBeLessThan(tracker);
    expect(route).toMatch(/error: 'final_duration_invalid',\s*reason: finalCut\.reason,/);
  });
  test('the single clip is cut fail-CLOSED; the multi-scene master is cut by the CPU assembler, never the GPU worker', () => {
    expect(route).toMatch(/if \(finalCut\?\.ok && finalCut\.trimSec > 0\) \{\s*master = await cutMasterToLength\(master, finalCut\.finalSec\);/);
    expect(route).toMatch(/const work = cfg && !finalCut\s*\? dispatchRunPod\(/);
    expect(route).toMatch(/\.\.\.\(finalCut\?\.ok \? \{ finalDurationSec: finalCut\.finalSec \} : \{\}\),/);
  });
  test('the assembler re-checks, renders the contract on the 30 fps timeline and stops the master at the final length', () => {
    expect(assembler).toMatch(/const fps = String\(g\.fps\) === '60' \? 60 : finalRequested !== null \? VIDEO_FPS : 24;/);
    expect(assembler).toMatch(/const finalCut = finalRequested !== null \? finalCutForAssemble\(masterDurSec, finalRequested\) : null;/);
    expect(assembler).toMatch(/if \(finalCut && !finalCut\.ok\) throw new Error\(`final duration refused/);
    expect(assembler).toMatch(/'-t', String\(deliverSec\),/);
    expect(assembler).toMatch(/expectedDurSec: deliverSec,/);
    expect(assembler).not.toMatch(/'-t', String\(masterDurSec\),/);
  });
});
