/**
 * lib/video/veoPlan.ts — the video tool's Veo parameters as ONE state (docs/VEO_ENGINE.md §2).
 *
 * Everything the studio asks Veo for lives here: the delivered format, the length (→ a scene grid of 8 s clips),
 * the quality tier, how character photos condition Veo, whether Veo renders its own sound, the seed lock, the
 * negative prompt, and a SCENE TIMELINE — each scene's words, camera and the join to the next scene. A pure
 * reducer + selectors, so the panel, the composer chip, the price and the dispatch all read one value and cannot
 * disagree; and so the whole plan snapshots into a queued film (FilmSnap) as a single object.
 *
 * What is NOT here, on purpose: the post-production audio lanes (music bed, narration voices, ducking, lip-sync)
 * and the documentary / music-video mode. Those shape the edit after Veo, not the Veo request.
 */
import type { CameraSpec, OutputFormat, Transition, VeoTier } from '@/lib/veo/types';

export type VeoLength = 8 | 24 | 48;

/**
 * How the character photos condition Veo:
 *  - first_frame: every scene ANIMATES FROM an approved storyboard frame (instances.image). Any tier, any length.
 *  - reference:   up to 3 photos ride as Veo "asset" references (instances.referenceImages) and Veo composes each
 *                 scene freely while keeping that person — no storyboard frame. 8 s clips, Standard/Fast only.
 */
export type ReferenceMode = 'first_frame' | 'reference';

/** Every clip is 8 s: 1080p, reference images and the 8/24/48 grid all need it (Veo contract). */
export const VEO_CLIP_SEC = 8 as const;

export const VEO_LENGTHS: readonly VeoLength[] = [8, 24, 48];

export const DEFAULT_CAMERA: CameraSpec = { move: 'auto', intensity: 5, shot: 'auto', angle: 'auto', lens: 'auto' };

export interface VeoScene {
  /** Stable key for the list (scenes reorder and resize; the index is not an identity). */
  id: string;
  /** What happens in this scene, in the user's words. Empty = the director writes it from the brief. */
  text: string;
  camera: CameraSpec;
  /** How this scene joins the next one. The last scene's value is ignored. */
  transitionOut: Transition;
}

export interface VeoPlan {
  format: OutputFormat;
  lengthSec: VeoLength;
  tier: VeoTier;
  referenceMode: ReferenceMode;
  /** Veo's own sound (dialogue, effects, ambience). Off = video-only (Vertex; cheaper) for clips re-scored in post. */
  nativeAudio: boolean;
  /** The same seed on every scene — Google's continuity lever for look and character. */
  seedLock: boolean;
  /** Vertex prompt enhancement. Off by default: the director already writes Veo's anatomy, and enhancement defeats the seed. */
  enhancePrompt: boolean;
  /** Nouns to keep out of the frame ("text, watermark, extra fingers") — never "no …". */
  negativePrompt: string;
  /** Applied to new scenes and by "all scenes". */
  cameraDefault: CameraSpec;
  transitionDefault: Transition;
  scenes: VeoScene[];
}

let sceneSeq = 0;
/** Deterministic in tests (reset via __resetVeoPlanIds), unique within a page otherwise. */
function newSceneId(): string {
  sceneSeq += 1;
  return `scene-${sceneSeq}`;
}
export function __resetVeoPlanIds(): void {
  sceneSeq = 0;
}

export function sceneCountFor(lengthSec: VeoLength): number {
  return Math.max(1, Math.round(lengthSec / VEO_CLIP_SEC));
}

function blankScene(camera: CameraSpec, transition: Transition): VeoScene {
  return { id: newSceneId(), text: '', camera: { ...camera }, transitionOut: transition };
}

