/**
 * One-tap starting points for the Cinema tab.
 *
 * ⚠️ THE PROBLEM THEY SOLVE. The video panel carries 57 controls. Every one of them is individually
 * reasonable and the combination is not: a first-time user has to decide a mode, a length, a format and
 * a look before anything happens, and three of those four are questions they do not yet have an opinion
 * about. A preset answers all four at once from something they DO have an opinion about — "this is for
 * Instagram", "this is a trailer" — and leaves every individual control visible underneath, so it is a
 * starting point rather than a mode they are trapped in.
 *
 * ⚠️ THE ACTIVE PRESET IS DERIVED, NEVER STORED. `matchVideoPreset` recomputes it from the live values
 * on every render. Storing "the user picked Reel" separately would leave Reel highlighted after they
 * change the length to 48s — a highlighted preset that no longer describes the form is worse than no
 * highlight at all, because it tells the user their settings are something they are not.
 *
 * Values are deliberately limited to the four that every preset can speak to. Audio, dialogue, lip-sync
 * and the rest stay where they are: a preset that silently rewrote a dozen fields would be a mode
 * switch wearing a chip's clothing, and the user would have no way to see what it did.
 */

export type VideoMode = 'musicvideo' | 'documentary';
export type VideoDuration = 8 | 24 | 48;
export type VideoOrientation = 'landscape' | 'vertical' | 'square' | 'portrait';

export interface VideoPresetValues {
  mode: VideoMode;
  duration: VideoDuration;
  orientation: VideoOrientation;
  style: string;
}

export interface VideoPreset extends VideoPresetValues {
  id: string;
  emoji: string;
  label: { ka: string; en: string; ru: string };
  /** Why someone would pick this — shown as the button's title. */
  hint: { ka: string; en: string; ru: string };
}

/**
 * ⚠️ TWO PRESETS WERE REMOVED HERE, AND THE REASON IS WORTH KEEPING.
 *
 * The first version of this list included 'musicvideo' and 'documentary'. Those are the exact two
 * options on the Mode card that sits DIRECTLY BELOW this row — so the same choice appeared twice on one
 * screen, once as a chip and once as a card, with no way to tell which one was in charge. That is not a
 * shortcut, it is a second control for a setting that already had one, and it made the panel harder to
 * read rather than easier.
 *
 * What survives are the combinations you CANNOT express by tapping one existing control: Reel, Trailer
 * and Teaser each set a mode AND a length AND a format AND a look together. A preset earns its place by
 * collapsing several decisions; one that mirrors a single neighbouring control only adds noise.
 */
export const VIDEO_PRESETS: ReadonlyArray<VideoPreset> = [
  {
    id: 'reel',
    emoji: '📱',
    label: { ka: 'რილსი', en: 'Reel', ru: 'Reels' },
    hint: {
      ka: '24 წამი, ვერტიკალური 9:16 — Instagram/TikTok-ისთვის',
      en: '24s vertical 9:16 — sized for Instagram and TikTok',
      ru: '24 с, вертикальное 9:16 — для Instagram и TikTok',
    },
    mode: 'documentary', duration: 24, orientation: 'vertical', style: 'Cinematic',
  },
  {
    id: 'trailer',
    emoji: '🎬',
    label: { ka: 'ტრეილერი', en: 'Trailer', ru: 'Трейлер' },
    hint: {
      ka: '48 წამი, ფართო 16:9, დრამატული',
      en: '48s widescreen 16:9, dramatic look',
      ru: '48 с, широкий 16:9, драматичный стиль',
    },
    mode: 'documentary', duration: 48, orientation: 'landscape', style: 'Dramatic',
  },
  {
    id: 'teaser',
    emoji: '⚡',
    label: { ka: 'თიზერი', en: 'Teaser', ru: 'Тизер' },
    hint: {
      ka: '8 წამი, ერთი სცენა — სწრაფი და იაფი',
      en: '8s single scene — the fastest and cheapest way to test an idea',
      ru: '8 с, одна сцена — быстро и дёшево проверить идею',
    },
    mode: 'documentary', duration: 8, orientation: 'vertical', style: 'Cinematic',
  },
];

/**
 * Which preset, if any, the current settings still match.
 *
 * Returns null the moment ANY of the four diverges — that is the point. A preset chip is a claim about
 * what the form currently says, so it has to stop being true as soon as the form stops agreeing.
 */
export function matchVideoPreset(v: VideoPresetValues | null | undefined): string | null {
  if (!v) return null;
  const hit = VIDEO_PRESETS.find(
    (p) => p.mode === v.mode && p.duration === v.duration && p.orientation === v.orientation && p.style === v.style,
  );
  return hit ? hit.id : null;
}

/** The values a preset applies, or null for an unknown id. */
export function videoPresetValues(id: string): VideoPresetValues | null {
  const p = VIDEO_PRESETS.find((x) => x.id === id);
  return p ? { mode: p.mode, duration: p.duration, orientation: p.orientation, style: p.style } : null;
}
