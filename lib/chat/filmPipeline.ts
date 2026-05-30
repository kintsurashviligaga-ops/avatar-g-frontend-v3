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

// ─── Plan model ──────────────────────────────────────────────────────────────

export interface FilmPlanOptions {
  /** A reference to the user's custom avatar (image URL / id) to lock identity. */
  avatarReference?: string | null;
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
  style: string | null;
  sceneCount: number;
  totalSec: number;
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
  const characterAnchor = buildCharacterAnchor(prompt, opts);
  const traits = extractPromptTraits(prompt, { defaultAudio: true });

  const shared: FilmShared = {
    seed,
    characterAnchor,
    avatarReference: opts.avatarReference ?? null,
    style: opts.style ?? null,
    sceneCount: segments.length,
    totalSec,
  };

  const scenes: FilmScene[] = segments.map((seg) => {
    const continuity = `Continuity: ${characterAnchor}. Match the palette and lighting of the other shots (consistency seed ${seed}).`;
    const styled = shared.style ? `${seg.prompt}, ${shared.style} style` : seg.prompt;
    const enriched = enrichVideoPrompt(`${styled}. ${continuity}`, traits, 1200);
    return {
      index: seg.index,
      ordinal: seg.index + 1,
      durationSec: seg.durationSec,
      cameraMotion: seg.cameraMotion,
      prompt: enriched,
      seed,
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
  if (shared.avatarReference) selectedOptions.characterReference = shared.avatarReference;
  if (shared.style) selectedOptions.style = shared.style;
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
