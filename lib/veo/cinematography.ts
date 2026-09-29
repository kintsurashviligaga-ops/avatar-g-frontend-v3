/**
 * lib/veo/cinematography.ts — the Omni director's camera vocabulary (docs/VEO_ENGINE.md §5).
 *
 * Veo takes NO motion input: no transition parameter, no vector, and on Veo 3.x no documented camera control.
 * Camera work is prompt language, and the model follows it best in the words Google's Vertex prompt guide
 * defines. The guide draws distinctions a casual prompt blurs and the model is trained on:
 *   • a PAN / TILT rotates the camera from a fixed position; a TRUCK / PEDESTAL physically moves it sideways / up;
 *   • a DOLLY physically moves the camera toward or away from the subject; a ZOOM changes the lens focal length,
 *     which the guide calls out as "different from a dolly" (the perspective does not change).
 * So each move phrase names the documented move AND carries its one-line definition, and the UI's
 * "push in / pull out" chips compile to the documented "dolly in / dolly out".
 *
 * Pure — no I/O. An unknown id from the wire reads as 'auto' and a malformed intensity as neutral, never a throw.
 * The option lists are shared with the client UI.
 */
import type {
  CameraAngle,
  CameraMove,
  CameraSpec,
  LensLook,
  MotionVector,
  ShotSize,
  VertexCameraControl,
} from './types';

/** One UI option: Georgian + English labels, and the English phrase the prompt receives ('' for auto). */
export interface CinematographyOption<T extends string> {
  readonly id: T;
  readonly ka: string;
  readonly en: string;
  readonly phrase: string;
}

type OptionTable<T extends string> = Record<T, Omit<CinematographyOption<T>, 'id'>>;

// Tables are Records so the compiler proves every member of each union has an entry; the exported lists keep
// the table's insertion order (string keys enumerate in insertion order), which is the order the UI shows.

const MOVES: OptionTable<CameraMove> = {
  auto: { ka: 'ავტომატური', en: 'Auto', phrase: '' },
  static: { ka: 'სტატიკური', en: 'Static', phrase: 'static shot (the camera holds completely still)' },
  pan_left: { ka: 'პანორამა მარცხნივ', en: 'Pan left', phrase: 'pan left (the camera rotates horizontally from a fixed position)' },
  pan_right: { ka: 'პანორამა მარჯვნივ', en: 'Pan right', phrase: 'pan right (the camera rotates horizontally from a fixed position)' },
  tilt_up: { ka: 'დახრა ზემოთ', en: 'Tilt up', phrase: 'tilt up (the camera rotates vertically from a fixed position)' },
  tilt_down: { ka: 'დახრა ქვემოთ', en: 'Tilt down', phrase: 'tilt down (the camera rotates vertically from a fixed position)' },
  push_in: { ka: 'მიახლოება', en: 'Push in', phrase: 'dolly in (the camera physically moves toward the subject)' },
  pull_out: { ka: 'დაშორება', en: 'Pull out', phrase: 'dolly out (the camera physically moves away from the subject)' },
  truck_left: { ka: 'გვერდითი სვლა მარცხნივ', en: 'Truck left', phrase: 'truck left (the camera physically moves sideways to the left)' },
  truck_right: { ka: 'გვერდითი სვლა მარჯვნივ', en: 'Truck right', phrase: 'truck right (the camera physically moves sideways to the right)' },
  pedestal_up: { ka: 'ვერტიკალური აწევა', en: 'Pedestal up', phrase: 'pedestal up (the camera physically rises straight up)' },
  pedestal_down: { ka: 'ვერტიკალური დაშვება', en: 'Pedestal down', phrase: 'pedestal down (the camera physically lowers straight down)' },
  zoom_in: { ka: 'ზუმით მიახლოება', en: 'Zoom in', phrase: 'zoom in (a lens zoom that narrows the field of view, not a dolly)' },
  zoom_out: { ka: 'ზუმით დაშორება', en: 'Zoom out', phrase: 'zoom out (a lens zoom that widens the field of view, not a dolly)' },
  orbit: { ka: 'წრიული', en: 'Orbit', phrase: 'arc shot orbiting the subject' },
  crane_up: { ka: 'კრანით აწევა', en: 'Crane up', phrase: 'crane shot rising' },
  crane_down: { ka: 'კრანით დაშვება', en: 'Crane down', phrase: 'crane shot descending' },
  aerial: { ka: 'საჰაერო', en: 'Aerial', phrase: 'aerial drone shot' },
  handheld: { ka: 'ხელის კამერა', en: 'Handheld', phrase: 'handheld camera' },
};

