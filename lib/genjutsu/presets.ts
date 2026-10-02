/**
 * lib/genjutsu/presets.ts — the VFX presets: ONE tap picks a ready effect, and Generate works with NO prompt typed.
 *
 * ⚠️ A PRESET IS THE PROMPT. The user never has to write one: `scene` is the English description the model is told
 * (these models read English — a Georgian brief arrives as noise, so the fragments here are English and only the
 * user's optional free-text line is translated, server-side, by lib/ai/promptToEnglish). The labels and hints are the
 * only user-visible copy, in ka / en / ru.
 *
 * Five kinds, matching what the owner asked for: motion looks (the scene built around a transferred motion), object
 * swaps (the subject becomes something else), location swaps, style swaps and VFX transformations.
 * `becomes` is the object swap's noun phrase ("a sleek chrome mecha robot…"), used when the op is `swap`, where the
 * instruction must say what is replaced and that the rest of the shot stays.
 *
 * `palette` paints the preset's tile (dark base → the effect's accent), the same placeholder convention as
 * lib/studio/templates: no thumbnail file to ship, no broken image, and a tile that already says what it is.
 *
 * Pure and client-safe.
 */
import { COMPOSED_PROMPT_MAX_CHARS, USER_PROMPT_MAX_CHARS } from './limits';
import type { GenjutsuOp, L10n, ReferenceRole } from './types';

export type PresetKind = 'motion' | 'object' | 'location' | 'style' | 'vfx';
export const PRESET_KINDS: readonly PresetKind[] = ['motion', 'object', 'location', 'style', 'vfx'];

/** The lucide icon painted faint on the tile — a KEY, mapped to the component in components/studio/genjutsu. */
export type PresetIcon =
  | 'Swords' | 'Music2' | 'CloudRain' | 'Rocket'
  | 'Bot' | 'Mountain' | 'Gem' | 'Crown'
  | 'Building2' | 'Sun' | 'Waves' | 'MountainSnow'
  | 'Smile' | 'Shapes' | 'Moon' | 'Cpu' | 'Droplets' | 'Box'
  | 'Flame' | 'Snowflake' | 'CloudFog' | 'Zap' | 'MonitorX' | 'Orbit';

export interface GenjutsuPreset {
  id: string;
  kind: PresetKind;
  icon: PresetIcon;
  label: L10n;
  /** One line: what it does. Shown on the hero card and as the tile's description. */
  hint: L10n;
  /** Dark base → the effect's accent. */
  palette: readonly [string, string];
  /** English: the look / scene the model builds. */
  scene: string;
  /** English noun phrase for an object swap. */
  becomes?: string;
}

export const KIND_LABEL: Record<PresetKind, L10n> = {
  motion: { ka: 'მოძრაობა', en: 'Motion', ru: 'Движение' },
  object: { ka: 'ობიექტი', en: 'Object', ru: 'Объект' },
  location: { ka: 'ლოკაცია', en: 'Place', ru: 'Место' },
  style: { ka: 'სტილი', en: 'Style', ru: 'Стиль' },
  vfx: { ka: 'VFX', en: 'VFX', ru: 'VFX' },
};

const P = (ka: string, en: string, ru: string): L10n => ({ ka, en, ru });

