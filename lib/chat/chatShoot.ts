/**
 * lib/chat/chatShoot.ts — the Photographer and the Interior designer, ordered in the chat.
 *
 * GG's rule (Production 2026-10-16 18:20–18:21Z): every service runs in the chat; Agent G clarifies, the user agrees, and
 * generation starts. „ოთახის დიზაინი გამიკეთე სკანდინავიურ სტილში" with the room's photo attached used to open the
 * Interior panel, leave the photo in the composer and ask the user to pick it again there. Now Agent G answers with its
 * card: what it will make, from which photo, at one render's price. Its Create, or a „კი", renders it in the chat
 * through the same image route the panels use (`studio` = lib/studio/shootWire, resolved on the server), one charge and
 * one refund path.
 *
 * The product ad runs the same way (its card carries the product's photo; Create runs the panel's own product-ad job).
 *
 * Pure and client-safe.
 */
import type { ToolId } from '@/lib/studio/tools';
import type { ShootKind, StudioWire } from '@/lib/studio/shootWire';

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string | null | undefined): Lang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

/** The studio a catalog tool renders with, or null for a tool that is not one of the two. */
export function shootKindForTool(tool: ToolId | string | null | undefined): ShootKind | null {
  return tool === 'interior' ? 'interior' : tool === 'photoshoot' ? 'photoshoot' : null;
}

/** The wire the image route resolves: the kind only. The style, room and camera are read from the user's words. */
export function shootWire(kind: ShootKind): StudioWire {
  return { kind };
}

const WHAT: Record<ShootKind, Record<Lang, string>> = {
  interior: { ka: 'ინტერიერის დიზაინი', en: 'an interior design', ru: 'дизайн интерьера' },
  photoshoot: { ka: 'ფოტოსესიის კადრი', en: 'a photo shoot picture', ru: 'кадр фотосессии' },
};

const FROM_PHOTO: Record<ShootKind, Record<Lang, string>> = {
  interior: { ka: ' შენი ოთახის ფოტოდან', en: ' from your room photo', ru: ' по фото вашей комнаты' },
  photoshoot: { ka: ' შენი ფოტოდან', en: ' from your photo', ru: ' по вашему фото' },
};

/** Said when there is no photo: the render still runs from the words, and how to give it one. */
const NO_PHOTO: Record<ShootKind, Record<Lang, string>> = {
  interior: {
    ka: 'ფოტო არ მაქვს, ამიტომ ოთახს აღწერით დავხატავ. შენი ოთახიდან თუ გინდა, მიამაგრე მისი ფოტო და ისე მომწერე.',
    en: 'I have no photo, so I will draw the room from the description. To redesign your own room, attach its photo and write to me again.',
    ru: 'Фото нет, поэтому нарисую комнату по описанию. Чтобы переделать вашу комнату, прикрепите её фото и напишите снова.',
  },
  photoshoot: {
    ka: 'ფოტო არ მაქვს, ამიტომ კადრს აღწერით გადავიღებ. შენი სახით თუ გინდა, მიამაგრე შენი ფოტო და ისე მომწერე.',
    en: 'I have no photo, so I will shoot it from the description. To have your own face in it, attach your photo and write to me again.',
    ru: 'Фото нет, поэтому сниму кадр по описанию. Чтобы в кадре были вы, прикрепите своё фото и напишите снова.',
  },
};

const ASK: Record<Lang, string> = { ka: 'დავიწყო?', en: 'Shall I start?', ru: 'Начинать?' };

/**
 * Agent G's confirm bubble for a shoot ordered in the chat: what it will make, from which photo, the words it renders
 * from, and „დავიწყო?". The price is on the card's Create; its Create or a „კი" starts it.
 */
export function shootOfferText(input: { kind: ShootKind; prompt: string; withPhoto: boolean; locale: string | null | undefined }): string {
  const l = lang(input.locale);
  const cut = input.prompt.length > 400 ? `${input.prompt.slice(0, 397)}…` : input.prompt;
  const what = WHAT[input.kind][l] + (input.withPhoto ? FROM_PHOTO[input.kind][l] : '');
  const head = l === 'en' ? `I am ready to make ${what}:` : l === 'ru' ? `Готова сделать ${what}:` : `მზად ვარ, გავაკეთო ${what}:`;
  const quote = l === 'en' ? `“${cut}”` : `«${cut}»`;
  return [head, quote, ...(input.withPhoto ? [] : [NO_PHOTO[input.kind][l]]), ASK[l]].join('\n');
}

export type ProductStyle = 'splash' | 'epic' | 'luxury' | 'nature';
const STYLE: Record<ProductStyle, Record<Lang, string>> = {
  splash: { ka: 'შხეფა', en: 'Splash', ru: 'Всплеск' },
  epic: { ka: 'ეპიკური', en: 'Epic', ru: 'Эпик' },
  luxury: { ka: 'ლუქსი', en: 'Luxury', ru: 'Люкс' },
  nature: { ka: 'ბუნება', en: 'Nature', ru: 'Природа' },
};

/**
 * The product ad, ordered in the chat. It needs the product's photo: with one, Agent G's card offers the ad at its price,
 * at the panel's length, frame and style; without one, Agent G asks for it, and the photo sent next makes the card.
 * The ad is drawn from the photo and the style (the route takes no words), so the card names those, not the order's words.
 */
export function productAdOfferText(input: { seconds: number; aspect: string; style: ProductStyle; locale: string | null | undefined }): string {
  const l = lang(input.locale);
  const style = STYLE[input.style][l];
  const head = l === 'en'
    ? `I am ready to make a product ad video from your photo: ${input.seconds} s, ${input.aspect}, style „${style}".`
    : l === 'ru'
      ? `Готова сделать рекламное видео товара по вашему фото: ${input.seconds} с, ${input.aspect}, стиль «${style}».`
      : `მზად ვარ, გავაკეთო პროდუქტის სარეკლამო ვიდეო შენი ფოტოდან: ${input.seconds} წმ, ${input.aspect}, სტილი „${style}".`;
  return [head, ASK[l]].join('\n');
}

/** Agent G's question when a product ad is ordered with no photo. */
export function productAdPhotoAsk(locale: string | null | undefined): string {
  const l = lang(locale);
  if (l === 'en') return 'For the product ad I need the product\'s photo. Attach it and send it to me; I will show the price before anything starts.';
  if (l === 'ru') return 'Для рекламы товара нужно его фото. Прикрепите и отправьте его мне; цену покажу до запуска.';
  return 'პროდუქტის რეკლამისთვის მისი ფოტო მჭირდება. მიამაგრე და გამომიგზავნე; ფასს დაწყებამდე გაჩვენებ.';
}

/** How long a product ad ordered without a photo waits for one (the photo sent next makes its card). */
export const PRODUCT_PHOTO_WAIT_MS = 10 * 60_000;
