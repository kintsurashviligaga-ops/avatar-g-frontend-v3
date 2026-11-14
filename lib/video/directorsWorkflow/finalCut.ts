/**
 * lib/video/directorsWorkflow/finalCut.ts — the final cut of a Director's Workflow film (Phase 8.3, PR D). Pure and
 * client-safe: what the cut needs, in what order, at what size, and what (if anything) it costs.
 *
 *   • The delivered scene clips are joined IN STORYBOARD ORDER into one film (lib/video/longform/stitch: a stream copy
 *     when every clip matches, else a re-encode to the film's frame).
 *   • ONE FRAME FOR THE WHOLE FILM (GG 2026-11-14 decision 2): 1080p → 1920×1080 (or 1080×1920 vertical), 720p →
 *     1280×720. A clip of another size is scaled to it; nothing is upscaled because a 1080p film has no 720p scene
 *     (plan.sceneClipSpec).
 *   • The cut itself is FREE (our own ffmpeg). Only the optional WHOLE-FILM MUSIC BED (GG decision 5: "Add cinematic
 *     music to the whole film") costs, at the price book's music row for the bed's length, charged when it is made and
 *     refunded if the bed or the cut misses.
 *   • "Re-do scene 3": the runner re-renders that scene alone (runner.ts), and the next cut replaces the film in the
 *     Library under the same id, so the user keeps ONE film per project.
 */
import { musicCredits } from '@/lib/credits/priceBook';
import type { DwProject } from './types';

export const DW_MUSIC_PROMPT_MAX = 300;
/** What a bed is asked for when the user just says "add music" without saying which. */
export const DW_DEFAULT_MUSIC = 'cinematic orchestral score, warm and emotional, no vocals';

export interface DwCutClip {
  sceneId: string;
  url: string;
}

export interface DwMusicBed {
  /** What the bed should sound like, in the user's words ("cinematic", "soft piano"). Always instrumental. */
  prompt: string;
}

const sorted = (p: DwProject) => [...p.scenes].sort((a, b) => a.order - b.order);

export const filmSeconds = (p: DwProject): number => p.scenes.reduce((n, s) => n + s.seconds, 0);

/** The clips in film order, or which scenes have no delivered clip yet. */
export function orderedCutClips(project: DwProject, clips: readonly DwCutClip[]): { ok: true; urls: string[] } | { ok: false; missing: string[] } {
  const byScene = new Map(clips.map((c) => [c.sceneId, c.url]));
  const missing: string[] = [];
  const urls: string[] = [];
  for (const s of sorted(project)) {
    const u = byScene.get(s.id);
    if (!u) missing.push(s.id);
    else urls.push(u);
  }
  return missing.length ? { ok: false, missing } : { ok: true, urls };
}

/** The film's frame: the user's resolution, in the board's orientation, 24 fps. */
export function cutTarget(project: DwProject): { width: number; height: number; fps: number } {
  const long = project.resolution === '1080p' ? 1920 : 1280;
  const short = project.resolution === '1080p' ? 1080 : 720;
  return project.aspect === '9:16' ? { width: short, height: long, fps: 24 } : { width: long, height: short, fps: 24 };
}

/**
 * The bed's price for a bed of `bedSec` seconds (the server decides the length from what Lyria can make here:
 * lib/audio/lyriaBed.lyriaBedPlan; a bed shorter than the film loops under it).
 */
export const musicBedCredits = (bedSec: number): number => musicCredits(bedSec);

/** One stable Library id per project: a re-cut after "re-do scene 3" replaces the film, never adds a second one. */
export const dwFilmLibraryId = (project: DwProject): string => `dwfilm_${project.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

const MUSIC_WORD = /\b(music|soundtrack|score)\b|მუსიკ|саундтрек|музык/i;
const WHOLE_FILM = /\b(whole|entire|all|full)\b.*\b(film|movie|video)\b|მთელ(ს|ი)?\s*ფილმ|ფილმ(ს|ი)?\s*მთლიან|(весь|всему|всего|целый)\s*фильм/i;

/**
 * "Add cinematic music to the whole film" / „მთელ ფილმს დაადე კინემატოგრაფიული მუსიკა" / „добавь музыку на весь фильм"
 * → the bed to ask for, or null when the message is not that request. The style words are kept as the user wrote them
 * (the server puts them into English for Lyria); a bare request gets the default cinematic score.
 */
export function wholeFilmMusicAsk(text: string): DwMusicBed | null {
  const t = text.trim();
  if (!t || !MUSIC_WORD.test(t) || !WHOLE_FILM.test(t)) return null;
  const style = t
    .replace(/\b(please|add|put|give|make|to|on|under|the|a|an|whole|entire|all|full|film|movie|video|music|soundtrack|score)\b/gi, ' ')
    .replace(/მთელ(ს|ი)?|ფილმ(ს|ი|ზე)?|დაადე|დაამატე|მუსიკა|მუსიკ(ა|ის)?|добавь|поставь|на|весь|всему|фильм(у)?|музык(у|а)/gi, ' ')
    .replace(/[.,!?;:„“"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { prompt: (style ? `${style} music` : DW_DEFAULT_MUSIC).slice(0, DW_MUSIC_PROMPT_MAX) };
}
