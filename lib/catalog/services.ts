/**
 * lib/catalog/services.ts — THE service catalog (Master Task §23). One list of what MyAvatar can do, grouped into
 * categories, with exactly one canonical id, route, price key and analytics identity per capability.
 *
 * Why this file exists (docs/handoffs/service-inventory.md): nine registries named the services and none agreed —
 * "24 modules" on /services, "17 active" and "18 services" on /hub, "13 Services" in messages/en.json. A count shown
 * to a user now comes from `countServices()` here, never from a literal.
 *
 * The model, in the owner's words: Agent G = orchestration layer · Studio = the one window · Services = capability
 * taxonomy · Modes/Presets = flows · provider models = implementation detail. So:
 *   - a SERVICE runs on exactly one studio tool (lib/studio/tools.ts — the runtime: `?tool=` deep link, the panel, the
 *     route behind it) and is priced by exactly one quote key (lib/credits/quote.ts — the number on the button is the
 *     number on the bill, R5);
 *   - a SHORTCUT is where the same service also appears (Music → Music video); it opens the SAME canonical service —
 *     never a second implementation (§1.2, §24);
 *   - a MODE is a flow inside a service, not a card (§53 "no service explosion").
 *
 * ⚠️ STATUS IS A CLAIM. `live` means the studio tool exists and is reachable today; it does NOT mean the provider path
 * is proven or inside PROJECT_MASTER §A — that is `boundary` below, kept honest by the inventory and the tests.
 * A service with no runtime is `coming-soon` or `hidden`, never `live`.
 *
 * Pure: no I/O, no env, safe on the client.
 */
import { ALL_TOOLS, type ToolId } from '@/lib/studio/tools';
import type { QuoteTool } from '@/lib/credits/quote';

export type ServiceCategory =
  | 'video' | 'image-photo' | 'avatar' | 'music' | 'voice-audio' | 'text-content' | 'design' | 'code' | 'web-research';

export type ServiceStatus = 'live' | 'beta' | 'coming-soon' | 'hidden' | 'deprecated';

/**
 * PROJECT_MASTER §A on the service's CURRENT runtime path (inventory §2, 2026-10-08):
 *   'google'     — Google (and/or ElevenLabs / ffmpeg / on-device) only;
 *   'violation'  — today's path calls a provider §A removes (named in `boundaryNote`); the Vertex/Imagen/Lyria
 *                  migration (PROJECT_MASTER Part 2) owns the fix. Kept visible so a launch report cannot call it clean.
 */
export type BoundaryState = 'google' | 'violation';

export type L10n = { ka: string; en: string; ru: string };

export interface ServiceMode {
  id: string;
  label: L10n;
  /** Extra query the studio understands for this mode (e.g. `mode=musicvideo`), appended to the deep link. */
  query?: Record<string, string>;
}

export interface ServiceDefinition {
  /** Canonical id `<category-ish>.<name>` — also the analytics identity (§50). Never reused, never renamed silently. */
  id: string;
  category: ServiceCategory;
  label: L10n;
  description: L10n;
  /** The studio tool that runs it (the runtime). `null` only for a service that has no runtime yet. */
  tool: ToolId | null;
  modes: readonly ServiceMode[];
  /** Other categories that show this service as a shortcut. The shortcut opens THIS service (§24). */
  shortcuts: readonly ServiceCategory[];
  /** lib/credits/quote.ts key the button is priced with; `null` = no charge today (stated, not hidden). */
  pricingKey: QuoteTool | null;
  authRequired: boolean;
  status: ServiceStatus;
  boundary: BoundaryState;
  boundaryNote?: string;
  /** Agent G may pick this service from intent (§52). */
  agentCallable: boolean;
  visibleInSidebar: boolean;
  visibleInTools: boolean;
  visibleInServices: boolean;
  /** Search words in every UI language (§51): what a person would type, not the marketing name. */
  aliases: readonly string[];
  order: number;
}

const l = (ka: string, en: string, ru: string): L10n => ({ ka, en, ru });

