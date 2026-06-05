/**
 * lib/chat/filmPipeline.ts
 * ========================
 * PHASE 42 §1 — The "30-Second Film" Master Agent planning core.
 *
 * The 30-second film is a full automated production, not a single API call. The
 * Master Agent decomposes one brief into a deterministic production plan that
 * downstream sub-agents execute:
 *
 *   1. Storyboard Agent  → split the brief into N sequential 6-second scenes
 *   2. Continuity Agent  → stamp EVERY scene with the SAME seed + character
 *                          anchor so the protagonist (or the user's avatar)
 *                          never mutates across the 30 seconds
 *   3. Editor Agent      → concatenate the N clips into one seamless stream
 *   4. Audio/Foley Agent → bind a cohesive track / voiceover across the timeline
 *
 * This module is the PURE, dependency-light core of that plan. It imports only
 * the already-pure scene splitter (`script-breakdown`) and prompt-trait helpers
 * — never a provider SDK, network client, or `server-only` boundary — so the
 * whole production matrix is exhaustively unit-testable and can NEVER trigger a
 * paid render. The server fan-out lives in `filmComposite.ts`.
 */

import {
  deterministicBreakdown,
  planSegmentCount,
} from '@/lib/orchestrator/script-breakdown';
import { SEGMENT_DURATION_SEC } from '@/lib/orchestrator/types';
import { extractPromptTraits, enrichVideoPrompt } from './promptTraits';

/** The flagship runtime: a full 30-second film. */
export const FILM_TOTAL_SEC = 30;
/** 30s / 6s = 5 sequential scenes. Derived (not hardcoded) so it stays honest. */
export const FILM_SCENE_COUNT = planSegmentCount(FILM_TOTAL_SEC);

// ─── Intent detection ────────────────────────────────────────────────────────
// Deliberately conservative: matches explicit "30-second film / short film /
// mini-movie" language, NOT a bare "video". Music videos are intentionally left
// to the music-video composite (which owns lyrics + beat), so the router checks
// that path first. A false negative here just falls back to a normal video job.

const DURATION_RX = /\b(?:30|thirty)[\s-]?(?:second|sec|secs|s)\b/i;
const FILM_NOUN_RX = /\b(film|movie|cinematic\s+(?:short|sequence|story|piece)|short\s+film|mini[\s-]?(?:movie|film))\b/i;

export function isThirtySecondFilm(message: string): boolean {
  if (!message) return false;
  const m = String(message);
  // Compact forms: "30s film", "30-sec film".
  if (/\b30\s*s?\s*film\b/i.test(m)) return true;
  // Named short-form productions.
  if (/\bshort\s+film\b/i.test(m) || /\bmini[\s-]?(?:movie|film)\b/i.test(m)) return true;
  // "a 30 second film/movie/cinematic sequence".
  if (DURATION_RX.test(m) && FILM_NOUN_RX.test(m)) return true;
  return false;
}

// ─── Character / continuity consistency ──────────────────────────────────────

/**
 * Deterministic 32-bit FNV-1a seed derived from the brief. The SAME seed is
 * stamped on all N clips so the diffusion model re-anchors the protagonist's
 * face/wardrobe/palette instead of re-rolling a new character every shot. Pure
 * and stable: identical briefs always yield the identical seed (idempotent
 * retries reproduce the same film).
 */