const SHOTS: OptionTable<ShotSize> = {
  auto: { ka: 'ავტომატური', en: 'Auto', phrase: '' },
  extreme_wide: { ka: 'ძალიან საერთო ხედი', en: 'Extreme wide', phrase: 'extreme wide establishing shot' },
  wide: { ka: 'საერთო ხედი', en: 'Wide', phrase: 'wide shot' },
  full: { ka: 'სრული ხედი', en: 'Full', phrase: 'full shot framing the subject head to toe' },
  medium: { ka: 'საშუალო ხედი', en: 'Medium', phrase: 'medium shot' },
  medium_close: { ka: 'საშუალო ახლო ხედი', en: 'Medium close-up', phrase: 'medium close-up' },
  close_up: { ka: 'ახლო ხედი', en: 'Close-up', phrase: 'close-up' },
  extreme_close_up: { ka: 'ძალიან ახლო ხედი', en: 'Extreme close-up', phrase: 'extreme close-up' },
};

const ANGLES: OptionTable<CameraAngle> = {
  auto: { ka: 'ავტომატური', en: 'Auto', phrase: '' },
  eye_level: { ka: 'თვალის დონე', en: 'Eye level', phrase: 'eye-level shot' },
  low: { ka: 'ქვედა რაკურსი', en: 'Low angle', phrase: 'low-angle shot looking up at the subject' },
  high: { ka: 'ზედა რაკურსი', en: 'High angle', phrase: 'high-angle shot looking down at the subject' },
  birds_eye: { ka: 'ზემოდან (ფრინველის თვალით)', en: "Bird's-eye", phrase: "bird's-eye view from directly overhead" },
  worms_eye: { ka: 'ქვემოდან (მიწის დონიდან)', en: "Worm's-eye", phrase: "worm's-eye view from ground level looking up" },
  dutch: { ka: 'დახრილი კადრი', en: 'Dutch angle', phrase: 'Dutch angle with a tilted horizon' },
  over_shoulder: { ka: 'მხრის უკნიდან', en: 'Over the shoulder', phrase: 'over-the-shoulder shot' },
  pov: { ka: 'პირველი პირის ხედი', en: 'POV', phrase: 'point-of-view (POV) shot' },
};

const LENSES: OptionTable<LensLook> = {
  auto: { ka: 'ავტომატური', en: 'Auto', phrase: '' },
  wide_angle: { ka: 'ფართოკუთხიანი ობიექტივი', en: 'Wide-angle lens', phrase: 'wide-angle lens' },
  standard: { ka: 'სტანდარტული ობიექტივი', en: 'Standard lens', phrase: 'standard 50mm lens with natural perspective' },
  telephoto: { ka: 'ტელეობიექტივი', en: 'Telephoto', phrase: 'telephoto lens with compressed perspective' },
  macro: { ka: 'მაკრო', en: 'Macro', phrase: 'macro lens revealing fine detail' },
  shallow_focus: { ka: 'ბუნდოვანი ფონი', en: 'Shallow focus', phrase: 'shallow depth of field with soft background bokeh' },
  deep_focus: { ka: 'ღრმა ფოკუსი', en: 'Deep focus', phrase: 'deep focus with foreground and background both sharp' },
};

function toList<T extends string>(table: OptionTable<T>): readonly CinematographyOption<T>[] {
  return Object.freeze((Object.keys(table) as T[]).map((id) => Object.freeze({ id, ...table[id] })));
}

export const CAMERA_MOVES: readonly CinematographyOption<CameraMove>[] = toList(MOVES);
export const SHOT_SIZES: readonly CinematographyOption<ShotSize>[] = toList(SHOTS);
export const CAMERA_ANGLES: readonly CinematographyOption<CameraAngle>[] = toList(ANGLES);
export const LENS_LOOKS: readonly CinematographyOption<LensLook>[] = toList(LENSES);

/** The default intensity. It adds no words to the prompt, so an untouched slider never changes a render. */
export const NEUTRAL_INTENSITY = 5;

/** 1…10 integer; a non-number (a malformed request) falls back to neutral rather than to an extreme. */
export function clampIntensity(intensity: number): number {
  if (typeof intensity !== 'number' || !Number.isFinite(intensity)) return NEUTRAL_INTENSITY;
  return Math.min(10, Math.max(1, Math.round(intensity)));
}

/** 1–3 "slow", 4–6 "" (neutral), 7–8 "brisk", 9–10 "fast". */
export function speedAdverb(intensity: number): '' | 'slow' | 'brisk' | 'fast' {
  const i = clampIntensity(intensity);
  if (i <= 3) return 'slow';
  if (i <= 6) return '';
  if (i <= 8) return 'brisk';
  return 'fast';
}

/** Table lookup that tolerates an id the union does not know (UI/JSON input) by treating it as 'auto'. */
function phraseOf<T extends string>(table: OptionTable<T>, id: T): string {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id].phrase : '';
}

function movePhrase(move: CameraMove, intensity: number): string {
  const phrase = phraseOf(MOVES, move);
  // A static shot has no speed; saying "slow static shot" would invite drift.
  if (!phrase || move === 'static') return phrase;
  const adverb = speedAdverb(intensity);
  if (!adverb) return phrase;
  // "slow handheld camera" reads as a property of the camera, not of its movement.
  if (move === 'handheld') return `${phrase} moving at a ${adverb} pace`;
  return `${adverb} ${phrase}`;
}

