/**
 * Landing copy — Georgian first; en/ru translate it (docs/DESIGN.md §7). Russian uses «вы», the dashboard's register. Every claim here is something the
 * product does today: text/photo → video (Kling, Seedance, the film pipeline), Georgian voice (ElevenLabs),
 * music incl. Georgian vocals, a talking-photo avatar, the price shown before any spend.
 */
export type LandingLang = 'ka' | 'en' | 'ru';
export const landingLang = (locale: string): LandingLang => (locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka');

export type ServiceKey = 'video' | 'image' | 'music' | 'avatar';

export interface LandingCopy {
  metaTitle: string;
  metaDescription: string;
  nav: { pricing: string; signIn: string; openStudio: string; menu: string };
  hero: { eyebrow: string; title: string; sub: string; cta: string; secondary: string; note: string };
  services: { kicker: string; title: string; main: string; open: string; items: Record<ServiceKey, { name: string; line: string; alt: string }> };
  steps: { kicker: string; title: string; items: Array<{ name: string; line: string }> };
  pricing: { kicker: string; title: string; line: string; cta: string };
  closing: { title: string; cta: string };
  footer: { tagline: string; terms: string; privacy: string; refund: string; rights: string; language: string };
  heroAlt: string;
}

export const LANDING_COPY: Record<LandingLang, LandingCopy> = {
  ka: {
    metaTitle: 'MyAvatar.ge — ვიდეო ერთი იდეიდან',
    metaDescription: 'ქართული AI ვიდეო სტუდია Reels‑ისთვის: აღწერე სცენა და მიიღე მზა ვიდეო — კადრებით, ქართული ხმით, მუსიკით და სუბტიტრებით. ფასი ჩანს, სანამ დაიწყებ.',
    nav: { pricing: 'ფასები', signIn: 'შესვლა', openStudio: 'სტუდიის გახსნა', menu: 'მენიუ' },
    hero: {
      eyebrow: 'AI ვიდეო სტუდია · თბილისი',
      title: 'ვიდეო ერთი იდეიდან.',
      sub: 'აღწერე სცენა ქართულად და მიიღე Reels‑ისთვის მზა ვიდეო — კადრებით, ქართული ხმით და მუსიკით.',
      cta: 'შექმენი ვიდეო',
      secondary: 'შესვლა',
      note: 'ფასი ჩანს, სანამ დაიწყებ',
    },
    services: {
      kicker: 'სტუდია',
      title: 'ყველაფერი, რაც ერთ რილს სჭირდება.',
      main: 'მთავარი',
      open: 'გახსნა',
      items: {
        video: { name: 'ვიდეო', line: 'Reels, რეკლამა და კლიპი — ტექსტიდან ან ფოტოდან.', alt: 'კინოკამერა სველ ქუჩაზე ღამით' },
        image: { name: 'სურათი', line: 'პროდუქტის ფოტო და პორტრეტი წამებში.', alt: 'პროდუქტის ფოტო ბნელ სტუდიაში' },
        music: { name: 'მუსიკა', line: 'საუნდთრექი და სიმღერა ქართულად.', alt: 'სინთეზატორი და მიკროფონი ღამის სტუდიაში' },
        avatar: { name: 'ავატარი', line: 'ალაპარაკე ფოტო ქართული ხმით.', alt: 'პორტრეტი ეკრანის შუქზე' },
      },
    },
    steps: {
      kicker: 'როგორ მუშაობს',
      title: 'სამი ნაბიჯი.',
      items: [
        { name: 'დაწერე', line: 'აღწერე კადრი ქართულად ან თქვი ხმით. საჭიროებისას მიამაგრე ფოტო.' },
        { name: 'დაარენდერე', line: 'ფასს ღილაკზე დაინახავ, სანამ დაადასტურებ. დანარჩენს სტუდია აკეთებს.' },
        { name: 'გამოაქვეყნე', line: 'ჩამოტვირთე 9:16 ვიდეო და ატვირთე Reels‑ში, TikTok-სა თუ Shorts-ზე.' },
      ],
    },
    pricing: {
      kicker: 'ფასები',
      title: 'ფასი — სანამ დაიწყებ.',
      line: 'ყოველ გენერაციას ფასი ღილაკზე აწერია, სანამ დაადასტურებ. გეგმები და კრედიტები — ფასების გვერდზე.',
      cta: 'ფასების ნახვა',
    },
    closing: { title: 'პირველი რილი დღეს.', cta: 'შექმენი ვიდეო' },
    footer: { tagline: 'AI ვიდეო სტუდია ქართულად.', terms: 'წესები', privacy: 'კონფიდენციალურობა', refund: 'თანხის დაბრუნება', rights: 'ყველა უფლება დაცულია.', language: 'ენა' },
    heroAlt: 'ღამის თბილისი წვიმის შემდეგ; ტელეფონის ეკრანზე ვერტიკალური ვიდეო',
  },
  en: {
    metaTitle: 'MyAvatar.ge — Video from a single idea',
    metaDescription: 'An AI video studio for Reels, made in Tbilisi: describe a scene and get a finished video — shots, Georgian voice, music and subtitles. You see the price before you start.',
    nav: { pricing: 'Pricing', signIn: 'Sign in', openStudio: 'Open studio', menu: 'Menu' },
    hero: {
      eyebrow: 'AI video studio · Tbilisi',
      title: 'Video from a single idea.',
      sub: 'Describe a scene and get a Reels-ready video — shots, Georgian voice and music.',
      cta: 'Create a video',
      secondary: 'Sign in',
      note: 'You see the price before you start',
    },
    services: {
      kicker: 'Studio',
      title: 'Everything one reel needs.',
      main: 'Main',
      open: 'Open',
      items: {
        video: { name: 'Video', line: 'Reels, ads and clips — from text or a photo.', alt: 'A cinema camera on a wet street at night' },
        image: { name: 'Image', line: 'Product shots and portraits in seconds.', alt: 'A product shot in a dark studio' },
        music: { name: 'Music', line: 'Soundtracks and songs, Georgian vocals included.', alt: 'A synthesizer and a microphone in a night studio' },
        avatar: { name: 'Avatar', line: 'Make a photo talk in a Georgian voice.', alt: 'A portrait lit by screen light' },
      },
    },
    steps: {
      kicker: 'How it works',
      title: 'Three steps.',
      items: [
        { name: 'Write', line: 'Describe the shot, or say it. Attach a photo if you like.' },
        { name: 'Render', line: 'The price is on the button before you confirm. The studio does the rest.' },
        { name: 'Publish', line: 'Download the 9:16 video and post it to Reels, TikTok or Shorts.' },
      ],
    },
    pricing: {
      kicker: 'Pricing',
      title: 'The price, before you start.',
      line: 'Every generation shows its price on the button before you confirm. Plans and credits are on the pricing page.',
      cta: 'See pricing',
    },
    closing: { title: 'Your first reel, today.', cta: 'Create a video' },
    footer: { tagline: 'An AI video studio, in Georgian.', terms: 'Terms', privacy: 'Privacy', refund: 'Refunds', rights: 'All rights reserved.', language: 'Language' },
    heroAlt: 'Tbilisi at night after rain; a phone screen shows a vertical video',
  },
  ru: {
    metaTitle: 'MyAvatar.ge — Видео из одной идеи',
    metaDescription: 'AI-видеостудия для Reels из Тбилиси: опишите сцену и получите готовое видео — кадры, грузинская озвучка, музыка и субтитры. Цена видна до старта.',
    nav: { pricing: 'Цены', signIn: 'Войти', openStudio: 'Открыть студию', menu: 'Меню' },
    hero: {
      eyebrow: 'AI-видеостудия · Тбилиси',
      title: 'Видео из одной идеи.',
      sub: 'Опишите сцену и получите готовое видео для Reels — кадры, грузинская озвучка и музыка.',
      cta: 'Создать видео',
      secondary: 'Войти',
      note: 'Цена видна до старта',
    },
    services: {
      kicker: 'Студия',
      title: 'Всё, что нужно одному рилсу.',
      main: 'Главное',
      open: 'Открыть',
      items: {
        video: { name: 'Видео', line: 'Рилсы, реклама и клипы — из текста или фото.', alt: 'Кинокамера на мокрой улице ночью' },
        image: { name: 'Изображение', line: 'Предметная съёмка и портреты за секунды.', alt: 'Предметная съёмка в тёмной студии' },
        music: { name: 'Музыка', line: 'Саундтреки и песни, в том числе на грузинском.', alt: 'Синтезатор и микрофон в ночной студии' },
        avatar: { name: 'Аватар', line: 'Оживите фото грузинским голосом.', alt: 'Портрет в свете экрана' },
      },
    },
    steps: {
      kicker: 'Как это работает',
      title: 'Три шага.',
      items: [
        { name: 'Напишите', line: 'Опишите кадр или скажите голосом. При желании прикрепите фото.' },
        { name: 'Отрендерите', line: 'Цена на кнопке до подтверждения. Остальное делает студия.' },
        { name: 'Опубликуйте', line: 'Скачайте видео 9:16 и выложите в Reels, TikTok или Shorts.' },
      ],
    },
    pricing: {
      kicker: 'Цены',
      title: 'Цена — до начала.',
      line: 'Цена каждой генерации видна на кнопке до подтверждения. Планы и кредиты — на странице цен.',
      cta: 'Смотреть цены',
    },
    closing: { title: 'Первый рилс — сегодня.', cta: 'Создать видео' },
    footer: { tagline: 'AI-видеостудия на грузинском.', terms: 'Условия', privacy: 'Конфиденциальность', refund: 'Возврат средств', rights: 'Все права защищены.', language: 'Язык' },
    heroAlt: 'Ночной Тбилиси после дождя; на экране телефона вертикальное видео',
  },
};
