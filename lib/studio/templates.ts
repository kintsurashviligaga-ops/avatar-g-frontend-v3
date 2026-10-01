/**
 * lib/studio/templates.ts — the studio's TEMPLATE GALLERIES: one visual card per starting point, for the video,
 * image, music and avatar tools (the owner's 2026-10-01 directive: "Instead of dry inputs, build a grid of rich,
 * clickable Template Cards… Clicking a card must inject the specific style context and aspect ratios directly into
 * the generation pipeline").
 *
 * ⚠️ A CARD WRITES THE PANEL'S REAL PARAMETERS — NOTHING ELSE. It sets the same state the panel's own controls set
 * (style, format, length, genre, tempo, the presenter's face…), and that state is what each route already turns into
 * its generation context: the image route expands `style` into its server-side style directive (STYLE_SUFFIXES),
 * the film director takes `style` + orientation + scene count, the score engine takes genre + tempo + vocal, the
 * presenter route takes the face + voice + format. So a template can never send something the controls could not —
 * no hidden prompt, no client-supplied system instruction — and every individual control stays visible to fine-tune.
 *
 * ⚠️ THE ACTIVE CARD IS DERIVED, NEVER STORED (the contract of lib/video/videoPresets and lib/image/imagePresets,
 * whose presets these cards absorb): `match*Template` recomputes it from the live values, so a card stops being lit
 * the moment the user edits a field it set. Value tuples are unique per tool (a test enforces it).
 *
 * Thumbnails: `thumb` is set ONLY when the file exists under public/ (a test enforces it), so a missing image is never
 * shipped as a broken <img> or a 404. A card without one renders its palette as a gradient tile. The generated set is
 * produced by `scripts/templates/thumbs.md` + the hf-art-pack runner (`--pack templates`, hard-capped spend).
 *
 * Pure and isomorphic: no React, no env.
 */
import type { VideoPresetValues } from '@/lib/video/videoPresets';
import type { ImagePresetValues } from '@/lib/image/imagePresets';

export type TemplateTool = 'video' | 'image' | 'music' | 'avatar';
export type TemplateLang = 'ka' | 'en' | 'ru';
type L10n = Record<TemplateLang, string>;

interface TemplateBase {
  id: string;
  label: L10n;
  /** One line: what it is for. Shown under the label and as the card's description. */
  hint: L10n;
  /** A public path to a 3:4 image, or null until one exists (the card then shows `palette`). */
  thumb: string | null;
  /** Two colours for the no-image tile — dark → accent of the look. */
  palette: readonly [string, string];
}

export interface VideoTemplate extends TemplateBase { tool: 'video'; values: VideoPresetValues }
export interface ImageTemplate extends TemplateBase { tool: 'image'; values: ImagePresetValues }

export interface MusicTemplateValues {
  genre: string;
  tempo: 'slow' | 'medium' | 'fast';
  duration: 0 | 15 | 30 | 60 | 90;
  instrumental: boolean;
  voiceType: 'female' | 'male' | 'duet';
}
export interface MusicTemplate extends TemplateBase { tool: 'music'; values: MusicTemplateValues }

export interface AvatarTemplateValues {
  /** The preset face (public path) — it IS the presenter, so it is also the card's image. */
  preset: string;
  gender: 'female' | 'male';
  format: '9:16' | '16:9' | '1:1';
}
export interface AvatarTemplate extends TemplateBase { tool: 'avatar'; values: AvatarTemplateValues }

export type StudioTemplate = VideoTemplate | ImageTemplate | MusicTemplate | AvatarTemplate;

const T = (ka: string, en: string, ru: string): L10n => ({ ka, en, ru });

// ─── Video ─────────────────────────────────────────────────────────────────────────────────────────────