export const SERVICE_CATEGORIES: readonly { id: ServiceCategory; label: L10n; group: 'create' | 'work' | 'agent' }[] = [
  { id: 'video', label: l('ვიდეო', 'Video', 'Видео'), group: 'create' },
  { id: 'image-photo', label: l('სურათი და ფოტო', 'Image & Photo', 'Изображения и фото'), group: 'create' },
  { id: 'avatar', label: l('ავატარი', 'Avatar', 'Аватар'), group: 'create' },
  { id: 'music', label: l('მუსიკა', 'Music', 'Музыка'), group: 'create' },
  { id: 'voice-audio', label: l('ხმა და აუდიო', 'Voice & Audio', 'Голос и аудио'), group: 'create' },
  { id: 'text-content', label: l('ტექსტი და კონტენტი', 'Text & Content', 'Текст и контент'), group: 'work' },
  { id: 'design', label: l('დიზაინი', 'Design', 'Дизайн'), group: 'work' },
  { id: 'code', label: l('კოდი', 'Code', 'Код'), group: 'work' },
  { id: 'web-research', label: l('ძიება და კვლევა', 'Search & Research', 'Поиск и исследования'), group: 'agent' },
];

const svc = (d: Omit<ServiceDefinition, 'modes' | 'shortcuts' | 'authRequired' | 'agentCallable' | 'visibleInSidebar' | 'visibleInTools' | 'visibleInServices'> &
  Partial<Pick<ServiceDefinition, 'modes' | 'shortcuts' | 'authRequired' | 'agentCallable' | 'visibleInSidebar' | 'visibleInTools' | 'visibleInServices'>>): ServiceDefinition => ({
  modes: [], shortcuts: [], authRequired: true, agentCallable: true,
  visibleInSidebar: false, visibleInTools: true, visibleInServices: true,
  ...d,
});

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  // ── VIDEO ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'video.generate', category: 'video', order: 10, tool: 'video', pricingKey: 'video', status: 'live', boundary: 'google',
    label: l('ვიდეოს გენერაცია', 'Generate video', 'Создать видео'),
    description: l('იდეიდან სცენარი, კადრები და მზა ფილმი', 'From an idea to a storyboard and a finished film', 'От идеи к раскадровке и готовому фильму'),
    modes: [
      { id: 'text', label: l('ტექსტიდან', 'From text', 'Из текста') },
      { id: 'documentary', label: l('დოკუმენტური', 'Documentary', 'Документальный'), query: { mode: 'documentary' } },
    ],
    visibleInSidebar: true,
    aliases: ['video', 'ვიდეო', 'видео', 'film', 'ფილმი', 'фильм', 'reel', 'რილი', 'text to video', 'storyboard', 'სთორიბორდი', 'раскадровка'],
  }),
  svc({
    id: 'video.music-video', category: 'video', order: 11, tool: 'video', pricingKey: 'video', status: 'live', boundary: 'google',
    label: l('მუსიკალური კლიპი', 'Music video', 'Музыкальный клип'),
    description: l('სიმღერიდან ვიდეოკლიპი', 'A clip for your song', 'Клип для вашей песни'),
    modes: [{ id: 'musicvideo', label: l('მუსიკალური კლიპი', 'Music video', 'Музыкальный клип'), query: { mode: 'musicvideo' } }],
    shortcuts: ['music'],
    // A row of its own under Video in the sidebar (lib/catalog/nav.ts modeServices): the mode was not findable otherwise.
    visibleInSidebar: true,
    aliases: ['music video', 'მუსიკალური ვიდეო', 'მუსიკალური კლიპი', 'კლიპი', 'ვიდეოკლიპი', 'клип', 'музыкальный клип', 'музыкальное видео'],
  }),
  svc({
    id: 'video.product-ad', category: 'video', order: 12, tool: 'product', pricingKey: 'product', status: 'live',
    boundary: 'violation', boundaryNote: 'Veo first, then Kling via Replicate, then a Ken Burns still (/api/video/remix productad); §A removes the Kling leg',
    label: l('პროდუქტის რეკლამა', 'Product ad', 'Реклама продукта'),
    description: l('პროდუქტის ფოტოდან სარეკლამო რილი', 'An ad reel from a product photo', 'Рекламный ролик из фото продукта'),
    shortcuts: ['image-photo'],
    aliases: ['product ad', 'ad', 'advert', 'advertisement', 'promo video', 'რეკლამა', 'პროდუქტის რეკლამა', 'სარეკლამო ვიდეო', 'реклама', 'реклама продукта', 'рекламный ролик'],
  }),
  svc({
    id: 'video.character-swap', category: 'video', order: 13, tool: 'swap', pricingKey: 'swap', status: 'live',
    boundary: 'violation', boundaryNote: 'roop via Replicate (/api/video/remix `character`, quotes and charges remix 15); the Genjutsu panel\'s swap is Kling via Higgsfield (/api/genjutsu)',
    label: l('პერსონაჟის შეცვლა', 'Character swap', 'Замена персонажа'),
    description: l('ვიდეოში სხვა სახე ან პერსონაჟი', 'Put another face or character in a video', 'Другое лицо или персонаж в видео'),
    shortcuts: ['avatar'],
    aliases: ['character swap', 'face swap', 'swap the character', 'swap character', 'swap the face', 'swap face', 'სახის შეცვლა', 'პერსონაჟის შეცვლა', 'замена лица', 'замена персонажа', 'ამ ბიჭით', 'ამ გოგოთი'],
  }),
  svc({
    id: 'video.motion', category: 'video', order: 14, tool: 'motion', pricingKey: 'motion', status: 'live',
    boundary: 'violation', boundaryNote: 'Kling via Higgsfield / Replicate (/api/motion-control)',
    label: l('მოძრაობის გადატანა', 'Motion transfer', 'Перенос движения'),
    description: l('ფოტო იმოძრავებს ვიდეოს მიხედვით', 'A photo moves like a reference video', 'Фото двигается по образцу'),
    shortcuts: ['avatar'],
    // Not „animate this photo": that is image→video, which the chat sends to Veo (§A). Motion transfer needs a
    // reference video, so only its own name routes here.
    aliases: ['motion transfer', 'motion control', 'copy the motion', 'მოძრაობის გადატანა', 'перенос движения'],
  }),
  svc({
    id: 'video.vfx', category: 'video', order: 15, tool: 'vfx', pricingKey: 'remix', status: 'live', boundary: 'google',
    boundaryNote: 'Veo scene; button quotes `remix`, route prices with lib/genjutsu/pricing.ts (R5 gap)',
    label: l('VFX ეფექტები', 'VFX effects', 'VFX-эффекты'),
    description: l('ერთი შეხებით VFX ეფექტები ფოტოსთვის', 'One-tap VFX effects for your photos', 'VFX-эффекты в одно касание'),
    aliases: ['vfx', 'visual effects', 'special effects', 'ვიზუალური ეფექტ', 'სპეცეფექტ', 'спецэффект', 'визуальные эффекты'],
  }),
  svc({
    id: 'video.remix', category: 'video', order: 16, tool: 'remix', pricingKey: 'remix', status: 'live',
    boundary: 'violation', boundaryNote: 'restyle/character ops can reach Kling / Replicate Wav2Lip / NanoBanana',
    label: l('ვიდეო რემიქსი', 'Video remix', 'Видео-ремикс'),
    description: l('შეცვალე არსებული ვიდეო: სტილი, სუბტიტრები, ხმა', 'Change a video you have: style, captions, voice', 'Измените своё видео: стиль, субтитры, голос'),
    aliases: ['video remix', 'remix this video', 'remix my video', 'remix the video', 'restyle', 'add captions', 'add subtitles', 'ვიდეოს რემიქსი', 'ვიდეო რემიქსი', 'ვიდეო დამირემიქსე', 'ვიდეოს სუბტიტრ', 'ремикс видео', 'субтитры к видео'],
  }),
  svc({
    id: 'video.editing', category: 'video', order: 17, tool: 'montage', pricingKey: null, status: 'live', boundary: 'google',
    label: l('ვიდეოს მონტაჟი', 'Video editing', 'Видеомонтаж'),
    description: l('კადრებიდან ერთი ფილმი: ჭრა, მიერთება, მუსიკა', 'One film from your clips: trim, join, music', 'Один фильм из клипов: обрезка, склейка, музыка'),
    aliases: ['montage', 'edit video', 'trim', 'join clips', 'join the clips', 'join videos', 'მონტაჟი', 'მოჭრა', 'монтаж', 'обрезать', 'склеить'],
  }),
  // ── IMAGE & PHOTO ─────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'image.generate', category: 'image-photo', order: 20, tool: 'image', pricingKey: 'image', status: 'live',
    boundary: 'violation', boundaryNote: 'NanoBananaAI (third party) → Grok → FLUX (/api/nanobanana/image); Imagen/Gemini image is the §A target',
    label: l('სურათის შექმნა', 'Generate image', 'Создать изображение'),
    description: l('შექმენი და დაარედაქტირე სურათები', 'Create and edit images', 'Создавайте и редактируйте изображения'),
    visibleInSidebar: true,
    aliases: ['image', 'picture', 'სურათი', 'ნახატი', 'изображение', 'картинка', 'draw', 'დახატე', 'დამიხატე', 'нарисуй', 'edit image'],
  }),
  svc({
    id: 'image.photoshoot', category: 'image-photo', order: 21, tool: 'photoshoot', pricingKey: 'photoshoot', status: 'live',
    boundary: 'violation', boundaryNote: 'same cascade as image.generate',
    label: l('ფოტოგრაფი', 'Photographer', 'Фотограф'),
    description: l('სტუდიური ფოტოსესია შენი ფოტოებიდან', 'A studio photoshoot from your photos', 'Студийная фотосессия из ваших фото'),
    aliases: ['photoshoot', 'photo shoot', 'photographer', 'ფოტოსესია', 'ფოტოგრაფი', 'фотосессия', 'фотограф'],
  }),
  svc({
    id: 'image.interior', category: 'image-photo', order: 22, tool: 'interior', pricingKey: 'interior', status: 'live',
    boundary: 'violation', boundaryNote: 'NanoBanana cascade; /api/orchestrator/interior/produce uses Claude for style',
    label: l('ინტერიერის დიზაინი', 'Interior design', 'Дизайн интерьера'),
    description: l('გადააპროექტე ოთახი ფოტოდან', 'Redesign a room from a photo', 'Новый дизайн комнаты по фото'),
    aliases: ['interior', 'interior design', 'room design', 'redesign my room', 'redesign my living room', 'redesign my bedroom', 'redesign my kitchen', 'ინტერიერი', 'ოთახის დიზაინი', 'интерьер', 'дизайн комнаты'],
  }),
  svc({
    id: 'image.culling', category: 'image-photo', order: 23, tool: 'photo', pricingKey: null, authRequired: false, agentCallable: false,
    status: 'live', boundary: 'google', boundaryNote: 'on-device, no provider',
    label: l('ფოტოების შერჩევა', 'Photo culling', 'Отбор фото'),
    description: l('საუკეთესო კადრები — ფოტოები მოწყობილობას არ ტოვებს', 'Pick the best shots — photos never leave your device', 'Лучшие кадры — фото не покидают устройство'),
    aliases: ['culling', 'best photos', 'შერჩევა', 'отбор фото'],
  }),
  // ── AVATAR ────────────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'avatar.talking', category: 'avatar', order: 30, tool: 'avatar', pricingKey: 'avatar', status: 'live',
    boundary: 'violation', boundaryNote: 'HeyGen talking photo; Replicate SadTalker/Wav2Lip fallback (ElevenLabs voice is allowed)',
    label: l('მოლაპარაკე ავატარი', 'Talking avatar', 'Говорящий аватар'),
    description: l('ფოტო ალაპარაკდება შენი ტექსტით ან ხმით', 'A photo speaks your script or voice', 'Фото говорит вашим текстом или голосом'),
    visibleInSidebar: true,
    aliases: ['avatar', 'talking avatar', 'lip sync', 'lipsync', 'ავატარი', 'ალაპარაკე', 'аватар', 'говорящий аватар', 'липсинк'],
  }),
  // ── MUSIC ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'music.generate', category: 'music', order: 40, tool: 'music', pricingKey: 'music', status: 'live',
    boundary: 'violation', boundaryNote: 'Lyria → ElevenLabs Music → Udio cascade (/api/ai/music); Udio is removed by §A',
    label: l('მუსიკის შექმნა', 'Generate music', 'Создать музыку'),
    description: l('ტრეკი, სიმღერა ან საუნდტრეკი', 'A track, a song or a soundtrack', 'Трек, песня или саундтрек'),
    modes: [
      { id: 'song', label: l('სიმღერა', 'Song', 'Песня') },
      { id: 'instrumental', label: l('ინსტრუმენტული', 'Instrumental', 'Инструментал') },
    ],
    shortcuts: ['video'],
    visibleInSidebar: true,
    aliases: ['music', 'song', 'track', 'soundtrack', 'მუსიკა', 'სიმღერა', 'ტრეკი', 'музыка', 'музык', 'песня', 'песн', 'трек', 'саундтрек'],
  }),
  svc({
    id: 'music.remix', category: 'music', order: 41, tool: null, pricingKey: null, status: 'coming-soon', boundary: 'google',
    agentCallable: false, visibleInTools: false, visibleInServices: false,
    label: l('აუდიო რემიქსი', 'Audio remix', 'Аудио-ремикс'),
    description: l('არსებული ტრეკის ვარიაცია — ჯერ არ არის', 'A variation of a track you have — not available yet', 'Вариация вашего трека — пока недоступно'),
    aliases: ['audio remix', 'music remix', 'remix song', 'remix this song', 'remix my song', 'remix this track', 'მუსიკის რემიქსი', 'მუსიკა დამირემიქსე', 'სიმღერა დამირემიქსე', 'ტრეკი დამირემიქსე', 'ремикс музыки', 'ремикс трека', 'ремикс песни'],
  }),
  // ── VOICE & AUDIO ─────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'voice.dubbing', category: 'voice-audio', order: 50, tool: 'dubbing', pricingKey: null, status: 'live', boundary: 'google',
    boundaryNote: 'ElevenLabs Scribe + Gemini translation + TTS; route charges nothing yet (dubbing/start/route.ts)',
    label: l('დუბლაჟი', 'Dubbing', 'Дубляж'),
    description: l('ვიდეო სხვა ენაზე, შენი ხმით', 'Your video in another language', 'Ваше видео на другом языке'),
    shortcuts: ['video'],
    // Never a bare „translate": „გადათარგმნე ეს ტექსტი" is a text job for Agent G, not a video one.
    aliases: ['dubbing', 'dub', 'translate video', 'translate this video', 'დუბლაჟი', 'ვიდეოს ხმა', 'ვიდეოს თარგმანი', 'ვიდეოს გადათარგმნა', 'дубляж', 'перевести видео', 'переведи видео', 'озвучка видео'],
  }),
  // ── TEXT & CONTENT ────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'text.write', category: 'text-content', order: 60, tool: 'chat', pricingKey: 'chat', authRequired: false, status: 'live', boundary: 'google',
    label: l('ტექსტი და კონტენტი', 'Writing', 'Тексты'),
    description: l('სტატია, სცენარი, რეკლამის ტექსტი, პოსტი — Agent G-სთან', 'Articles, scripts, ad copy, posts — with Agent G', 'Статьи, сценарии, реклама, посты — с Agent G'),
    modes: [
      { id: 'content', label: l('კონტენტი', 'Content', 'Контент') },
      { id: 'video-script', label: l('ვიდეოს სცენარი', 'Video script', 'Сценарий видео') },
      { id: 'podcast', label: l('პოდკასტის სცენარი', 'Podcast script', 'Сценарий подкаста') },
      { id: 'prompt', label: l('პრომპტი', 'Prompt', 'Промпт') },
      { id: 'translate', label: l('თარგმანი', 'Translate', 'Перевод') },
    ],
    shortcuts: ['video'],
    aliases: ['write', 'დამიწერე', 'დაწერე', 'text', 'copy', 'article', 'script', 'podcast', 'prompt', 'ტექსტი', 'სტატია', 'სცენარი', 'პოსტი', 'პოდკასტი', 'текст', 'статья', 'сценарий', 'пост', 'подкаст'],
  }),
  // ── DESIGN ────────────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'design.presentation', category: 'design', order: 70, tool: 'presentation', pricingKey: null, status: 'live', boundary: 'google',
    boundaryNote: 'Gemini outline + Imagen; route charges nothing yet',
    label: l('პრეზენტაცია', 'Presentation', 'Презентация'),
    description: l('თემიდან მზა სლაიდები', 'Slides from a topic', 'Слайды по теме'),
    aliases: ['presentation', 'slides', 'deck', 'პრეზენტაცია', 'სლაიდები', 'презентация', 'слайды'],
  }),
  svc({
    id: 'design.model3d', category: 'design', order: 71, tool: 'model3d', pricingKey: 'model3d', status: 'beta',
    boundary: 'violation', boundaryNote: 'Replicate TRELLIS (/api/v2/model3d)',
    label: l('3D მოდელი', '3D model', '3D-модель'),
    description: l('3D მოდელი ტექსტიდან ან ფოტოდან', 'A 3D model from text or a photo', '3D-модель из текста или фото'),
    aliases: ['3d', '3d model', '3დ', '3D მოდელი', '3d модель'],
  }),
  // ── CODE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  svc({
    id: 'code.assistant', category: 'code', order: 80, tool: 'chat', pricingKey: 'chat', authRequired: false, status: 'live', boundary: 'google',
    boundaryNote: 'Gemini in chat; a sandboxed terminal (PROJECT_MASTER §A Sandbox) is not built',
    label: l('კოდის ასისტენტი', 'Code assistant', 'Помощник по коду'),
    description: l('დაწერე, აუხსენი და გამართე კოდი Agent G-სთან', 'Write, explain and debug code with Agent G', 'Пишите, объясняйте и отлаживайте код с Agent G'),
    visibleInTools: false,
    aliases: ['code', 'coding', 'debug', 'program', 'კოდი', 'პროგრამა', 'код', 'программа', 'отладка'],
  }),
  svc({
    id: 'code.terminal', category: 'code', order: 81, tool: null, pricingKey: null, status: 'coming-soon', boundary: 'google',
    agentCallable: false, visibleInTools: false, visibleInServices: false,
    label: l('ტერმინალი', 'Terminal', 'Терминал'),
    description: l('იზოლირებული sandbox — ჯერ არ არის', 'An isolated sandbox — not available yet', 'Изолированная песочница — пока недоступно'),
    aliases: ['terminal', 'sandbox', 'ტერმინალი', 'терминал'],
  }),
  // ── SEARCH & RESEARCH (Agent G capabilities, not marketing cards) ────────────────────────────────────────────────
  svc({
    id: 'research.web-search', category: 'web-research', order: 90, tool: 'chat', pricingKey: 'chat', authRequired: false, status: 'live',
    boundary: 'google', boundaryNote: 'Gemini Google Search grounding in chat',
    label: l('ვებ ძიება', 'Web search', 'Веб-поиск'),
    description: l('Agent G ეძებს ინტერნეტში და წყაროებს გიჩვენებს', 'Agent G searches the web and shows its sources', 'Agent G ищет в интернете и показывает источники'),
    visibleInTools: false, visibleInServices: false,
    aliases: ['search', 'google', 'news', 'ძიება', 'მომიძებნე', 'სიახლე', 'поиск', 'найди', 'новости'],
  }),
];

