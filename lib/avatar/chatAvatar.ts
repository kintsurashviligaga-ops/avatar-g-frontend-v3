/**
 * lib/avatar/chatAvatar.ts — a talking avatar ordered in words (GG, 2026-10-17 07:39Z): „შექმენი ავატარი რომელიც ამბობს
 * ქართულად: გადადი მაი ავატარ ჯიზე და დაიწყე". Pure, client-safe.
 *
 * ⚠️ THE ORDER USED TO END ON A HEYGEN REFUSAL. With no photo and no preset picked, the avatar tool sent the words to the
 * HeyGen presenter, which the Google-only boundary refuses („ეს ხელსაწყო დროებით შეჩერებულია…"), so nothing was made.
 * Where the Veo avatar is open to the caller (GET /api/avatar/veo), a face is now always found — the photo the user
 * gave, the preset they picked, else a ready presenter matched to the voice and the frame — and the order goes to Veo.
 *
 * Agent G's card says what will be made before anything is charged: the line, the voice (a Georgian line is spoken by
 * ElevenLabs and the lips follow it only approximately: GG's choice, 2026-10-17 07:54Z), the face, the frame, the price.
 */
import { AVATAR_TEMPLATES } from '@/lib/studio/templates';
import { creditsLabel } from '@/lib/credits/quote';
import { VEO_AVATAR_SECONDS, avatarVoiceByElevenLabs } from './veoAvatar';
import { splitAvatarScript } from './scriptSplit';

export type AvatarGender = 'female' | 'male';
export type AvatarAspect = '9:16' | '16:9';
/** Where the face comes from: the user's own photo, the preset (or twin) picked in the Avatar panel, a ready presenter. */
export type AvatarFace = 'photo' | 'preset' | 'stock';

/** A ready presenter for this voice and frame (the Avatar panel's own presets): same gender, same frame when one has it. */
export function stockAvatarFace(gender: AvatarGender, aspect: AvatarAspect): string {
  const same = AVATAR_TEMPLATES.filter((t) => t.values.gender === gender);
  const pick = same.find((t) => t.values.format === aspect) ?? same[0] ?? AVATAR_TEMPLATES[0];
  return pick!.values.preset;
}

// No \b: it is ASCII-only in JS, and never matches next to a Georgian or Cyrillic letter.
const EDGE = '(?:^|[\\s,.;:!?()"„“«»—-])';
const END = '(?=$|[\\s,.;:!?()"„“«»—-])';
const FEMALE = new RegExp(`${EDGE}(?:ქალ(?:ი|ის|ბატონი|ური)?|გოგო(?:ნა)?|woman|female|girl|lady|женщин\\S*|девушк\\S*|женск\\S*)${END}`, 'iu');
const MALE = new RegExp(`${EDGE}(?:კაც(?:ი|ის)?|მამაკაც(?:ი|ის)?|ბიჭ(?:ი|ის)?|man|male|guy|boy|мужчин\\S*|парень|парн\\S*|мужск\\S*)${END}`, 'iu');

/**
 * „ქალი ავატარი…", „a man who says…": the voice the order names, read only from the words AROUND the line — never from the
 * line itself („ქალბატონებო, მოგესალმებით" is spoken, it is not a casting note). Null when it names none.
 */
export function avatarGenderFromText(text: string): AvatarGender | null {
  const { speech } = splitAvatarScript(text);
  const at = speech ? text.lastIndexOf(speech) : -1;
  const around = at >= 0 ? text.slice(0, at) + ' ' + text.slice(at + speech.length) : text;
  const f = FEMALE.test(around);
  const m = MALE.test(around);
  return f === m ? null : f ? 'female' : 'male';
}

export interface AvatarOffer {
  speech: string;
  direction: string;
  gender: AvatarGender;
  aspect: AvatarAspect;
  face: AvatarFace;
  credits: number;
  locale: string;
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Agent G's card text for one talking avatar: what it says, in which voice, with which face and frame, and its price. */
export function avatarOfferText(o: AvatarOffer): string {
  const en = o.locale === 'en';
  const ru = o.locale === 'ru';
  const eleven = avatarVoiceByElevenLabs(o.speech);
  const line = clip(o.speech, 200);
  const head = en ? `I’ll make an ${VEO_AVATAR_SECONDS}-second talking avatar (${o.aspect}).`
    : ru ? `Сделаю говорящего аватара на ${VEO_AVATAR_SECONDS} секунд (${o.aspect}).`
      : `გავაკეთებ ${VEO_AVATAR_SECONDS} წამიან მოლაპარაკე ავატარს (${o.aspect}).`;
  const says = en ? `**Says:** “${line}”` : ru ? `**Скажет:** «${line}»` : `**იტყვის:** „${line}“`;
  const voice = eleven
    ? (en ? `**Voice:** a Georgian ${o.gender} voice (ElevenLabs); the lips follow it approximately.`
      : ru ? `**Голос:** грузинский ${o.gender === 'female' ? 'женский' : 'мужской'} голос (ElevenLabs); губы следуют ему приблизительно.`
        : `**ხმა:** ქართული ${o.gender === 'female' ? 'ქალის' : 'კაცის'} ხმა (ElevenLabs); ტუჩები ხმას მიახლოებით მიჰყვება.`)
    : (en ? '**Voice:** the video engine’s own voice.' : ru ? '**Голос:** собственный голос видеодвижка.' : '**ხმა:** ვიდეოს ძრავის საკუთარი ხმა.');
  const face = o.face === 'photo'
    ? (en ? '**Face:** your photo.' : ru ? '**Лицо:** ваше фото.' : '**სახე:** შენი ფოტო.')
    : o.face === 'preset'
      ? (en ? '**Face:** the one picked in the Avatar panel.' : ru ? '**Лицо:** выбранное в панели «Аватар».' : '**სახე:** ავატარის პანელში არჩეული.')
      : (en ? '**Face:** a ready presenter. For your own face, attach a photo and send the order with it.'
        : ru ? '**Лицо:** готовый ведущий. Для своего лица прикрепите фото и отправьте заказ с ним.'
          : '**სახე:** მზა წამყვანი. შენი სახით გინდა? ფოტო მიამაგრე და ისე მომწერე.');
  const how = o.direction
    ? (en ? `**How:** ${clip(o.direction, 120)}` : ru ? `**Как:** ${clip(o.direction, 120)}` : `**როგორ:** ${clip(o.direction, 120)}`)
    : '';
  const price = `${en ? '**Price:**' : ru ? '**Цена:**' : '**ფასი:**'} ${creditsLabel(o.credits, o.locale)}.`;
  const ask = en ? 'Shall I start?' : ru ? 'Начать?' : 'დავიწყო?';
  return [head, '', says, voice, face, ...(how ? [how] : []), price, '', ask].join('\n');
}
