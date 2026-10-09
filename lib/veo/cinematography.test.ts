/** @jest-environment node */
import {
  CAMERA_ANGLES,
  CAMERA_MOVES,
  LENS_LOOKS,
  SHOT_SIZES,
  NEUTRAL_INTENSITY,
  cameraPhrase,
  clampIntensity,
  motionVector,
  nativeCameraControl,
  speedAdverb,
  type CinematographyOption,
} from './cinematography';
import type { CameraAngle, CameraMove, CameraSpec, LensLook, ShotSize, VertexCameraControl } from './types';

const ALL_MOVES: CameraMove[] = [
  'auto', 'static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'push_in', 'pull_out', 'truck_left',
  'truck_right', 'pedestal_up', 'pedestal_down', 'zoom_in', 'zoom_out', 'orbit', 'crane_up', 'crane_down',
  'aerial', 'handheld',
];
const ALL_SHOTS: ShotSize[] = ['auto', 'extreme_wide', 'wide', 'full', 'medium', 'medium_close', 'close_up', 'extreme_close_up'];
const ALL_ANGLES: CameraAngle[] = ['auto', 'eye_level', 'low', 'high', 'birds_eye', 'worms_eye', 'dutch', 'over_shoulder', 'pov'];
const ALL_LENSES: LensLook[] = ['auto', 'wide_angle', 'standard', 'telephoto', 'macro', 'shallow_focus', 'deep_focus'];

const GEORGIAN = /[Ⴀ-ჿ]/;

function spec(partial: Partial<CameraSpec> = {}): CameraSpec {
  return { move: 'auto', intensity: NEUTRAL_INTENSITY, shot: 'auto', angle: 'auto', lens: 'auto', ...partial };
}

describe('the option lists the UI renders', () => {
  it.each<[string, readonly CinematographyOption<string>[], string[]]>([
    ['CAMERA_MOVES', CAMERA_MOVES, ALL_MOVES],
    ['SHOT_SIZES', SHOT_SIZES, ALL_SHOTS],
    ['CAMERA_ANGLES', CAMERA_ANGLES, ALL_ANGLES],
    ['LENS_LOOKS', LENS_LOOKS, ALL_LENSES],
  ])('%s lists every id of its union exactly once, auto first', (_name, list, ids) => {
    expect(list.map((o) => o.id).sort()).toEqual([...ids].sort());
    expect(new Set(list.map((o) => o.id)).size).toBe(list.length);
    expect(list[0]?.id).toBe('auto');
  });

  it.each<[string, readonly CinematographyOption<string>[]]>([
    ['CAMERA_MOVES', CAMERA_MOVES], ['SHOT_SIZES', SHOT_SIZES], ['CAMERA_ANGLES', CAMERA_ANGLES], ['LENS_LOOKS', LENS_LOOKS],
  ])('%s: every option has a Georgian, an English and a Russian label, and a phrase unless it is auto', (_name, list) => {
    for (const o of list) {
      expect(o.ka).toMatch(GEORGIAN);
      expect(o.en.trim()).not.toBe('');
      // Until 2026-10-09 the Russian studio showed these in English.
      expect(o.ru).toMatch(/[Ѐ-ӿ]/);
      if (o.id === 'auto') expect(o.phrase).toBe('');
      else expect(o.phrase.trim()).not.toBe('');
      // The prompt phrase is English — no Georgian letters may reach Veo.
      expect(o.phrase).not.toMatch(GEORGIAN);
    }
  });

  it('Georgian labels are the natural film terms', () => {
    const ka = (list: readonly CinematographyOption<string>[], id: string) => list.find((o) => o.id === id)?.ka;
    expect(ka(CAMERA_MOVES, 'push_in')).toBe('მიახლოება');
    expect(ka(CAMERA_MOVES, 'pull_out')).toBe('დაშორება');
    expect(ka(CAMERA_MOVES, 'pan_left')).toBe('პანორამა მარცხნივ');
    expect(ka(CAMERA_MOVES, 'tilt_up')).toBe('დახრა ზემოთ');
    expect(ka(CAMERA_MOVES, 'static')).toBe('სტატიკური');
    expect(ka(CAMERA_MOVES, 'orbit')).toBe('წრიული');
    expect(ka(CAMERA_MOVES, 'aerial')).toBe('საჰაერო');
    expect(ka(CAMERA_MOVES, 'handheld')).toBe('ხელის კამერა');
    expect(ka(SHOT_SIZES, 'close_up')).toBe('ახლო ხედი');
    expect(ka(SHOT_SIZES, 'wide')).toBe('საერთო ხედი');
  });

  it('no two options in a list share a label (the chips must be distinguishable)', () => {
    for (const list of [CAMERA_MOVES, SHOT_SIZES, CAMERA_ANGLES, LENS_LOOKS] as const) {
      expect(new Set(list.map((o) => o.ka)).size).toBe(list.length);
      expect(new Set(list.map((o) => o.en)).size).toBe(list.length);
    }
  });

  it('the lists are frozen — the UI cannot mutate the shared vocabulary', () => {
    expect(Object.isFrozen(CAMERA_MOVES)).toBe(true);
    expect(Object.isFrozen(CAMERA_MOVES[1])).toBe(true);
  });
});

