import {
  Box, Film, Image as ImageIcon, Languages, MessageSquare, Music2, Package, PersonStanding, Presentation, Repeat,
  ScanFace, Scissors, Wand2, type LucideIcon,
} from 'lucide-react';

/**
 * The studio's tools — ONE list for every surface that names them: the sidebar's „სერვისები", the composer's
 * „+" sheet (phones), the „ხელსაწყოები" picker (desktop) and the settings panel's service card
 * (docs/DESIGN.md §8). Order is the product's order: video first, chat last.
 *
 * A tool is not new state. OmniStudio derives it from what it already has — `mode`, the video tab, the avatar
 * tab and the studio panel — and `selectTool` sets those (components/studio/OmniStudio.tsx). The ids travel in
 * the `omni:set-tool` / `omni:tool-changed` window events and the `?tool=` deep link.
 */
export type ToolId =
  | 'video' | 'image' | 'music' | 'avatar' | 'remix' | 'chat'
  | 'product' | 'swap' | 'motion' | 'montage' | 'dubbing' | 'model3d' | 'presentation';

type L10n = { ka: string; en: string; ru: string };
export type ToolLang = 'ka' | 'en' | 'ru';

export const PRIMARY_TOOLS: readonly ToolId[] = ['video', 'image', 'music', 'avatar', 'remix', 'chat'];
/** Tools that live one level down: video variants, motion, and the four full studios. */
export const MORE_TOOLS: readonly ToolId[] = ['product', 'swap', 'motion', 'montage', 'dubbing', 'model3d', 'presentation'];
export const ALL_TOOLS: readonly ToolId[] = [...PRIMARY_TOOLS, ...MORE_TOOLS];

export const TOOL_META: Record<ToolId, { Icon: LucideIcon; name: L10n; sub: L10n }> = {
  video: { Icon: Film, name: { ka: 'ვიდეო', en: 'Video', ru: 'Видео' }, sub: { ka: 'იდეიდან მზა რილამდე', en: 'From an idea to a finished reel', ru: 'От идеи до готового рилса' } },
  image: { Icon: ImageIcon, name: { ka: 'სურათი', en: 'Image', ru: 'Изображение' }, sub: { ka: 'შექმენი და დაარედაქტირე', en: 'Create and edit', ru: 'Создать и отредактировать' } },
  music: { Icon: Music2, name: { ka: 'მუსიკა', en: 'Music', ru: 'Музыка' }, sub: { ka: 'ტრეკი და სიმღერა', en: 'Tracks and songs', ru: 'Треки и песни' } },
  avatar: { Icon: ScanFace, name: { ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' }, sub: { ka: 'ფოტო ალაპარაკდება', en: 'Make a photo talk', ru: 'Фото заговорит' } },
  remix: { Icon: Wand2, name: { ka: 'რემიქსი', en: 'Remix', ru: 'Ремикс' }, sub: { ka: 'შეცვალე არსებული ვიდეო', en: 'Change a video you have', ru: 'Измените своё видео' } },
  chat: { Icon: MessageSquare, name: { ka: 'ჩატი', en: 'Chat', ru: 'Чат' }, sub: { ka: 'ჰკითხე ნებისმიერი რამ', en: 'Ask anything', ru: 'Спросите что угодно' } },
  product: { Icon: Package, name: { ka: 'პროდუქტის რეკლამა', en: 'Product ad', ru: 'Реклама продукта' }, sub: { ka: 'ფოტოდან სარეკლამო რილი', en: 'An ad reel from a product photo', ru: 'Рекламный рилс из фото' } },
  swap: { Icon: Repeat, name: { ka: 'პერსონაჟის შეცვლა', en: 'Character swap', ru: 'Замена персонажа' }, sub: { ka: 'ვიდეოში სხვა სახე', en: 'Put another face in a video', ru: 'Другое лицо в видео' } },
  motion: { Icon: PersonStanding, name: { ka: 'მოძრაობა', en: 'Motion', ru: 'Движение' }, sub: { ka: 'ფოტო იმოძრავებს ვიდეოს მიხედვით', en: 'A photo moves like a reference', ru: 'Фото двигается по образцу' } },
  montage: { Icon: Scissors, name: { ka: 'მონტაჟი', en: 'Montage', ru: 'Монтаж' }, sub: { ka: 'კადრებიდან ერთი ფილმი', en: 'One film from your clips', ru: 'Один фильм из ваших клипов' } },
  dubbing: { Icon: Languages, name: { ka: 'დუბლაჟი', en: 'Dubbing', ru: 'Дубляж' }, sub: { ka: 'ვიდეო სხვა ენაზე', en: 'A video in another language', ru: 'Видео на другом языке' } },
  model3d: { Icon: Box, name: { ka: '3D მოდელი', en: '3D model', ru: '3D-модель' }, sub: { ka: 'ტექსტიდან ან ფოტოდან', en: 'From text or a photo', ru: 'Из текста или фото' } },
  presentation: { Icon: Presentation, name: { ka: 'პრეზენტაცია', en: 'Presentation', ru: 'Презентация' }, sub: { ka: 'თემიდან მზა სლაიდები', en: 'Slides from a topic', ru: 'Слайды по теме' } },
};

export const toolLang = (locale: string): ToolLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');
export const isToolId = (v: unknown): v is ToolId => typeof v === 'string' && (ALL_TOOLS as readonly string[]).includes(v);
export const toolName = (id: ToolId, locale: string) => TOOL_META[id].name[toolLang(locale)];
export const toolSub = (id: ToolId, locale: string) => TOOL_META[id].sub[toolLang(locale)];
