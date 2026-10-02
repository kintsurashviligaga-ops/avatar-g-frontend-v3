/**
 * lib/studio/templates.photoshoot.ts — the PHOTOGRAPHER's shoot presets and camera controls (components/studio/create/
 * PhotoshootCreatePanel.tsx). Same contract as lib/studio/templates.interior.ts (read its header): a preset card names a
 * look, the request names it by id, the server resolves the id to the look's directive (lib/studio/shootContext.ts,
 * `server-only`), the card discloses what it adds as one „Adds: …" line, and `thumb` stays null until the art exists
 * (scripts/templates/thumbs.shoot.md).
 *
 * ⚠️ NOT `photo`. The studio's `photo` tool is on-device photo CULLING (no upload, no credits, lib/studio/tools.ts); this
 * is `photoshoot`, which MAKES new pictures from yours and spends credits per image.
 *
 * The camera controls are chips — lens · light · angle · depth of field — each an id from lib/studio/shootWire.ts. `auto`
 * (nothing picked) leaves the preset's own look; a picked chip is appended to the request as a server-side directive.
 *
 * A preset knows what it shoots (`subject`): with a reference photo the server tells the model what must stay IDENTICAL
 * (a product's shape and labels, a person's face, a building's architecture); `aspect` is the shape it suggests, applied
 * once when the card is picked (the aspect chip stays free to change it afterwards).
 *
 * Pure and isomorphic: no React, no env.
 */
import type { TemplateLang } from '@/lib/studio/templates';
import { TEMPLATE_ID_RX } from '@/lib/studio/templates';
import type { AngleId, DofId, LensId, LightId } from '@/lib/studio/shootWire';

type L10n = Record<TemplateLang, string>;
const T = (ka: string, en: string, ru: string): L10n => ({ ka, en, ru });

export type ShootSubject = 'product' | 'person' | 'place' | 'any';

export interface PhotoshootTemplate {
  tool: 'photoshoot';
  id: string;
  label: L10n;
  hint: L10n;
  /** What the preset adds to the request, in plain words — the „Adds: …" line. */
  adds: L10n;
  /** What a reference photo of this shoot is OF — decides what the server keeps identical. */
  subject: ShootSubject;
  /** The shape the preset suggests (one of the image route's ratios); applied once, when the card is picked. */
  aspect: '1:1' | '4:5' | '3:4' | '2:3' | '4:3' | '3:2' | '16:9' | '9:16';
  thumb: string | null;
  palette: readonly [string, string];
}

