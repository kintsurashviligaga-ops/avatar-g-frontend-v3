/**
 * lib/studio/templates.interior.ts — the INTERIOR DESIGNER's style cards and room types (components/studio/create/
 * InteriorCreatePanel.tsx). It follows lib/studio/templates.ts card for card — a visual card per starting point, an
 * „Adds: …" disclosure, a palette tile until the picture exists — but lives in its own file so the hot templates.ts
 * stays untouched.
 *
 * ⚠️ A STYLE CARD NAMES A STYLE; IT DOES NOT WRITE PANEL VALUES. The image cards are tuples of the panel's own controls
 * (aspect · quality · style) and are lit by `match*Template`. A room style has no such tuple: any style fits any aspect
 * and quality, and "Scandinavian" is not a number. So the picked card is simply selected state, and the request names
 * it by id (`StudioWire.template`, lib/studio/shootWire.ts). The server resolves that id to the style's directive
 * (lib/studio/shootContext.ts, `server-only`) — a client can choose WHICH style, never what it says. What a card adds
 * is DISCLOSED on it as the same one-line „Adds: …" (`templateAddsLine`-shaped, below) in ka/en/ru.
 *
 * Thumbnails: `thumb` is null until the art exists (a test refuses a path whose file is missing); until then a card
 * shows its palette as a gradient tile in the same 3:4 box, so nothing shifts when a picture arrives. The shots live in
 * scripts/templates/thumbs.shoot.md (the `shoot` art pack — see that file for the exact commands).
 *
 * The card objects keep `tool: 'interior', id: '…',` on ONE line and `thumb:` within a few lines below it: that is what
 * scripts/templates/build-thumbs.mjs greps to print the `thumb:` lines to change once a take is selected.
 *
 * Pure and isomorphic: no React, no env.
 */
import type { TemplateLang } from '@/lib/studio/templates';
import { TEMPLATE_ID_RX } from '@/lib/studio/templates';
import type { RoomId } from '@/lib/studio/shootWire';

type L10n = Record<TemplateLang, string>;
const T = (ka: string, en: string, ru: string): L10n => ({ ka, en, ru });

export interface InteriorTemplate {
  tool: 'interior';
  id: string;
  label: L10n;
  /** One line: what the style feels like. */
  hint: L10n;
  /** What the card adds to the request, in plain words — the „Adds: …" line (the server's own text is separate). */
  adds: L10n;
  /** A public path to a 3:4 picture, or null until one exists (the card then shows `palette`). */
  thumb: string | null;
  /** Two colours for the no-picture tile — dark → accent of the style. */
  palette: readonly [string, string];
}

