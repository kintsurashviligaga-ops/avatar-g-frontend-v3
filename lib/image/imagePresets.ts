/**
 * One-tap starting points for the Image panel.
 *
 * Same contract as lib/video/videoPresets: a preset sets several fields at once from something the user
 * has an opinion about ("this is a product shot", "this is a poster"), every individual control stays
 * visible underneath, and the active highlight is DERIVED from the live values rather than stored — a
 * chip that stayed lit after the user changed the aspect would be describing settings they no longer
 * have, right next to a button that spends credits.
 *
 * Quality is deliberately part of the preset. It is the field users understand least — "1K / 2K / 4K"
 * says nothing about what it is FOR — and the one where a wrong guess is most expensive in render time.
 * A preset can answer it from the use case instead: a social post does not need 4K, a print poster does.
 *
 * `count` is NOT included. It multiplies the charge (imgCount > 1 fans out into N separate billed
 * requests), and a control that silently quadruples a bill is not something a preset should touch.
 */

export interface ImagePresetValues {
  aspect: string;
  quality: 'standard' | 'high' | 'ultra';
  style: string;
}

export interface ImagePreset extends ImagePresetValues {
  id: string;
  emoji: string;
  label: { ka: string; en: string; ru: string };
  hint: { ka: string; en: string; ru: string };
}

export const IMAGE_PRESETS: ReadonlyArray<ImagePreset> = [
  {
    id: 'social',
    emoji: '📱',
    label: { ka: 'სოციალური', en: 'Social post', ru: 'Соцсети' },
    hint: {
      ka: '4:5 — Instagram-ის ლენტის ფორმატი, 2K',
      en: '4:5 — the Instagram feed ratio, 2K',
      ru: '4:5 — формат ленты Instagram, 2K',
    },
    aspect: '4:5', quality: 'high', style: 'Photorealistic',
  },
  {
    id: 'product',
    emoji: '📦',
    label: { ka: 'პროდუქტი', en: 'Product shot', ru: 'Товар' },
    hint: {
      ka: '1:1 კვადრატი, 4K — კატალოგისთვის',
      en: '1:1 square at 4K — catalogue quality',
      ru: '1:1 квадрат, 4K — для каталога',
    },
    aspect: '1:1', quality: 'ultra', style: 'Photorealistic',
  },
  {
    id: 'poster',
    emoji: '🖼',
    label: { ka: 'პოსტერი', en: 'Poster', ru: 'Постер' },
    hint: {
      ka: '3:4 პორტრეტი, 4K — ბეჭდვისთვის',
      en: '3:4 portrait at 4K — sized for print',
      ru: '3:4 портрет, 4K — для печати',
    },
    aspect: '3:4', quality: 'ultra', style: 'Cinematic',
  },
  {
    id: 'wallpaper',
    emoji: '🌄',
    label: { ka: 'ფონი', en: 'Wallpaper', ru: 'Обои' },
    hint: {
      ka: '16:9 ფართო, 4K',
      en: '16:9 widescreen at 4K',
      ru: '16:9 широкий, 4K',
    },
    aspect: '16:9', quality: 'ultra', style: 'Cinematic',
  },
  {
    id: 'concept',
    emoji: '🎨',
    label: { ka: 'კონცეპტი', en: 'Concept art', ru: 'Концепт' },
    hint: {
      ka: '16:9, 2K — სწრაფი იდეის შესამოწმებლად',
      en: '16:9 at 2K — quick enough to iterate on an idea',
      ru: '16:9, 2K — быстро проверить идею',
    },
    aspect: '16:9', quality: 'high', style: 'Digital Art',
  },
  {
    id: 'anime',
    emoji: '✨',
    label: { ka: 'ანიმე', en: 'Anime', ru: 'Аниме' },
    hint: {
      ka: '9:16 ვერტიკალური, 2K',
      en: '9:16 vertical at 2K',
      ru: '9:16 вертикальное, 2K',
    },
    aspect: '9:16', quality: 'high', style: 'Anime',
  },
];

/** Which preset the current values still describe — null the moment any field diverges. */
export function matchImagePreset(v: ImagePresetValues | null | undefined): string | null {
  if (!v) return null;
  const hit = IMAGE_PRESETS.find((p) => p.aspect === v.aspect && p.quality === v.quality && p.style === v.style);
  return hit ? hit.id : null;
}

export function imagePresetValues(id: string): ImagePresetValues | null {
  const p = IMAGE_PRESETS.find((x) => x.id === id);
  return p ? { aspect: p.aspect, quality: p.quality, style: p.style } : null;
}