export function buildConsistencySeed(prompt: string): number {
  const s = String(prompt || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned, clamped into a provider-safe positive 31-bit seed range.
  return (h >>> 0) % 2_147_483_647;
}

/**
 * The continuity clause appended to every scene prompt. When the user supplies
 * their custom avatar, the anchor locks to THAT identity; otherwise it locks the
 * first shot's protagonist as the canonical one to reproduce.
 */
export function buildCharacterAnchor(prompt: string, opts: FilmPlanOptions = {}): string {
  if (opts.avatarReference) {
    return "the user's custom avatar — identical face, hair and wardrobe in every shot";
  }
  return 'the same primary character — identical face, wardrobe, palette and styling in every shot';
}

/**
 * PHASE 44 §2 — The rigid VISUAL STYLE GUIDE stamped, verbatim, on every scene.
 *
 * The seed locks the diffusion noise; this clause locks the *semantics* the seed
 * alone can't guarantee — wardrobe, palette, lighting, lens, grain, character
 * design. Appended identically to all N clips so that, even as the camera and
 * composition change shot-to-shot, the world and protagonist do not. This is the
 * "rigid visual style guide" continuity contract the Master Agent enforces.
 */
export function buildStyleGuide(shared: FilmShared): string {
  const aesthetic = shared.style ? `${shared.style} aesthetic` : 'a single consistent cinematic aesthetic';
  const refCount = shared.referenceImages?.length ?? 0;
  const identity = refCount > 0
    ? `the exact subject from the user's ${refCount} uploaded reference image${refCount > 1 ? 's' : ''} (same face, hair, wardrobe)`
    : shared.avatarReference
      ? "the user's custom avatar (same face, hair, wardrobe)"
      : 'the same character design (same face, hair, wardrobe)';
  return (
    `Rigid visual style guide — identical in every shot: ${aesthetic}; one consistent color palette; `
    + `consistent key and rim lighting; the same lens, depth of field and film grain; unchanged props and set dressing; `
    + `${identity}.`
  );
}

// ─── Cinematic shot progression (the real Storyboard arc) ────────────────────
//
// PHASE 44 §2 — Without a Claude scene-writer the planner used to emit five
// identical prompts (differing only by " — shot N of 5"), so all five clips
// rendered as the same 6-second beat: continuity was perfect but the film was a
// monotone loop. This deterministic 5-beat grammar gives each scene a distinct
// composition + camera move (a genuine establishing → resolution arc) WITHOUT
// touching the seed or the style guide — so the protagonist holds while the
// cinematography actually progresses. Beat 3's enforced close-up doubles as a
// continuity anchor (it re-asserts the face mid-film).

interface CinematicBeat {
  /** Composition + camera direction folded into one render-ready framing phrase. */
  framing: string;
  /** One of script-breakdown's CAMERA_MOTIONS, kept honest for the segment record. */
  cameraMotion: string;
}

const CINEMATIC_BEATS: readonly CinematicBeat[] = [
  { framing: 'Epic wide establishing shot, anamorphic lens, slow cinematic dolly push-in that reveals the world as the protagonist enters frame — deep focus, golden-hour key light, gentle atmospheric haze', cameraMotion: 'zoom_in' },
  { framing: 'Smooth lateral tracking shot on a gimbal gliding alongside the protagonist at eye level — 35mm lens, shallow depth of field, soft rim light separating the subject from the background', cameraMotion: 'dolly' },
  { framing: 'Intimate cinematic close-up, 85mm portrait lens, a slow controlled pan across the protagonist’s face and signature details — creamy bokeh, soft Rembrandt lighting', cameraMotion: 'pan_left' },
  { framing: 'Dynamic low-angle hero shot at the dramatic peak with subtle handheld energy — wide lens, high contrast, volumetric backlight, the protagonist powerful against the sky', cameraMotion: 'pan_right' },
  { framing: 'Sweeping crane pull-back rising as the protagonist settles and the scene resolves — expansive composition, warm cinematic colour grade, soft lens flare, a confident final beat', cameraMotion: 'zoom_out' },
];

/**
 * Select the cinematic beat for scene `index` of `count`. The first scene always
 * establishes and the last always resolves; the middle scenes spread evenly
 * across the remaining beats, so any scene count (1–8) yields a coherent arc.
 */
export function sceneBeat(index: number, count: number): CinematicBeat {
  const last = CINEMATIC_BEATS.length - 1;
  if (count <= 1) return CINEMATIC_BEATS[0]!;
  const pos = Math.min(1, Math.max(0, index / (count - 1)));
  return CINEMATIC_BEATS[Math.round(pos * last)]!;
}

// ─── Plan model ──────────────────────────────────────────────────────────────

/** PHASE 45 §2/§3 — a film accepts up to THREE user reference images that lock
 *  the protagonist's identity into the LTX character-reference / IP-Adapter array. */
export const FILM_MAX_REFERENCE_IMAGES = 3;

/**
 * Normalise an arbitrary multimodal reference-image payload into a clean, capped,
 * de-duplicated array of 0–`max` non-empty string refs (data URLs / https URLs /
 * asset ids). Tolerates a single string, an array, JSON-encoded arrays, comma
 * lists, and null/undefined — the composer and the orchestrator both feed this.
 */
export function normalizeReferenceImages(input: unknown, max = FILM_MAX_REFERENCE_IMAGES): string[] {
  let raw: unknown[] = [];
  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try { const parsed = JSON.parse(trimmed); raw = Array.isArray(parsed) ? parsed : [trimmed]; }
      catch { raw = [trimmed]; }
    } else if (trimmed.includes(',') && !trimmed.startsWith('data:')) {
      // Comma lists are unsafe for data: URLs (which contain commas) — only split plain refs.
      raw = trimmed.split(',');
    } else {
      raw = [trimmed];
    }
  } else if (input != null) {
    raw = [input];
  }
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export interface FilmPlanOptions {
  /** A reference to the user's custom avatar (image URL / id) to lock identity. */
  avatarReference?: string | null;
  /** PHASE 45 §2 — 1–3 user-uploaded reference images for multimodal identity lock. */
  referenceImages?: unknown;
  /** Optional aesthetic/genre override (e.g. "cyberpunk", "noir"). */
  style?: string | null;
  /** Override total runtime; defaults to FILM_TOTAL_SEC (30s). */
  totalSec?: number;
}