/** Grow or shrink the timeline to the length's scene count, keeping every surviving scene as it was. */
function fitScenes(plan: VeoPlan, lengthSec: VeoLength): VeoScene[] {
  const n = sceneCountFor(lengthSec);
  if (plan.scenes.length === n) return plan.scenes;
  if (plan.scenes.length > n) return plan.scenes.slice(0, n);
  const grown = [...plan.scenes];
  while (grown.length < n) grown.push(blankScene(plan.cameraDefault, plan.transitionDefault));
  return grown;
}

export function initialVeoPlan(overrides: Partial<Omit<VeoPlan, 'scenes'>> = {}): VeoPlan {
  const base: VeoPlan = {
    format: '9:16',
    lengthSec: 24,
    tier: 'standard',
    referenceMode: 'first_frame',
    nativeAudio: true,
    seedLock: true,
    enhancePrompt: false,
    negativePrompt: '',
    cameraDefault: { ...DEFAULT_CAMERA },
    // A hard cut keeps the promised length exact: every soft join overlaps the clips by ~1 s, so a crossfaded
    // 24 s film used to arrive as 22 s.
    transitionDefault: 'cut',
    scenes: [],
    ...overrides,
  };
  return { ...base, scenes: fitScenes(base, base.lengthSec) };
}

export type VeoPlanAction =
  | { type: 'format'; format: OutputFormat }
  | { type: 'length'; lengthSec: VeoLength }
  | { type: 'tier'; tier: VeoTier }
  | { type: 'referenceMode'; mode: ReferenceMode }
  | { type: 'nativeAudio'; on: boolean }
  | { type: 'seedLock'; on: boolean }
  | { type: 'enhancePrompt'; on: boolean }
  | { type: 'negative'; text: string }
  | { type: 'sceneText'; index: number; text: string }
  | { type: 'sceneCamera'; index: number; camera: Partial<CameraSpec> }
  | { type: 'cameraAll'; camera: Partial<CameraSpec> }
  | { type: 'sceneTransition'; index: number; transition: Transition }
  | { type: 'transitionAll'; transition: Transition }
  /** A script split into scenes (master script, pasted scene sheet): fills the texts, resizing to fit when asked. */
  | { type: 'loadScenes'; texts: string[]; lengthSec?: VeoLength }
  | { type: 'clearSceneTexts' };

const clampIntensity = (n: number) => (Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 5);

function mergeCamera(base: CameraSpec, patch: Partial<CameraSpec>): CameraSpec {
  const next = { ...base, ...patch };
  return { ...next, intensity: clampIntensity(next.intensity) };
}

