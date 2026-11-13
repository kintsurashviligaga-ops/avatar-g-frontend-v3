/**
 * Interior designer polish, Phase 7.6 I1 · I3 · I4 (GG 2026-11-13 18:15Z), all behind NEXT_PUBLIC_INTERIOR_UX_V2 (off):
 *   I1 with a room photo the panel says it is REDESIGNING that room (banner, „Redesign" button, a room-edit placeholder and
 *      five quick room edits that add their words to the brief);
 *   I3 a before / after divider on a finished render (both pictures are already on the page);
 *   I4 a "You will get" line above Generate from the same shootTiles / shootCredits the button already uses.
 * UI only: the request, the route and the price are unchanged.
 */
import type { Lang } from './copy';

/** NEXT_PUBLIC_ is inlined at build time only when read literally. */
export function interiorUxV2On(): boolean {
  return /^(1|true|yes|on)$/i.test((process.env.NEXT_PUBLIC_INTERIOR_UX_V2 ?? '').trim());
}

export const ROOM_EDITS = ['brighter', 'declutter', 'floor', 'walls', 'plants'] as const;
export type RoomEdit = (typeof ROOM_EDITS)[number];

const COPY: Record<Lang, {
  banner: string; redesign: string; placeholder: string; quickEdits: string;
  edit: Record<RoomEdit, { label: string; words: string }>;
  youGet: string; before: string; after: string; compare: string;
}> = {
  ka: {
    banner: 'შენი ოთახის განახლება: ფოტოზე არსებული ოთახი შეიცვლება, კედლები და ფანჯრები იგივე დარჩება.',
    redesign: 'განახლება',
    placeholder: 'მაგ.: თბილი მუხის იატაკი, სელის დივანი, მეტი შუქი',
    quickEdits: 'სწრაფი ცვლილებები',
    edit: {
      brighter: { label: 'უფრო ნათელი', words: 'უფრო ნათელი, მეტი დღის შუქი' },
      declutter: { label: 'დალაგება', words: 'მოაშორე ზედმეტი ნივთები, სუფთა და მოწესრიგებული' },
      floor: { label: 'ახალი იატაკი', words: 'ახალი იატაკი' },
      walls: { label: 'ახალი კედლები', words: 'კედლების ახალი ფერი' },
      plants: { label: 'მცენარეები', words: 'დაამატე მწვანე მცენარეები' },
    },
    youGet: 'მიიღებ:', before: 'მანამდე', after: 'შემდეგ', compare: 'შედარება: მანამდე და შემდეგ',
  },
  en: {
    banner: 'Redesigning your room: the room in the photo is changed, its walls and windows stay where they are.',
    redesign: 'Redesign',
    placeholder: 'e.g. warm oak floor, linen sofa, more light',
    quickEdits: 'Quick edits',
    edit: {
      brighter: { label: 'Brighter', words: 'brighter, more daylight' },
      declutter: { label: 'Declutter', words: 'remove clutter, clean and tidy' },
      floor: { label: 'New floor', words: 'a new floor' },
      walls: { label: 'New walls', words: 'a new wall colour' },
      plants: { label: 'Add plants', words: 'add green plants' },
    },
    youGet: 'You will get:', before: 'Before', after: 'After', compare: 'Compare before and after',
  },
  ru: {
    banner: 'Обновляем вашу комнату: меняется комната на фото, стены и окна остаются на месте.',
    redesign: 'Обновить',
    placeholder: 'например: тёплый дубовый пол, льняной диван, больше света',
    quickEdits: 'Быстрые правки',
    edit: {
      brighter: { label: 'Светлее', words: 'светлее, больше дневного света' },
      declutter: { label: 'Убрать лишнее', words: 'убрать лишние вещи, чисто и аккуратно' },
      floor: { label: 'Новый пол', words: 'новый пол' },
      walls: { label: 'Новые стены', words: 'новый цвет стен' },
      plants: { label: 'Растения', words: 'добавить зелёные растения' },
    },
    youGet: 'Вы получите:', before: 'До', after: 'После', compare: 'Сравнить до и после',
  },
};

export function interiorUxV2Copy(lang: Lang) {
  return COPY[lang];
}

/** I1: a quick edit's words added to the brief once (a second tap of the same edit adds nothing), within `max`. */
export function addRoomEdit(brief: string, edit: RoomEdit, lang: Lang, max: number): string {
  const words = COPY[lang].edit[edit].words;
  const cur = brief.trim();
  if (cur.toLowerCase().includes(words.toLowerCase())) return brief;
  const next = cur ? `${cur.replace(/[,.;\s]+$/u, '')}, ${words}` : words;
  return next.length > max ? brief : next;
}

/** I4: „2 photos × 2 = 4 images · 4:5 · ✦ 8" from the line the count chip already uses. */
export function interiorSummaryLine(o: { tilesLine: string; aspect: string; credits: number }): string {
  return [o.tilesLine, o.aspect, `✦ ${o.credits}`].filter(Boolean).join(' · ');
}
