/**
 * The studio's locked empty-state copy (docs/DESIGN.md §7), in ONE place for both renderers:
 * the client (OmniStudio's greeting, line and video placeholder) and the server (the dashboard's
 * <title>/<meta description>/OG in app/[locale]/dashboard/page.tsx). The dashboard body is client-rendered,
 * so the server <head> is where `curl` and crawlers read this copy. Video is always named first.
 */
export type StudioLang = 'ka' | 'en' | 'ru';

export const studioLang = (locale: string): StudioLang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export const STUDIO_EMPTY: Record<StudioLang, { greeting: string; sub: string; videoPlaceholder: string; title: string }> = {
  ka: {
    greeting: 'რით დაგეხმარო?',
    sub: 'შექმენი ვიდეო, სურათი ან მუსიკა — ტექსტით, ხმით ან ფაილით.',
    videoPlaceholder: 'აღწერე კადრი, ჩაწერე ხმა, ან მიამაგრე ფაილი…',
    title: 'სტუდია — MyAvatar.ge',
  },
  en: {
    greeting: 'How can I help?',
    sub: 'Make a video, an image or music — by text, voice or file.',
    videoPlaceholder: 'Describe a shot, record your voice, or attach a file…',
    title: 'Studio — MyAvatar.ge',
  },
  ru: {
    greeting: 'Чем помочь?',
    sub: 'Создайте видео, изображение или музыку — текстом, голосом или файлом.',
    videoPlaceholder: 'Опишите кадр, запишите голос или прикрепите файл…',
    title: 'Студия — MyAvatar.ge',
  },
};