/** Parameters shared identically across every clip — the continuity contract. */
export interface FilmShared {
  seed: number;
  characterAnchor: string;
  avatarReference: string | null;
  /** PHASE 45 §2 — 0–3 reference images mapped into the LTX characterReference array. */
  referenceImages: string[];
  style: string | null;
  sceneCount: number;
  totalSec: number;
}

/**
 * PHASE 47 §3 — Nano Banano's visual contingency plan for a single scene.
 *
 * When a clip is dropped by a transient provider failure and a fallback variant
 * must be mounted in its place, the editor needs that fallback to cosmetically
 * MATCH its neighbours — same protagonist, same seed, same palette — so the
 * 30-second cut reads as one continuous film, not an abrupt swap. Nano Banano
 * (the storyboard architect) emits this contingency alongside the primary prompt
 * and it rides in the clip's asset payload metadata. It deliberately re-asserts
 * the SAME continuity levers as the primary render (seed + character anchor +
 * reference) plus a motion-light "safe" framing that blends between the adjacent
 * shots instead of introducing a new camera move.
 */
export interface FilmSceneContingency {
  /** Identical to the primary render so a fallback re-anchors the same noise. */
  seed: number;
  /** Neutral, low-motion framing safe to swap in without a jarring camera move. */
  fallbackFraming: string;
  /** Ordinals of the adjacent scenes whose look the fallback must match. */
  matchNeighbors: number[];
  /** The shared character anchor the fallback must preserve verbatim. */
  characterAnchor: string;
  /** The primary character reference (avatar / first uploaded image), if any. */
  characterReference: string | null;
}

export interface FilmScene {
  /** 0-based render index. */
  index: number;
  /** 1-based ordinal for UI copy ("clip 1 of 5"). */
  ordinal: number;
  durationSec: number;
  cameraMotion: string;
  /** Fully enriched, continuity-anchored prompt for this clip. */
  prompt: string;
  /** SAME across all scenes (continuity). */
  seed: number;
  /** PHASE 47 §3 — the visual fallback plan that keeps a dropped clip on-model. */
  contingency: FilmSceneContingency;
}

