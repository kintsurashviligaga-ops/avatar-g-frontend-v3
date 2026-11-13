/**
 * Music panel polish, Phase 7.6 M1–M4 (GG 2026-11-13 18:15Z), all behind NEXT_PUBLIC_MUSIC_UX_V2 (off):
 *   M1 a "You will get" line above Create, M2 lyrics section chips, M3 why vocals are locked, M4 the two approximate
 *   sliders folded under "Advanced" with a dot when moved.
 * UI only: the price shown is the panel's own musicQuote, the same number Create already shows. No route, no billing.
 */
import type { VocalGender } from '@/lib/ai/musicControls';
import type { MusicDuration } from '@/lib/studio/musicQuote';
import type { LyricsSection } from '@/lib/studio/lyricsTags';

/** NEXT_PUBLIC_ is inlined at build time only when read literally. */
export function musicUxV2On(): boolean {
  return /^(1|true|yes|on)$/i.test((process.env.NEXT_PUBLIC_MUSIC_UX_V2 ?? '').trim());
}

type L = 'ka' | 'en' | 'ru';
const lang = (l: string): L => (l === 'en' || l === 'ru' ? l : 'ka');

const COPY = {
  ka: {
    youGet: 'მიიღებ:', fullSong: 'სრული სიმღერა', sec: (n: number) => `${n} წმ`, instrumental: 'ინსტრუმენტული',
    vocals: (who: string) => `ვოკალი (${who})`, vocalsAuto: 'ვოკალი',
    vocal: { auto: 'ავტო', female: 'ქალის', male: 'კაცის', duet: 'დუეტი' } as Record<VocalGender, string>,
    sections: 'სექციები', addSection: (s: string) => `დაამატე [${s}]`,
    section: { Verse: 'კუპლეტი', Chorus: 'მისამღერი', Bridge: 'ბრიჯი', Outro: 'დასასრული' } as Record<LyricsSection, string>,
    vocalsWhy: 'რატომ? ნამღერ სიმღერას ჯერ ვამოწმებთ, რომ ქართული ტექსტი სწორად იმღეროს. მანამდე ინსტრუმენტული სრულად მუშაობს და იგივე ფასი აქვს.',
    advanced: 'დამატებით', moved: 'შეცვლილია',
  },
  en: {
    youGet: 'You will get:', fullSong: 'full song', sec: (n: number) => `${n} s`, instrumental: 'instrumental',
    vocals: (who: string) => `vocals (${who.toLowerCase()})`, vocalsAuto: 'vocals',
    vocal: { auto: 'Auto', female: 'female', male: 'male', duet: 'duet' } as Record<VocalGender, string>,
    sections: 'Sections', addSection: (s: string) => `Add [${s}]`,
    section: { Verse: 'Verse', Chorus: 'Chorus', Bridge: 'Bridge', Outro: 'Outro' } as Record<LyricsSection, string>,
    vocalsWhy: 'Why? We are still checking that sung songs pronounce Georgian lyrics correctly. Until then instrumentals work fully, at the same price.',
    advanced: 'Advanced', moved: 'changed',
  },
  ru: {
    youGet: 'Вы получите:', fullSong: 'полная песня', sec: (n: number) => `${n} с`, instrumental: 'инструментал',
    vocals: (who: string) => `вокал (${who.toLowerCase()})`, vocalsAuto: 'вокал',
    vocal: { auto: 'Авто', female: 'женский', male: 'мужской', duet: 'дуэт' } as Record<VocalGender, string>,
    sections: 'Секции', addSection: (s: string) => `Добавить [${s}]`,
    section: { Verse: 'Куплет', Chorus: 'Припев', Bridge: 'Бридж', Outro: 'Концовка' } as Record<LyricsSection, string>,
    vocalsWhy: 'Почему? Мы ещё проверяем, что песни с вокалом правильно поют грузинский текст. До тех пор инструментал работает полностью и по той же цене.',
    advanced: 'Дополнительно', moved: 'изменено',
  },
};

export function musicUxV2Copy(locale: string) {
  return COPY[lang(locale)];
}

/** M1: „მიიღებ: 60 წმ · ვოკალი (ქალის) · Lyria 3 Pro · ✦ 12" — what Create will make, from what the panel already shows. */
export function musicSummaryLine(o: {
  locale: string; duration: MusicDuration; cover: boolean; instrumental: boolean; vocal: VocalGender; engine: string; credits: number;
}): string {
  const c = musicUxV2Copy(o.locale);
  const len = o.cover ? c.sec(30) : o.duration === 0 ? c.fullSong : c.sec(o.duration);
  const voice = o.instrumental ? c.instrumental : o.vocal === 'auto' ? c.vocalsAuto : c.vocals(c.vocal[o.vocal]);
  return [len, voice, o.engine, `✦ ${o.credits}`].filter(Boolean).join(' · ');
}

/** M4: the sliders are off neutral (50 / 50), so the folded "Advanced" row shows a dot. */
export function slidersMoved(s: { weirdness: number; styleInfluence: number }, neutral = 50): boolean {
  return Math.round(s.weirdness) !== neutral || Math.round(s.styleInfluence) !== neutral;
}
