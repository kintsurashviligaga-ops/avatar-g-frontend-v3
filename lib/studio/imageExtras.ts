/**
 * lib/studio/imageExtras.ts — Phase 7.5 additions to the Image tool, like Google AI Studio's Nano Banana screen. Pure and
 * client-safe. Every piece ships OFF:
 *
 *   · EXTRA RATIOS — gemini-3.1-flash-image also renders 1:4, 4:1, 1:8 and 8:1 (Google's model card:
 *     https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image). The picker offers them
 *     only with NEXT_PUBLIC_IMAGE_EXTRA_RATIOS on, and lib/ai/geminiImage forwards them to Google only with
 *     IMAGE_EXTRA_RATIOS on (off, an unknown ratio is dropped and Google picks its default, exactly as today). GG approved one
 *     paid check (~$0.05) once the database is back; both flags stay off until it passes. Same price per image.
 *   · EDIT MODE — with an image attached, the request already edits that image (the route sends it as the reference). The
 *     screen did not say so: it still read "Create". With NEXT_PUBLIC_IMAGE_EDIT_MODE on it says "Editing your image", the
 *     button says Edit, and quick edits fill the prompt. Nothing about the request changes.
 */

export const IMG_EXTRA_ASPECTS = ['1:4', '4:1', '1:8', '8:1'] as const;
export type ImgExtraAspect = (typeof IMG_EXTRA_ASPECTS)[number];

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

/** The picker offers the four extra ratios. Inlined at build time. */
export const imageExtraRatiosUiOn = (): boolean => truthy(process.env.NEXT_PUBLIC_IMAGE_EXTRA_RATIOS);
/** lib/ai/geminiImage forwards them to Google. Server only. */
export const imageExtraRatiosServerOn = (): boolean => truthy(process.env.IMAGE_EXTRA_RATIOS);
/** The screen says it is editing the attached image. Inlined at build time. */
export const imageEditModeUiOn = (): boolean => truthy(process.env.NEXT_PUBLIC_IMAGE_EDIT_MODE);

export const isImgExtraAspect = (v: unknown): v is ImgExtraAspect => typeof v === 'string' && (IMG_EXTRA_ASPECTS as readonly string[]).includes(v);

type L = 'ka' | 'en' | 'ru';
const lang = (locale: string): L => (locale === 'en' || locale === 'ru' ? locale : 'ka');

/** One quick edit: its chip label and the words it puts in the prompt (the user can change them before Edit). */
export interface QuickEdit { id: string; label: string; prompt: string }

const EDITS: Record<string, Record<L, [label: string, prompt: string]>> = {
  'remove-bg': {
    ka: ['ფონის მოშორება', 'მოაშორე ფონი, დატოვე მხოლოდ მთავარი საგანი სუფთა თეთრ ფონზე.'],
    en: ['Remove background', 'Remove the background and keep only the main subject on a clean white background.'],
    ru: ['Убрать фон', 'Убери фон, оставь только главный объект на чистом белом фоне.'],
  },
  'new-bg': {
    ka: ['ახალი ფონი', 'შეცვალე ფონი: '],
    en: ['New background', 'Replace the background with '],
    ru: ['Новый фон', 'Замени фон на '],
  },
  recolor: {
    ka: ['ფერის შეცვლა', 'შეცვალე ფერი: '],
    en: ['Change colours', 'Change the colour of '],
    ru: ['Сменить цвет', 'Измени цвет '],
  },
  'add-text': {
    ka: ['ტექსტის დამატება', 'დაამატე წარწერა „“ — მკაფიო, ლამაზი შრიფტით.'],
    en: ['Add text', 'Add the words "" in a clear, well-designed font.'],
    ru: ['Добавить текст', 'Добавь надпись «» чётким красивым шрифтом.'],
  },
  restyle: {
    ka: ['სტილის შეცვლა', 'იგივე კადრი, ოღონდ სტილში: '],
    en: ['Restyle', 'Keep the same scene, redrawn in the style of '],
    ru: ['Сменить стиль', 'Та же сцена, но в стиле '],
  },
  enhance: {
    ka: ['გაუმჯობესება', 'გააუმჯობესე სიმკვეთრე, შუქი და ფერები, შინაარსი არ შეცვალო.'],
    en: ['Enhance', 'Improve sharpness, light and colour without changing what is in the picture.'],
    ru: ['Улучшить', 'Улучши резкость, свет и цвета, не меняя содержание.'],
  },
};

export function quickEdits(locale: string): QuickEdit[] {
  const l = lang(locale);
  return Object.entries(EDITS).map(([id, v]) => ({ id, label: v[l][0], prompt: v[l][1] }));
}

/** What a quick edit does to the prompt: an empty box takes its words; a box with words keeps them and adds the edit on a new line. */
export function applyQuickEdit(current: string, edit: QuickEdit): string {
  const now = current.trimEnd();
  return now ? `${now}\n${edit.prompt}` : edit.prompt;
}

export function editModeCopy(locale: string) {
  const l = lang(locale);
  return {
    ka: { banner: 'შენს სურათს არედაქტირებ', hint: 'აღწერე, რა შეიცვალოს. დანარჩენი ისე დარჩება, როგორც არის.', button: 'რედაქტირება', placeholder: 'მაგ. ცა გახადე მზის ჩასვლისფერი', quick: 'სწრაფი რედაქტირება' },
    en: { banner: 'Editing your image', hint: 'Say what should change. Everything else stays as it is.', button: 'Edit', placeholder: 'e.g. make the sky a sunset', quick: 'Quick edits' },
    ru: { banner: 'Редактируете своё изображение', hint: 'Опишите, что изменить. Остальное останется как есть.', button: 'Изменить', placeholder: 'напр. сделай небо закатным', quick: 'Быстрые правки' },
  }[l];
}

/**
 * MULTI-REFERENCE (GG 2026-11-13, decision 4: "prepare the server change to read up to 14 images, keeping pricing the same").
 * gemini-3.1-flash-image takes up to 14 input images. Today the route reads ONE (`referenceImage`) and lib/ai/geminiImage
 * keeps at most 3. With IMAGE_MULTI_REF on, the route also reads `referenceImages` (extra pictures after the first), up to 14
 * in all. Off, the field is ignored and every request is exactly today's. The price is per image made, never per input.
 */
export const IMAGE_MULTI_REF_MAX = 14;
/** The image route reads `referenceImages`. Server only. */
export const imageMultiRefServerOn = (): boolean => truthy(process.env.IMAGE_MULTI_REF);

/**
 * The extra references a request carries: strings only (data: or https), trimmed, de-duplicated against the first and each
 * other, and cut so the first plus the extras never pass 14. Anything else in the field is dropped, never an error.
 */
export function extraReferences(raw: unknown, first: string): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(first ? [first] : []);
  const out: string[] = [];
  const room = IMAGE_MULTI_REF_MAX - (first ? 1 : 0);
  for (const v of raw) {
    if (out.length >= room) break;
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!s || seen.has(s) || !(s.startsWith('data:image/') || /^https:\/\//i.test(s))) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}