export const GENJUTSU_PRESETS: readonly GenjutsuPreset[] = [
  // ─── Motion looks — the scene built around the motion ────────────────────────────────────────────────────────
  {
    id: 'hero-cinematic', kind: 'motion', icon: 'Swords',
    label: P('კინო გმირი', 'Cinematic hero', 'Кино-герой'),
    hint: P('ეპიკური ეკრანული გმირი — ბექლაითი, მტვერი, ფართო ლინზა', 'An epic action-film hero — backlight, dust, anamorphic glow', 'Эпичный герой боевика — контровой свет, пыль, анаморфный блик'),
    palette: ['#1A1206', '#F2B544'],
    scene: 'An epic cinematic action-film moment: dramatic backlight, drifting dust and embers, shallow depth of field, anamorphic lens flare, slow heroic camera push-in, rich film grade.',
  },
  {
    id: 'neon-stage', kind: 'motion', icon: 'Music2',
    label: P('ნეონის სცენა', 'Neon stage', 'Неоновая сцена'),
    hint: P('ცეკვა ნეონის სცენაზე, ბურუსსა და ლაზერებში', 'A dance on a neon stage in haze and lasers', 'Танец на неоновой сцене в дыму и лазерах'),
    palette: ['#14061F', '#FF3DB8'],
    scene: 'A dance performance on a neon-lit stage: coloured laser beams cutting through stage haze, a pulsing LED wall, glossy floor reflections, energetic dynamic camera, saturated magenta and cyan light.',
  },
  {
    id: 'rain-street', kind: 'motion', icon: 'CloudRain',
    label: P('წვიმიანი ქუჩა', 'Rain street', 'Дождливая улица'),
    hint: P('ღამის ქალაქი, სველი ასფალტი, არეკვლები', 'A night city, wet asphalt, neon reflections', 'Ночной город, мокрый асфальт, отражения'),
    palette: ['#05121C', '#2FB5C9'],
    scene: 'A night city street in heavy rain: wet asphalt full of neon reflections, steam rising from vents, passing headlights, handheld cinematic camera, moody teal-and-orange grade.',
  },
  {
    id: 'zero-gravity', kind: 'motion', icon: 'Rocket',
    label: P('უწონადობა', 'Zero gravity', 'Невесомость'),
    hint: P('მცურავი მოძრაობა კოსმოსურ სადგურში', 'Weightless motion inside a space station', 'Плавное движение на космической станции'),
    palette: ['#060B1A', '#7C9CFF'],
    scene: 'Weightless motion inside a space station: loose objects and water droplets floating slowly in the air, soft cool light from the windows with Earth glowing outside, smooth floating camera.',
  },

  // ─── Object swaps — the subject becomes something else ───────────────────────────────────────────────────────
  {
    id: 'mecha-robot', kind: 'object', icon: 'Bot',
    label: P('მეხა რობოტი', 'Mecha robot', 'Меха-робот'),
    hint: P('ქრომის რობოტი მანათობელი სახსრებით', 'A chrome robot with glowing joints', 'Хромированный робот со светящимися суставами'),
    palette: ['#0A1018', '#5AA9FF'],
    becomes: 'a sleek chrome mecha robot with articulated armour plates and glowing blue joints',
    scene: 'The subject transformed into a sleek chrome mecha robot with articulated armour plates, glowing blue joints, reflective hard-surface metal and cinematic sci-fi lighting.',
  },
  {
    id: 'stone-golem', kind: 'object', icon: 'Mountain',
    label: P('ქვის გოლემი', 'Stone golem', 'Каменный голем'),
    hint: P('ნაკვეთი გრანიტი და მანათობელი რუნები', 'Carved granite with glowing runes', 'Резной гранит со светящимися рунами'),
    palette: ['#16100A', '#FF8A3D'],
    becomes: 'a towering stone golem carved from rough granite with glowing orange runes and moss in its cracks',
    scene: 'The subject transformed into a towering stone golem carved from rough granite, glowing orange runes, moss in the cracks, dust falling from every heavy movement, cinematic fantasy lighting.',
  },
  {
    id: 'glass-crystal', kind: 'object', icon: 'Gem',
    label: P('მინის კრისტალი', 'Glass crystal', 'Стеклянный кристалл'),
    hint: P('გამჭვირვალე სხეული, რომელიც სინათლეს არღვევს', 'A translucent body that bends the light', 'Прозрачное тело, преломляющее свет'),
    palette: ['#071418', '#6FE3E0'],
    becomes: 'a translucent glass crystal figure that bends and refracts the light',
    scene: 'The subject transformed into a translucent glass crystal body that refracts and bends the light, internal caustics, prismatic highlights and crisp reflections.',
  },
  {
    id: 'gold-statue', kind: 'object', icon: 'Crown',
    label: P('ოქროს ქანდაკება', 'Gold statue', 'Золотая статуя'),
    hint: P('გაპრიალებული თხევადი ოქრო', 'Polished liquid gold', 'Полированное жидкое золото'),
    palette: ['#1A1304', '#E8B93A'],
    becomes: 'a polished liquid-gold statue with mirror-like reflections',
    scene: 'The subject transformed into a polished liquid-gold statue with mirror-like reflections, molten highlights and slowly dripping gold under luxurious warm light.',
  },

  // ─── Location swaps — the place changes, the subject stays ───────────────────────────────────────────────────
  {
    id: 'tokyo-night', kind: 'location', icon: 'Building2',
    label: P('ტოკიოს ღამე', 'Tokyo night', 'Токио ночью'),
    hint: P('ნეონით სავსე ვიწრო ქუჩა, ორთქლი, აბრები', 'A neon alley with signs and steam', 'Неоновый переулок, вывески, пар'),
    palette: ['#12061A', '#FF4F9A'],
    scene: 'A narrow Tokyo alley at night: layers of glowing neon signs, steam from street-food stalls, light drizzle, reflective wet ground, cinematic shallow depth of field, vivid yet realistic colour.',
  },
  {
    id: 'alien-desert', kind: 'location', icon: 'Sun',
    label: P('უცხოპლანეტელი უდაბნო', 'Alien desert', 'Инопланетная пустыня'),
    hint: P('ორი მზე, წითელი დიუნები, მცურავი კლდეები', 'Twin suns, red dunes, floating rocks', 'Два солнца, красные дюны, парящие скалы'),
    palette: ['#1F0C06', '#FF7A45'],
    scene: 'An alien desert world: two suns low on the horizon, red dunes with long shadows, enormous rocks floating in the sky, dust drifting in warm light, epic widescreen sci-fi look.',
  },
  {
    id: 'underwater-city', kind: 'location', icon: 'Waves',
    label: P('წყალქვეშა ქალაქი', 'Underwater city', 'Подводный город'),
    hint: P('მანათობელი მარჯანი, სინათლის სვეტები, ბუშტები', 'Glowing coral, light shafts, bubbles', 'Светящиеся кораллы, лучи света, пузыри'),
    palette: ['#041620', '#2BC4B4'],
    scene: 'A sunken city deep underwater: glowing coral towers, shafts of light from the surface, drifting bubbles and fish, soft blue-green haze, slow floating camera, photoreal.',
  },
  {
    id: 'arctic-peak', kind: 'location', icon: 'MountainSnow',
    label: P('არქტიკული მწვერვალი', 'Arctic peak', 'Арктическая вершина'),
    hint: P('ქარბუქი მწვერვალზე მზის ამოსვლისას', 'A blizzard on a summit at sunrise', 'Метель на вершине на рассвете'),
    palette: ['#08121C', '#BFE3FF'],
    scene: 'A blizzard on an arctic mountain summit at sunrise: swirling snow, golden light breaking through the clouds, ice-crusted rocks, strong wind, dramatic wide landscape.',
  },

  // ─── Style swaps — the whole picture is redrawn ──────────────────────────────────────────────────────────────
  {
    id: 'anime', kind: 'style', icon: 'Smile',
    label: P('ანიმე', 'Anime', 'Аниме'),
    hint: P('ხელით დახატული ცელი, მკვეთრი კონტური', 'Hand-drawn cel shading, bold outlines', 'Рисованная графика, чёткие контуры'),
    palette: ['#10101F', '#FF7AAE'],
    scene: 'Hand-drawn Japanese anime: clean cel shading, bold outlines, expressive speed lines, painterly sky backgrounds, saturated colours, 24 fps animation feel.',
  },
  {
    id: 'claymation', kind: 'style', icon: 'Shapes',
    label: P('კლეიმეიშენი', 'Claymation', 'Клеймейшн'),
    hint: P('პლასტილინის სტოპ-მოუშენი თითის კვალით', 'Stop-motion clay with fingerprints', 'Пластилиновая покадровая анимация'),
    palette: ['#1C1208', '#E9955B'],
    scene: 'Stop-motion claymation: every surface hand-sculpted from clay with visible fingerprints and tool marks, slightly jittery frame-by-frame motion, warm miniature-set lighting.',
  },
  {
    id: 'film-noir', kind: 'style', icon: 'Moon',
    label: P('ფილმ-ნუარი', 'Film noir', 'Фильм-нуар'),
    hint: P('შავ-თეთრი, მკაცრი ჩრდილები, კვამლი', 'Black and white, hard shadows, smoke', 'Чёрно-белое, жёсткие тени, дым'),
    palette: ['#0B0B0B', '#C9C9C9'],
    scene: 'Classic film noir: high-contrast black and white, hard venetian-blind shadows, drifting cigarette smoke, 1940s cinematography, low-key dramatic lighting, fine film grain.',
  },
  {
    id: 'cyberpunk', kind: 'style', icon: 'Cpu',
    label: P('კიბერპანკი', 'Cyberpunk', 'Киберпанк'),
    hint: P('ნეონი წვიმაში, ჰოლოგრამები', 'Neon in the rain, holograms', 'Неон под дождём, голограммы'),
    palette: ['#0C0620', '#18F0FF'],
    scene: 'Cyberpunk look: magenta and cyan neon, rain-soaked surfaces, floating holographic signs, lens flares, dense futuristic city atmosphere, high-contrast cinematic grade.',
  },
  {
    id: 'watercolor', kind: 'style', icon: 'Droplets',
    label: P('აკვარელი', 'Watercolour', 'Акварель'),
    hint: P('დაღვრილი საღებავი ქაღალდის ტექსტურაზე', 'Flowing paint on paper texture', 'Растекающаяся краска на бумаге'),
    palette: ['#0F1418', '#8FB8E8'],
    scene: 'Animated watercolour painting: translucent washes of paint bleeding and flowing, visible paper texture, soft pigment edges, gentle hand-painted motion.',
  },
  {
    id: 'toy-3d', kind: 'style', icon: 'Box',
    label: P('3D სათამაშო', '3D toy', '3D-игрушка'),
    hint: P('პრიალა პლასტმასის კოლექციური ფიგურა', 'A glossy collectible plastic figure', 'Глянцевая коллекционная фигурка'),
    palette: ['#0D1424', '#FFC857'],
    scene: 'Glossy 3D collectible-toy style: soft rounded forms, smooth plastic with subtle reflections, bright studio lighting, charming animated-feature look.',
  },

  // ─── VFX transformations — an effect is added to the subject ─────────────────────────────────────────────────
  {
    id: 'fire', kind: 'vfx', icon: 'Flame',
    label: P('ცეცხლი', 'Fire', 'Огонь'),
    hint: P('სხეული ალში, ნაპერწკლები', 'Wreathed in flames and embers', 'В пламени и искрах'),
    palette: ['#220803', '#FF6A1A'],
    scene: 'Fire VFX: the subject wreathed in roaring flames, embers and sparks streaming upward, heat haze distorting the air, flickering orange light on the surroundings, photoreal.',
  },
  {
    id: 'ice', kind: 'vfx', icon: 'Snowflake',
    label: P('ყინული', 'Ice', 'Лёд'),
    hint: P('ყინვა ვრცელდება, კრისტალები იზრდება', 'Frost spreading, ice crystals growing', 'Расползается иней, растут кристаллы'),
    palette: ['#061622', '#8FD8FF'],
    scene: 'Ice VFX: frost spreading across the subject and surroundings, jagged ice crystals growing, cold breath mist, cold blue light, glittering particles, photoreal.',
  },
  {
    id: 'smoke', kind: 'vfx', icon: 'CloudFog',
    label: P('კვამლი', 'Smoke', 'Дым'),
    hint: P('იფანტება კვამლად და ისევ იკრიბება', 'Dissolves into smoke and reforms', 'Рассеивается дымом и собирается вновь'),
    palette: ['#0E0E10', '#9AA3B2'],
    scene: 'Smoke VFX: the subject dissolving into thick drifting smoke and reforming, soft volumetric trails following every movement, moody dramatic light, photoreal.',
  },
  {
    id: 'lightning', kind: 'vfx', icon: 'Zap',
    label: P('ელვა', 'Lightning', 'Молния'),
    hint: P('ელექტრო რკალები და ციმციმა სინათლე', 'Electric arcs and flickering light', 'Электрические дуги и мерцающий свет'),
    palette: ['#080B1E', '#B7C8FF'],
    scene: 'Lightning VFX: bright electric arcs crackling around the subject and through the air, flickering white-blue light across the scene, sparks and brief flashes, photoreal.',
  },
  {
    id: 'glitch', kind: 'vfx', icon: 'MonitorX',
    label: P('გლიჩი', 'Glitch', 'Глитч'),
    hint: P('RGB გაყოფა, პიქსელები, სკანხაზები', 'RGB split, pixel tearing, scanlines', 'RGB-сдвиг, пиксели, строчки'),
    palette: ['#0A0A0A', '#2DFF9A'],
    scene: 'Digital glitch VFX: RGB channel splitting, pixel tearing and datamosh blocks, scanlines and signal noise, the image stuttering and re-forming, neon-tinted highlights.',
  },
  {
    id: 'portal', kind: 'vfx', icon: 'Orbit',
    label: P('პორტალი', 'Portal', 'Портал'),
    hint: P('ენერგიის მორევი იხსნება და ანათებს', 'A swirling energy portal opens', 'Открывается светящийся портал энергии'),
    palette: ['#0B0620', '#9B6BFF'],
    scene: 'Portal VFX: a swirling energy portal opens with a bright rim of light and sparks, wind pulling dust and debris toward its centre, glowing light spilling onto the subject, cinematic.',
  },
];

