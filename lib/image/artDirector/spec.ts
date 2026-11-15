/**
 * lib/image/artDirector/spec.ts — what the Art Director offers, and what gemini-3.1-flash-image on Vertex really supports
 * (checked 2026-11-15). Pure, client-safe.
 *
 * Supported by the model: 14 aspect ratios (1:4, 4:1, 1:8, 8:1 are new in 3.1 Flash Image), 1K / 2K / 4K output, image
 * references (Google: identity held for about 5 characters, up to 14 objects).
 * NOT supported, and therefore built differently (never faked):
 *  - Imagen 3 (and every Imagen model) is discontinued on Vertex: nothing here can name one (lib/image/lifecycle).
 *  - No mask parameter: a brush mask is sent as a second picture and the original is pasted back outside it (mask.ts).
 *  - No deterministic upscaler: "upscale" is a re-render at 2K/4K with the image as its own reference (generative).
 *  - One image per call: a grid of 2 or 4 is that many separately charged calls (grid.ts).
 *  - No negative-prompt field: "what to avoid" is a final "Avoid:" line (best effort).
 *  - A seed is sent and saved, but Google does not promise the same picture for the same seed (best effort).
 */
export const ART_MODEL = 'gemini-3.1-flash-image' as const;

export const ART_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1',
] as const;
export type ArtRatio = (typeof ART_RATIOS)[number];

export const ART_SIZES = ['1K', '2K', '4K'] as const;
export type ArtSize = (typeof ART_SIZES)[number];

export const ART_COUNTS = [1, 2, 4] as const;
export type ArtCount = (typeof ART_COUNTS)[number];

/** References the model takes in one request (Google's stated object ceiling). */
export const MAX_REFERENCES = 14;
/** Above this many people/face references Google no longer promises likeness: the panel warns, it does not refuse. */
export const IDENTITY_SOFT_LIMIT = 5;
/** Combined reference bytes after normalisation (keeps one request well under Vertex's inline limit). */
export const MAX_REFERENCE_BYTES = 40 * 1024 * 1024;

export const ART_ROLES = [
  'face', 'character', 'outfit', 'style', 'pose', 'composition', 'background', 'product', 'color', 'object',
] as const;
export type ArtRole = (typeof ART_ROLES)[number];
/** Roles that carry a person's identity (counted against IDENTITY_SOFT_LIMIT). */
export const PERSON_ROLES: readonly ArtRole[] = ['face', 'character'];

/** Letters A–N name references in the prompt and in the UI ("the face from A, the outfit from B"). */
export const REF_LETTERS = 'ABCDEFGHIJKLMN'.split('') as readonly string[];

export interface StylePreset {
  id: string;
  label: { ka: string; en: string; ru: string };
  /** Appended to the prompt as "Style: …". English: the model's strongest language for style vocabulary. */
  prompt: string;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'photoreal', label: { ka: 'ფოტორეალისტური', en: 'Photorealistic', ru: 'Фотореализм' }, prompt: 'photorealistic photograph, natural light, true-to-life skin and materials, 50mm lens' },
  { id: 'cinematic', label: { ka: 'კინემატოგრაფიული', en: 'Cinematic', ru: 'Кинематографичный' }, prompt: 'cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, color graded' },
  { id: 'anime', label: { ka: 'ანიმე', en: 'Anime', ru: 'Аниме' }, prompt: 'anime illustration, clean line art, cel shading, vibrant colors' },
  { id: 'render3d', label: { ka: '3D რენდერი', en: '3D Render', ru: '3D-рендер' }, prompt: 'high-end 3D render, global illumination, soft shadows, physically based materials' },
  { id: 'illustration', label: { ka: 'ილუსტრაცია', en: 'Illustration', ru: 'Иллюстрация' }, prompt: 'editorial digital illustration, bold shapes, considered color palette' },
  { id: 'watercolor', label: { ka: 'აკვარელი', en: 'Watercolor', ru: 'Акварель' }, prompt: 'watercolor painting on textured paper, soft washes, visible pigment blooms' },
  { id: 'oil', label: { ka: 'ზეთის ფერწერა', en: 'Oil painting', ru: 'Масляная живопись' }, prompt: 'oil painting on canvas, visible brush strokes, rich impasto' },
  { id: 'comic', label: { ka: 'კომიქსი', en: 'Comic', ru: 'Комикс' }, prompt: 'comic book art, ink outlines, halftone shading, dynamic composition' },
  { id: 'pixel', label: { ka: 'პიქსელ-არტი', en: 'Pixel art', ru: 'Пиксель-арт' }, prompt: '16-bit pixel art, limited palette, crisp pixels, no anti-aliasing' },
  { id: 'product', label: { ka: 'პროდუქტის სტუდია', en: 'Product studio', ru: 'Предметная съёмка' }, prompt: 'studio product photography, seamless backdrop, softbox lighting, crisp reflections' },
  { id: 'fashion', label: { ka: 'მოდის ედიტორიალი', en: 'Fashion editorial', ru: 'Фэшн-съёмка' }, prompt: 'high-fashion editorial photograph, magazine lighting, styled pose' },
  { id: 'georgian', label: { ka: 'ქართული ორნამენტი', en: 'Georgian ornament', ru: 'Грузинский орнамент' }, prompt: 'decorated with traditional Georgian ornament motifs, Georgian folk art palette' },
];

export const NEGATIVE_CHIPS: readonly { id: string; text: string; label: { ka: string; en: string; ru: string } }[] = [
  { id: 'blurry', text: 'blurry or out-of-focus areas', label: { ka: 'ბუნდოვანი', en: 'Blurry', ru: 'Размытость' } },
  { id: 'fingers', text: 'extra or deformed fingers and hands', label: { ka: 'ზედმეტი თითები', en: 'Extra fingers', ru: 'Лишние пальцы' } },
  { id: 'text', text: 'any text, letters or captions', label: { ka: 'ტექსტი', en: 'Text', ru: 'Текст' } },
  { id: 'watermark', text: 'watermarks or logos', label: { ka: 'ვოდიშნიშანი', en: 'Watermark', ru: 'Водяной знак' } },
  { id: 'lowres', text: 'low resolution, JPEG artifacts, noise', label: { ka: 'დაბალი ხარისხი', en: 'Low quality', ru: 'Низкое качество' } },
];

export function stylePreset(id: string | null | undefined): StylePreset | null {
  return STYLE_PRESETS.find((s) => s.id === id) ?? null;
}

/** width / height of a ratio, e.g. '9:16' → 0.5625. */
export function ratioValue(r: ArtRatio): number {
  const [w, h] = r.split(':').map(Number);
  return (w as number) / (h as number);
}

/** The listed ratio nearest a picture's own shape (log distance, so 1:8 and 8:1 are as far from 1:1 as each other). */
export function nearestRatio(width: number, height: number): ArtRatio {
  const target = Math.log(width / height);
  let best: ArtRatio = '1:1';
  let d = Infinity;
  for (const r of ART_RATIOS) {
    const x = Math.abs(Math.log(ratioValue(r)) - target);
    if (x < d - 1e-12) { d = x; best = r; }
  }
  return best;
}
