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
import { filmAssembleBody, type FilmStudioMatrix } from '@/lib/chat/filmStudioClient';

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
    expect(studio).toMatch(/const v = planFinalDuration\(a\.durationSec, videoCaps, videoPlanOpts\);/);
    expect(studio).toMatch(/applied\.durationRefused = v\.reason;/);
  });
  test('the Image Studio storyboard hand-over plans its length the same way, and a refused one is said', () => {
    expect(studio).toMatch(/const sbPlan = planFinalDuration\(Number\(sb\.duration\), videoCaps, videoPlanOpts\);/);
    expect(studio).toMatch(/describeDurationBlock\(sbPlan, locale\)/);
  });
});

describe('chat → the Video tool, with the plan said (AC-01 · §3)', () => {
  test("the chat step 'open' is handled: mode, length through the contract, storyboard planned on that grid", () => {
    expect(studio).toMatch(/case 'open': \{/);
    expect(studio).toMatch(/const v = planFinalDuration\(step\.durationSec, videoCaps, videoPlanOpts\);/);
    expect(studio).toMatch(/lengthNote = describeDurationPlan\(v\.plan, locale\);/);
    expect(studio).toMatch(/say\(`\$\{describeDurationBlock\(v, locale\)\}/);
    // Round 3 (browser defect 24): the step hands over the mode it decided, so the plan is a music video in the same tick.
    expect(studio).toMatch(/void createStoryboard\(text, routeRefs, routeOrientation, \{ nativeSec, musicVideoMode: step\.videoMode === 'musicvideo' \}\);/);
  });
  test('no length in the words → the panel default, named — never the last project\'s length', () => {
    expect(studio).toMatch(/nativeSec = VIDEO_PANEL_DEFAULTS\.duration;/);
  });
  test('the storyboard takes the grid it is planned on, not the closure\'s stale length', () => {
    expect(studio).toMatch(/opts\?: \{ nativeSec\?: number; musicVideoMode\?: boolean \}\) => \{/);
    expect(studio).toMatch(/const musicVideoMode = opts\?\.musicVideoMode \?\? videoMode === 'musicvideo';/);
    expect(studio).toMatch(/const planSec = opts\?\.nativeSec \?\? videoDuration;/);
    expect(studio).toMatch(/sceneCountForSeconds\(planSec\)/);
    expect(studio).toMatch(/clipSecForSeconds\(planSec\)/);
  });
});

describe('the panel says requested · rendered · final, and a pick on it drops the request', () => {
  test('OmniStudio binds the request to the panel and clears it on a pick', () => {
    expect(studio).toMatch(/onSeconds=\{\(s\) => \{ setVideoDuration\(s\); setVideoRequestedSec\(null\); \}\}/);
    expect(studio).toMatch(/requestedSec=\{videoRequestedSec\}\s*joinOverlapSec=\{videoPlanOpts\.joinOverlapSec\}/);
  });
  test('the panel and the length sheet draw the plan line from the one contract', () => {
    expect(panel).toMatch(/const requestPlan = activePlan\(p\.requestedSec, seconds, caps, \{ joinOverlapSec: p\.joinOverlapSec \?\? 0 \}\);/);
    expect(panel).toMatch(/requestPlan\.deviation === 'trim' \? requestPlan : null/);
    expect(panel).toMatch(/data-testid="video-duration-plan"/);
    expect(panel).toMatch(/requestedSec=\{p\.requestedSec \?\? null\} joinOverlapSec=\{p\.joinOverlapSec \?\? 0\}/);
    expect(pickers).toMatch(/const requestPlan = activePlan\(requestedSec, seconds, caps, \{ joinOverlapSec: joinOverlapSec \?\? 0 \}\);/);
    expect(pickers).toMatch(/data-testid="video-duration-plan-sheet"/);
  });
});

describe('the final length reaches the render and the server cuts to it, or refuses (§4 · §8)', () => {
  test('the render snapshot carries finalDurationSec only when the request was planned on the grid that renders', () => {
    // raw source: the comment stripper swallows this region (a '/*' inside a string literal above it)
    expect(read('components/studio/OmniStudio.tsx')).toMatch(/const videoPlanOpts = useMemo\(\(\) => \(\{ joinOverlapSec: joinOverlapFor\(veoPlan\.transitionDefault\) \}\), \[veoPlan\.transitionDefault\]\);/);
    expect(studio).toMatch(/const stitchOfRender = stitchedSeconds\(renderSceneCount, filmClipSec \?\? FILM_CLIP_SEC, composeTransitionRender\(videoTransition, renderJoins\), VIDEO_FPS\);/);
    expect(studio).toMatch(/const requestedCut = videoRequestedSec !== null \? finalCutForAssemble\(stitchOfRender, videoRequestedSec\) : null;/);
    expect(studio).toMatch(/describeFinalCutRefusal\(requestedCut, locale\)\}`, retryVideo: true, retryReq: \{ filmPrompt, refs, orientation \} \}\]\);\s*return Promise\.resolve\(\);/);
    expect(studio).toMatch(/const finalDurationSec = requestedCut \? requestedCut\.finalSec : quantizeToFrames\(stitchOfRender\);/);
    expect(studio).toMatch(/\.\.\.\(finalDurationSec !== undefined \? \{ finalDurationSec \} : \{\}\),/);
    expect(studio).toMatch(/\.\.\.\(typeof finalDurationSec === 'number' \? \{ finalDurationSec \} : \{\}\),/);
  });
  test('the film client posts it to the assembler', () => {
    expect(filmClient).toMatch(/finalDurationSec\?: number;/);
    const partial: FilmStudioMatrix = {
      sceneCount: 3, clipSec: 8, seed: 1, storyboard: 'succeeded', stitch: 'pending', audio: 'skipped',
      clips: [
        { ordinal: 1, status: 'succeeded', url: 'https://storage.example/one.mp4' },
        { ordinal: 2, status: 'failed', url: null },
        { ordinal: 3, status: 'succeeded', url: 'https://storage.example/three.mp4' },
      ],
    };
    // A failed scene cannot remove the requested duration from either driver's HTTP body.
    const body = JSON.parse(JSON.stringify(filmAssembleBody({ finalDurationSec: 24 }, partial, 'brief')));
    expect(body).toMatchObject({ finalDurationSec: 24, expectedSegments: 3 });
    expect(body.segments).toHaveLength(2);
    // The body is built once (filmAssembleBody) for the tab and for the server that finishes a film whose tab closed.
    expect(filmClient).toMatch(/const finalDurationSec = finalContractForCut\(plan\.finalDurationSec, clipUrls\.length, scenesPlanned\);/);
    expect(filmClient).toMatch(/const assembledRes = await assembleMaster\(filmFollowPlan\(opts\), matrix, message, opts\.myVoiceNarration, signal\);/);
    expect(filmClient).toMatch(/body: JSON\.stringify\(filmAssembleBody\(plan, matrix, scorePrompt, finalVoiceUrl\)\),/);
    expect(filmClient).not.toMatch(/\{ finalDurationSec: plan\.finalDurationSec \}/);
  });
  test('legacy salvage still reports the dropped clip count in the response and client result', () => {
    expect(route).toMatch(/const clipsDropped = handedOver\.length - segments\.length;/);
    expect(route).toMatch(/\.\.\.\(clipsDropped > 0 \? \{ clipsDropped \} : \{\}\)/);
    expect(filmClient).toMatch(/scenesRendered: clips\.length - \(assembledRes && 'clipsDropped' in assembledRes \? \(assembledRes\.clipsDropped \?\? 0\) : 0\),/);
  });
  it('the film stitch asks for a signed-in caller before it probes any clip URL (final review 2026-10-13)', () => {
    const gate = route.indexOf('const gate = requireAuthForGeneration(uid);');
    const probe = route.indexOf('const segments = await keepLiveClips(handedOver);');
    const links = route.indexOf("error: 'invalid_media_url'");
    expect(gate).toBeGreaterThan(-1);
    expect(probe).toBeGreaterThan(-1);
    expect(links).toBeGreaterThan(-1);
    expect(links).toBeLessThan(probe);
    expect(gate).toBeLessThan(probe);
    expect(route.split('requireAuthForGeneration(uid)').length - 1).toBe(1);
  });
  test('the route checks it against the clips BEFORE any charge, and answers 400 with the reason', () => {
    const check = route.indexOf('finalCutForAssemble(stitchSec, body.finalDurationSec)');
    expect(route).toMatch(/const stitchSec = stitchedSeconds\(segments\.length, clipSecOfRender, \{ \.\.\.\(filmTokenId \? \{ transition: 'cut' \} : \{\}\), \.\.\.\(body\.globalRender \?\? \{\}\) \}, VIDEO_FPS\);/);
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
    expect(assembler).toMatch(/const stitchSec = inputs\.length \* clipSec - overlapSec\.reduce\(\(a, b\) => a \+ b, 0\);/);
    expect(assembler).toMatch(/const masterDurSec = finalRequested !== null \? stitchSec : expectedMasterDuration\(inputs\.length, clipSec, transSec\);/);
    expect(assembler).toMatch(/\.\.\.\(finalRequested !== null \? \{ padToTarget: false \} : \{\}\),/);
    expect(assembler).toMatch(/const \{ transition, transitions: joinTransitions \} = resolveJoins\(segs\.length, g\);/);
    expect(assembler).toMatch(/if \(finalCut && !finalCut\.ok\) throw new Error\(`final duration refused/);
    expect(assembler).toMatch(/'-t', String\(deliverSec\),/);
    expect(assembler).toMatch(/expectedDurSec: deliverSec,/);
    expect(assembler).not.toMatch(/'-t', String\(masterDurSec\),/);
  });
});

describe('§5 · a storyboard miss is SAID with a Retry — nothing renders, nothing is charged, on its own', () => {
  test('both fail-open renders are gone from createStoryboard', () => {
    expect(studio).not.toMatch(/startFilmRender\(filmPrompt, refs, orientation, undefined\)/);
  });
  test('the plan miss and the thrown plan call both post the error card whose Retry plans the storyboard again', () => {
    expect(studio).toMatch(/const failVisible = \(body\?: unknown\) => \{\s*if \(ac\.signal\.aborted\) return;/);
    expect(studio).toMatch(/describeOpFailure\(body, t\.sbFailed\)\}`, retryVideo: true, retryReq: \{ filmPrompt, refs, orientation \} \}\]\);/);
    expect(studio).toMatch(/failVisible\(j\);[^\n]*\n\s*return;/);
    expect(studio).toMatch(/if \(ac\.signal\.aborted\) return;[^\n]*\n\s*failVisible\(\);/);
    // The Retry plans the storyboard again; while another generation is busy it stays on the card, disabled (Phase 2 PR 6).
    expect(studio).toMatch(/onRetry=\{r \? \(\) => void createStoryboard\(r\.filmPrompt, r\.refs, r\.orientation\) : undefined\}\s*retryBlocked=\{busy\}/);
  });
});

