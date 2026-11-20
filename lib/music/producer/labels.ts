/**
 * lib/music/producer/labels.ts — the words on the Music Producer buttons. Every label that could promise more than Lyria
 * does says what really happens (GG 2026-11-15: be candid about Vertex limits).
 */
import type { L10n } from './spec';

export const LABELS = {
  extend: { en: 'Add 30 s (new section, same style)', ka: '+30 წმ (ახალი ნაწილი, იგივე სტილი)', ru: '+30 с (новая часть, тот же стиль)' },
  extendTip: {
    en: 'Writes 30 more seconds in the same key, tempo and instruments and joins them on the beat. The melody of the new part is new.',
    ka: 'იმავე ტონალობაში, ტემპსა და საკრავებზე წერს კიდევ 30 წამს და რიტმზე აერთებს. ახალი ნაწილის მელოდია ახალია.',
    ru: 'Пишет ещё 30 секунд в той же тональности, темпе и инструментах и склеивает по долям. Мелодия новой части новая.',
  },
  restyle: { en: 'Restyle (new take)', ka: 'სტილის შეცვლა (ახალი ვერსია)', ru: 'Сменить стиль (новый дубль)' },
  restyleTip: {
    en: 'Keeps the lyrics, structure and tempo and changes the style. Lyria cannot keep the melody, so it is a new take.',
    ka: 'ინახავს ტექსტს, სტრუქტურასა და ტემპს და ცვლის სტილს. Lyria მელოდიას ვერ ინახავს, ამიტომ ეს ახალი ვერსიაა.',
    ru: 'Сохраняет текст, структуру и темп и меняет стиль. Lyria не умеет сохранять мелодию, поэтому это новый дубль.',
  },
  useInVideo: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'Использовать в видео' },
  regenerate: { en: 'Regenerate', ka: 'თავიდან შექმნა', ru: 'Создать заново' },
  lyrics: { en: 'Lyrics', ka: 'ტექსტი', ru: 'Текст' },
  synced: { en: 'Synced by section', ka: 'სინქრონი ნაწილების მიხედვით', ru: 'Синхронизация по частям' },
  targetTempo: { en: 'Target tempo', ka: 'სასურველი ტემპი', ru: 'Желаемый темп' },
  writeLyrics: { en: 'Write lyrics for me', ka: 'ტექსტი შენ დაწერე', ru: 'Напиши текст за меня' },
  georgianBeta: { en: 'Georgian vocals (beta)', ka: 'ქართული ვოკალი (ბეტა)', ru: 'Грузинский вокал (бета)' },
  refunded: { en: 'The track did not come back. Your credits were returned.', ka: 'ტრეკი ვერ შეიქმნა. კრედიტები დაგიბრუნდა.', ru: 'Трек не получился. Кредиты возвращены.' },
} as const satisfies Record<string, L10n>;