export function veoPlanReducer(plan: VeoPlan, action: VeoPlanAction): VeoPlan {
  switch (action.type) {
    case 'format':
      return plan.format === action.format ? plan : { ...plan, format: action.format };
    case 'length': {
      if (plan.lengthSec === action.lengthSec) return plan;
      const next = { ...plan, lengthSec: action.lengthSec };
      return { ...next, scenes: fitScenes(plan, action.lengthSec) };
    }
    case 'tier': {
      if (plan.tier === action.tier) return plan;
      // Lite takes no reference images (Google: "Veo 3.1 and Fast only"): picking Lite hands the photos back to
      // the first-frame path rather than silently dropping them at render time.
      const referenceMode = action.tier === 'lite' && plan.referenceMode === 'reference' ? 'first_frame' : plan.referenceMode;
      return { ...plan, tier: action.tier, referenceMode };
    }
    case 'referenceMode': {
      if (plan.referenceMode === action.mode) return plan;
      // …and the reverse: references need Standard or Fast.
      const tier = action.mode === 'reference' && plan.tier === 'lite' ? 'standard' : plan.tier;
      return { ...plan, referenceMode: action.mode, tier };
    }
    case 'nativeAudio':
      return plan.nativeAudio === action.on ? plan : { ...plan, nativeAudio: action.on };
    case 'seedLock':
      return plan.seedLock === action.on ? plan : { ...plan, seedLock: action.on };
    case 'enhancePrompt':
      return plan.enhancePrompt === action.on ? plan : { ...plan, enhancePrompt: action.on };
    case 'negative':
      return { ...plan, negativePrompt: action.text.slice(0, 800) };
    case 'sceneText': {
      if (!plan.scenes[action.index]) return plan;
      const scenes = plan.scenes.map((s, i) => (i === action.index ? { ...s, text: action.text.slice(0, 2000) } : s));
      return { ...plan, scenes };
    }
    case 'sceneCamera': {
      if (!plan.scenes[action.index]) return plan;
      const scenes = plan.scenes.map((s, i) => (i === action.index ? { ...s, camera: mergeCamera(s.camera, action.camera) } : s));
      return { ...plan, scenes };
    }
    case 'cameraAll': {
      const cameraDefault = mergeCamera(plan.cameraDefault, action.camera);
      return { ...plan, cameraDefault, scenes: plan.scenes.map((s) => ({ ...s, camera: mergeCamera(s.camera, action.camera) })) };
    }
    case 'sceneTransition': {
      if (!plan.scenes[action.index]) return plan;
      const scenes = plan.scenes.map((s, i) => (i === action.index ? { ...s, transitionOut: action.transition } : s));
      return { ...plan, scenes };
    }
    case 'transitionAll':
      return { ...plan, transitionDefault: action.transition, scenes: plan.scenes.map((s) => ({ ...s, transitionOut: action.transition })) };
    case 'loadScenes': {
      const texts = action.texts.map((t) => t.trim()).filter(Boolean);
      if (!texts.length) return plan;
      const lengthSec = action.lengthSec ?? plan.lengthSec;
      const sized = { ...plan, lengthSec, scenes: fitScenes(plan, lengthSec) };
      return { ...sized, scenes: sized.scenes.map((s, i) => ({ ...s, text: (texts[i] ?? s.text).slice(0, 2000) })) };
    }
    case 'clearSceneTexts':
      return { ...plan, scenes: plan.scenes.map((s) => ({ ...s, text: '' })) };
    default:
      return plan;
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────────────────────────────────

export function sceneCount(plan: VeoPlan): number {
  return plan.scenes.length;
}

/** 1:1 and 4:5 are not Veo ratios: they are rendered at a native ratio and cropped in post. */
export function isCroppedFormat(format: OutputFormat): boolean {
  return format === '1:1' || format === '4:5';
}

/** The legacy orientation enum the rest of the pipeline (storyboard, orchestrate, assembler canvas) speaks. */
export function orientationFor(format: OutputFormat): 'vertical' | 'landscape' | 'square' | 'portrait' {
  return format === '9:16' ? 'vertical' : format === '16:9' ? 'landscape' : format === '1:1' ? 'square' : 'portrait';
}

export function formatForOrientation(o: 'vertical' | 'landscape' | 'square' | 'portrait'): OutputFormat {
  return o === 'vertical' ? '9:16' : o === 'landscape' ? '16:9' : o === 'square' ? '1:1' : '4:5';
}

/** True when any scene asks for a specific camera move (the legacy global field then stays 'auto'). */
export function hasCustomCamera(plan: VeoPlan): boolean {
  return plan.scenes.some((s) => s.camera.move !== 'auto' || s.camera.shot !== 'auto' || s.camera.angle !== 'auto' || s.camera.lens !== 'auto' || s.camera.intensity !== 5);
}

/** The per-join transitions (length = scenes − 1). */
export function joinTransitions(plan: VeoPlan): Transition[] {
  return plan.scenes.slice(0, -1).map((s) => s.transitionOut);
}

/**
 * The block the studio sends with a film (validated by the orchestrate route's zod schema and read by
 * filmComposite → buildFilmClipRequest → the Veo engine). Only what the SERVER needs: the texts travel through
 * the storyboard, the photos through referenceImages.
 */
export interface VeoRenderOptions {
  tier: VeoTier;
  format: OutputFormat;
  referenceMode: ReferenceMode;
  generateAudio: boolean;
  seedLock: boolean;
  enhancePrompt: boolean;
  negativePrompt?: string;
  scenes: Array<{ camera: CameraSpec; transitionOut: Transition }>;
}

/**
 * `sceneCount` fits the per-scene list to the film that will actually render — the approved storyboard can hold more
 * or fewer scenes than the length's grid (a scene added or deleted on the board, a script's own timecodes). Missing
 * scenes take the plan's defaults; extra ones are dropped. Scene cameras are positional: scene N keeps camera N.
 */
export function toRenderOptions(plan: VeoPlan, sceneCount?: number): VeoRenderOptions {
  const n = typeof sceneCount === 'number' && Number.isFinite(sceneCount) && sceneCount >= 1
    ? Math.min(12, Math.floor(sceneCount))
    : plan.scenes.length;
  const scenes = Array.from({ length: n }, (_, i) => {
    const s = plan.scenes[i];
    return s
      ? { camera: { ...s.camera }, transitionOut: s.transitionOut }
      : { camera: { ...plan.cameraDefault }, transitionOut: plan.transitionDefault };
  });
  return {
    tier: plan.tier,
    format: plan.format,
    referenceMode: plan.referenceMode,
    generateAudio: plan.nativeAudio,
    seedLock: plan.seedLock,
    enhancePrompt: plan.enhancePrompt,
    ...(plan.negativePrompt.trim() ? { negativePrompt: plan.negativePrompt.trim() } : {}),
    scenes,
  };
}

export interface PlanNotice {
  id: 'cropped' | 'audio-fixed' | 'reference-8s' | 'reference-no-frames';
  ka: string;
  en: string;
  ru: string;
}

/** Honest notes the panel shows next to the choice that causes them. `audioToggle` = the live transport can switch Veo's sound off. */
export function planNotices(plan: VeoPlan, env: { audioToggle: boolean }): PlanNotice[] {
  const out: PlanNotice[] = [];
  if (isCroppedFormat(plan.format)) {
    const native = plan.format === '4:5' ? '9:16' : '16:9';
    out.push({
      id: 'cropped',
      ka: `Veo ${plan.format}-ს არ ქმნის: კადრი ${native}-ში გადაიღება და ${plan.format}-ზე დაიჭრება — მთავარი ობიექტი ცენტრში დარჩება.`,
      en: `Veo does not render ${plan.format}: the shot is made at ${native} and cropped to ${plan.format}, with the subject kept centred.`,
      ru: `Veo не снимает ${plan.format}: кадр создаётся в ${native} и обрезается до ${plan.format}, объект остаётся в центре.`,
    });
  }
  if (!plan.nativeAudio && !env.audioToggle) {
    out.push({
      id: 'audio-fixed',
      ka: 'ამ რეჟიმში Veo ხმას ყოველთვის ქმნის — გამორთვა Vertex AI-ზე გადასვლის შემდეგ იმუშავებს.',
      en: 'On this connection Veo always renders sound — switching it off needs Vertex AI.',
      ru: 'В этом режиме Veo всегда создаёт звук — отключение заработает после перехода на Vertex AI.',
    });
  }
  if (plan.referenceMode === 'reference') {
    out.push({
      id: 'reference-no-frames',
      ka: 'რეფერენსის რეჟიმი: სტორიბორდის კადრები მხოლოდ გეგმისთვისაა — Veo ყოველ სცენას თავად აწყობს და ფოტოებზე მყოფ ადამიანს ინარჩუნებს (მაქს. 3 ფოტო, 8 წმ-იანი კლიპები).',
      en: 'Reference mode: the storyboard frames only show the plan — Veo composes every scene itself and keeps the person in your photos (up to 3 photos, 8 s clips).',
      ru: 'Режим референса: кадры раскадровки лишь показывают план — Veo сам строит каждую сцену и сохраняет человека с фото (до 3 фото, клипы по 8 с).',
    });
  }
  return out;
}