/**
 * PHASE 47 §3 — Derive a scene's contingency plan. The fallback framing leans on
 * the neighbours' established look: an interior scene blends the previous and
 * next beats so a swapped-in clip never jumps the eyeline. Pure + deterministic.
 */
export function buildSceneContingency(
  index: number,
  count: number,
  shared: FilmShared,
): FilmSceneContingency {
  const ordinal = index + 1;
  const matchNeighbors = [ordinal - 1, ordinal + 1].filter((n) => n >= 1 && n <= count);
  const characterReference = shared.avatarReference ?? shared.referenceImages[0] ?? null;
  const fallbackFraming =
    'Steady, low-motion continuity shot holding the established framing — '
    + `${shared.characterAnchor}; identical palette, lighting and lens as the surrounding scenes `
    + `(consistency seed ${shared.seed}). No new camera move; blend seamlessly between adjacent shots.`;
  return { seed: shared.seed, fallbackFraming, matchNeighbors, characterAnchor: shared.characterAnchor, characterReference };
}

export interface FilmPlan {
  shared: FilmShared;
  scenes: FilmScene[];
}

/**
 * Decompose a brief into a complete, continuity-locked film plan. Reuses the
 * already-tested `deterministicBreakdown` shot splitter for the scene boundaries
 * and camera grammar, then stamps each scene with the shared seed + character
 * anchor and folds the brief's directorial traits (camera/style/lighting/mood)
 * back into the clip prompt via `enrichVideoPrompt`.
 */
export function planFilmScenes(prompt: string, opts: FilmPlanOptions = {}): FilmPlan {
  const totalSec = opts.totalSec && opts.totalSec > 0 ? opts.totalSec : FILM_TOTAL_SEC;
  const segments = deterministicBreakdown(prompt, totalSec);
  const seed = buildConsistencySeed(prompt);
  // PHASE 45 §2 — fold uploaded reference images into the identity lock. The
  // explicit avatarReference wins; otherwise the FIRST reference image becomes
  // the primary character anchor so the storyboard agent treats the upload as
  // the canonical protagonist.
  const referenceImages = normalizeReferenceImages(opts.referenceImages);
  const avatarReference = opts.avatarReference ?? referenceImages[0] ?? null;
  const characterAnchor = buildCharacterAnchor(prompt, { ...opts, avatarReference });
  const traits = extractPromptTraits(prompt, { defaultAudio: true });
  // The core subject, stripped of the splitter's " — shot N of N" suffix so each
  // scene reframes the SAME subject under a different cinematic beat.
  const subject = String(prompt || '').trim().replace(/\s*—\s*shot\s+\d+\s+of\s+\d+\s*$/i, '')
    || 'cinematic establishing shot';

  const shared: FilmShared = {
    seed,
    characterAnchor,
    avatarReference,
    referenceImages,
    style: opts.style ?? null,
    sceneCount: segments.length,
    totalSec,
  };

  const styleGuide = buildStyleGuide(shared);

  const scenes: FilmScene[] = segments.map((seg) => {
    // §2 — vary the COMPOSITION per scene (real storyboard arc)…
    const beat = sceneBeat(seg.index, segments.length);
    const styled = shared.style ? `, ${shared.style} style` : '';
    const head = `${beat.framing} — ${subject}${styled}`;
    // …while the seed + style guide + character anchor hold the world CONSTANT.
    const continuity = `${styleGuide} Continuity: ${characterAnchor}; match every other shot exactly (consistency seed ${seed}).`;
    const enriched = enrichVideoPrompt(`${head}. ${continuity}`, traits, 1200);
    return {
      index: seg.index,
      ordinal: seg.index + 1,
      durationSec: seg.durationSec,
      cameraMotion: beat.cameraMotion,
      prompt: enriched,
      seed,
      // PHASE 47 §3 — Nano Banano stamps each scene with its on-model fallback.
      contingency: buildSceneContingency(seg.index, segments.length, shared),
    };
  });

  return { shared, scenes };
}