export const VIDEO_TEMPLATES: readonly VideoTemplate[] = [
  {
    tool: 'video', id: 'reel',
    label: T('კინო რილსი', 'Cinematic Reel', 'Кино-рилс'),
    hint: T('24 წმ, 9:16 — Instagram/TikTok-ისთვის', '24s vertical 9:16 for Instagram and TikTok', '24 с, 9:16 — для Instagram и TikTok'),
    thumb: '/templates/video/reel.jpg', palette: ['#0B1A2C', '#338FE8'],
    values: { mode: 'documentary', duration: 24, orientation: 'vertical', style: 'Cinematic' },
  },
  {
    tool: 'video', id: 'trailer',
    label: T('ფილმის ტრეილერი', 'Movie Trailer', 'Трейлер фильма'),
    hint: T('48 წმ, ფართო 16:9, დრამატული', '48s widescreen 16:9, dramatic', '48 с, широкий 16:9, драматично'),
    thumb: '/templates/video/trailer.jpg', palette: ['#1A1206', '#D9A441'],
    values: { mode: 'documentary', duration: 48, orientation: 'landscape', style: 'Dramatic' },
  },
  {
    tool: 'video', id: 'teaser',
    label: T('თიზერი · 8 წმ', 'Teaser · 8s', 'Тизер · 8 с'),
    hint: T('ერთი სცენა — იდეის სწრაფი და იაფი ტესტი', 'One scene — the fastest, cheapest test of an idea', 'Одна сцена — быстро и дёшево проверить идею'),
    thumb: null, palette: ['#06121F', '#4DB6FF'],
    values: { mode: 'documentary', duration: 8, orientation: 'vertical', style: 'Cinematic' },
  },
  {
    tool: 'video', id: 'anime',
    label: T('ანიმე', 'Anime', 'Аниме'),
    hint: T('ანიმაციური სტილი, 9:16, 24 წმ', 'Hand-drawn anime look, 9:16, 24s', 'Аниме-стиль, 9:16, 24 с'),
    thumb: null, palette: ['#1B0F2E', '#FF7AB6'],
    values: { mode: 'documentary', duration: 24, orientation: 'vertical', style: 'Anime' },
  },
  {
    tool: 'video', id: 'neon-nights',
    label: T('ნეონის ღამე', 'Neon Nights', 'Неоновая ночь'),
    hint: T('ღამის ქალაქი, ნეონის შუქი, 9:16', 'A city at night in neon light, 9:16', 'Ночной город в неоне, 9:16'),
    thumb: null, palette: ['#120624', '#B44CFF'],
    values: { mode: 'documentary', duration: 24, orientation: 'vertical', style: 'Neon' },
  },
  {
    tool: 'video', id: 'nature-doc',
    label: T('ბუნების დოკუმენტური', 'Nature Documentary', 'Природа, документалка'),
    hint: T('48 წმ, 16:9 — მთები, ტყე, ცოცხალი სამყარო', '48s 16:9 — mountains, forests, wildlife', '48 с, 16:9 — горы, леса, дикая природа'),
    thumb: null, palette: ['#07170D', '#4CC27A'],
    values: { mode: 'documentary', duration: 48, orientation: 'landscape', style: 'Nature' },
  },
  {
    tool: 'video', id: 'noir',
    label: T('ნუარი', 'Film Noir', 'Нуар'),
    hint: T('შავ-თეთრი, მკვეთრი ჩრდილები, 16:9', 'Black and white, hard shadows, 16:9', 'Чёрно-белое, резкие тени, 16:9'),
    thumb: null, palette: ['#0A0A0A', '#BDBDBD'],
    values: { mode: 'documentary', duration: 24, orientation: 'landscape', style: 'Noir' },
  },
  {
    tool: 'video', id: 'music-video',
    label: T('მუსიკალური კლიპი', 'Music Video', 'Клип'),
    hint: T('სიმღერის კლიპი, 9:16, ნეონი', 'A clip cut to your song, 9:16, neon', 'Клип под вашу песню, 9:16, неон'),
    thumb: null, palette: ['#14061C', '#338FE8'],
    values: { mode: 'musicvideo', duration: 24, orientation: 'vertical', style: 'Neon' },
  },
];

// ─── Image ─────────────────────────────────────────────────────────────────────────────────────────────

