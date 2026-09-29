import {
  __resetVeoPlanIds, DEFAULT_CAMERA, formatForOrientation, hasCustomCamera, initialVeoPlan, isCroppedFormat,
  joinTransitions, orientationFor, planNotices, sceneCount, sceneCountFor, toRenderOptions, veoPlanReducer,
  type VeoPlan, type VeoPlanAction,
} from './veoPlan';

const run = (plan: VeoPlan, ...actions: VeoPlanAction[]) => actions.reduce(veoPlanReducer, plan);

beforeEach(() => __resetVeoPlanIds());

describe('the scene grid follows the length', () => {
  it('8 / 24 / 48 s are 1 / 3 / 6 clips of 8 s', () => {
    expect([8, 24, 48].map((l) => sceneCountFor(l as 8 | 24 | 48))).toEqual([1, 3, 6]);
    expect(sceneCount(initialVeoPlan())).toBe(3); // 24 s default
  });

  it('growing keeps every scene the user wrote and adds blank ones with the default camera and join', () => {
    const p = run(initialVeoPlan(), { type: 'sceneText', index: 1, text: 'she opens the door' }, { type: 'cameraAll', camera: { move: 'push_in' } }, { type: 'length', lengthSec: 48 });
    expect(p.scenes).toHaveLength(6);
    expect(p.scenes[1]!.text).toBe('she opens the door');
    expect(p.scenes[5]!.camera.move).toBe('push_in');
    expect(p.scenes[5]!.transitionOut).toBe('cut');
    expect(new Set(p.scenes.map((s) => s.id)).size).toBe(6); // stable, unique keys
  });

  it('shrinking keeps the first scenes as they were', () => {
    const p = run(initialVeoPlan({ lengthSec: 48 }), { type: 'sceneText', index: 0, text: 'a' }, { type: 'length', lengthSec: 8 });
    expect(p.scenes).toHaveLength(1);
    expect(p.scenes[0]!.text).toBe('a');
  });
});

describe('the Veo contract is enforced in the state, not discovered at render time', () => {
  it('Lite has no reference images: picking Lite hands the photos back to the first-frame path', () => {
    const p = run(initialVeoPlan(), { type: 'referenceMode', mode: 'reference' }, { type: 'tier', tier: 'lite' });
    expect(p.tier).toBe('lite');
    expect(p.referenceMode).toBe('first_frame');
  });

  it('choosing references on Lite moves the tier up to Standard', () => {
    const p = run(initialVeoPlan({ tier: 'lite' }), { type: 'referenceMode', mode: 'reference' });
    expect(p.referenceMode).toBe('reference');
    expect(p.tier).toBe('standard');
  });

  it('camera intensity is clamped to 1…10 and merged, not replaced', () => {
    const p = run(initialVeoPlan(), { type: 'sceneCamera', index: 0, camera: { move: 'pan_left', intensity: 99 } }, { type: 'sceneCamera', index: 0, camera: { shot: 'close_up' } });
    expect(p.scenes[0]!.camera).toEqual({ ...DEFAULT_CAMERA, move: 'pan_left', intensity: 10, shot: 'close_up' });
    expect(p.scenes[1]!.camera).toEqual(DEFAULT_CAMERA);
  });

  it('an out-of-range scene index is a no-op', () => {
    const p0 = initialVeoPlan();
    expect(veoPlanReducer(p0, { type: 'sceneText', index: 9, text: 'x' })).toBe(p0);
  });

  it('the negative prompt is capped at 800 characters', () => {
    expect(run(initialVeoPlan(), { type: 'negative', text: 'x'.repeat(2000) }).negativePrompt).toHaveLength(800);
  });
});

describe('a script fills the timeline', () => {
  it('loads scene texts in order and can resize the grid to fit', () => {
    const p = run(initialVeoPlan({ lengthSec: 8 }), { type: 'loadScenes', texts: ['one', ' two ', '', 'three'], lengthSec: 24 });
    expect(p.lengthSec).toBe(24);
    expect(p.scenes.map((s) => s.text)).toEqual(['one', 'two', 'three']);
  });

  it('an empty script changes nothing', () => {
    const p0 = initialVeoPlan();
    expect(veoPlanReducer(p0, { type: 'loadScenes', texts: ['  '] })).toBe(p0);
  });
});

describe('what the server receives', () => {
  it('per-scene cameras and joins travel; the scene texts do not (they go through the storyboard)', () => {
    const p = run(initialVeoPlan(), { type: 'sceneCamera', index: 2, camera: { move: 'orbit' } }, { type: 'sceneTransition', index: 0, transition: 'dissolve' }, { type: 'negative', text: '  text, watermark ' });
    const o = toRenderOptions(p);
    expect(o.scenes).toHaveLength(3);
    expect(o.scenes[2]!.camera.move).toBe('orbit');
    expect(o.scenes[0]!.transitionOut).toBe('dissolve');
    expect(o.negativePrompt).toBe('text, watermark');
    expect(JSON.stringify(o)).not.toContain('"text"');
    expect(joinTransitions(p)).toEqual(['dissolve', 'cut']);
  });

  it('a blank negative is omitted, not sent empty', () => {
    expect(toRenderOptions(initialVeoPlan())).not.toHaveProperty('negativePrompt');
  });

  it('hasCustomCamera is false until a scene departs from auto', () => {
    expect(hasCustomCamera(initialVeoPlan())).toBe(false);
    expect(hasCustomCamera(run(initialVeoPlan(), { type: 'sceneCamera', index: 1, camera: { angle: 'low' } }))).toBe(true);
  });
});

describe('formats', () => {
  it('orientation round-trips for every format', () => {
    for (const f of ['9:16', '16:9', '1:1', '4:5'] as const) expect(formatForOrientation(orientationFor(f))).toBe(f);
  });

  it('only 1:1 and 4:5 are cropped, and the notice says so', () => {
    expect(['9:16', '16:9', '1:1', '4:5'].map((f) => isCroppedFormat(f as '9:16'))).toEqual([false, false, true, true]);
    const n = planNotices(initialVeoPlan({ format: '4:5' }), { audioToggle: true });
    expect(n.map((x) => x.id)).toContain('cropped');
    expect(n.find((x) => x.id === 'cropped')!.ka).toContain('9:16');
  });

  it('turning Veo sound off on a connection that cannot is flagged, not silently ignored', () => {
    const p = run(initialVeoPlan(), { type: 'nativeAudio', on: false });
    expect(planNotices(p, { audioToggle: false }).map((x) => x.id)).toContain('audio-fixed');
    expect(planNotices(p, { audioToggle: true }).map((x) => x.id)).not.toContain('audio-fixed');
  });
});