function capitalizeAscii(text: string): string {
  // ASCII only: String#toUpperCase maps Georgian Mkhedruli to Mtavruli, which is not sentence case.
  return /^[a-z]/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * One clause: shot size, angle, lens, then the move with its speed — e.g. "Medium close-up, low-angle shot looking
 * up at the subject, telephoto lens with compressed perspective, slow dolly in (the camera physically moves toward
 * the subject)". 'auto' parts contribute nothing; all-auto returns ''.
 */
export function cameraPhrase(spec: CameraSpec): string {
  const parts = [
    phraseOf(SHOTS, spec.shot),
    phraseOf(ANGLES, spec.angle),
    phraseOf(LENSES, spec.lens),
    movePhrase(spec.move, spec.intensity),
  ].filter((p) => p.length > 0);
  return capitalizeAscii(parts.join(', '));
}

const NATIVE: Record<CameraMove, VertexCameraControl | undefined> = {
  auto: undefined,
  static: 'fixed',
  pan_left: 'pan_left',
  pan_right: 'pan_right',
  tilt_up: 'tilt_up',
  tilt_down: 'tilt_down',
  push_in: 'push_in',
  pull_out: 'pull_out',
  truck_left: 'truck_left',
  truck_right: 'truck_right',
  pedestal_up: 'pedestal_up',
  pedestal_down: 'pedestal_down',
  // The enum has no zoom; the nearest framing change is the dolly (the prompt still says "zoom").
  zoom_in: 'push_in',
  zoom_out: 'pull_out',
  // No enum value for an arc, crane, drone or handheld move: the prompt phrase alone carries them.
  orbit: undefined,
  crane_up: undefined,
  crane_down: undefined,
  aerial: undefined,
  handheld: undefined,
};

/** The Vertex `cameraControl` value for a move (opt-in, requires a first frame — the caller checks both). */
export function nativeCameraControl(move: CameraMove): VertexCameraControl | undefined {
  return Object.prototype.hasOwnProperty.call(NATIVE, move) ? NATIVE[move] : undefined;
}

/** A move at full magnitude (intensity 10). Units per types.MotionVector; zoom is added to 1 ("+1" = 2x). */
interface UnitMotion {
  x?: number; y?: number; z?: number;
  pan?: number; tilt?: number; roll?: number;
  zoom?: 'in' | 'out';
}

const UNIT_MOTION: Record<CameraMove, UnitMotion | null> = {
  auto: null,
  static: null,
  pan_left: { pan: -60 },
  pan_right: { pan: 60 },
  tilt_up: { tilt: 40 },
  tilt_down: { tilt: -40 },
  push_in: { z: 1 },
  pull_out: { z: -1 },
  truck_left: { x: -1 },
  truck_right: { x: 1 },
  pedestal_up: { y: 1 },
  pedestal_down: { y: -1 },
  zoom_in: { zoom: 'in' },
  zoom_out: { zoom: 'out' },
  // Convention: the arc travels right around the subject while panning left to keep it centred.
  orbit: { x: 1.5, pan: -90 },
  // A crane rises and tilts down to hold the subject (and the mirror image on the way down).
  crane_up: { y: 1.5, tilt: -15 },
  crane_down: { y: -1.5, tilt: 15 },
  // The drone flies forward and climbs over the scene.
  aerial: { z: 2, y: 0.5 },
  // No net travel; the shake is expressed as a small roll amplitude.
  handheld: { roll: 3 },
};

/** Rounds away float noise (0.30000000000000004) and normalises -0, so equal moves compare equal. */
function tidy(n: number): number {
  const r = Math.round(n * 1000) / 1000;
  return r === 0 ? 0 : r;
}

/**
 * The structured description of the move the phrase asks for — deterministic, and sign-consistent with the
 * phrase (pan_right → pan > 0, push_in → z > 0, zoom_in → zoom > 1). magnitude = intensity / 10, so 0.1…1;
 * static and auto describe no motion (all zero, zoom 1, magnitude 0). Shot size, angle and lens are framing,
 * not motion, and never change the vector.
 */
export function motionVector(spec: CameraSpec): MotionVector {
  const unit = Object.prototype.hasOwnProperty.call(UNIT_MOTION, spec.move) ? UNIT_MOTION[spec.move] : null;
  if (!unit) {
    return { translation: { x: 0, y: 0, z: 0 }, rotation: { pan: 0, tilt: 0, roll: 0 }, zoom: 1, magnitude: 0 };
  }
  const m = clampIntensity(spec.intensity) / 10;
  const zoom = unit.zoom === 'in' ? 1 + m : unit.zoom === 'out' ? 1 / (1 + m) : 1;
  return {
    translation: { x: tidy((unit.x ?? 0) * m), y: tidy((unit.y ?? 0) * m), z: tidy((unit.z ?? 0) * m) },
    rotation: { pan: tidy((unit.pan ?? 0) * m), tilt: tidy((unit.tilt ?? 0) * m), roll: tidy((unit.roll ?? 0) * m) },
    zoom: tidy(zoom),
    magnitude: tidy(m),
  };
}