// ─── Provider request shaping ────────────────────────────────────────────────

export interface FilmClipRequest {
  userPrompt: string;
  selectedOptions: Record<string, string>;
}

/**
 * Shape a single scene into a ServiceManager/LTX request. The seed is passed
 * explicitly (the primary continuity lever) and per-clip audio is OFF — the
 * Audio/Foley agent binds one cohesive track across the full stitched timeline
 * rather than five disjoint 6-second stings.
 */
export function buildFilmClipRequest(scene: FilmScene, shared: FilmShared): FilmClipRequest {
  const selectedOptions: Record<string, string> = {
    duration: String(scene.durationSec),
    fps: '24',
    aspectRatio: '9:16',
    seed: String(scene.seed),
    generate_audio: 'false',
  };
  // PHASE 45 §2 — map the 1–3 reference images into the LTX character-reference /
  // IP-Adapter array. The primary ref stays in `characterReference` for the
  // single-image path; the full set rides in `characterReferences` (JSON) so the
  // Director Agent can lock identity across all clips when multiple are supplied.
  const refs = shared.referenceImages?.length
    ? shared.referenceImages
    : (shared.avatarReference ? [shared.avatarReference] : []);
  const primaryRef = refs[0];
  if (primaryRef) selectedOptions.characterReference = primaryRef;
  if (refs.length > 0) selectedOptions.characterReferences = JSON.stringify(refs);
  if (shared.style) selectedOptions.style = shared.style;
  // PHASE 47 §3 — carry Nano Banano's on-model fallback plan in the asset payload
  // metadata so the Director/Editor can swap in a continuity-matched variant if
  // this leg drops, without re-rolling a fresh (off-model) character.
  selectedOptions.contingency = JSON.stringify(scene.contingency);
  return { userPrompt: scene.prompt, selectedOptions };
}

// ─── Progressive transparency (§4) ───────────────────────────────────────────

export interface FilmStageLabel {
  key: string;
  label: { en: string; ka: string; ru: string };
}

/**
 * The ordered, human-readable agent timeline surfaced to the user while the
 * film renders — Storyboard → per-clip render (with the character-consistency
 * reassurance) → Stitch → Audio → Finalize. Kept multilingual so the client
 * can render `label[lang]` directly.
 */
export function filmProgressStages(sceneCount: number = FILM_SCENE_COUNT): FilmStageLabel[] {
  const count = Number.isFinite(sceneCount) && sceneCount > 0 ? Math.floor(sceneCount) : FILM_SCENE_COUNT;
  const stages: FilmStageLabel[] = [
    {
      key: 'storyboard',
      label: {
        en: 'Storyboard Agent writing scenes…',
        ka: 'სცენარის აგენტი წერს სცენებს…',
        ru: 'Агент раскадровки пишет сцены…',
      },
    },
  ];
  for (let i = 1; i <= count; i++) {
    stages.push({
      key: `clip_${i}`,
      label: {
        en: `Rendering clip ${i} of ${count} · maintaining character consistency`,
        ka: `კლიპის რენდერი ${i}/${count} · პერსონაჟის თანმიმდევრულობა`,
        ru: `Рендер клипа ${i} из ${count} · сохранение персонажа`,
      },
    });
  }
  stages.push({
    key: 'stitch',
    label: {
      en: 'Editor Agent stitching the final film…',
      ka: 'მონტაჟის აგენტი ასრულებს ფილმს…',
      ru: 'Агент-монтажёр собирает финальный фильм…',
    },
  });
  stages.push({
    key: 'audio',
    label: {
      en: 'Audio Agent binding music & voiceover…',
      ka: 'აუდიო აგენტი ურთავს მუსიკას და ხმას…',
      ru: 'Аудио-агент привязывает музыку и озвучку…',
    },
  });
  stages.push({
    key: 'finalize',
    label: {
      en: 'Finalizing output…',
      ka: 'შედეგის დასრულება…',
      ru: 'Финализация результата…',
    },
  });
  return stages;
}