export const IMAGE_TEMPLATES: readonly ImageTemplate[] = [
  {
    tool: 'image', id: 'product',
    label: T('პროდუქტის ფოტო', 'Product Shot', 'Фото товара'),
    hint: T('1:1, 4K — კატალოგის ხარისხი', '1:1 at 4K — catalogue quality', '1:1, 4K — каталожное качество'),
    thumb: '/templates/image/product.jpg', palette: ['#160E06', '#E0A458'],
    values: { aspect: '1:1', quality: 'ultra', style: 'Photorealistic' },
  },
  {
    tool: 'image', id: 'social',
    label: T('სოციალური პოსტი', 'Social Post', 'Пост для соцсетей'),
    hint: T('4:5 — Instagram-ის ლენტა, 2K', '4:5 for the Instagram feed, 2K', '4:5 — лента Instagram, 2K'),
    thumb: null, palette: ['#0C1424', '#5BA6F0'],
    values: { aspect: '4:5', quality: 'high', style: 'Photorealistic' },
  },
  {
    tool: 'image', id: 'poster',
    label: T('კინოპოსტერი', 'Cinematic Poster', 'Киноафиша'),
    hint: T('3:4, 4K — ბეჭდვისთვის', '3:4 at 4K — sized for print', '3:4, 4K — для печати'),
    thumb: null, palette: ['#1A0C08', '#FF8A4C'],
    values: { aspect: '3:4', quality: 'ultra', style: 'Cinematic' },
  },
  {
    tool: 'image', id: 'wallpaper',
    label: T('ფონი', 'Wallpaper', 'Обои'),
    hint: T('16:9, 4K', '16:9 widescreen at 4K', '16:9, 4K'),
    thumb: null, palette: ['#06101C', '#3FA9F5'],
    values: { aspect: '16:9', quality: 'ultra', style: 'Cinematic' },
  },
  {
    tool: 'image', id: 'concept',
    label: T('კონცეპტ-არტი', 'Concept Art', 'Концепт-арт'),
    hint: T('16:9 — სამყაროები და პერსონაჟები', '16:9 — worlds and characters', '16:9 — миры и персонажи'),
    thumb: null, palette: ['#0E1A1A', '#3FD0C9'],
    values: { aspect: '16:9', quality: 'high', style: 'Digital Art' },
  },
  {
    tool: 'image', id: 'anime',
    label: T('ანიმე', 'Anime', 'Аниме'),
    hint: T('9:16 — ანიმე-ილუსტრაცია', '9:16 anime illustration', '9:16 — аниме-иллюстрация'),
    thumb: null, palette: ['#1B0F2E', '#FF7AB6'],
    values: { aspect: '9:16', quality: 'high', style: 'Anime' },
  },
  {
    tool: 'image', id: 'oil-painting',
    label: T('ზეთის ფერწერა', 'Oil Painting', 'Масло'),
    hint: T('3:4 — ტილო და ფუნჯის მონასმი', '3:4 — canvas and brushwork', '3:4 — холст и мазок'),
    thumb: null, palette: ['#1C1208', '#C98A3A'],
    values: { aspect: '3:4', quality: 'high', style: 'Oil Painting' },
  },
  {
    tool: 'image', id: '3d-render',
    label: T('3D რენდერი', '3D Render', '3D-рендер'),
    hint: T('1:1 — სუფთა სტუდიური 3D', '1:1 clean studio 3D', '1:1 — чистый студийный 3D'),
    thumb: null, palette: ['#0A1220', '#7FB8FF'],
    values: { aspect: '1:1', quality: 'high', style: '3D Render' },
  },
];

// ─── Music ─────────────────────────────────────────────────────────────────────────────────────────────