describe('§6 · above the film ceiling it is the long-form route or a refusal with the reason — never a 96 s film', () => {
  test("the chat step's refusal returns before the board is planned", () => {
    const open = studio.slice(studio.indexOf("case 'open': {"));
    const refusal = open.indexOf('if (!v.ok) {');
    const planned = open.indexOf("void createStoryboard(text, routeRefs, routeOrientation, { nativeSec, musicVideoMode: step.videoMode === 'musicvideo' });");
    expect(refusal).toBeGreaterThan(0);
    expect(planned).toBeGreaterThan(refusal);
    const branch = open.slice(refusal, open.indexOf('nativeSec = v.plan.nativeSec;'));
    expect(branch).toMatch(/describeDurationBlock\(v, locale\)/);
    expect(branch).toMatch(/return true;/);
  });
  test('long-form stays closed by the one switch the owner flips; the picker reads the server, never a stop list', () => {
    const createPanel = code(read('lib/video/createPanel.ts'));
    expect(createPanel).toMatch(/export const LONGFORM_ORDER_WIRED = false;/);
    expect(createPanel).toMatch(/export function effectiveCapabilities\(server: VideoCapabilities, wired: boolean = LONGFORM_ORDER_WIRED\)/);
  });
});

describe('the storyboard is approved as a REVISION, and the render is checked against it (§5)', () => {
  const orchestrateRoute = code(read('app/api/chat/orchestrate/route.ts'));
  test('the studio snapshots a revision on every board change and approves the render FROM it at the tap', () => {
    expect(studio).toMatch(/const storyboardRevisionRef = useRef<StoryboardRevision \| null>\(null\);/);
    expect(studio).toMatch(/storyboardRevisionRef\.current = snapshotRevision\(storyboard, inferOrigin\(storyboardPrevBoardRef\.current, storyboard\), storyboardRevisionRef\.current\);/);
    expect(studio).toMatch(/const approvedRev = snapshotRevision\(sb, inferOrigin\(storyboardPrevBoardRef\.current, sb\), storyboardRevisionRef\.current\);/);
    expect(studio).toMatch(/const storyboardApproval = approvalForRender\(approvedRev, sb\);/);
  });
  test('the scene texts the render sends are derived by the ONE function the server checks them with', () => {
    expect(studio).toMatch(/const scripts = renderScriptsFor\(sb\) \?\? undefined;/);
    expect(studio).not.toMatch(/sb\.scenes\.map\(\(s, i\) => \(s\.edited && s\.prompt\.trim\(\) \? s\.prompt\.trim\(\) : \(sb\.sceneScripts\?\.\[i\] \?\? s\.prompt\)\)\)/);
  });
  test('the approval rides in the submit snapshot to the film client, and the client posts it', () => {
    expect(studio).toMatch(/sb\.sceneMeta\?\.length === sb\.scenes\.length \? sb\.sceneMeta : undefined, storyboardApproval\);/);
    expect(studio).toMatch(/\.\.\.\(storyboardApproval \? \{ storyboardApproval \} : \{\}\),/);
    expect(filmClient).toMatch(/storyboardApproval\?: RenderApprovalWire;/);
    expect(filmClient).toMatch(/\.\.\.\(opts\.storyboardApproval \? \{ storyboardApproval: opts\.storyboardApproval \} : \{\}\),/);
  });
  test('the director path carries the same approval: the tap approves BEFORE the branch, the overlay posts it, the runs route checks it first (round 3 P1)', () => {
    const approve = studio.indexOf('const storyboardApproval = approvalForRender(approvedRev, sb);');
    const branch = studio.indexOf('if (directorRunsOn) {');
    expect(approve).toBeGreaterThan(0);
    expect(branch).toBeGreaterThan(approve);
    expect(studio).toMatch(/approval: storyboardApproval,/);
    expect(studio).toMatch(/approval=\{directorBoard\.approval\}/);
    const overlay = code(read('components/studio/video/DirectorRunOverlay.tsx'));
    expect(overlay).toMatch(/postJson\('\/api\/video\/director\/runs', \{ storyboard, \.\.\.\(approval \? \{ storyboardApproval: approval \} : \{\}\), locale \}\)/);
    const runsRoute = code(read('app/api/video/director/runs/route.ts'));
    const check = runsRoute.indexOf('const verdict = checkStoryboardApproval(draft, approval as RenderApprovalWire);');
    const refuse = runsRoute.indexOf("error: 'revision_mismatch'");
    const frozen = runsRoute.indexOf('const storyboard = freeze(draft);');
    expect(check).toBeGreaterThan(0);
    expect(refuse).toBeGreaterThan(check);
    expect(frozen).toBeGreaterThan(refuse);
  });
  test('a follow-up on a delivered montage (add clips / swap the music) is answered as unsupported BEFORE the montage lane or the model sees it (round 3 AC-23)', () => {
    const follow = studio.indexOf("if (mode === 'chat' && agentMontageOn && attachments.length > 0 && messages.some((m) => m.montage)) {");
    const say = studio.indexOf('text: followUpUnsupportedText(follow, locale), notice: true');
    const lane = studio.indexOf("if (mode === 'chat' && agentMontageOn && attachments.length > 1) {");
    expect(follow).toBeGreaterThan(0);
    expect(say).toBeGreaterThan(follow);
    expect(lane).toBeGreaterThan(say);
  });
  test('the orchestrate route validates the approval BEFORE the orchestrator is called, and refuses with revision_mismatch', () => {
    const check = orchestrateRoute.indexOf('const verdict = validateRenderApproval(data.storyboardApproval, {');
    const refuse = orchestrateRoute.indexOf("error: 'revision_mismatch'");
    const call = orchestrateRoute.indexOf('const response = await orchestrate({');
    expect(check).toBeGreaterThan(0);
    expect(refuse).toBeGreaterThan(check);
    expect(call).toBeGreaterThan(refuse);
  });
});