const BY_ID: ReadonlyMap<string, GenjutsuPreset> = new Map(GENJUTSU_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: unknown): GenjutsuPreset | null {
  return typeof id === 'string' ? BY_ID.get(id) ?? null : null;
}

// ─── Composing the prompt ────────────────────────────────────────────────────────────────────────────────────────

/** What each reference role asks of a model that is given the photo as a reference — said once, in plain English. */
const ROLE_CLAUSE: Record<ReferenceRole, string> = {
  character: 'The main character is the exact person shown in the reference images, with identical face, hair and build.',
  product: 'The product from the reference images appears clearly, with identical shape, colour and branding.',
  wardrobe: 'The character wears the exact outfit shown in the reference images.',
};

/** Keeps a free-text line to one tidy paragraph of at most USER_PROMPT_MAX_CHARS (control characters out). */
export function cleanUserText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, USER_PROMPT_MAX_CHARS);
}

const noTrailingStop = (s: string): string => s.trim().replace(/[.\s]+$/, '');

function swapInstruction(p: GenjutsuPreset): string {
  switch (p.kind) {
    case 'object':
      return `Replace the main subject with ${noTrailingStop(p.becomes ?? p.scene)}. Keep the background, the lighting and the camera movement exactly as they are.`;
    case 'location':
      return `Replace only the location behind the subject with this: ${p.scene} Keep the subject, their motion and the camera movement unchanged.`;
    case 'style':
      return `Restyle the entire video: ${p.scene} Keep every motion, the composition and the timing identical.`;
    case 'vfx':
      return `Add this effect to the shot: ${p.scene} Keep everything else in the video unchanged.`;
    default:
      return `Recreate the shot like this: ${p.scene} Keep the subject's motion unchanged.`;
  }
}