const BY_ID: ReadonlyMap<string, ServiceDefinition> = new Map(SERVICE_CATALOG.map((s) => [s.id, s]));
const CATEGORY_LABEL: ReadonlyMap<ServiceCategory, L10n> = new Map(SERVICE_CATEGORIES.map((c) => [c.id, c.label]));

export const getService = (id: string): ServiceDefinition | undefined => BY_ID.get(id);

/** What a person can use today (live + beta). Every count on a page comes from here. */
export const usableServices = (): ServiceDefinition[] =>
  SERVICE_CATALOG.filter((s) => s.status === 'live' || s.status === 'beta').sort((a, b) => a.order - b.order);

export const countServices = (filter: (s: ServiceDefinition) => boolean = (s) => s.visibleInServices): number =>
  usableServices().filter(filter).length;

/** Services under a category: those it owns, then the shortcuts other categories lend it (§24). */
export function servicesInCategory(category: ServiceCategory): { service: ServiceDefinition; shortcut: boolean }[] {
  const owned = usableServices().filter((s) => s.category === category).map((service) => ({ service, shortcut: false }));
  const lent = usableServices().filter((s) => s.category !== category && s.shortcuts.includes(category)).map((service) => ({ service, shortcut: true }));
  return [...owned, ...lent];
}