describe('speedAdverb — 1–3 slow, 4–6 nothing, 7–8 brisk, 9–10 fast', () => {
  it.each([
    [1, 'slow'], [2, 'slow'], [3, 'slow'],
    [4, ''], [5, ''], [6, ''],
    [7, 'brisk'], [8, 'brisk'],
    [9, 'fast'], [10, 'fast'],
  ])('intensity %i → "%s"', (i, want) => {
    expect(speedAdverb(i)).toBe(want);
  });

  it('clamps out-of-range values instead of inventing a speed', () => {
    expect(speedAdverb(0)).toBe('slow');
    expect(speedAdverb(-4)).toBe('slow');
    expect(speedAdverb(11)).toBe('fast');
    expect(speedAdverb(1e9)).toBe('fast');
  });

  it('rounds fractional values to the nearest step', () => {
    expect(speedAdverb(3.4)).toBe('slow');
    expect(speedAdverb(3.5)).toBe('');
    expect(speedAdverb(6.6)).toBe('brisk');
  });

  it('a malformed intensity is neutral, never an extreme', () => {
    expect(speedAdverb(Number.NaN)).toBe('');
    expect(speedAdverb(Number.POSITIVE_INFINITY)).toBe('');
    expect(speedAdverb('7' as unknown as number)).toBe('');
    expect(clampIntensity(Number.NaN)).toBe(NEUTRAL_INTENSITY);
  });
});