export const PHOTOSHOOT_TEMPLATES: readonly PhotoshootTemplate[] = [
  {
    tool: 'photoshoot', id: 'ecom-white',
    label: T('თეთრი ფონი', 'E-commerce white', 'Белый фон'),
    hint: T('ონლაინ მაღაზიისთვის, უნაკლო თეთრ ფონზე', 'Catalogue-ready on a pure white backdrop', 'Для каталога, на чисто белом фоне'),
    adds: T('სუფთა თეთრი ფონი და რბილი, უჩრდილო შუქი', 'A pure white backdrop and soft shadowless light', 'Чисто белый фон и мягкий свет без теней'),
    subject: 'product', aspect: '1:1',
    thumb: '/templates/photoshoot/ecom-white.jpg', palette: ['#0F1114', '#DADCE0'],
  },
  {
    tool: 'photoshoot', id: 'lifestyle',
    label: T('ლაიფსთაილი', 'Lifestyle', 'Лайфстайл'),
    hint: T('ცოცხალი გარემო, ბუნებრივი შუქი', 'A real, lived-in setting in natural light', 'Живая обстановка, естественный свет'),
    adds: T('ცოცხალი გარემო და ფანჯრის ბუნებრივი შუქი', 'A lived-in setting and natural window light', 'Живая обстановка и свет из окна'),
    subject: 'any', aspect: '4:5',
    thumb: '/templates/photoshoot/lifestyle.jpg', palette: ['#14110C', '#E3B27A'],
  },
  {
    tool: 'photoshoot', id: 'editorial-fashion',
    label: T('ედიტორიალ მოდა', 'Editorial fashion', 'Эдиториал'),
    hint: T('ჟურნალის გარეკანის დონე, მკაფიო შუქი', 'Magazine-cover polish, bold directional light', 'Уровень обложки, выразительный свет'),
    adds: T('ჟურნალის სტილი, დრამატული მიმართული შუქი', 'Magazine styling and dramatic directional light', 'Стиль журнала и драматичный направленный свет'),
    subject: 'person', aspect: '4:5',
    thumb: '/templates/photoshoot/editorial-fashion.jpg', palette: ['#120C14', '#E26A9A'],
  },
  {
    tool: 'photoshoot', id: 'luxury-product',
    label: T('პრემიუმ პროდუქტი', 'Luxury product', 'Премиум-продукт'),
    hint: T('მუქი ფონი, ბზინვარება და ამრეკლი ზედაპირი', 'Dark backdrop, gloss and mirror reflections', 'Тёмный фон, глянец и отражения'),
    adds: T('მუქი ფონი, ამრეკლი ზედაპირი, კონტურული შუქი', 'A dark backdrop, a mirror surface, rim light', 'Тёмный фон, зеркальная поверхность, контровой свет'),
    subject: 'product', aspect: '4:5',
    thumb: '/templates/photoshoot/luxury-product.jpg', palette: ['#08080C', '#C9A24E'],
  },
  {
    tool: 'photoshoot', id: 'food',
    label: T('საკვები', 'Food', 'Еда'),
    hint: T('მადისაღმძვრელი, გვერდითი ბუნებრივი შუქი', 'Appetising, side-lit and fresh', 'Аппетитно, боковой естественный свет'),
    adds: T('გვერდითი შუქი, ახალი ინგრედიენტები, თბილი ფერები', 'Side light, fresh ingredients, warm colour', 'Боковой свет, свежие продукты, тёплые цвета'),
    subject: 'product', aspect: '4:5',
    thumb: '/templates/photoshoot/food.jpg', palette: ['#160C06', '#E8803A'],
  },
  {
    tool: 'photoshoot', id: 'jewelry',
    label: T('სამკაული', 'Jewelry', 'Украшения'),
    hint: T('მაკრო, ბრწყინვალე წახნაგები და ლითონი', 'Macro detail, crisp facets and metal', 'Макро: чёткие грани и металл'),
    adds: T('მაკრო კადრი, ბრწყინვალე წახნაგები, მუქი ხავერდი', 'A macro shot, crisp facets, dark velvet', 'Макросъёмка, чёткие грани, тёмный бархат'),
    subject: 'product', aspect: '1:1',
    thumb: '/templates/photoshoot/jewelry.jpg', palette: ['#0A0C14', '#8FB8FF'],
  },
  {
    tool: 'photoshoot', id: 'cosmetics',
    label: T('კოსმეტიკა', 'Cosmetics', 'Косметика'),
    hint: T('სუფთა პასტელი და ნაზი ტექსტურები', 'Clean pastel and soft textures', 'Чистый пастель и нежные текстуры'),
    adds: T('პასტელის გრადიენტი, წყლის წვეთები, რბილი ნათება', 'A pastel gradient, water droplets, a soft glow', 'Пастельный градиент, капли воды, мягкое сияние'),
    subject: 'product', aspect: '4:5',
    thumb: '/templates/photoshoot/cosmetics.jpg', palette: ['#150E12', '#F0A6B8'],
  },
  {
    tool: 'photoshoot', id: 'headshot',
    label: T('პორტრეტი (LinkedIn)', 'Headshot / LinkedIn', 'Портрет (LinkedIn)'),
    hint: T('საქმიანი პორტრეტი, თავდაჯერებული გამომეტყველება', 'A confident, professional portrait', 'Деловой портрет, уверенный взгляд'),
    adds: T('რბილი სტუდიური შუქი, ნეიტრალური ბუნდოვანი ფონი', 'Soft studio light, a neutral blurred backdrop', 'Мягкий студийный свет, нейтральный размытый фон'),
    subject: 'person', aspect: '4:5',
    thumb: '/templates/photoshoot/headshot.jpg', palette: ['#0D1118', '#7FA6D6'],
  },
  {
    tool: 'photoshoot', id: 'real-estate-exterior',
    label: T('ფასადი (უძრავი ქონება)', 'Real-estate exterior', 'Фасад (недвижимость)'),
    hint: T('შენობა მთლიანად, ნათელი ცა', 'The whole building under a bright sky', 'Здание целиком под ясным небом'),
    adds: T('ფართო ხედი, მოწესრიგებული გარემო, ნათელი ცა', 'A wide level view, tidy surroundings, a bright sky', 'Широкий ракурс, ухоженная территория, ясное небо'),
    subject: 'place', aspect: '3:2',
    thumb: '/templates/photoshoot/real-estate-exterior.jpg', palette: ['#0A1420', '#E0A860'],
  },
  {
    tool: 'photoshoot', id: 'street',
    label: T('ქუჩის ფოტო', 'Street', 'Улица'),
    hint: T('ქალაქი, დინამიკა, კინემატოგრაფიული ფერები', 'City energy and cinematic colour', 'Город, динамика, кинематографичный цвет'),
    adds: T('ქალაქის გარემო, ბუნებრივი შუქი, დინამიური კადრი', 'An urban setting, available light, a dynamic frame', 'Городская среда, естественный свет, динамичный кадр'),
    subject: 'any', aspect: '4:5',
    thumb: '/templates/photoshoot/street.jpg', palette: ['#0E1014', '#E0603A'],
  },
  {
    tool: 'photoshoot', id: 'studio-portrait',
    label: T('სტუდიური პორტრეტი', 'Studio portrait', 'Студийный портрет'),
    hint: T('კლასიკური, მუქი ფონი და რემბრანდტის შუქი', 'Classic, a dark backdrop and Rembrandt light', 'Классика: тёмный фон и свет Рембрандта'),
    adds: T('მუქი ფონი, რემბრანდტის შუქი, ბუნებრივი კანი', 'A dark backdrop, Rembrandt light, natural skin', 'Тёмный фон, свет Рембрандта, живая кожа'),
    subject: 'person', aspect: '4:5',
    thumb: '/templates/photoshoot/studio-portrait.jpg', palette: ['#0B0B0E', '#B8A58A'],
  },
  {
    tool: 'photoshoot', id: 'film-noir',
    label: T('ფილმ-ნუარი', 'Film noir', 'Нуар'),
    hint: T('შავ-თეთრი, მკვეთრი ჩრდილები', 'Black and white with hard shadows', 'Чёрно-белое, резкие тени'),
    adds: T('შავ-თეთრი, მკვეთრი ჩრდილები, კინოს მარცვალი', 'Black and white, hard shadows, cinema grain', 'Чёрно-белое, резкие тени, киношное зерно'),
    subject: 'any', aspect: '2:3',
    thumb: '/templates/photoshoot/film-noir.jpg', palette: ['#080808', '#B8B8B8'],
  },
  {
    tool: 'photoshoot', id: 'flat-lay',
    label: T('ზემოდან (flat lay)', 'Flat lay', 'Флэтлей'),
    hint: T('ნივთები ზემოდან, წესრიგი და ფერები', 'Items arranged and shot from above', 'Предметы сверху, порядок и цвет'),
    adds: T('ხედი ზემოდან, რბილი დღის შუქი, შერჩეული აქსესუარები', 'A top-down view, soft daylight, chosen props', 'Вид сверху, мягкий дневной свет, подобранный реквизит'),
    subject: 'product', aspect: '1:1',
    thumb: '/templates/photoshoot/flat-lay.jpg', palette: ['#12100C', '#CDB88E'],
  },
];

