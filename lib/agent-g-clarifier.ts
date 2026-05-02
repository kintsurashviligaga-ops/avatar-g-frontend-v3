import type { ServiceId } from '@/lib/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuestionType = 'chips' | 'multi';

export interface LocalizedLabel {
  ka: string;
  en: string;
  ru?: string;
}

export interface ChipOption {
  value: string;
  label: LocalizedLabel | string;
  icon?: string;
  credits?: number;
  time?: number;
}

export interface ClarificationQuestion {
  id: string;
  text: LocalizedLabel;
  type: QuestionType;
  options: ChipOption[];
}

export interface ClarificationFlow {
  questions: ClarificationQuestion[];
  creditFormula: (answers: Record<string, string | string[]>) => number;
  timeFormula: (answers: Record<string, string | string[]>) => number;
  buildPrompt: (userInput: string, answers: Record<string, string | string[]>) => string;
}

function s(v: string): string { return v; }

// ─── All 8 Clarification Flows ────────────────────────────────────────────────

export const CLARIFICATION_PROMPTS: Record<ServiceId, ClarificationFlow> = {

  // ── AVATAR ────────────────────────────────────────────────────────────────
  avatar: {
    questions: [
      {
        id: 'style',
        text: { ka: 'რა სტილი გინდა?', en: 'What style?', ru: 'Какой стиль?' },
        type: 'chips',
        options: [
          { value: 'realistic',    label: { ka: 'რეალისტური',    en: 'Realistic',    ru: 'Реалистичный'    }, icon: '📷' },
          { value: 'anime',        label: { ka: 'ანიმე',          en: 'Anime',         ru: 'Аниме'           }, icon: '✨' },
          { value: '3d',           label: { ka: '3D',              en: '3D Render',     ru: '3D рендер'       }, icon: '🎲' },
          { value: 'illustration', label: { ka: 'ილუსტრაცია',    en: 'Illustration',  ru: 'Иллюстрация'     }, icon: '🎨' },
          { value: 'pixel',        label: { ka: 'პიქსელ არტი',   en: 'Pixel Art',     ru: 'Пиксель арт'     }, icon: '👾' },
        ],
      },
      {
        id: 'mood',
        text: { ka: 'განწყობა?', en: 'Mood?', ru: 'Настроение?' },
        type: 'chips',
        options: [
          { value: 'professional', label: { ka: 'პროფესიონალი',   en: 'Professional',  ru: 'Профессиональный' }, icon: '💼' },
          { value: 'creative',     label: { ka: 'შემოქმედებითი', en: 'Creative',       ru: 'Творческий'       }, icon: '🎭' },
          { value: 'mysterious',   label: { ka: 'იდუმალი',        en: 'Mysterious',    ru: 'Таинственный'     }, icon: '🌙' },
          { value: 'friendly',     label: { ka: 'მეგობრული',      en: 'Friendly',      ru: 'Дружелюбный'      }, icon: '😊' },
        ],
      },
      {
        id: 'gender',
        text: { ka: 'პერსონაჟის სქესი?', en: 'Character gender?', ru: 'Пол персонажа?' },
        type: 'chips',
        options: [
          { value: 'male',    label: { ka: 'მამრობითი',  en: 'Male',    ru: 'Мужской'   } },
          { value: 'female',  label: { ka: 'მდედრობითი', en: 'Female',  ru: 'Женский'   } },
          { value: 'neutral', label: { ka: 'ნეიტრალური', en: 'Neutral', ru: 'Нейтральный' } },
        ],
      },
      {
        id: 'use_case',
        text: { ka: 'სად გამოიყენება?', en: 'Where will you use it?', ru: 'Где будете использовать?' },
        type: 'chips',
        options: [
          { value: 'social',   label: { ka: 'სოციალური მედია', en: 'Social Media', ru: 'Соцсети'   }, icon: '📱' },
          { value: 'game',     label: { ka: 'თამაში',           en: 'Game',          ru: 'Игра'      }, icon: '🎮' },
          { value: 'brand',    label: { ka: 'ბრენდი',           en: 'Brand',         ru: 'Бренд'     }, icon: '🏢' },
          { value: 'personal', label: { ka: 'პირადი',           en: 'Personal',      ru: 'Личное'    }, icon: '👤' },
        ],
      },
    ],
    creditFormula: (a) => s(a.style as string) === 'realistic' ? 20 : 15,
    timeFormula: () => 25,
    buildPrompt: (input, a) =>
      `Create a ${a.style} ${a.gender} avatar/persona with ${a.mood} mood for ${a.use_case}. User description: ${input}. High quality, detailed, professional character design.`,
  },

  // ── VIDEO ─────────────────────────────────────────────────────────────────
  video: {
    questions: [
      {
        id: 'type',
        text: { ka: 'ვიდეოს ტიპი?', en: 'Video type?', ru: 'Тип видео?' },
        type: 'chips',
        options: [
          { value: 'cinematic',   label: { ka: 'კინემატოგრაფიული', en: 'Cinematic',   ru: 'Кинематографичный' }, icon: '🎬' },
          { value: 'animated',    label: { ka: 'ანიმაციური',        en: 'Animated',    ru: 'Анимированный'     }, icon: '✨' },
          { value: 'documentary', label: { ka: 'დოკუმენტური',      en: 'Documentary', ru: 'Документальный'    }, icon: '📹' },
          { value: 'abstract',    label: { ka: 'აბსტრაქტული',      en: 'Abstract',    ru: 'Абстрактный'       }, icon: '🌀' },
        ],
      },
      {
        id: 'duration',
        text: { ka: 'ხანგრძლივობა?', en: 'Duration?', ru: 'Длительность?' },
        type: 'chips',
        options: [
          { value: '5',  label: { ka: '5 წამი',  en: '5 seconds',  ru: '5 секунд'  }, credits: 10 },
          { value: '10', label: { ka: '10 წამი', en: '10 seconds', ru: '10 секунд' }, credits: 20 },
          { value: '15', label: { ka: '15 წამი', en: '15 seconds', ru: '15 секунд' }, credits: 30 },
        ],
      },
      {
        id: 'aspect',
        text: { ka: 'ფორმატი?', en: 'Format?', ru: 'Формат?' },
        type: 'chips',
        options: [
          { value: '16:9', label: { ka: 'Landscape (16:9)', en: 'Landscape (16:9)', ru: 'Горизонтальный' }, icon: '📺' },
          { value: '9:16', label: { ka: 'Vertical (9:16)',  en: 'Vertical (9:16)',  ru: 'Вертикальный'   }, icon: '📱' },
          { value: '1:1',  label: { ka: 'Square (1:1)',     en: 'Square (1:1)',     ru: 'Квадрат'         }, icon: '⬜' },
        ],
      },
      {
        id: 'motion',
        text: { ka: 'მოძრაობის სიჩქარე?', en: 'Motion speed?', ru: 'Скорость движения?' },
        type: 'chips',
        options: [
          { value: 'slow',    label: { ka: 'ნელი',       en: 'Slow & Smooth',   ru: 'Медленный'    } },
          { value: 'dynamic', label: { ka: 'დინამიური',  en: 'Dynamic',         ru: 'Динамичный'   } },
          { value: 'static',  label: { ka: 'სტატიური',   en: 'Mostly Static',   ru: 'Статичный'    } },
        ],
      },
    ],
    creditFormula: (a) => parseInt(String(a.duration ?? '5')) * 2,
    timeFormula: (a) => parseInt(String(a.duration ?? '5')) * 8,
    buildPrompt: (input, a) =>
      `${a.type} video, ${a.duration}s, ${a.aspect} format, ${a.motion} motion. Scene: ${input}`,
  },

  // ── IMAGE ─────────────────────────────────────────────────────────────────
  image: {
    questions: [
      {
        id: 'style',
        text: { ka: 'ვიზუალური სტილი?', en: 'Visual style?', ru: 'Визуальный стиль?' },
        type: 'chips',
        options: [
          { value: 'photorealistic', label: { ka: 'ფოტო-რეალისტური', en: 'Photorealistic', ru: 'Фотореалистичный' }, icon: '📷' },
          { value: 'artistic',       label: { ka: 'მხატვრული',       en: 'Artistic',       ru: 'Художественный'   }, icon: '🎨' },
          { value: 'anime',          label: { ka: 'ანიმე',            en: 'Anime',           ru: 'Аниме'            }, icon: '✨' },
          { value: '3d',             label: { ka: '3D Render',        en: '3D Render',       ru: '3D рендер'        }, icon: '🎲' },
          { value: 'flat',           label: { ka: 'ფლატ დიზაინი',   en: 'Flat Design',     ru: 'Флет дизайн'      }, icon: '⬜' },
          { value: 'dark',           label: { ka: 'ბნელი',           en: 'Dark/Gothic',     ru: 'Тёмный/Готика'    }, icon: '🌑' },
        ],
      },
      {
        id: 'aspect',
        text: { ka: 'ზომა/პროპორცია?', en: 'Size/Ratio?', ru: 'Размер/Соотношение?' },
        type: 'chips',
        options: [
          { value: '1:1',  label: { ka: 'Square 1:1', en: 'Square 1:1', ru: 'Квадрат 1:1' }, icon: '⬜' },
          { value: '16:9', label: { ka: 'Wide 16:9',  en: 'Wide 16:9',  ru: 'Широкий 16:9'  }, icon: '📺' },
          { value: '9:16', label: { ka: 'Vertical 9:16', en: 'Vertical 9:16', ru: 'Вертикальный 9:16' }, icon: '📱' },
          { value: '4:3',  label: { ka: 'Classic 4:3', en: 'Classic 4:3', ru: 'Классический 4:3' }, icon: '🖼' },
        ],
      },
      {
        id: 'quality',
        text: { ka: 'ხარისხი?', en: 'Quality?', ru: 'Качество?' },
        type: 'chips',
        options: [
          { value: 'draft',    label: { ka: 'სწრაფი (draft)', en: 'Quick Draft', ru: 'Быстрый' }, credits: 2,  time: 8  },
          { value: 'standard', label: { ka: 'სტანდარტული',   en: 'Standard',    ru: 'Стандарт' }, credits: 5,  time: 20 },
          { value: 'premium',  label: { ka: 'პრემიუმი',      en: 'Premium',     ru: 'Премиум'  }, credits: 10, time: 40 },
        ],
      },
      {
        id: 'lighting',
        text: { ka: 'განათება?', en: 'Lighting?', ru: 'Освещение?' },
        type: 'chips',
        options: [
          { value: 'natural',  label: { ka: 'ბუნებრივი', en: 'Natural',       ru: 'Естественный' } },
          { value: 'studio',   label: { ka: 'სტუდიური',  en: 'Studio',        ru: 'Студийный'    } },
          { value: 'dramatic', label: { ka: 'დრამატული', en: 'Dramatic',      ru: 'Драматичный'  } },
          { value: 'neon',     label: { ka: 'Neon/Cyberpunk', en: 'Neon/Cyberpunk', ru: 'Неон/Киберпанк' } },
        ],
      },
    ],
    creditFormula: (a) => a.quality === 'draft' ? 2 : a.quality === 'premium' ? 10 : 5,
    timeFormula: (a) => a.quality === 'draft' ? 8 : a.quality === 'premium' ? 40 : 20,
    buildPrompt: (input, a) =>
      `${a.style} style image, ${a.aspect} ratio, ${a.lighting} lighting, ${a.quality} quality. Subject: ${input}. Highly detailed, professional composition.`,
  },

  // ── MUSIC ─────────────────────────────────────────────────────────────────
  music: {
    questions: [
      {
        id: 'genre',
        text: { ka: 'ჟანრი?', en: 'Genre?', ru: 'Жанр?' },
        type: 'chips',
        options: [
          { value: 'ambient',       label: { ka: 'Ambient',         en: 'Ambient',       ru: 'Эмбиент'       }, icon: '🌌' },
          { value: 'electronic',    label: { ka: 'Electronic',      en: 'Electronic',    ru: 'Электронный'   }, icon: '⚡' },
          { value: 'orchestral',    label: { ka: 'Orchestral',      en: 'Orchestral',    ru: 'Оркестровый'   }, icon: '🎻' },
          { value: 'cinematic',     label: { ka: 'Cinematic',       en: 'Cinematic',     ru: 'Кинематографич.' }, icon: '🎬' },
          { value: 'lofi',          label: { ka: 'Lo-Fi',           en: 'Lo-Fi',         ru: 'Ло-фай'        }, icon: '☕' },
          { value: 'georgian_folk', label: { ka: 'ქართული',        en: 'Georgian Folk', ru: 'Грузинский'    }, icon: '🇬🇪' },
        ],
      },
      {
        id: 'mood',
        text: { ka: 'განწყობა?', en: 'Mood?', ru: 'Настроение?' },
        type: 'chips',
        options: [
          { value: 'epic',        label: { ka: 'ეპიკური',       en: 'Epic',        ru: 'Эпический'    } },
          { value: 'calm',        label: { ka: 'მშვიდი',        en: 'Calm',        ru: 'Спокойный'    } },
          { value: 'mysterious',  label: { ka: 'იდუმალი',      en: 'Mysterious',  ru: 'Таинственный' } },
          { value: 'energetic',   label: { ka: 'ენერგიული',    en: 'Energetic',   ru: 'Энергичный'   } },
          { value: 'melancholic', label: { ka: 'მელანქოლიური', en: 'Melancholic', ru: 'Меланхоличный'} },
        ],
      },
      {
        id: 'duration',
        text: { ka: 'ხანგრძლივობა?', en: 'Duration?', ru: 'Длительность?' },
        type: 'chips',
        options: [
          { value: '15',  label: { ka: '15 წმ',   en: '15s',   ru: '15с'  }, credits: 5  },
          { value: '22',  label: { ka: '22 წმ',   en: '22s',   ru: '22с'  }, credits: 10 },
        ],
      },
      {
        id: 'use_case',
        text: { ka: 'სად გამოიყენება?', en: 'Use case?', ru: 'Назначение?' },
        type: 'chips',
        options: [
          { value: 'video',        label: { ka: 'ვიდეო ბექგრაუნდი', en: 'Video Background', ru: 'Фон для видео'  } },
          { value: 'game',         label: { ka: 'თამაშისთვის',       en: 'Game OST',         ru: 'Саундтрек игры' } },
          { value: 'meditation',   label: { ka: 'მედიტაცია',         en: 'Meditation',       ru: 'Медитация'      } },
          { value: 'presentation', label: { ka: 'პრეზენტაცია',      en: 'Presentation',     ru: 'Презентация'    } },
        ],
      },
    ],
    creditFormula: (a) => Math.round(parseInt(String(a.duration ?? '22')) / 3),
    timeFormula: (a) => parseInt(String(a.duration ?? '22')) + 15,
    buildPrompt: (input, a) =>
      `${a.genre} ${a.mood} music, ${a.duration} seconds, for ${a.use_case}. Style notes: ${input}`,
  },

  // ── GAME ──────────────────────────────────────────────────────────────────
  game: {
    questions: [
      {
        id: 'genre',
        text: { ka: 'თამაშის ჟანრი?', en: 'Game genre?', ru: 'Жанр игры?' },
        type: 'chips',
        options: [
          { value: 'rpg',       label: { ka: 'RPG',       en: 'RPG',       ru: 'РПГ'       }, icon: '⚔️' },
          { value: 'platformer',label: { ka: 'Platformer', en: 'Platformer', ru: 'Платформер'}, icon: '🏃' },
          { value: 'puzzle',    label: { ka: 'Puzzle',    en: 'Puzzle',    ru: 'Головоломка'}, icon: '🧩' },
          { value: 'strategy',  label: { ka: 'Strategy',  en: 'Strategy',  ru: 'Стратегия' }, icon: '♟️' },
          { value: 'action',    label: { ka: 'Action',    en: 'Action',    ru: 'Экшн'      }, icon: '💥' },
          { value: 'adventure', label: { ka: 'Adventure', en: 'Adventure', ru: 'Приключение'}, icon: '🗺️' },
        ],
      },
      {
        id: 'output_type',
        text: { ka: 'რა გჭირდება?', en: 'What do you need?', ru: 'Что нужно?' },
        type: 'chips',
        options: [
          { value: 'concept',       label: { ka: 'კონცეფცია',        en: 'Game Concept',  ru: 'Концепция'   } },
          { value: 'mechanics_doc', label: { ka: 'მექანიკა',         en: 'Mechanics Doc', ru: 'Механика'    } },
          { value: 'level_design',  label: { ka: 'ლეველის დიზაინი', en: 'Level Design',  ru: 'Дизайн уровня'} },
          { value: 'gdd',           label: { ka: 'სრული GDD',       en: 'Full GDD',      ru: 'Полный GDD'  } },
        ],
      },
      {
        id: 'platform',
        text: { ka: 'პლატფორმა?', en: 'Platform?', ru: 'Платформа?' },
        type: 'chips',
        options: [
          { value: 'mobile',  label: { ka: 'Mobile',      en: 'Mobile',      ru: 'Мобильная' }, icon: '📱' },
          { value: 'pc',      label: { ka: 'PC',          en: 'PC',          ru: 'ПК'         }, icon: '💻' },
          { value: 'web',     label: { ka: 'Web Browser', en: 'Web Browser', ru: 'Браузер'   }, icon: '🌐' },
          { value: 'console', label: { ka: 'Console',     en: 'Console',     ru: 'Консоль'   }, icon: '🎮' },
        ],
      },
      {
        id: 'complexity',
        text: { ka: 'სკოპი?', en: 'Scope?', ru: 'Масштаб?' },
        type: 'chips',
        options: [
          { value: 'indie',       label: { ka: 'ინდი (1-3 თვე)',     en: 'Indie (1-3 months)',  ru: 'Инди (1-3 мес.)'   } },
          { value: 'mid',         label: { ka: 'საშუალო (6+ თვე)',   en: 'Mid (6+ months)',     ru: 'Средний (6+ мес.)' } },
          { value: 'aaa_concept', label: { ka: 'AAA კონცეფცია',      en: 'AAA Concept',         ru: 'AAA концепция'     } },
        ],
      },
    ],
    creditFormula: (a) => a.output_type === 'gdd' ? 15 : 8,
    timeFormula: (a) => a.output_type === 'gdd' ? 20 : 8,
    buildPrompt: (input, a) =>
      `Create a detailed ${a.output_type} for a ${a.genre} game on ${a.platform}. Scope: ${a.complexity}. Concept: ${input}. Include specific mechanics, systems, and implementation details.`,
  },

  // ── INTERIOR ──────────────────────────────────────────────────────────────
  interior: {
    questions: [
      {
        id: 'room_type',
        text: { ka: 'ოთახის ტიპი?', en: 'Room type?', ru: 'Тип комнаты?' },
        type: 'chips',
        options: [
          { value: 'living',     label: { ka: 'სასტუმრო ოთახი', en: 'Living Room',  ru: 'Гостиная'   }, icon: '🛋️' },
          { value: 'bedroom',    label: { ka: 'საძინებელი',      en: 'Bedroom',      ru: 'Спальня'    }, icon: '🛏️' },
          { value: 'kitchen',    label: { ka: 'სამზარეულო',     en: 'Kitchen',      ru: 'Кухня'      }, icon: '🍳' },
          { value: 'office',     label: { ka: 'ოფისი',           en: 'Office',       ru: 'Офис'       }, icon: '💼' },
          { value: 'studio',     label: { ka: 'სტუდია',          en: 'Studio',       ru: 'Студия'     }, icon: '🎨' },
          { value: 'commercial', label: { ka: 'კომერციული',     en: 'Commercial',   ru: 'Коммерческий'}, icon: '🏢' },
        ],
      },
      {
        id: 'style',
        text: { ka: 'სტილი?', en: 'Design style?', ru: 'Стиль дизайна?' },
        type: 'chips',
        options: [
          { value: 'minimalist',          label: { ka: 'მინიმალისტი',          en: 'Minimalist',           ru: 'Минимализм'     } },
          { value: 'georgian_traditional',label: { ka: 'ქართული ტრადიციული',  en: 'Georgian Traditional', ru: 'Грузинский'     } },
          { value: 'modern',              label: { ka: 'თანამედროვე',          en: 'Modern',               ru: 'Современный'    } },
          { value: 'industrial',          label: { ka: 'Industrial',            en: 'Industrial',           ru: 'Индустриальный' } },
          { value: 'cozy',                label: { ka: 'კოზი',                  en: 'Cozy',                 ru: 'Уютный'         } },
          { value: 'luxury',              label: { ka: 'ლუქსი',                en: 'Luxury',               ru: 'Люкс'           } },
        ],
      },
      {
        id: 'color_palette',
        text: { ka: 'ფერების პალიტრა?', en: 'Color palette?', ru: 'Цветовая палитра?' },
        type: 'chips',
        options: [
          { value: 'warm',       label: { ka: 'თბილი',       en: 'Warm Tones',  ru: 'Тёплые'      } },
          { value: 'cool',       label: { ka: 'ცივი',        en: 'Cool Tones',  ru: 'Холодные'    } },
          { value: 'neutral',    label: { ka: 'ნეიტრალური',  en: 'Neutral',     ru: 'Нейтральные' } },
          { value: 'vibrant',    label: { ka: 'მდიდარი',     en: 'Vibrant',     ru: 'Яркие'       } },
          { value: 'monochrome', label: { ka: 'მონოქრომი',   en: 'Monochrome',  ru: 'Монохром'    } },
        ],
      },
      {
        id: 'size',
        text: { ka: 'სივრცის ზომა?', en: 'Space size?', ru: 'Размер помещения?' },
        type: 'chips',
        options: [
          { value: 'small',  label: { ka: 'მცირე (<30 მ²)',      en: 'Small (<30m²)',     ru: 'Маленький (<30м²)'  } },
          { value: 'medium', label: { ka: 'საშუალო (30-60 მ²)', en: 'Medium (30-60m²)',  ru: 'Средний (30-60м²)'  } },
          { value: 'large',  label: { ka: 'დიდი (60+ მ²)',       en: 'Large (60+m²)',     ru: 'Большой (60+м²)'    } },
        ],
      },
    ],
    creditFormula: () => 7,
    timeFormula: () => 20,
    buildPrompt: (input, a) =>
      `Interior design visualization: ${a.style} style ${a.room_type}, ${a.size} space, ${a.color_palette} color palette. Requirements: ${input}. Show realistic 3D render with furniture placement and lighting.`,
  },

  // ── PROMPT-BUILDER ────────────────────────────────────────────────────────
  'prompt-builder': {
    questions: [
      {
        id: 'target_ai',
        text: { ka: 'რომელი AI-სთვის?', en: 'Which AI?', ru: 'Для какого AI?' },
        type: 'chips',
        options: [
          { value: 'midjourney',       label: { ka: 'Midjourney',       en: 'Midjourney',       ru: 'Midjourney'       }, icon: '🎨' },
          { value: 'stable_diffusion', label: { ka: 'Stable Diffusion', en: 'Stable Diffusion', ru: 'Stable Diffusion' }, icon: '🌊' },
          { value: 'dalle',            label: { ka: 'DALL-E',           en: 'DALL-E',            ru: 'DALL-E'           }, icon: '🤖' },
          { value: 'sora',             label: { ka: 'Sora (Video)',     en: 'Sora (Video)',     ru: 'Sora (Видео)'    }, icon: '🎬' },
          { value: 'claude',           label: { ka: 'Claude',           en: 'Claude',            ru: 'Claude'           }, icon: '◆'  },
          { value: 'gpt',              label: { ka: 'GPT-4',            en: 'GPT-4',             ru: 'GPT-4'            }, icon: '💬' },
          { value: 'flux',             label: { ka: 'FLUX',             en: 'FLUX',              ru: 'FLUX'             }, icon: '⚡' },
        ],
      },
      {
        id: 'detail_level',
        text: { ka: 'დეტალიზაცია?', en: 'Detail level?', ru: 'Уровень детализации?' },
        type: 'chips',
        options: [
          { value: 'minimal',   label: { ka: 'მინიმალური', en: 'Minimal',          ru: 'Минимальный'  } },
          { value: 'detailed',  label: { ka: 'დეტალური',   en: 'Detailed',         ru: 'Детальный'    } },
          { value: 'technical', label: { ka: 'ტექნიკური',  en: 'Technical/Expert', ru: 'Технический'  } },
        ],
      },
      {
        id: 'language',
        text: { ka: 'Prompt-ის ენა?', en: 'Prompt language?', ru: 'Язык промпта?' },
        type: 'chips',
        options: [
          { value: 'en', label: { ka: 'English (recommended)', en: 'English (recommended)', ru: 'Английский (рекомендуется)' }, icon: '🇺🇸' },
          { value: 'ka', label: { ka: 'Georgian / ქართული',  en: 'Georgian',              ru: 'Грузинский'                  }, icon: '🇬🇪' },
        ],
      },
      {
        id: 'purpose',
        text: { ka: 'მიზანი?', en: 'Purpose?', ru: 'Цель?' },
        type: 'chips',
        options: [
          { value: 'image_gen',    label: { ka: 'სურათის გენერაცია', en: 'Image Generation', ru: 'Генерация изображений' } },
          { value: 'video_gen',    label: { ka: 'ვიდეოს გენერაცია', en: 'Video Generation', ru: 'Генерация видео'       } },
          { value: 'chat_system',  label: { ka: 'AI ჩატ სისტემა',   en: 'Chat System',       ru: 'Чат система'          } },
          { value: 'code_gen',     label: { ka: 'კოდის გენერაცია',  en: 'Code Generation',  ru: 'Генерация кода'       } },
        ],
      },
    ],
    creditFormula: () => 2,
    timeFormula: () => 5,
    buildPrompt: (input, a) =>
      `Build an optimized ${a.detail_level} prompt for ${a.target_ai} in ${a.language === 'en' ? 'English' : 'Georgian'} for ${a.purpose}. User's idea: ${input}. Apply best practices for ${a.target_ai} prompt engineering. Return ONLY the final prompt, no explanations.`,
  },

  // ── TERMINAL ──────────────────────────────────────────────────────────────
  terminal: {
    questions: [
      {
        id: 'language',
        text: { ka: 'პროგრამირების ენა?', en: 'Programming language?', ru: 'Язык программирования?' },
        type: 'chips',
        options: [
          { value: 'python',     label: { ka: 'Python',     en: 'Python',     ru: 'Python'     }, icon: '🐍' },
          { value: 'javascript', label: { ka: 'JavaScript', en: 'JavaScript', ru: 'JavaScript' }, icon: '🟨' },
          { value: 'typescript', label: { ka: 'TypeScript', en: 'TypeScript', ru: 'TypeScript' }, icon: '🔷' },
          { value: 'bash',       label: { ka: 'Bash/Shell', en: 'Bash/Shell', ru: 'Bash/Shell' }, icon: '🖥' },
          { value: 'go',         label: { ka: 'Go',         en: 'Go',         ru: 'Go'         }, icon: '🐹' },
          { value: 'sql',        label: { ka: 'SQL',        en: 'SQL',        ru: 'SQL'        }, icon: '🗄️' },
          { value: 'rust',       label: { ka: 'Rust',       en: 'Rust',       ru: 'Rust'       }, icon: '⚙️' },
        ],
      },
      {
        id: 'type',
        text: { ka: 'კოდის ტიპი?', en: 'Code type?', ru: 'Тип кода?' },
        type: 'chips',
        options: [
          { value: 'function',   label: { ka: 'ფუნქცია',           en: 'Function/Module',     ru: 'Функция/Модуль' } },
          { value: 'script',     label: { ka: 'სკრიპტი',           en: 'Automation Script',   ru: 'Скрипт'         } },
          { value: 'cli_tool',   label: { ka: 'CLI Tool',          en: 'CLI Tool',            ru: 'CLI инструмент' } },
          { value: 'api_client', label: { ka: 'API Client',        en: 'API Client',          ru: 'API клиент'     } },
          { value: 'full_app',   label: { ka: 'სრული აპლიკაცია', en: 'Full App',            ru: 'Полное приложение'} },
        ],
      },
      {
        id: 'extras',
        text: { ka: 'დამატებები?', en: 'Include?', ru: 'Включить?' },
        type: 'multi',
        options: [
          { value: 'comments',       label: { ka: 'კომენტარები',      en: 'Inline Comments', ru: 'Комментарии'   } },
          { value: 'tests',          label: { ka: 'ტესტები',           en: 'Unit Tests',      ru: 'Тесты'         } },
          { value: 'readme',         label: { ka: 'README',            en: 'README',          ru: 'README'        } },
          { value: 'error_handling', label: { ka: 'ერორ ჰენდლინგი', en: 'Error Handling',  ru: 'Обработка ошибок'} },
        ],
      },
      {
        id: 'complexity',
        text: { ka: 'სირთულე?', en: 'Complexity?', ru: 'Сложность?' },
        type: 'chips',
        options: [
          { value: 'simple',       label: { ka: 'მარტივი',       en: 'Simple',          ru: 'Простой'       } },
          { value: 'intermediate', label: { ka: 'საშუალო',       en: 'Intermediate',    ru: 'Средний'       } },
          { value: 'advanced',     label: { ka: 'რთული',         en: 'Advanced',        ru: 'Сложный'       } },
        ],
      },
    ],
    creditFormula: (a) => a.type === 'full_app' ? 10 : 3,
    timeFormula: (a) => a.type === 'full_app' ? 20 : 5,
    buildPrompt: (input, a) => {
      const extras = Array.isArray(a.extras) ? (a.extras as string[]).join(', ') : String(a.extras ?? '');
      return `Write ${a.type} in ${a.language}. Complexity: ${a.complexity}. Requirements: ${input}. Include: ${extras || 'error handling'}. Production-ready code, clean architecture, best practices.`;
    },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getFlow(serviceId: ServiceId): ClarificationFlow {
  return CLARIFICATION_PROMPTS[serviceId];
}

export function localizeLabel(label: LocalizedLabel | string, locale: string): string {
  if (typeof label === 'string') return label;
  if (locale === 'ru' && label.ru) return label.ru;
  if (locale === 'en') return label.en;
  return label.ka;
}

export function getCreditCost(serviceId: ServiceId, answers: Record<string, string | string[]>): number {
  return CLARIFICATION_PROMPTS[serviceId].creditFormula(answers);
}

export function getEstimatedSeconds(serviceId: ServiceId, answers: Record<string, string | string[]>): number {
  return CLARIFICATION_PROMPTS[serviceId].timeFormula(answers);
}

export function buildFinalPrompt(serviceId: ServiceId, userInput: string, answers: Record<string, string | string[]>): string {
  return CLARIFICATION_PROMPTS[serviceId].buildPrompt(userInput, answers);
}