/** The studio link that opens a service (and a mode). Shortcuts use the same link — one runtime. */
export function serviceHref(id: string, locale: string, modeId?: string): string | null {
  const s = BY_ID.get(id);
  if (!s || !s.tool) return null;
  const q = new URLSearchParams({ tool: s.tool });
  for (const [k, v] of Object.entries(serviceModeQuery(id, modeId) ?? {})) q.set(k, v);
  return `/${locale}/dashboard?${q.toString()}`;
}

/** The studio query a service (and mode) adds to its tool — a single-mode service always carries its mode. */
export function serviceModeQuery(id: string, modeId?: string): Readonly<Record<string, string>> | undefined {
  const s = BY_ID.get(id);
  if (!s) return undefined;
  const mode = modeId ? s.modes.find((m) => m.id === modeId) : s.modes.length === 1 ? s.modes[0] : undefined;
  return mode?.query;
}

const norm = (t: string): string => t.toLocaleLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Whole-word match, or — for an alias of 4+ letters — the alias plus up to 3 more letters, which covers Georgian and
 * Russian case endings („ვიდეოს", „музыку") and English plurals ("videos") without letting "ad" match "admin".
 * A Georgian or Russian alias written in the nominative also matches its other cases: the final vowel is an ending,
 * not part of the word („ინტერიერი" → „ინტერიერის", „фотосессия" → „фотосессию").
 */
