/**
 * Which video-remix ops cost credits — ONE list for the route that charges (app/api/video/remix) and for the chat, which
 * asks before a charged op runs (components/studio/OmniStudio, the chat-attached remix). The free ops are the local ffmpeg
 * ones (trim, captions, colour grade, speed, stabilise, watermark).
 *
 * The chat's classifier (/api/video/remix-intent) and the panel name some ops differently; REMIX_OP_ALIASES maps both to
 * the route's names, so "add_music" and "music" are one op with one price.
 */
import { creditCostFor } from '@/lib/credits/pricing';

export const REMIX_OP_ALIASES: Readonly<Record<string, string>> = {
  add_music: 'music', face_swap: 'character', character_swap: 'character', add_text_overlay: 'captions', add_subtitles: 'captions',
};

export const CHARGED_REMIX_OPS: ReadonlySet<string> = new Set(['voiceover', 'music', 'redub', 'restyle', 'character', 'background_remove', 'productad']);

export const canonicalRemixOp = (raw: string): string => REMIX_OP_ALIASES[raw] ?? raw;

export const isChargedRemixOp = (raw: string): boolean => CHARGED_REMIX_OPS.has(canonicalRemixOp(raw));

/** What a charged remix op costs (every one but the product ad, which is billed as a video and never comes from the chat). */
export const remixOpCredits = (): number => creditCostFor('remix');

type L = { ka: string; en: string; ru: string };
const OP_LABEL: Record<string, L> = {
  music: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
  character: { ka: 'პერსონაჟის შეცვლა', en: 'Change character', ru: 'Смена персонажа' },
  background_remove: { ka: 'ფონის მოცილება', en: 'Background removal', ru: 'Удаление фона' },
  voiceover: { ka: 'ვოისოვერი', en: 'Voiceover', ru: 'Озвучка' },
  redub: { ka: 'ხელახალი გახმოვანება', en: 'Redub (lip-sync)', ru: 'Переозвучка' },
  restyle: { ka: 'რესტაილი', en: 'Restyle', ru: 'Рестайл' },
};

/** Agent G's question before a charged edit of a video attached in the chat: the edit and its price, then Create / Edit. */
export function remixAskText(rawOp: string, credits: number, locale: string): string {
  const op = canonicalRemixOp(rawOp);
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const label = OP_LABEL[op]?.[lang] ?? op;
  if (lang === 'en') return `This edit of your video, „${label}", costs ${credits} credits. Shall I start?`;
  if (lang === 'ru') return `Эта правка видео, «${label}», стоит ${credits} кредитов. Начать?`;
  return `ვიდეოს ეს რედაქტირება, „${label}", ${credits} კრედიტი ღირს. დავიწყო?`;
}