describe('cameraPhrase — Google\'s documented vocabulary', () => {
  it('all-auto contributes nothing', () => {
    expect(cameraPhrase(spec())).toBe('');
    expect(cameraPhrase(spec({ intensity: 10 }))).toBe('');
  });

  it.each<[CameraMove, RegExp]>([
    ['static', /^Static shot \(the camera holds completely still\)$/],
    ['pan_left', /^Pan left \(the camera rotates horizontally from a fixed position\)$/],
    ['pan_right', /^Pan right \(the camera rotates horizontally/],
    ['tilt_up', /^Tilt up \(the camera rotates vertically/],
    ['tilt_down', /^Tilt down \(the camera rotates vertically/],
    ['push_in', /^Dolly in \(the camera physically moves toward the subject\)$/],
    ['pull_out', /^Dolly out \(the camera physically moves away from the subject\)$/],
    ['truck_left', /^Truck left \(the camera physically moves sideways/],
    ['truck_right', /^Truck right \(the camera physically moves sideways/],
    ['pedestal_up', /^Pedestal up \(the camera physically rises/],
    ['pedestal_down', /^Pedestal down \(the camera physically lowers/],
    ['zoom_in', /^Zoom in \(.*not a dolly\)$/],
    ['zoom_out', /^Zoom out \(.*not a dolly\)$/],
    ['orbit', /^Arc shot orbiting the subject$/],
    ['crane_up', /^Crane shot rising$/],
    ['crane_down', /^Crane shot descending$/],
    ['aerial', /^Aerial drone shot$/],
    ['handheld', /^Handheld camera$/],
  ])('%s at neutral intensity → the documented phrase', (move, rx) => {
    expect(cameraPhrase(spec({ move }))).toMatch(rx);
  });

  it('push in / pull out are a DOLLY (the camera moves), never a zoom (the lens changes)', () => {
    expect(cameraPhrase(spec({ move: 'push_in' }))).not.toMatch(/zoom/i);
    expect(cameraPhrase(spec({ move: 'pull_out' }))).not.toMatch(/zoom/i);
    expect(cameraPhrase(spec({ move: 'zoom_in' }))).toMatch(/^Zoom in/);
  });

  it('a pan rotates, a truck travels — the two are never described alike', () => {
    expect(cameraPhrase(spec({ move: 'pan_left' }))).toMatch(/rotates/);
    expect(cameraPhrase(spec({ move: 'pan_left' }))).not.toMatch(/physically/);
    expect(cameraPhrase(spec({ move: 'truck_left' }))).toMatch(/physically moves/);
    expect(cameraPhrase(spec({ move: 'truck_left' }))).not.toMatch(/rotates/);
  });

  it('combines shot size, angle, lens and move — in that order — into one clause', () => {
    const phrase = cameraPhrase({ move: 'push_in', intensity: 2, shot: 'medium_close', angle: 'low', lens: 'telephoto' });
    expect(phrase).toBe(
      'Medium close-up, low-angle shot looking up at the subject, telephoto lens with compressed perspective, ' +
      'slow dolly in (the camera physically moves toward the subject)',
    );
    expect(phrase).not.toMatch(/\.$/);
  });

  it('auto parts are skipped without leaving stray separators', () => {
    expect(cameraPhrase(spec({ shot: 'wide' }))).toBe('Wide shot');
    expect(cameraPhrase(spec({ angle: 'birds_eye' }))).toBe("Bird's-eye view from directly overhead");
    expect(cameraPhrase(spec({ lens: 'shallow_focus', move: 'orbit' }))).toBe(
      'Shallow depth of field with soft background bokeh, arc shot orbiting the subject',
    );
    for (const p of [cameraPhrase(spec({ shot: 'wide', lens: 'macro' })), cameraPhrase(spec({ angle: 'pov' }))]) {
      expect(p).not.toMatch(/, ,|^,|,$|\s{2}/);
    }
  });

  it('every shot, angle and lens phrase appears verbatim in the clause', () => {
    for (const o of SHOT_SIZES) if (o.id !== 'auto') expect(cameraPhrase(spec({ shot: o.id })).toLowerCase()).toBe(o.phrase.toLowerCase());
    for (const o of CAMERA_ANGLES) if (o.id !== 'auto') expect(cameraPhrase(spec({ angle: o.id })).toLowerCase()).toBe(o.phrase.toLowerCase());
    for (const o of LENS_LOOKS) if (o.id !== 'auto') expect(cameraPhrase(spec({ lens: o.id })).toLowerCase()).toBe(o.phrase.toLowerCase());
  });

  it('the speed adverb leads the move', () => {
    expect(cameraPhrase(spec({ move: 'pan_right', intensity: 1 }))).toMatch(/^Slow pan right/);
    expect(cameraPhrase(spec({ move: 'pan_right', intensity: 8 }))).toMatch(/^Brisk pan right/);
    expect(cameraPhrase(spec({ move: 'pan_right', intensity: 10 }))).toMatch(/^Fast pan right/);
    expect(cameraPhrase(spec({ shot: 'wide', move: 'aerial', intensity: 2 }))).toBe('Wide shot, slow aerial drone shot');
  });

  it('neutral intensity (5, and 4–6) adds no words at all', () => {
    for (const move of ALL_MOVES) {
      const five = cameraPhrase(spec({ move, intensity: 5 }));
      expect(cameraPhrase(spec({ move, intensity: 4 }))).toBe(five);
      expect(cameraPhrase(spec({ move, intensity: 6 }))).toBe(five);
      expect(five).not.toMatch(/\b(slow|brisk|fast)\b/i);
      expect(five.toLowerCase()).toBe(CAMERA_MOVES.find((o) => o.id === move)?.phrase ?? '');
    }
  });

  it('a static shot has no speed, whatever the slider says', () => {
    expect(cameraPhrase(spec({ move: 'static', intensity: 1 }))).toBe(cameraPhrase(spec({ move: 'static', intensity: 10 })));
    expect(cameraPhrase(spec({ move: 'static', intensity: 10 }))).not.toMatch(/fast|slow|brisk/i);
  });

  it('handheld speed describes the movement, not the camera', () => {
    expect(cameraPhrase(spec({ move: 'handheld', intensity: 9 }))).toBe('Handheld camera moving at a fast pace');
    expect(cameraPhrase(spec({ move: 'handheld', intensity: 2 }))).toBe('Handheld camera moving at a slow pace');
  });

  it('an unknown id from the wire is treated as auto, never printed', () => {
    const bogus = spec({ move: 'whip_pan' as CameraMove, shot: 'cowboy' as ShotSize, angle: 'sideways' as CameraAngle, lens: 'fisheye' as LensLook });
    expect(cameraPhrase(bogus)).toBe('');
    expect(cameraPhrase(spec({ move: 'constructor' as CameraMove }))).toBe('');
  });

  it('is deterministic', () => {
    const s = spec({ move: 'crane_up', intensity: 7, shot: 'extreme_wide', angle: 'high', lens: 'deep_focus' });
    expect(cameraPhrase(s)).toBe(cameraPhrase({ ...s }));
  });
});

describe('nativeCameraControl — the opt-in Vertex enum', () => {
  it.each<[CameraMove, VertexCameraControl | undefined]>([
    ['static', 'fixed'],
    ['pan_left', 'pan_left'], ['pan_right', 'pan_right'],
    ['tilt_up', 'tilt_up'], ['tilt_down', 'tilt_down'],
    ['truck_left', 'truck_left'], ['truck_right', 'truck_right'],
    ['pedestal_up', 'pedestal_up'], ['pedestal_down', 'pedestal_down'],
    ['push_in', 'push_in'], ['zoom_in', 'push_in'],
    ['pull_out', 'pull_out'], ['zoom_out', 'pull_out'],
    ['auto', undefined], ['orbit', undefined], ['crane_up', undefined], ['crane_down', undefined],
    ['aerial', undefined], ['handheld', undefined],
  ])('%s → %s', (move, want) => {
    expect(nativeCameraControl(move)).toBe(want);
  });

  it('covers every move, and an unknown id maps to nothing', () => {
    for (const move of ALL_MOVES) expect(() => nativeCameraControl(move)).not.toThrow();
    expect(nativeCameraControl('toString' as CameraMove)).toBeUndefined();
  });
});

describe('motionVector — the structured move the phrase encodes', () => {
  const ZERO = { translation: { x: 0, y: 0, z: 0 }, rotation: { pan: 0, tilt: 0, roll: 0 }, zoom: 1, magnitude: 0 };

  it('static is all zero at every intensity', () => {
    for (const intensity of [1, 5, 10]) expect(motionVector(spec({ move: 'static', intensity }))).toEqual(ZERO);
  });

  it('auto describes no motion (the director has not chosen one)', () => {
    expect(motionVector(spec({ move: 'auto', intensity: 10 }))).toEqual(ZERO);
  });

  it.each<[CameraMove, (v: ReturnType<typeof motionVector>) => boolean]>([
    ['pan_right', (v) => v.rotation.pan > 0],
    ['pan_left', (v) => v.rotation.pan < 0],
    ['tilt_up', (v) => v.rotation.tilt > 0],
    ['tilt_down', (v) => v.rotation.tilt < 0],
    ['push_in', (v) => v.translation.z > 0],
    ['pull_out', (v) => v.translation.z < 0],
    ['truck_right', (v) => v.translation.x > 0],
    ['truck_left', (v) => v.translation.x < 0],
    ['pedestal_up', (v) => v.translation.y > 0],
    ['pedestal_down', (v) => v.translation.y < 0],
    ['zoom_in', (v) => v.zoom > 1],
    ['zoom_out', (v) => v.zoom < 1 && v.zoom > 0],
    ['crane_up', (v) => v.translation.y > 0],
    ['crane_down', (v) => v.translation.y < 0],
    ['aerial', (v) => v.translation.z > 0],
    ['orbit', (v) => v.translation.x !== 0 && Math.sign(v.rotation.pan) === -Math.sign(v.translation.x)],
    ['handheld', (v) => v.rotation.roll > 0 && v.translation.x === 0 && v.translation.z === 0],
  ])('%s is sign-consistent with its phrase', (move, ok) => {
    expect(ok(motionVector(spec({ move, intensity: 6 })))).toBe(true);
  });

  it('pure rotations do not travel, pure travels do not rotate, and neither zooms', () => {
    const pan = motionVector(spec({ move: 'pan_right' }));
    expect(pan.translation).toEqual({ x: 0, y: 0, z: 0 });
    expect(pan.zoom).toBe(1);
    const dolly = motionVector(spec({ move: 'push_in' }));
    expect(dolly.rotation).toEqual({ pan: 0, tilt: 0, roll: 0 });
    expect(dolly.zoom).toBe(1);
  });

  it('a zoom changes only the focal length — the camera itself does not move (not a dolly)', () => {
    const z = motionVector(spec({ move: 'zoom_in' }));
    expect(z.translation).toEqual({ x: 0, y: 0, z: 0 });
    expect(z.rotation).toEqual({ pan: 0, tilt: 0, roll: 0 });
  });

  it('mirror moves are exact opposites', () => {
    const r = motionVector(spec({ move: 'pan_right', intensity: 7 }));
    const l = motionVector(spec({ move: 'pan_left', intensity: 7 }));
    expect(l.rotation.pan).toBe(-r.rotation.pan);
    const zi = motionVector(spec({ move: 'zoom_in', intensity: 7 }));
    const zo = motionVector(spec({ move: 'zoom_out', intensity: 7 }));
    expect(zi.zoom * zo.zoom).toBeCloseTo(1, 2);
  });

  it('magnitude = intensity / 10, always within [0, 1]', () => {
    for (let i = 1; i <= 10; i += 1) {
      const v = motionVector(spec({ move: 'truck_right', intensity: i }));
      expect(v.magnitude).toBeCloseTo(i / 10, 10);
      expect(v.magnitude).toBeGreaterThanOrEqual(0);
      expect(v.magnitude).toBeLessThanOrEqual(1);
    }
    expect(motionVector(spec({ move: 'truck_right', intensity: 99 })).magnitude).toBe(1);
    expect(motionVector(spec({ move: 'truck_right', intensity: -3 })).magnitude).toBe(0.1);
    expect(motionVector(spec({ move: 'truck_right', intensity: Number.NaN })).magnitude).toBe(0.5);
  });

  it('more intensity is more motion, strictly', () => {
    for (const move of ALL_MOVES.filter((m) => m !== 'auto' && m !== 'static')) {
      const size = (i: number) => {
        const v = motionVector(spec({ move, intensity: i }));
        return Math.abs(v.translation.x) + Math.abs(v.translation.y) + Math.abs(v.translation.z) +
          Math.abs(v.rotation.pan) + Math.abs(v.rotation.tilt) + Math.abs(v.rotation.roll) + Math.abs(Math.log(v.zoom));
      };
      expect(size(2)).toBeLessThan(size(5));
      expect(size(5)).toBeLessThan(size(9));
    }
  });

  it('shot size, angle and lens are framing, not motion — they never change the vector', () => {
    const base = motionVector(spec({ move: 'orbit', intensity: 8 }));
    expect(motionVector({ move: 'orbit', intensity: 8, shot: 'close_up', angle: 'dutch', lens: 'macro' })).toEqual(base);
  });

  it('is deterministic and free of float noise and negative zero', () => {
    for (const move of ALL_MOVES) {
      for (const intensity of [1, 3, 7, 10]) {
        const a = motionVector(spec({ move, intensity }));
        expect(motionVector(spec({ move, intensity }))).toEqual(a);
        const numbers = [a.translation.x, a.translation.y, a.translation.z, a.rotation.pan, a.rotation.tilt, a.rotation.roll, a.zoom, a.magnitude];
        for (const n of numbers) {
          expect(Number.isFinite(n)).toBe(true);
          expect(Object.is(n, -0)).toBe(false);
          expect(Math.round(n * 1000) / 1000).toBe(n);
        }
      }
    }
  });

  it('an unknown move is no motion, not a crash', () => {
    expect(motionVector(spec({ move: 'whip_pan' as CameraMove, intensity: 9 }))).toEqual(ZERO);
  });
});
