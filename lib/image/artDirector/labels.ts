/**
 * lib/image/artDirector/labels.ts — UI words for the Art Director (ka / en / ru). Pure, client-safe.
 * Upscale wording is GG's (2026-11-15 05:44Z): „გაუმჯობესება (ხელახლა დახატვა)" / "Upscale (Re-render)" with the tooltip
 * "Re-renders the image at a higher resolution for more detail." — it is a generative re-render, not a pixel upscaler.
 */
export type Lang = 'ka' | 'en' | 'ru';

export const ART_LABELS = {
  upscale: { ka: 'გაუმჯობესება (ხელახლა დახატვა)', en: 'Upscale (Re-render)', ru: 'Улучшить (перерисовать)' },
  upscaleTip: {
    ka: 'სურათს უფრო მაღალ გარჩევადობაში ხელახლა ხატავს, მეტი დეტალისთვის.',
    en: 'Re-renders the image at a higher resolution for more detail.',
    ru: 'Перерисовывает изображение в более высоком разрешении для большей детализации.',
  },
  edit: { ka: 'რედაქტირება', en: 'Edit', ru: 'Редактировать' },
  vary: { ka: 'ვარიაცია', en: 'Vary', ru: 'Вариация' },
  useAsBase: { ka: 'საფუძვლად გამოყენება', en: 'Use as base', ru: 'Взять за основу' },
  download: { ka: 'ჩამოტვირთვა', en: 'Download', ru: 'Скачать' },
  save: { ka: 'ბიბლიოთეკაში შენახვა', en: 'Save to Library', ru: 'В библиотеку' },
  keepRest: { ka: 'დანარჩენი უცვლელი დატოვე', en: 'Keep everything else identical', ru: 'Остальное без изменений' },
  brushPrompt: { ka: 'რა შეიცვალოს აქ?', en: 'What should change here?', ru: 'Что изменить здесь?' },
  avoid: { ka: 'რას მოვერიდოთ (შეძლებისდაგვარად)', en: 'What to avoid (best effort)', ru: 'Чего избегать (по возможности)' },
  seed: { ka: 'Seed (შეძლებისდაგვარად)', en: 'Seed (best effort)', ru: 'Seed (по возможности)' },
  refunded: { ka: 'დაბრუნდა', en: 'refunded', ru: 'возвращено' },
  identityWarn: {
    ka: '5-ზე მეტ ადამიანზე Google მსგავსებას აღარ გვპირდება.',
    en: 'Google does not promise likeness for more than 5 people.',
    ru: 'Google не гарантирует сходство более чем для 5 человек.',
  },
} as const;

export function artLabel(key: keyof typeof ART_LABELS, lang: Lang): string {
  return ART_LABELS[key][lang] ?? ART_LABELS[key].en;
}