function aliasHits(query: string, alias: string): boolean {
  const inflects = /[ია]$/u.test(alias) && /[\u10D0-\u10FF]$/u.test(alias) || /[аяыиь]$/u.test(alias);
  const stem = inflects && alias.length >= 5 ? alias.slice(0, -1) : alias;
  let at = query.indexOf(` ${stem}`);
  while (at !== -1) {
    const rest = query.slice(at + 1 + stem.length);
    const tail = rest.slice(0, rest.indexOf(' '));
    if (tail.length === 0 || (stem.length >= 4 && tail.length <= 3)) return true;
    at = query.indexOf(` ${stem}`, at + 1);
  }
  return false;
}

/**
 * Bare category nouns. Almost every request names its medium („swap the character in this VIDEO", „ამ ვიდეოს ხმა
 * გადამითარგმნე"), so a medium word is evidence of the category, not of the service: it scores below any specific
 * alias and only decides when nothing more specific was said ("make a video about the sea" → video.generate).
 */
const GENERIC_ALIASES: ReadonlySet<string> = new Set([
  'video', 'ვიდეო', 'видео', 'film', 'ფილმი', 'фильм',
  'image', 'picture', 'სურათი', 'ნახატი', 'изображение', 'картинка',
]);

/**
 * Search (§51) and Agent G service resolution (§52): the best catalog service for free text, or null.
 * Scoring prefers the LONGEST matching alias, so „მუსიკალური ვიდეო" wins over „მუსიკა" and „ვიდეო", and
 * "music remix" (audio) wins over "remix" — §25 "Remix is not enough"; a bare medium word (GENERIC_ALIASES) loses to
 * any specific one. Unusable services still resolve (a person asking for an audio remix must hear it is not
 * available, not get a video remix instead).
 */