export const INTERIOR_TEMPLATES: readonly InteriorTemplate[] = [
  {
    tool: 'interior', id: 'scandinavian',
    label: T('სკანდინავიური', 'Scandinavian', 'Скандинавский'),
    hint: T('ნათელი და ჰაეროვანი, ბუნებრივი ხე და სელი', 'Light and airy, natural wood and linen', 'Светлый и воздушный, дерево и лён'),
    adds: T('ღია მუხა, თეთრი კედლები, რბილი სელის ტექსტილი', 'Pale oak, white walls, soft linen', 'Светлый дуб, белые стены, мягкий лён'),
    thumb: '/templates/interior/scandinavian.jpg', palette: ['#16130F', '#D9C7A3'],
  },
  {
    tool: 'interior', id: 'modern',
    label: T('თანამედროვე', 'Modern', 'Современный'),
    hint: T('სუფთა ხაზები და ნეიტრალური ტონები', 'Clean lines and neutral tones', 'Чистые линии и нейтральные тона'),
    adds: T('სუფთა ხაზები, ნეიტრალური პალიტრა, აქცენტური შუქი', 'Clean lines, a neutral palette, statement light', 'Чистые линии, нейтральная палитра, акцентный свет'),
    thumb: '/templates/interior/modern.jpg', palette: ['#101216', '#8FA3BF'],
  },
  {
    tool: 'interior', id: 'minimalist',
    label: T('მინიმალისტური', 'Minimalist', 'Минимализм'),
    hint: T('ცოტა ავეჯი და ბევრი სივრცე', 'Few pieces and a lot of space', 'Минимум вещей и много пространства'),
    adds: T('მინიმუმი ავეჯი, ცარიელი ზედაპირები, მონოქრომი', 'Few pieces, bare surfaces, monochrome', 'Минимум мебели, чистые поверхности, монохром'),
    thumb: '/templates/interior/minimalist.jpg', palette: ['#0E0E0F', '#C9C9C4'],
  },
  {
    tool: 'interior', id: 'japandi',
    label: T('იაპანდი', 'Japandi', 'Джапанди'),
    hint: T('იაპონური სიმშვიდე და სკანდინავიური სითბო', 'Japanese calm meets Nordic warmth', 'Японский покой и скандинавское тепло'),
    adds: T('დაბალი ავეჯი, ქაღალდის ლამპები, მიწისფერი ტონები', 'Low oak furniture, paper lamps, earthy tones', 'Низкая мебель, бумажные лампы, земляные тона'),
    thumb: '/templates/interior/japandi.jpg', palette: ['#14110E', '#B89B7A'],
  },
  {
    tool: 'interior', id: 'loft',
    label: T('ლოფტი', 'Industrial loft', 'Индустриальный лофт'),
    hint: T('აგური, ფოლადი და მაღალი ჭერი', 'Brick, steel and tall ceilings', 'Кирпич, сталь и высокие потолки'),
    adds: T('აგური, შავი ფოლადი, გაცვეთილი ტყავი', 'Exposed brick, black steel, worn leather', 'Кирпич, чёрная сталь, потёртая кожа'),
    thumb: '/templates/interior/loft.jpg', palette: ['#150E0B', '#C0663A'],
  },
  {
    tool: 'interior', id: 'classic',
    label: T('კლასიკური', 'Classic', 'Классический'),
    hint: T('სიმეტრია, ლეპნინა და მდიდარი ქსოვილები', 'Symmetry, mouldings and rich fabrics', 'Симметрия, лепнина и богатые ткани'),
    adds: T('კედლის პანელები, სიმეტრია, ბროლის ჭაღი', 'Wall panelling, symmetry, a crystal chandelier', 'Панели на стенах, симметрия, хрустальная люстра'),
    thumb: '/templates/interior/classic.jpg', palette: ['#0F1220', '#D4B572'],
  },
  {
    tool: 'interior', id: 'art-deco',
    label: T('არ დეკო', 'Art Deco', 'Ар-деко'),
    hint: T('გეომეტრია, ხავერდი და ოქროსფერი ბზინვარება', 'Geometry, velvet and golden glamour', 'Геометрия, бархат и золотой блеск'),
    adds: T('თითბრის ჩანართები, ხავერდი, გეომეტრიული ორნამენტი', 'Brass inlay, velvet, bold geometric patterns', 'Латунь, бархат, смелая геометрия'),
    thumb: '/templates/interior/art-deco.jpg', palette: ['#071A18', '#D1A94B'],
  },
  {
    tool: 'interior', id: 'boho',
    label: T('ბოჰო', 'Boho', 'Бохо'),
    hint: T('ფენებად ხალიჩები, მცენარეები და ვინტაჟი', 'Layered rugs, plants and vintage finds', 'Слои ковров, растения и винтаж'),
    adds: T('ხალიჩები, რატანი, მაკრამე, ბევრი მცენარე', 'Layered rugs, rattan, macramé, many plants', 'Ковры, ротанг, макраме, много растений'),
    thumb: '/templates/interior/boho.jpg', palette: ['#1A0F08', '#D98A4E'],
  },
  {
    tool: 'interior', id: 'mediterranean',
    label: T('ხმელთაშუაზღვისპირული', 'Mediterranean', 'Средиземноморский'),
    hint: T('მზით სავსე ვილა, თეთრი და ტერაკოტა', 'A sunlit villa in white and terracotta', 'Солнечная вилла в белом и терракоте'),
    adds: T('შეთეთრებული კედლები, ტერაკოტა, თაღები', 'Whitewashed walls, terracotta, arches', 'Побелённые стены, терракота, арки'),
    thumb: '/templates/interior/mediterranean.jpg', palette: ['#0A1620', '#E0A06A'],
  },
  {
    tool: 'interior', id: 'georgian-traditional',
    label: T('ქართული ტრადიციული', 'Georgian traditional', 'Грузинский традиционный'),
    hint: T('ხის კვეთა, ფარდაგები და სტუმართმოყვარე სითბო', 'Carved wood, kilims and hospitable warmth', 'Резное дерево, килимы и гостеприимное тепло'),
    adds: T('ხის კვეთა, ფარდაგები, თიხის ნაკეთობები', 'Carved timber, kilim textiles, clay ceramics', 'Резное дерево, килимы, глиняная керамика'),
    thumb: '/templates/interior/georgian-traditional.jpg', palette: ['#180C0A', '#B5422F'],
  },
  {
    tool: 'interior', id: 'mid-century',
    label: T('მიდ-სენჩური', 'Mid-century modern', 'Мид-сенчури'),
    hint: T('1950–60-იანების მოდერნი, კაკალი და ფერი', '1950s–60s modern in walnut and colour', 'Модерн 50–60-х: орех и цвет'),
    adds: T('კაკლის ავეჯი, წვრილი ფეხები, ფერადი აქცენტები', 'Walnut furniture, tapered legs, colour accents', 'Мебель из ореха, конусные ножки, цветные акценты'),
    thumb: '/templates/interior/mid-century.jpg', palette: ['#14100A', '#E0A12E'],
  },
  {
    tool: 'interior', id: 'luxury',
    label: T('ლუქსი', 'Luxury', 'Люкс'),
    hint: T('მარმარილო, თითბერი და ხავერდი', 'Marble, brass and velvet', 'Мрамор, латунь и бархат'),
    adds: T('მარმარილო, ოქროსფერი დეტალები, ხავერდი, ჭაღი', 'Marble, gold details, plush velvet, a chandelier', 'Мрамор, золотые детали, бархат, люстра'),
    thumb: '/templates/interior/luxury.jpg', palette: ['#0B0B10', '#C7A15A'],
  },
];