// ─── The camera controls ──────────────────────────────────────────────────────────────────────────────────

export interface CameraOption<Id extends string> { id: Id; label: L10n }

export const LENS_OPTIONS: readonly CameraOption<LensId>[] = [
  { id: '24', label: T('24 მმ', '24 mm', '24 мм') },
  { id: '35', label: T('35 მმ', '35 mm', '35 мм') },
  { id: '50', label: T('50 მმ', '50 mm', '50 мм') },
  { id: '85', label: T('85 მმ', '85 mm', '85 мм') },
];

export const LIGHT_OPTIONS: readonly CameraOption<LightId>[] = [
  { id: 'window', label: T('ფანჯრის შუქი', 'Soft window', 'Окно') },
  { id: 'softbox', label: T('სოფტბოქსი', 'Studio softbox', 'Софтбокс') },
  { id: 'golden', label: T('ოქროს საათი', 'Golden hour', 'Золотой час') },
  { id: 'neon', label: T('ნეონი', 'Neon', 'Неон') },
  { id: 'flash', label: T('მკაცრი ფლეში', 'Hard flash', 'Жёсткая вспышка') },
];

export const ANGLE_OPTIONS: readonly CameraOption<AngleId>[] = [
  { id: 'eye', label: T('თვალის დონეზე', 'Eye level', 'На уровне глаз') },
  { id: 'low', label: T('დაბლიდან', 'Low angle', 'Снизу') },
  { id: 'top', label: T('ზემოდან', 'Top-down', 'Сверху') },
];

export const DOF_OPTIONS: readonly CameraOption<DofId>[] = [
  { id: 'shallow', label: T('მცირე სიღრმე (f/1.8)', 'Shallow (f/1.8)', 'Малая (f/1.8)') },
  { id: 'medium', label: T('საშუალო (f/5.6)', 'Medium (f/5.6)', 'Средняя (f/5.6)') },
  { id: 'deep', label: T('დიდი სიღრმე (f/11)', 'Deep (f/11)', 'Большая (f/11)') },
];

/** What the panel holds before the user touches anything: no preset, no camera chip (`null` = the preset's own look). */
export const PHOTOSHOOT_PANEL_DEFAULTS = {
  template: null, lens: null, light: null, angle: null, dof: null, quality: 'high', count: 1, aspect: '1:1',
} as const;

const ADDS_PREFIX: L10n = T('ამატებს', 'Adds', 'Добавляет');

/** The preset's one-line disclosure — „Adds: A pure white backdrop and soft shadowless light". */
export function photoshootAddsLine(t: PhotoshootTemplate, lang: TemplateLang): string {
  return `${ADDS_PREFIX[lang]}: ${t.adds[lang].trim()}`;
}

export const photoshootTemplate = (id: string | null | undefined): PhotoshootTemplate | null =>
  (id && TEMPLATE_ID_RX.test(id) ? PHOTOSHOOT_TEMPLATES.find((t) => t.id === id) : undefined) ?? null;