export function resolveService(text: string): ServiceDefinition | null {
  const q = ` ${norm(text)} `;
  if (q.trim() === '') return null;
  let best: { s: ServiceDefinition; score: number } | null = null;
  for (const s of SERVICE_CATALOG) {
    if (s.status === 'hidden' || s.status === 'deprecated') continue;
    for (const a of s.aliases) {
      const na = norm(a);
      if (!na) continue;
      if (!aliasHits(q, na)) continue;
      const score = (GENERIC_ALIASES.has(na) ? 1 : na.length) + (s.status === 'live' ? 0.5 : 0);
      if (!best || score > best.score) best = { s, score };
    }
  }
  return best?.s ?? null;
}

/** Joining words a search box must not match on („სურათი და ფოტო" is not a hit for „და"). */
const SEARCH_STOP: ReadonlySet<string> = new Set(['და', 'and', 'и', 'the', 'a', 'an', 'to', 'of', 'in', 'для', 'в', 'на']);

/**
 * One typed token against one catalog word: the word starts with it (typing in progress: „მუს" → „მუსიკა"), or it is
 * the word plus an ending of up to 3 letters, also after a Georgian/Russian final vowel (aliasHits' rule, per word).
 */
function tokenHits(token: string, word: string): boolean {
  if (word.startsWith(token)) return true;
  const inflects = /[ია]$/u.test(word) && /[ა-ჿ]$/u.test(word) || /[аяыиь]$/u.test(word);
  const stem = inflects && word.length >= 5 ? word.slice(0, -1) : word;
  return stem.length >= 4 && token.startsWith(stem) && token.length - stem.length <= 3;
}