export interface RoomOption { id: RoomId; label: L10n }

/** The room-type chips, in the order they appear. `auto` first: with a photo the room is already on screen. */
export const ROOM_TYPES: readonly RoomOption[] = [
  { id: 'auto', label: T('ავტომატურად', 'Auto', 'Авто') },
  { id: 'living-room', label: T('მისაღები', 'Living room', 'Гостиная') },
  { id: 'bedroom', label: T('საძინებელი', 'Bedroom', 'Спальня') },
  { id: 'kitchen', label: T('სამზარეულო', 'Kitchen', 'Кухня') },
  { id: 'bathroom', label: T('სააბაზანო', 'Bathroom', 'Ванная') },
  { id: 'dining-room', label: T('სასადილო', 'Dining room', 'Столовая') },
  { id: 'home-office', label: T('კაბინეტი', 'Home office', 'Кабинет') },
  { id: 'kids-room', label: T('საბავშვო', 'Kids room', 'Детская') },
  { id: 'hallway', label: T('ჰოლი', 'Hallway', 'Прихожая') },
  { id: 'balcony', label: T('აივანი', 'Balcony', 'Балкон') },
];

/** What the panel holds before the user touches anything. Nothing is picked: a request names a style only once chosen. */
export const INTERIOR_PANEL_DEFAULTS = { room: 'auto', template: null, quality: 'high', count: 1, aspect: 'auto' } as const;

const ADDS_PREFIX: L10n = T('ამატებს', 'Adds', 'Добавляет');

/** The card's one-line disclosure — „Adds: Pale oak, white walls, soft linen". */
export function interiorAddsLine(t: InteriorTemplate, lang: TemplateLang): string {
  return `${ADDS_PREFIX[lang]}: ${t.adds[lang].trim()}`;
}

export const interiorTemplate = (id: string | null | undefined): InteriorTemplate | null =>
  (id && TEMPLATE_ID_RX.test(id) ? INTERIOR_TEMPLATES.find((t) => t.id === id) : undefined) ?? null;

export const roomOption = (id: string | null | undefined): RoomOption | null =>
  ROOM_TYPES.find((r) => r.id === id) ?? null;
