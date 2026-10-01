/**
 * components/studio/ui/musicControlsCopy.ts — ka / en / ru copy for the music panel's granular controls
 * (lib/ai/musicControls): the style strip, the Lyrics | Instrumental switch, the singer's four stops, the Weirdness and
 * Style influence sliders with their „approximate" hint, and the result card's note on how the sliders reached the
 * engine (the route's `controls.mode`).
 *
 * ⚠️ „APPROXIMATE" IS AN OWNER DECISION, NOT MODESTY. On Lyria and ElevenLabs a slider can only add a sentence to the
 * text brief — neither engine has a knob for it — so the panel must never present them as exact settings, and the
 * result card says which way a track's sliders actually landed.
 *
 * Pure (no React), so every string is checked in all three languages by a test.
 */
import { SLIDER_DEFAULT, clampSlider, type MusicControlMode, type VocalGender } from '@/lib/ai/musicControls';

export type MusicControlsLang = 'ka' | 'en' | 'ru';

export interface MusicControlsCopy {
  /** The style strip's label — it says the cap, which the counter beside it then tracks. */
  styles: string;
  trackType: string;
  lyrics: string;
  instrumental: string;
  /** The Fine-tune badge's word for an instrumental. */
  instrumentalShort: string;
  vocal: string;
  vocalGender: Record<VocalGender, string>;
  /** The Fine-tune badge's shorter forms. */
  vocalShort: Record<VocalGender, string>;
  weirdness: string;
  weirdnessEnds: readonly [string, string];
  styleInfluence: string;
  styleInfluenceEnds: readonly [string, string];
  /** Under the sliders. */
  approximate: string;
  /** The result card, after "Generated with …". */
  note: Record<MusicControlMode, string>;
}

export const MUSIC_CONTROLS_COPY: Readonly<Record<MusicControlsLang, MusicControlsCopy>> = {
  ka: {
    styles: 'სტილი — აირჩიე 3-მდე',
    trackType: 'ტიპი',
    lyrics: 'ლირიკა',
    instrumental: 'ინსტრუმენტული',
    instrumentalShort: 'ინსტრ.',
    vocal: 'ვოკალი',
    vocalGender: { auto: 'ავტო', female: 'ქალის', male: 'კაცის', duet: 'დუეტი' },
    vocalShort: { auto: 'ავტო', female: 'ქალის', male: 'კაცის', duet: 'დუეტი' },
    weirdness: 'უცნაურობა',
    weirdnessEnds: ['ნაცნობი', 'ექსპერიმენტული'],
    styleInfluence: 'სტილის გავლენა',
    styleInfluenceEnds: ['თავისუფალი', 'მკაცრი'],
    approximate: '≈ მიახლოებითი: Lyria-სა და ElevenLabs-ზე სლაიდერები მხოლოდ ტექსტურ აღწერას ცვლის და არა ზუსტ პარამეტრს.',
    note: { prompt: '≈ სლაიდერები მიახლოებითია', native: 'სლაიდერები — ძრავის პარამეტრებად' },
  },
  en: {
    styles: 'Style — pick up to 3',
    trackType: 'Track type',
    lyrics: 'Lyrics',
    instrumental: 'Instrumental',
    instrumentalShort: 'Instrumental',
    vocal: 'Vocal',
    vocalGender: { auto: 'Auto', female: 'Female', male: 'Male', duet: 'Duet' },
    vocalShort: { auto: 'Auto', female: 'Female', male: 'Male', duet: 'Duet' },
    weirdness: 'Weirdness',
    weirdnessEnds: ['Familiar', 'Experimental'],
    styleInfluence: 'Style influence',
    styleInfluenceEnds: ['Loose', 'Strict'],
    approximate: '≈ Approximate: on Lyria and ElevenLabs the sliders only steer the text brief, not an exact setting.',
    note: { prompt: '≈ sliders approximate', native: 'sliders set as engine parameters' },
  },
  ru: {
    styles: 'Стиль — до 3',
    trackType: 'Тип трека',
    lyrics: 'Текст',
    instrumental: 'Инструментал',
    instrumentalShort: 'Инструментал',
    vocal: 'Вокал',
    vocalGender: { auto: 'Авто', female: 'Женский', male: 'Мужской', duet: 'Дуэт' },
    vocalShort: { auto: 'Авто', female: 'Жен.', male: 'Муж.', duet: 'Дуэт' },
    weirdness: 'Необычность',
    weirdnessEnds: ['Привычно', 'Экспериментально'],
    styleInfluence: 'Влияние стиля',
    styleInfluenceEnds: ['Свободно', 'Строго'],
    approximate: '≈ Приблизительно: в Lyria и ElevenLabs ползунки меняют только текстовое описание, а не точный параметр.',
    note: { prompt: '≈ ползунки приблизительны', native: 'ползунки — параметрами движка' },
  },
};

export const musicControlsCopy = (locale: string): MusicControlsCopy =>
  MUSIC_CONTROLS_COPY[locale === 'en' || locale === 'ru' ? locale : 'ka'];

/**
 * The slider parts of the Fine-tune badge — only the sliders someone moved ("Weirdness 80"), so an untouched panel's
 * badge reads exactly as it did.
 */
export function sliderBadgeParts(s: { weirdness: number; styleInfluence: number }, locale: string): string[] {
  const c = musicControlsCopy(locale);
  const out: string[] = [];
  if (clampSlider(s.weirdness) !== SLIDER_DEFAULT) out.push(`${c.weirdness} ${clampSlider(s.weirdness)}`);
  if (clampSlider(s.styleInfluence) !== SLIDER_DEFAULT) out.push(`${c.styleInfluence} ${clampSlider(s.styleInfluence)}`);
  return out;
}

/**
 * The result card's note: how this track's sliders reached its engine — or null when there is nothing to say (no
 * report from the route, or both sliders left at 50, so nothing was steered either way).
 */
export function musicControlsNote(
  mode: MusicControlMode | undefined,
  sliders: { weirdness?: number; styleInfluence?: number } | undefined,
  locale: string,
): string | null {
  if (mode !== 'prompt' && mode !== 'native') return null;
  const moved = (v: number | undefined) => typeof v === 'number' && clampSlider(v) !== SLIDER_DEFAULT;
  if (!sliders || !(moved(sliders.weirdness) || moved(sliders.styleInfluence))) return null;
  return musicControlsCopy(locale).note[mode];
}