/**
 * The search box (§51): services for what a person is TYPING, best first, at most `limit`.
 * Every token (stop words aside) must hit a word of the service's aliases, its label or its modes' labels in any UI
 * language, so a half-typed word already finds it. Agent G's pick (`resolveService`) for the same text always leads,
 * so the box and the chat never disagree on the top service. Coming-soon services are returned too, for the UI to
 * show as unavailable (§25 — „audio remix" must not quietly become a video remix); hidden and deprecated never are.
 */
export function searchServices(text: string, limit = 6): ServiceDefinition[] {
  const q = norm(text);
  const tokens = q.split(' ').filter((t) => t.length > 0 && !SEARCH_STOP.has(t));
  if (q.length < 2 || tokens.length === 0) return [];
  const top = resolveService(text);
  const hits: { s: ServiceDefinition; score: number }[] = [];
  for (const s of SERVICE_CATALOG) {
    if (s.status === 'hidden' || s.status === 'deprecated') continue;
    const phrases = [...s.aliases, ...Object.values(s.label), ...s.modes.flatMap((m) => Object.values(m.label))];
    const words = [...new Set(phrases.flatMap((p) => norm(p).split(' ')).filter((w) => w && !SEARCH_STOP.has(w)))];
    const all = tokens.every((t) => words.some((w) => tokenHits(t, w)));
    if (!all && s !== top) continue;
    // Agent G's pick first; then services whose LABEL carries the words (what the row shows), those of the category the
    // words name („მუს" → Music before Music video), then alias-only hits; a usable service before a coming-soon one.
    const labelWords = Object.values(s.label).flatMap((p) => norm(p).split(' '));
    const inLabel = tokens.every((t) => labelWords.some((w) => tokenHits(t, w)));
    const catWords = Object.values(CATEGORY_LABEL.get(s.category) ?? {}).flatMap((p) => norm(p).split(' '));
    const inCategory = tokens.every((t) => catWords.some((w) => tokenHits(t, w)));
    const score = (s === top ? 100 : 0) + (inLabel ? 10 : 0) + (inCategory ? 5 : 0) + (s.status === 'coming-soon' ? 0 : 1);
    hits.push({ s, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.s.order - b.s.order).slice(0, limit).map((h) => h.s);
}

/**
 * Legacy page slugs (/{lang}/services/<slug>) → canonical service (§48 migration matrix, §49 route compatibility).
 * A slug missing here keeps its page but has no studio runtime of its own (see docs/handoffs/service-taxonomy.md).
 */
export const LEGACY_SLUG_TO_SERVICE: Readonly<Record<string, string>> = {
  video: 'video.generate',
  editing: 'video.editing',
  image: 'image.generate',
  photo: 'image.photoshoot',
  interior: 'image.interior',
  avatar: 'avatar.talking',
  music: 'music.generate',
  // NOT `voice`: that page is a text-to-speech voiceover (/api/pipeline voice), which no catalog service runs yet —
  // pointing it at Dubbing named it after a different thing. See the migration matrix (voice.voiceover, FUTURE).
  'content-writer': 'text.write',
  podcast: 'text.write',
  text: 'text.write',
  prompt: 'text.write',
  'prompt-builder': 'text.write',
  character: 'text.write',
  event: 'text.write',
  software: 'code.assistant',
  terminal: 'code.assistant',
};

/** Every studio tool that some catalog service runs on — used by the tests to prove nothing in the studio is orphaned. */
export const toolsInCatalog = (): ToolId[] => ALL_TOOLS.filter((t) => SERVICE_CATALOG.some((s) => s.tool === t));