export const MUSIC_TEMPLATES: readonly MusicTemplate[] = [
  {
    tool: 'music', id: 'hollywood-cinematic',
    label: T('ჰოლივუდური კინო', 'Cinematic Score', 'Кино-саундтрек'),
    hint: T('ინსტრუმენტული, ნელი, 90 წმ', 'Instrumental, slow, 90s', 'Инструментал, медленно, 90 с'),
    thumb: null, palette: ['#140D05', '#E3B04B'],
    values: { genre: 'classical', tempo: 'slow', duration: 90, instrumental: true, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'rnb-beat',
    label: T('R&B ბითი', 'R&B Beat', 'R&B-бит'),
    hint: T('ინსტრუმენტული ბითი, საშუალო ტემპი, 30 წმ', 'Instrumental beat, mid-tempo, 30s', 'Инструментальный бит, средний темп, 30 с'),
    thumb: null, palette: ['#1A0A16', '#E0569B'],
    values: { genre: 'r&b', tempo: 'medium', duration: 30, instrumental: true, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'rnb-hiphop-core',
    label: T('R&B / ჰიპ-ჰოპი', 'R&B / Hip-Hop', 'R&B / Хип-хоп'),
    hint: T('კაცის ვოკალი, საშუალო ტემპი, 30 წმ', 'Male vocal, mid-tempo, 30s', 'Мужской вокал, средний темп, 30 с'),
    thumb: null, palette: ['#120A1E', '#8E6CFF'],
    values: { genre: 'hip-hop', tempo: 'medium', duration: 30, instrumental: false, voiceType: 'male' },
  },
  {
    tool: 'music', id: 'georgian-folk',
    label: T('ქართული ფოლკი', 'Georgian Folk', 'Грузинский фолк'),
    hint: T('ქალის ვოკალი, საშუალო ტემპი, 60 წმ', 'Female vocal, mid-tempo, 60s', 'Женский вокал, средний темп, 60 с'),
    thumb: null, palette: ['#160A06', '#D46A3A'],
    values: { genre: 'folk', tempo: 'medium', duration: 60, instrumental: false, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'lofi-chill',
    label: T('ლო-ფაი ღამე', 'Lo-fi Night', 'Лоу-фай ночь'),
    hint: T('ინსტრუმენტული, ნელი, 60 წმ', 'Instrumental, slow, 60s', 'Инструментал, медленно, 60 с'),
    thumb: '/templates/music/lofi-chill.jpg', palette: ['#06141A', '#3FB6C9'],
    values: { genre: 'lo-fi', tempo: 'slow', duration: 60, instrumental: true, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'electronic-cyber',
    label: T('ელექტრონული კიბერ', 'Electronic Cyber', 'Электронный кибер'),
    hint: T('ინსტრუმენტული, სწრაფი, 60 წმ', 'Instrumental, fast, 60s', 'Инструментал, быстро, 60 с'),
    thumb: null, palette: ['#05101E', '#338FE8'],
    values: { genre: 'electronic', tempo: 'fast', duration: 60, instrumental: true, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'retro-jazz-lounge',
    label: T('ჯაზ-ლაუნჯი', 'Jazz Lounge', 'Джаз-лаунж'),
    hint: T('ქალის ვოკალი, ნელი, 60 წმ', 'Female vocal, slow, 60s', 'Женский вокал, медленно, 60 с'),
    thumb: null, palette: ['#160E04', '#C8913A'],
    values: { genre: 'jazz', tempo: 'slow', duration: 60, instrumental: false, voiceType: 'female' },
  },
  {
    tool: 'music', id: 'documentary-ambient',
    label: T('დოკუმენტური ემბიენტი', 'Documentary Ambient', 'Эмбиент для документалки'),
    hint: T('ინსტრუმენტული ფონი, ნელი, სრული სიგრძე', 'Instrumental bed, slow, full length', 'Инструментальный фон, медленно, полная длина'),
    thumb: null, palette: ['#081216', '#6FA8B8'],
    values: { genre: 'ambient', tempo: 'slow', duration: 0, instrumental: true, voiceType: 'female' },
  },
];

// ─── Avatar (the face IS the presenter, so the card's image is the face itself) ─────────────────────────

export const AVATAR_TEMPLATES: readonly AvatarTemplate[] = [
  {
    tool: 'avatar', id: 'corporate-presenter',
    label: T('კორპორატიული წამყვანი', 'Corporate Presenter', 'Корпоративный ведущий'),
    hint: T('16:9 — პრეზენტაციები და ვებინარები', '16:9 for decks and webinars', '16:9 — презентации и вебинары'),
    thumb: '/avatars/preset-2.jpg', palette: ['#0A1424', '#338FE8'],
    values: { preset: '/avatars/preset-2.jpg', gender: 'male', format: '16:9' },
  },
  {
    tool: 'avatar', id: 'news-anchor',
    label: T('ახალი ამბების წამყვანი', 'News Anchor', 'Ведущая новостей'),
    hint: T('16:9 — ანონსები და სიახლეები', '16:9 for announcements and news', '16:9 — анонсы и новости'),
    thumb: '/avatars/preset-6.jpg', palette: ['#0E0E14', '#8FA3BF'],
    values: { preset: '/avatars/preset-6.jpg', gender: 'female', format: '16:9' },
  },
  {
    tool: 'avatar', id: 'executive-briefing',
    label: T('აღმასრულებლის მიმართვა', 'Executive Briefing', 'Обращение руководителя'),
    hint: T('16:9 — შიდა კომუნიკაცია', '16:9 for internal updates', '16:9 — внутренние коммуникации'),
    thumb: '/avatars/preset-4.jpg', palette: ['#10131A', '#A7B4C8'],
    values: { preset: '/avatars/preset-4.jpg', gender: 'male', format: '16:9' },
  },
  {
    tool: 'avatar', id: 'consultant',
    label: T('კონსულტანტი', 'Consultant', 'Консультант'),
    hint: T('1:1 — რჩევები და FAQ', '1:1 for tips and FAQs', '1:1 — советы и FAQ'),
    thumb: '/avatars/preset-1.jpg', palette: ['#0C1220', '#5B8FD8'],
    values: { preset: '/avatars/preset-1.jpg', gender: 'female', format: '1:1' },
  },
  {
    tool: 'avatar', id: 'social-story',
    label: T('სოციალური სთორი', 'Social Story', 'Сторис'),
    hint: T('9:16 — სთორები და რილსები', '9:16 for stories and reels', '9:16 — сторис и рилсы'),
    thumb: '/avatars/preset-3.jpg', palette: ['#0C1A14', '#4CC28A'],
    values: { preset: '/avatars/preset-3.jpg', gender: 'female', format: '9:16' },
  },
  {
    tool: 'avatar', id: 'creator-explainer',
    label: T('ბლოგერი', 'Creator Explainer', 'Блогер'),
    hint: T('9:16 — ახსნა-განმარტებები', '9:16 explainers', '9:16 — объясняющие ролики'),
    thumb: '/avatars/preset-5.jpg', palette: ['#0A1320', '#5BA6F0'],
    values: { preset: '/avatars/preset-5.jpg', gender: 'male', format: '9:16' },
  },
];

export const TEMPLATES_BY_TOOL = {
  video: VIDEO_TEMPLATES,
  image: IMAGE_TEMPLATES,
  music: MUSIC_TEMPLATES,
  avatar: AVATAR_TEMPLATES,
} as const;

export const templateLang = (locale: string): TemplateLang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

// ─── Derived selection (never stored) ──────────────────────────────────────────────────────────────────

export function matchVideoTemplate(v: VideoPresetValues | null | undefined): string | null {
  if (!v) return null;
  return VIDEO_TEMPLATES.find((t) => t.values.mode === v.mode && t.values.duration === v.duration
    && t.values.orientation === v.orientation && t.values.style === v.style)?.id ?? null;
}

export function matchImageTemplate(v: ImagePresetValues | null | undefined): string | null {
  if (!v) return null;
  return IMAGE_TEMPLATES.find((t) => t.values.aspect === v.aspect && t.values.quality === v.quality && t.values.style === v.style)?.id ?? null;
}

/** Instrumental templates ignore the vocal (it is hidden and moot for a bed), so their highlight stays stable. */
export function matchMusicTemplate(v: MusicTemplateValues | null | undefined): string | null {
  if (!v) return null;
  return MUSIC_TEMPLATES.find((t) => t.values.genre === v.genre && t.values.tempo === v.tempo && t.values.duration === v.duration
    && t.values.instrumental === v.instrumental && (t.values.instrumental || t.values.voiceType === v.voiceType))?.id ?? null;
}

export function matchAvatarTemplate(v: { preset: string | null; format: string } | null | undefined): string | null {
  if (!v || !v.preset) return null;
  return AVATAR_TEMPLATES.find((t) => t.values.preset === v.preset && t.values.format === v.format)?.id ?? null;
}

export function videoTemplateValues(id: string): VideoPresetValues | null {
  return VIDEO_TEMPLATES.find((t) => t.id === id)?.values ?? null;
}
export function imageTemplateValues(id: string): ImagePresetValues | null {
  return IMAGE_TEMPLATES.find((t) => t.id === id)?.values ?? null;
}
export function musicTemplateValues(id: string): MusicTemplateValues | null {
  return MUSIC_TEMPLATES.find((t) => t.id === id)?.values ?? null;
}
export function avatarTemplateValues(id: string): AvatarTemplateValues | null {
  return AVATAR_TEMPLATES.find((t) => t.id === id)?.values ?? null;
}