/**
 * The English prompt a model receives. `userText` must ALREADY be English (the server translates it first); the
 * preset fragments are English by construction. With no preset the user's line stands alone (the route requires one
 * or the other). Always at most COMPOSED_PROMPT_MAX_CHARS, cut on a word boundary.
 */
export function composeGenjutsuPrompt(a: {
  preset: GenjutsuPreset | null;
  op: GenjutsuOp;
  userText?: string;
  /** Roles of the photos the engine will really receive — only those are described. */
  roles?: readonly ReferenceRole[];
}): string {
  const user = cleanUserText(a.userText);
  const roles = new Set(a.roles ?? []);
  const parts: string[] = [];

  if (a.op === 'swap') {
    if (a.preset) parts.push(swapInstruction(a.preset));
  } else {
    // scene (Veo) describes who is in the shot; motion (Kling) already has the character as its image, so it only needs
    // the identity reminder, not a description of the other roles.
    if (a.op === 'scene') for (const r of ['character', 'product', 'wardrobe'] as const) if (roles.has(r)) parts.push(ROLE_CLAUSE[r]);
    if (a.op === 'motion' && roles.has('character')) parts.push("Keep the character's face, hair and outfit exactly as in the reference image.");
    if (a.preset) parts.push(a.preset.scene);
  }
  if (user) parts.push(`Extra detail: ${user}`);

  const text = parts.join(' ').trim();
  if (text.length <= COMPOSED_PROMPT_MAX_CHARS) return text;
  const cut = text.slice(0, COMPOSED_PROMPT_MAX_CHARS);
  return cut.replace(/\s+\S*$/, '').trim();
}
