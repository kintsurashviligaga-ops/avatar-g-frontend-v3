import type { ServiceId } from '@/lib/registry';
import { getNanoBananaCreditCost, resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';

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

// ─── All 8 Clarification Flows ────────────────────────────────────────────────

export const CLARIFICATION_PROMPTS: Record<ServiceId, ClarificationFlow> = {

  // ── AVATAR (HeyGen Talking Avatar) ────────────────────────────────────────
  avatar: {
    questions: [
      {
        id: 'voice_gender',
        text: { ka: 'ავატარის ხმა?', en: 'Avatar voice?', ru: 'Голос аватара?' },
        type: 'chips',
        options: [
          { value: 'female', label: { ka: 'ქალის ხმა',   en: 'Female Voice', ru: 'Женский голос'  }, icon: '👩' },
          { value: 'male',   label: { ka: 'მამაკაცის ხმა', en: 'Male Voice', ru: 'Мужской голос'   }, icon: '👨' },
        ],
      },
      {
        id: 'voice_language',
        text: { ka: 'ლაპარაკის ენა?', en: 'Speaking language?', ru: 'Язык речи?' },
        type: 'chips',
        options: [
          { value: 'en', label: { ka: 'ინგლისური',  en: 'English',   ru: 'Английский' }, icon: '🇺🇸' },
          { value: 'ka', label: { ka: 'ქართული',    en: 'Georgian',  ru: 'Грузинский' }, icon: '🇬🇪' },
          { value: 'ru', label: { ka: 'რუსული',     en: 'Russian',   ru: 'Русский'    }, icon: '🇷🇺' },
          { value: 'de', label: { ka: 'გერმანული',  en: 'German',    ru: 'Немецкий'   }, icon: '🇩🇪' },
          { value: 'fr', label: { ka: 'ფრანგული',   en: 'French',    ru: 'Французский'}, icon: '🇫🇷' },
          { value: 'es', label: { ka: 'ესპანური',   en: 'Spanish',   ru: 'Испанский'  }, icon: '🇪🇸' },
        ],
      },
      {
        id: 'video_format',
        text: { ka: 'ვიდეოს ფორმატი?', en: 'Video format?', ru: 'Формат видео?' },
        type: 'chips',
        options: [
          { value: '16:9', label: { ka: 'Landscape (16:9)',  en: 'Landscape (16:9)', ru: 'Горизонтальный' }, icon: '📺' },
          { value: '9:16', label: { ka: 'Portrait (9:16)',   en: 'Portrait (9:16)',  ru: 'Вертикальный'   }, icon: '📱' },
          { value: '1:1',  label: { ka: 'Square (1:1)',      en: 'Square (1:1)',     ru: 'Квадрат'         }, icon: '⬜' },
        ],
      },
      {
        id: 'speaking_style',
        text: { ka: 'ლაპარაკის სტილი?', en: 'Speaking style?', ru: 'Стиль речи?' },
        type: 'chips',
        options: [
          { value: 'professional', label: { ka: 'პროფესიონალი',   en: 'Professional',  ru: 'Профессиональный' }, icon: '💼' },
          { value: 'friendly',     label: { ka: 'მეგობრული',      en: 'Friendly',      ru: 'Дружелюбный'      }, icon: '😊' },
          { value: 'news_anchor',  label: { ka: 'ახალი ამბები',   en: 'News Anchor',   ru: 'Диктор новостей'  }, icon: '📡' },
          { value: 'teacher',      label: { ka: 'მასწავლებელი',   en: 'Teacher',       ru: 'Учитель'           }, icon: '🎓' },
          { value: 'storyteller',  label: { ka: 'მოთხრობა',       en: 'Storyteller',   ru: 'Рассказчик'       }, icon: '📖' },
        ],
      },
    ],
    creditFormula: () => 25,
    timeFormula: () => 60,
    buildPrompt: (input, a) => {
      const styleNote = a.speaking_style === 'professional'
        ? 'Speak confidently and professionally, maintain eye contact, use clear diction.'
        : a.speaking_style === 'news_anchor'
          ? 'Speak like a TV news anchor — authoritative, measured pace, clear enunciation.'
          : a.speaking_style === 'teacher'
            ? 'Speak in an educational, warm tone. Pause for emphasis. Use simple clear language.'
            : a.speaking_style === 'storyteller'
              ? 'Speak with narrative flow, engaging tone, vary pace for effect.'
              : 'Speak naturally, warmly, with a conversational friendly tone.';
      return `${input}\n\n[Voice: ${a.voice_gender}, Language: ${a.voice_language}, Style: ${a.speaking_style}]\n[Direction: ${styleNote}]`;
    },
  },

  // ── VIDEO (LTX) ───────────────────────────────────────────────────────────
  video: {
    questions: [
      {
        id: 'scene_type',
        text: { ka: 'სცენის ტიპი?', en: 'Scene type?', ru: 'Тип сцены?' },
        type: 'chips',
        options: [
          { value: 'cinematic',   label: { ka: 'კინემატოგრაფიული', en: 'Cinematic',   ru: 'Кинематографичный' }, icon: '🎬' },
          { value: 'nature',      label: { ka: 'ბუნება',            en: 'Nature',      ru: 'Природа'            }, icon: '🌿' },
          { value: 'urban',       label: { ka: 'ურბანული',          en: 'Urban',       ru: 'Городской'          }, icon: '🏙️' },
          { value: 'abstract',    label: { ka: 'აბსტრაქტული',      en: 'Abstract',    ru: 'Абстрактный'        }, icon: '🌀' },
          { value: 'fantasy',     label: { ka: 'ფანტაზია',          en: 'Fantasy',     ru: 'Фэнтези'            }, icon: '✨' },
          { value: 'product',     label: { ka: 'პროდუქტი',          en: 'Product Shot', ru: 'Продуктовый'       }, icon: '📦' },
        ],
      },
      {
        id: 'camera_movement',
        text: { ka: 'კამერის მოძრაობა?', en: 'Camera movement?', ru: 'Движение камеры?' },
        type: 'chips',
        options: [
          { value: 'static',   label: { ka: 'სტატიური',    en: 'Static',        ru: 'Статичный'   } },
          { value: 'pan',      label: { ka: 'პანორამა',    en: 'Pan',           ru: 'Панорама'    } },
          { value: 'zoom',     label: { ka: 'ზუმი',        en: 'Slow Zoom In',  ru: 'Наезд'       } },
          { value: 'tracking', label: { ka: 'ტრეკინგი',    en: 'Tracking Shot', ru: 'Трекинг'     } },
          { value: 'orbital',  label: { ka: 'ორბიტალური', en: 'Orbital 360°',  ru: 'Орбита 360°' } },
          { value: 'handheld', label: { ka: 'ხელით',       en: 'Handheld',      ru: 'С руки'       } },
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
        id: 'duration',
        text: { ka: 'ხანგრძლივობა?', en: 'Duration?', ru: 'Длительность?' },
        type: 'chips',
        options: [
          { value: '5',  label: { ka: '5 წამი',  en: '5 seconds',  ru: '5 секунд'  }, credits: 10, time: 45 },
          { value: '7',  label: { ka: '7 წამი',  en: '7 seconds',  ru: '7 секунд'  }, credits: 15, time: 60 },
          { value: '10', label: { ka: '10 წამი', en: '10 seconds', ru: '10 секунд' }, credits: 20, time: 80 },
        ],
      },
    ],
    creditFormula: (a) => parseInt(String(a.duration ?? '7')) * 2,
    timeFormula: (a) => parseInt(String(a.duration ?? '7')) * 8,
    buildPrompt: (input, a) => {
      const camNote = a.camera_movement === 'static' ? 'static locked-off camera' :
        a.camera_movement === 'pan' ? 'smooth panoramic camera pan' :
        a.camera_movement === 'zoom' ? 'slow cinematic zoom in' :
        a.camera_movement === 'tracking' ? 'tracking shot following the subject' :
        a.camera_movement === 'orbital' ? 'smooth 360-degree orbital camera movement' :
        'handheld documentary camera movement';
      return `${a.scene_type} scene: ${input}. ${camNote}. ${a.aspect} aspect ratio. Duration: ${a.duration}s. Cinematic color grade, professional lighting, high detail, 4K quality.`;
    },
  },

  // ── IMAGE (FLUX via Replicate) ────────────────────────────────────────────
  image: {
    questions: [
      {
        id: 'provider',
        text: { ka: 'პროვაიდერი?', en: 'Provider?', ru: 'Провайдер?' },
        type: 'chips',
        options: [
          { value: 'nanobanana', label: { ka: 'NanoBanana API', en: 'NanoBanana API', ru: 'NanoBanana API' }, icon: '🍌' },
          { value: 'replicate', label: { ka: 'Replicate', en: 'Replicate', ru: 'Replicate' }, icon: '⚡' },
        ],
      },
      {
        id: 'nanobanana_endpoint',
        text: { ka: 'NanoBanana ენდპოინტი?', en: 'NanoBanana endpoint?', ru: 'NanoBanana endpoint?' },
        type: 'chips',
        options: [
          { value: 'task-details', label: { ka: 'Task დეტალები', en: 'Task Details', ru: 'Детали задачи' }, credits: 0, time: 5 },
          { value: 'text-to-image', label: { ka: 'Text -> Image', en: 'Text -> Image', ru: 'Текст -> изображение' }, credits: 4, time: 20 },
          { value: 'pro-1k2k', label: { ka: 'Pro 1K/2K', en: 'Pro 1K/2K', ru: 'Pro 1K/2K' }, credits: 18, time: 35 },
          { value: 'pro-4k', label: { ka: 'Pro 4K', en: 'Pro 4K', ru: 'Pro 4K' }, credits: 24, time: 55 },
          { value: 'v2-1k', label: { ka: 'V2 1K', en: 'V2 1K', ru: 'V2 1K' }, credits: 8, time: 24 },
          { value: 'v2-2k', label: { ka: 'V2 2K', en: 'V2 2K', ru: 'V2 2K' }, credits: 12, time: 32 },
          { value: 'v2-4k', label: { ka: 'V2 4K', en: 'V2 4K', ru: 'V2 4K' }, credits: 18, time: 45 },
        ],
      },
      {
        id: 'style',
        text: { ka: 'ვიზუალური სტილი?', en: 'Visual style?', ru: 'Визуальный стиль?' },
        type: 'chips',
        options: [
          { value: 'photorealistic', label: { ka: 'ფოტო-რეალისტური',  en: 'Photorealistic',  ru: 'Фотореалистичный' }, icon: '📷' },
          { value: 'artistic',       label: { ka: 'მხატვრული ფერწერა', en: 'Oil Painting',    ru: 'Живопись'         }, icon: '🎨' },
          { value: 'anime',          label: { ka: 'ანიმე/მანგა',       en: 'Anime / Manga',   ru: 'Аниме / Манга'   }, icon: '✨' },
          { value: '3d',             label: { ka: '3D Render',          en: '3D Render',       ru: '3D рендер'        }, icon: '🎲' },
          { value: 'flat',           label: { ka: 'ვექტორი / ფლათი',  en: 'Vector / Flat',   ru: 'Вектор / Флет'   }, icon: '⬜' },
          { value: 'dark',           label: { ka: 'Dark / Gothic',     en: 'Dark / Gothic',   ru: 'Тёмный / Готика' }, icon: '🌑' },
          { value: 'watercolor',     label: { ka: 'Watercolor',        en: 'Watercolor',      ru: 'Акварель'         }, icon: '💧' },
          { value: 'cinematic',      label: { ka: 'კინემატოგრაფიული', en: 'Cinematic Photo', ru: 'Кинофото'         }, icon: '🎬' },
        ],
      },
      {
        id: 'aspect',
        text: { ka: 'ზომა/პროპორცია?', en: 'Size / Ratio?', ru: 'Размер / Соотношение?' },
        type: 'chips',
        options: [
          { value: '1:1',  label: { ka: 'Square 1:1',     en: 'Square 1:1',     ru: 'Квадрат 1:1'     }, icon: '⬜' },
          { value: '16:9', label: { ka: 'Wide 16:9',      en: 'Wide 16:9',      ru: 'Широкий 16:9'    }, icon: '📺' },
          { value: '9:16', label: { ka: 'Vertical 9:16',  en: 'Vertical 9:16',  ru: 'Вертикальный'    }, icon: '📱' },
          { value: '4:3',  label: { ka: 'Classic 4:3',    en: 'Classic 4:3',    ru: 'Классический 4:3'}, icon: '🖼' },
          { value: '3:2',  label: { ka: 'Photo 3:2',      en: 'Photo 3:2',      ru: 'Фото 3:2'        }, icon: '🖼' },
        ],
      },
      {
        id: 'quality',
        text: { ka: 'ხარისხი?', en: 'Quality?', ru: 'Качество?' },
        type: 'chips',
        options: [
          { value: 'draft',    label: { ka: 'სწრაფი',       en: 'Quick Draft',   ru: 'Быстрый'  }, credits: 3,  time: 10 },
          { value: 'standard', label: { ka: 'სტანდარტული', en: 'Standard',      ru: 'Стандарт' }, credits: 6,  time: 25 },
          { value: 'premium',  label: { ka: 'პრემიუმი',    en: 'Premium',       ru: 'Премиум'  }, credits: 12, time: 50 },
        ],
      },
      {
        id: 'lighting',
        text: { ka: 'განათება?', en: 'Lighting?', ru: 'Освещение?' },
        type: 'chips',
        options: [
          { value: 'natural',  label: { ka: 'ბუნებრივი',     en: 'Natural Light',  ru: 'Естественный' } },
          { value: 'studio',   label: { ka: 'სტუდიური',      en: 'Studio Light',   ru: 'Студийный'    } },
          { value: 'dramatic', label: { ka: 'დრამატული',     en: 'Dramatic/Moody', ru: 'Драматичный'  } },
          { value: 'golden',   label: { ka: 'ოქროსფერი სხივი', en: 'Golden Hour',  ru: 'Золотой час'  } },
          { value: 'neon',     label: { ka: 'Neon / Cyberpunk', en: 'Neon / Cyberpunk', ru: 'Неон/Киберпанк' } },
        ],
      },
    ],
    creditFormula: (a) => {
      const provider = String(a.provider ?? 'nanobanana').toLowerCase();
      if (provider === 'nanobanana') {
        return getNanoBananaCreditCost(a.nanobanana_endpoint);
      }
      return a.quality === 'draft' ? 3 : a.quality === 'premium' ? 12 : 6;
    },
    timeFormula: (a) => {
      const provider = String(a.provider ?? 'nanobanana').toLowerCase();
      if (provider === 'nanobanana') {
        const endpoint = resolveNanoBananaEndpoint(a.nanobanana_endpoint);
        if (endpoint === 'task-details') return 5;
        if (endpoint === 'text-to-image') return 20;
        if (endpoint === 'v2-1k') return 24;
        if (endpoint === 'v2-2k') return 32;
        if (endpoint === 'v2-4k') return 45;
        if (endpoint === 'pro-1k2k') return 35;
        return 55;
      }
      return a.quality === 'draft' ? 10 : a.quality === 'premium' ? 50 : 25;
    },
    buildPrompt: (input, a) => {
      const qualityTag = a.quality === 'premium'
        ? 'ultra-high detail, 8K resolution, award-winning photography'
        : a.quality === 'standard'
          ? 'high quality, detailed, professional'
          : 'clean, good quality';
      return `${a.style} style: ${input}. ${a.lighting} lighting. ${a.aspect} aspect ratio. ${qualityTag}. Sharp focus, professional composition, no watermarks.`;
    },
  },

  // ── MUSIC (ElevenLabs Sound Generation) ──────────────────────────────────
  music: {
    questions: [
      {
        id: 'genre',
        text: { ka: 'მუსიკის ჟანრი?', en: 'Music genre?', ru: 'Жанр музыки?' },
        type: 'chips',
        options: [
          { value: 'ambient',       label: { ka: 'Ambient',           en: 'Ambient',       ru: 'Эмбиент'         }, icon: '🌌' },
          { value: 'electronic',    label: { ka: 'Electronic / EDM',  en: 'Electronic/EDM', ru: 'Электронная'    }, icon: '⚡' },
          { value: 'orchestral',    label: { ka: 'Orchestral',        en: 'Orchestral',    ru: 'Оркестровый'     }, icon: '🎻' },
          { value: 'cinematic',     label: { ka: 'Cinematic',         en: 'Cinematic',     ru: 'Кинематографич.' }, icon: '🎬' },
          { value: 'lofi',          label: { ka: 'Lo-Fi Hip-Hop',     en: 'Lo-Fi Hip-Hop', ru: 'Ло-фай хип-хоп' }, icon: '☕' },
          { value: 'georgian_folk', label: { ka: 'ქართული ხალხური',  en: 'Georgian Folk', ru: 'Грузинский фольк'}, icon: '🇬🇪' },
          { value: 'jazz',          label: { ka: 'Jazz',              en: 'Jazz',          ru: 'Джаз'            }, icon: '🎷' },
          { value: 'rock',          label: { ka: 'Rock',              en: 'Rock',          ru: 'Рок'             }, icon: '🎸' },
        ],
      },
      {
        id: 'mood',
        text: { ka: 'განწყობა?', en: 'Mood?', ru: 'Настроение?' },
        type: 'chips',
        options: [
          { value: 'epic',        label: { ka: 'ეპიკური',         en: 'Epic',        ru: 'Эпический'    } },
          { value: 'calm',        label: { ka: 'მშვიდი/Relaxing',  en: 'Calm/Relaxing', ru: 'Спокойный' } },
          { value: 'mysterious',  label: { ka: 'იდუმალი',         en: 'Mysterious',  ru: 'Таинственный' } },
          { value: 'energetic',   label: { ka: 'ენერგიული',       en: 'Energetic',   ru: 'Энергичный'   } },
          { value: 'melancholic', label: { ka: 'მელანქოლიური',   en: 'Melancholic', ru: 'Меланхоличный'} },
          { value: 'uplifting',   label: { ka: 'ამაღელვებელი',   en: 'Uplifting',   ru: 'Воодушевляющий'} },
        ],
      },
      {
        id: 'duration',
        text: { ka: 'ხანგრძლივობა?', en: 'Duration?', ru: 'Длительность?' },
        type: 'chips',
        options: [
          { value: '15',  label: { ka: '15 წამი (მოკლე)',  en: '15s (Short)',  ru: '15с (Короткий)' }, credits: 5  },
          { value: '22',  label: { ka: '22 წამი (სტანდ.)', en: '22s (Standard)',ru: '22с (Стандарт)' }, credits: 10 },
        ],
      },
      {
        id: 'use_case',
        text: { ka: 'გამოყენება?', en: 'Use case?', ru: 'Назначение?' },
        type: 'chips',
        options: [
          { value: 'video_bg',     label: { ka: 'ვიდეო ბექგრაუნდი',  en: 'Video Background', ru: 'Фон видео'     } },
          { value: 'game_ost',     label: { ka: 'თამაშის OST',        en: 'Game OST',         ru: 'Саундтрек'     } },
          { value: 'meditation',   label: { ka: 'მედიტაცია / Spa',    en: 'Meditation / Spa', ru: 'Медитация'     } },
          { value: 'presentation', label: { ka: 'პრეზენტაცია',        en: 'Presentation',     ru: 'Презентация'   } },
          { value: 'podcast',      label: { ka: 'Podcast ჩასმა',      en: 'Podcast Insert',   ru: 'Подкаст'       } },
          { value: 'social',       label: { ka: 'სოცი. მედია',        en: 'Social Media',     ru: 'Соцсети'       } },
        ],
      },
    ],
    creditFormula: (a) => Math.round(parseInt(String(a.duration ?? '22')) / 3),
    timeFormula: (a) => parseInt(String(a.duration ?? '22')) + 15,
    buildPrompt: (input, a) =>
      `${a.genre} music, ${a.mood} mood, ${a.duration} seconds, designed for ${a.use_case}. ${input ? `Style notes: ${input}.` : ''} Rich layered composition, professional mastering, no vocals, clean fade in/out.`,
  },

  // ── GAME (Claude) ─────────────────────────────────────────────────────────
  game: {
    questions: [
      {
        id: 'genre',
        text: { ka: 'თამაშის ჟანრი?', en: 'Game genre?', ru: 'Жанр игры?' },
        type: 'chips',
        options: [
          { value: 'rpg',           label: { ka: 'RPG',           en: 'RPG',           ru: 'РПГ'          }, icon: '⚔️' },
          { value: 'platformer',    label: { ka: 'Platformer',    en: 'Platformer',    ru: 'Платформер'   }, icon: '🏃' },
          { value: 'puzzle',        label: { ka: 'Puzzle',        en: 'Puzzle',        ru: 'Головоломка'  }, icon: '🧩' },
          { value: 'strategy',      label: { ka: 'Strategy / RTS',en: 'Strategy/RTS',  ru: 'Стратегия'   }, icon: '♟️' },
          { value: 'action',        label: { ka: 'Action / FPS',  en: 'Action / FPS',  ru: 'Экшн / FPS'  }, icon: '💥' },
          { value: 'adventure',     label: { ka: 'Adventure',     en: 'Adventure',     ru: 'Приключение'  }, icon: '🗺️' },
          { value: 'simulation',    label: { ka: 'Simulation',    en: 'Simulation',    ru: 'Симулятор'    }, icon: '🏗️' },
          { value: 'horror',        label: { ka: 'Horror',        en: 'Horror',        ru: 'Ужасы'        }, icon: '👻' },
        ],
      },
      {
        id: 'output_type',
        text: { ka: 'რა დოკუმენტი გჭირდება?', en: 'What document?', ru: 'Какой документ?' },
        type: 'chips',
        options: [
          { value: 'concept',        label: { ka: 'Game Concept',   en: 'Game Concept',      ru: 'Концепция'       } },
          { value: 'mechanics_doc',  label: { ka: 'Core Mechanics', en: 'Core Mechanics Doc', ru: 'Механики'       } },
          { value: 'level_design',   label: { ka: 'Level Design',   en: 'Level Design Doc',  ru: 'Дизайн уровней' } },
          { value: 'character_bible',label: { ka: 'Character Bible',en: 'Character Bible',   ru: 'Персонажи'       } },
          { value: 'gdd',            label: { ka: 'სრული GDD',     en: 'Full GDD',          ru: 'Полный GDD'     } },
        ],
      },
      {
        id: 'platform',
        text: { ka: 'პლატფორმა?', en: 'Target platform?', ru: 'Целевая платформа?' },
        type: 'chips',
        options: [
          { value: 'mobile',  label: { ka: 'iOS / Android', en: 'iOS / Android', ru: 'iOS / Android' }, icon: '📱' },
          { value: 'pc',      label: { ka: 'PC / Steam',    en: 'PC / Steam',    ru: 'ПК / Steam'    }, icon: '💻' },
          { value: 'web',     label: { ka: 'Web Browser',   en: 'Web Browser',   ru: 'Браузер'       }, icon: '🌐' },
          { value: 'console', label: { ka: 'Console',       en: 'Console',       ru: 'Консоль'       }, icon: '🎮' },
          { value: 'vr',      label: { ka: 'VR / AR',       en: 'VR / AR',       ru: 'VR / AR'       }, icon: '🥽' },
        ],
      },
      {
        id: 'complexity',
        text: { ka: 'პროექტის სკოპი?', en: 'Project scope?', ru: 'Масштаб проекта?' },
        type: 'chips',
        options: [
          { value: 'jam',   label: { ka: 'Game Jam (48h)',    en: 'Game Jam (48h)',   ru: 'Game Jam (48ч)' } },
          { value: 'indie', label: { ka: 'Indie (1-6 თვე)',   en: 'Indie (1-6 months)', ru: 'Инди (1-6 мес.)'} },
          { value: 'mid',   label: { ka: 'Mid-size (6-18m)',  en: 'Mid-size (6-18m)', ru: 'Средний'       } },
          { value: 'aaa',   label: { ka: 'AAA Concept',       en: 'AAA Concept',      ru: 'AAA концепция' } },
        ],
      },
    ],
    creditFormula: (a) => a.output_type === 'gdd' ? 18 : a.output_type === 'character_bible' ? 12 : 8,
    timeFormula: (a) => a.output_type === 'gdd' ? 25 : 10,
    buildPrompt: (input, a) =>
      `You are a senior game designer at a AAA studio. Create a detailed, professional ${a.output_type} for a ${a.genre} game targeting ${a.platform}. Project scope: ${a.complexity}.\n\nGame concept: ${input}\n\nFormat in clean markdown with sections, subsections, bullet points. Include:\n- Core gameplay loop\n- Target audience & market positioning\n- Unique selling points vs competitors\n- Technical requirements for ${a.platform}\n- Monetization strategy appropriate for ${a.complexity} scope\n- Risk assessment and mitigation\nBe specific, actionable, and production-ready.`,
  },

  // ── INTERIOR (FLUX via Replicate) ─────────────────────────────────────────
  interior: {
    questions: [
      {
        id: 'provider',
        text: { ka: 'პროვაიდერი?', en: 'Provider?', ru: 'Провайдер?' },
        type: 'chips',
        options: [
          { value: 'nanobanana', label: { ka: 'NanoBanana API', en: 'NanoBanana API', ru: 'NanoBanana API' }, icon: '🍌' },
          { value: 'replicate', label: { ka: 'Replicate', en: 'Replicate', ru: 'Replicate' }, icon: '⚡' },
        ],
      },
      {
        id: 'nanobanana_endpoint',
        text: { ka: 'NanoBanana ენდპოინტი?', en: 'NanoBanana endpoint?', ru: 'NanoBanana endpoint?' },
        type: 'chips',
        options: [
          { value: 'task-details', label: { ka: 'Task დეტალები', en: 'Task Details', ru: 'Детали задачи' }, credits: 0, time: 5 },
          { value: 'text-to-image', label: { ka: 'Text -> Image', en: 'Text -> Image', ru: 'Текст -> изображение' }, credits: 4, time: 20 },
          { value: 'pro-1k2k', label: { ka: 'Pro 1K/2K', en: 'Pro 1K/2K', ru: 'Pro 1K/2K' }, credits: 18, time: 35 },
          { value: 'pro-4k', label: { ka: 'Pro 4K', en: 'Pro 4K', ru: 'Pro 4K' }, credits: 24, time: 55 },
          { value: 'v2-1k', label: { ka: 'V2 1K', en: 'V2 1K', ru: 'V2 1K' }, credits: 8, time: 24 },
          { value: 'v2-2k', label: { ka: 'V2 2K', en: 'V2 2K', ru: 'V2 2K' }, credits: 12, time: 32 },
          { value: 'v2-4k', label: { ka: 'V2 4K', en: 'V2 4K', ru: 'V2 4K' }, credits: 18, time: 45 },
        ],
      },
      {
        id: 'room_type',
        text: { ka: 'ოთახის ტიპი?', en: 'Room type?', ru: 'Тип комнаты?' },
        type: 'chips',
        options: [
          { value: 'living',     label: { ka: 'სასტუმრო',          en: 'Living Room',  ru: 'Гостиная'    }, icon: '🛋️' },
          { value: 'bedroom',    label: { ka: 'საძინებელი',         en: 'Bedroom',      ru: 'Спальня'     }, icon: '🛏️' },
          { value: 'kitchen',    label: { ka: 'სამზარეულო',        en: 'Kitchen',      ru: 'Кухня'       }, icon: '🍳' },
          { value: 'office',     label: { ka: 'სამუშაო კაბინეტი',  en: 'Home Office',  ru: 'Кабинет'     }, icon: '💼' },
          { value: 'bathroom',   label: { ka: 'სველი კვანძი',      en: 'Bathroom',     ru: 'Ванная'      }, icon: '🛁' },
          { value: 'studio',     label: { ka: 'Creative სტუდია',   en: 'Creative Studio', ru: 'Студия'   }, icon: '🎨' },
          { value: 'commercial', label: { ka: 'კომერციული სივრცე', en: 'Commercial',   ru: 'Коммерческий'}, icon: '🏢' },
        ],
      },
      {
        id: 'style',
        text: { ka: 'დიზაინის სტილი?', en: 'Design style?', ru: 'Стиль дизайна?' },
        type: 'chips',
        options: [
          { value: 'minimalist',           label: { ka: 'სკანდინავიური / მინ.', en: 'Scandinavian / Minimal', ru: 'Скандинавский'  } },
          { value: 'georgian_traditional', label: { ka: 'ქართული ტრადიციული',  en: 'Georgian Traditional',  ru: 'Грузинский'     } },
          { value: 'modern',               label: { ka: 'თანამედროვე',          en: 'Contemporary Modern',   ru: 'Современный'    } },
          { value: 'industrial',           label: { ka: 'ინდუსტრიალური / Loft', en: 'Industrial / Loft',     ru: 'Индустриальный' } },
          { value: 'cozy',                 label: { ka: 'Cozy / Hygge',         en: 'Cozy / Hygge',          ru: 'Уютный Hygge'   } },
          { value: 'luxury',               label: { ka: 'ლუქსი / Art Deco',    en: 'Luxury / Art Deco',     ru: 'Люкс / Art Deco'} },
          { value: 'japandi',              label: { ka: 'Japandi',              en: 'Japandi',               ru: 'Japandi'        } },
        ],
      },
      {
        id: 'color_palette',
        text: { ka: 'ფერთა სქემა?', en: 'Color scheme?', ru: 'Цветовая схема?' },
        type: 'chips',
        options: [
          { value: 'warm',       label: { ka: 'თბილი ტონები',    en: 'Warm Tones',   ru: 'Тёплые тона'  } },
          { value: 'cool',       label: { ka: 'ცივი ტონები',     en: 'Cool Tones',   ru: 'Холодные тона'} },
          { value: 'neutral',    label: { ka: 'ნეიტრალური / Wht', en: 'Neutral/White', ru: 'Нейтральные'} },
          { value: 'earthy',     label: { ka: 'Earth Tones',     en: 'Earth Tones',  ru: 'Земляные'     } },
          { value: 'bold',       label: { ka: 'გამჭვირვალე',    en: 'Bold / Vibrant', ru: 'Яркие'       } },
          { value: 'monochrome', label: { ka: 'მონოქრომი',      en: 'Monochrome',   ru: 'Монохром'     } },
        ],
      },
      {
        id: 'size',
        text: { ka: 'სივრცის ზომა?', en: 'Space size?', ru: 'Размер помещения?' },
        type: 'chips',
        options: [
          { value: 'small',  label: { ka: 'მცირე  (<30 მ²)',      en: 'Small (<30m²)',     ru: 'Маленький' } },
          { value: 'medium', label: { ka: 'საშუალო (30–60 მ²)',   en: 'Medium (30–60m²)',  ru: 'Средний'   } },
          { value: 'large',  label: { ka: 'დიდი   (60+ მ²)',       en: 'Large (60m²+)',     ru: 'Большой'   } },
          { value: 'open',   label: { ka: 'Open-plan / Studio',   en: 'Open Plan / Studio', ru: 'Открытый'  } },
        ],
      },
    ],
    creditFormula: (a) => {
      const provider = String(a.provider ?? 'nanobanana').toLowerCase();
      if (provider === 'nanobanana') {
        return getNanoBananaCreditCost(a.nanobanana_endpoint);
      }
      return 8;
    },
    timeFormula: (a) => {
      const provider = String(a.provider ?? 'nanobanana').toLowerCase();
      if (provider === 'nanobanana') {
        const endpoint = resolveNanoBananaEndpoint(a.nanobanana_endpoint);
        if (endpoint === 'task-details') return 5;
        if (endpoint === 'text-to-image') return 20;
        if (endpoint === 'v2-1k') return 24;
        if (endpoint === 'v2-2k') return 32;
        if (endpoint === 'v2-4k') return 45;
        if (endpoint === 'pro-1k2k') return 35;
        return 55;
      }
      return 25;
    },
    buildPrompt: (input, a) => {
      const refNote = ''; // photo reference appended separately via media context
      return `Photorealistic 3D interior design visualization: ${a.style} style ${a.room_type} (${a.size}), ${a.color_palette} color scheme. Design requirements: ${input}. ${refNote}Architectural digest quality render, professional interior photography angle, perfect proportions, ambient and accent lighting, realistic materials and textures, no people, 16:9 format.`;
    },
  },

  // ── PROMPT-BUILDER (Claude) ───────────────────────────────────────────────
  'prompt-builder': {
    questions: [
      {
        id: 'target_ai',
        text: { ka: 'რომელი AI-სთვის?', en: 'Optimize for which AI?', ru: 'Для какого AI?' },
        type: 'chips',
        options: [
          { value: 'midjourney',       label: { ka: 'Midjourney v6',      en: 'Midjourney v6',     ru: 'Midjourney v6'    }, icon: '🎨' },
          { value: 'flux',             label: { ka: 'FLUX (Replicate)',   en: 'FLUX (Replicate)',  ru: 'FLUX'             }, icon: '⚡' },
          { value: 'stable_diffusion', label: { ka: 'Stable Diffusion',  en: 'Stable Diffusion', ru: 'Stable Diffusion' }, icon: '🌊' },
          { value: 'dalle',            label: { ka: 'DALL-E 3',          en: 'DALL-E 3',          ru: 'DALL-E 3'         }, icon: '🤖' },
          { value: 'sora',             label: { ka: 'Sora (Video)',      en: 'Sora (Video)',      ru: 'Sora (Видео)'    }, icon: '🎬' },
          { value: 'kling',            label: { ka: 'Kling / RunwayML',  en: 'Kling / RunwayML',  ru: 'Kling / Runway'  }, icon: '🎞️' },
          { value: 'claude',           label: { ka: 'Claude 4',          en: 'Claude 4',          ru: 'Claude 4'         }, icon: '◆'  },
          { value: 'gpt',              label: { ka: 'GPT-4o',            en: 'GPT-4o',            ru: 'GPT-4o'           }, icon: '💬' },
          { value: 'gemini',           label: { ka: 'Gemini Ultra',      en: 'Gemini Ultra',      ru: 'Gemini Ultra'    }, icon: '♊' },
        ],
      },
      {
        id: 'detail_level',
        text: { ka: 'დეტალიზაციის დონე?', en: 'Detail level?', ru: 'Уровень детализации?' },
        type: 'chips',
        options: [
          { value: 'minimal',   label: { ka: 'მინიმალური (1 წინადადება)', en: 'Minimal (1 sentence)', ru: 'Минимальный' } },
          { value: 'detailed',  label: { ka: 'დეტალური (2-5 წინ.)',      en: 'Detailed (2-5 sentences)', ru: 'Детальный' } },
          { value: 'technical', label: { ka: 'Expert (ყველა პარამ.)',    en: 'Expert (all params)',   ru: 'Экспертный' } },
        ],
      },
      {
        id: 'language',
        text: { ka: 'Prompt-ის ენა?', en: 'Output language?', ru: 'Язык промпта?' },
        type: 'chips',
        options: [
          { value: 'en', label: { ka: 'English (recommended)', en: 'English (recommended)', ru: 'Английский (рекомендуется)' }, icon: '🇺🇸' },
          { value: 'ka', label: { ka: 'ქართული',              en: 'Georgian',              ru: 'Грузинский'                  }, icon: '🇬🇪' },
          { value: 'ru', label: { ka: 'Русский',               en: 'Russian',               ru: 'Русский'                    }, icon: '🇷🇺' },
        ],
      },
      {
        id: 'purpose',
        text: { ka: 'მიზანი?', en: 'Purpose?', ru: 'Цель промпта?' },
        type: 'chips',
        options: [
          { value: 'image_gen',    label: { ka: 'სურათის გენ.',   en: 'Image Generation',  ru: 'Генерация изображений' } },
          { value: 'video_gen',    label: { ka: 'ვიდეოს გენ.',    en: 'Video Generation',  ru: 'Генерация видео'       } },
          { value: 'chat_system',  label: { ka: 'AI System Prompt', en: 'AI System Prompt', ru: 'Системный промпт'     } },
          { value: 'code_gen',     label: { ka: 'კოდის გენ.',     en: 'Code Generation',   ru: 'Генерация кода'       } },
          { value: 'storytelling', label: { ka: 'მოთხრობა / ნარ.',en: 'Storytelling',      ru: 'Сторителлинг'         } },
        ],
      },
    ],
    creditFormula: () => 3,
    timeFormula: () => 6,
    buildPrompt: (input, a) => {
      const lang = a.language === 'en' ? 'English' : a.language === 'ru' ? 'Russian' : 'Georgian';
      const detail = a.detail_level === 'minimal' ? '1 concise sentence' : a.detail_level === 'detailed' ? '3-5 detailed sentences' : 'a comprehensive expert-level prompt with all relevant parameters, modifiers, and technical flags';
      return `You are a world-class prompt engineer specializing in ${a.target_ai}. Create ${detail} optimized for ${a.target_ai} in ${lang} for the purpose of: ${a.purpose}.\n\nUser's raw idea: "${input}"\n\nApply all best practices for ${a.target_ai}:\n- Use model-specific syntax and parameter flags\n- Include quality boosters and negative/exclusion terms where relevant\n- Structure for maximum coherence and output quality\n\nReturn ONLY the final optimized prompt. No explanations, no preamble, no markdown wrapper.`;
    },
  },

  // ── TERMINAL / CODE (Claude) ──────────────────────────────────────────────
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
          { value: 'bash',       label: { ka: 'Bash / Shell', en: 'Bash/Shell', ru: 'Bash/Shell'}, icon: '🖥' },
          { value: 'go',         label: { ka: 'Go (Golang)', en: 'Go (Golang)', ru: 'Go'        }, icon: '🐹' },
          { value: 'rust',       label: { ka: 'Rust',       en: 'Rust',       ru: 'Rust'       }, icon: '⚙️' },
          { value: 'sql',        label: { ka: 'SQL',        en: 'SQL',        ru: 'SQL'        }, icon: '🗄️' },
          { value: 'solidity',   label: { ka: 'Solidity (Web3)', en: 'Solidity (Web3)', ru: 'Solidity' }, icon: '⛓️' },
        ],
      },
      {
        id: 'type',
        text: { ka: 'კოდის ტიპი?', en: 'Code type?', ru: 'Тип кода?' },
        type: 'chips',
        options: [
          { value: 'function',    label: { ka: 'ფუნქცია / Module',    en: 'Function / Module',  ru: 'Функция/Модуль'    } },
          { value: 'script',      label: { ka: 'Automation Script',   en: 'Automation Script',  ru: 'Скрипт'            } },
          { value: 'cli_tool',    label: { ka: 'CLI Tool',            en: 'CLI Tool',            ru: 'CLI инструмент'    } },
          { value: 'api_client',  label: { ka: 'API Client',          en: 'API Client',          ru: 'API клиент'        } },
          { value: 'smart_contract', label: { ka: 'Smart Contract',  en: 'Smart Contract',      ru: 'Смарт-контракт'   } },
          { value: 'full_app',    label: { ka: 'სრული აპლიკაცია',   en: 'Full Application',   ru: 'Полное приложение' } },
        ],
      },
      {
        id: 'extras',
        text: { ka: 'დამატებები?', en: 'Include?', ru: 'Включить?' },
        type: 'multi',
        options: [
          { value: 'comments',       label: { ka: 'JSDoc/კომენტარები', en: 'JSDoc / Comments',  ru: 'Комментарии'       } },
          { value: 'tests',          label: { ka: 'Unit / Integration ტ.', en: 'Unit Tests',    ru: 'Тесты'             } },
          { value: 'readme',         label: { ka: 'README.md',           en: 'README.md',        ru: 'README.md'         } },
          { value: 'error_handling', label: { ka: 'Error Handling',      en: 'Error Handling',  ru: 'Обработка ошибок'  } },
          { value: 'docker',         label: { ka: 'Dockerfile',          en: 'Dockerfile',       ru: 'Dockerfile'        } },
          { value: 'ci_cd',          label: { ka: 'CI/CD Config',        en: 'CI/CD Config',     ru: 'CI/CD конфиг'     } },
        ],
      },
      {
        id: 'complexity',
        text: { ka: 'სირთულის დონე?', en: 'Complexity level?', ru: 'Уровень сложности?' },
        type: 'chips',
        options: [
          { value: 'simple',       label: { ka: 'მარტივი (Junior)',        en: 'Simple (Junior)',       ru: 'Простой'       } },
          { value: 'intermediate', label: { ka: 'საშუალო (Mid)',           en: 'Intermediate (Mid)',    ru: 'Средний'       } },
          { value: 'advanced',     label: { ka: 'Advanced (Senior)',       en: 'Advanced (Senior)',     ru: 'Продвинутый'   } },
          { value: 'expert',       label: { ka: 'Expert / Architect',     en: 'Expert / Architect',   ru: 'Эксперт'       } },
        ],
      },
    ],
    creditFormula: (a) => a.type === 'full_app' ? 12 : a.type === 'smart_contract' ? 10 : 4,
    timeFormula: (a) => a.type === 'full_app' ? 30 : 8,
    buildPrompt: (input, a) => {
      const extras = Array.isArray(a.extras) ? (a.extras as string[]).join(', ') : String(a.extras ?? 'error_handling');
      const style = a.complexity === 'expert' ? 'Staff/Principal engineer level'
        : a.complexity === 'advanced' ? 'Senior engineer level'
        : a.complexity === 'intermediate' ? 'Mid-level engineer level'
        : 'Clean, readable beginner-friendly';
      return `You are a ${style} ${a.language} developer. Write production-quality ${a.type} in ${a.language}.\n\nRequirement: ${input}\n\nMust include: ${extras}.\n\nCode standards:\n- Clean architecture, SOLID principles where applicable\n- Proper error handling and input validation\n- Performance-conscious implementation\n- Security best practices (no hardcoded secrets, sanitized inputs)\n\nFormat: Return complete, runnable code. Use markdown code blocks with language tag.`;
    },
  },

  // ── VOICE CLONE (ElevenLabs TTS) ──────────────────────────────────────────
  voice: {
    questions: [
      {
        id: 'text_lang',
        text: { ka: 'სინთეზის ენა?', en: 'Synthesis language?', ru: 'Язык синтеза?' },
        type: 'chips',
        options: [
          { value: 'ka', label: { ka: 'ქართული', en: 'Georgian', ru: 'Грузинский' }, icon: '🇬🇪' },
          { value: 'en', label: { ka: 'ინგლისური', en: 'English', ru: 'Английский' }, icon: '🇬🇧' },
          { value: 'ru', label: { ka: 'რუსული', en: 'Russian', ru: 'Русский' }, icon: '🇷🇺' },
        ],
      },
      {
        id: 'voice_style',
        text: { ka: 'ხმის სტილი?', en: 'Voice style?', ru: 'Стиль голоса?' },
        type: 'chips',
        options: [
          { value: 'neutral',      label: { ka: 'ნეიტრალური', en: 'Neutral', ru: 'Нейтральный' } },
          { value: 'professional', label: { ka: 'პროფესიონალური', en: 'Professional', ru: 'Профессиональный' } },
          { value: 'warm',         label: { ka: 'თბილი', en: 'Warm', ru: 'Тёплый' } },
          { value: 'energetic',    label: { ka: 'ენერგიული', en: 'Energetic', ru: 'Энергичный' } },
        ],
      },
    ],
    creditFormula: () => 6,
    timeFormula: () => 10,
    buildPrompt: (input, a) =>
      `Synthesize the following text in ${a.text_lang ?? 'ka'} with a ${a.voice_style ?? 'neutral'} tone:\n\n${input}`,
  },

  // ── CONTENT WRITER (Claude SEO/Content) ───────────────────────────────────
  'content-writer': {
    questions: [
      {
        id: 'content_type',
        text: { ka: 'კონტენტის ტიპი?', en: 'Content type?', ru: 'Тип контента?' },
        type: 'chips',
        options: [
          { value: 'blog',     label: { ka: 'ბლოგ სტატია', en: 'Blog Article', ru: 'Блог-статья' }, icon: '📝' },
          { value: 'social',   label: { ka: 'სოც. პოსტი', en: 'Social Post', ru: 'Соцсеть' }, icon: '📱' },
          { value: 'seo',      label: { ka: 'SEO ტექსტი', en: 'SEO Text', ru: 'SEO-текст' }, icon: '🔍' },
          { value: 'email',    label: { ka: 'Email ნიუსლეთერი', en: 'Email Newsletter', ru: 'Email-рассылка' }, icon: '✉️' },
          { value: 'ad_copy',  label: { ka: 'რეკლამის ტექსტი', en: 'Ad Copy', ru: 'Рекламный текст' }, icon: '📢' },
          { value: 'product',  label: { ka: 'პროდუქტის აღწერა', en: 'Product Description', ru: 'Описание товара' }, icon: '🛍' },
        ],
      },
      {
        id: 'tone',
        text: { ka: 'ტონი?', en: 'Tone?', ru: 'Тон?' },
        type: 'chips',
        options: [
          { value: 'professional', label: { ka: 'პროფესიონალური', en: 'Professional', ru: 'Профессиональный' } },
          { value: 'friendly',     label: { ka: 'მეგობრული', en: 'Friendly', ru: 'Дружелюбный' } },
          { value: 'persuasive',   label: { ka: 'დამარწმუნებელი', en: 'Persuasive', ru: 'Убедительный' } },
          { value: 'humorous',     label: { ka: 'იუმორისტული', en: 'Humorous', ru: 'Юмористический' } },
        ],
      },
    ],
    creditFormula: (a) => a.content_type === 'blog' ? 5 : 2,
    timeFormula: () => 8,
    buildPrompt: (input, a) =>
      `You are a world-class ${a.tone ?? 'professional'} copywriter. Write a high-quality ${a.content_type ?? 'blog'} about:\n\n${input}\n\nRequirements:\n- Engaging, readable, conversion-focused\n- Natural language, avoid generic phrases\n- Use markdown formatting where appropriate\n- Georgian-aware brand voice if topic is Georgian`,
  },

  // ── PODCAST (Script + TTS) ────────────────────────────────────────────────
  podcast: {
    questions: [
      {
        id: 'format',
        text: { ka: 'ფორმატი?', en: 'Format?', ru: 'Формат?' },
        type: 'chips',
        options: [
          { value: 'solo',      label: { ka: 'სოლო', en: 'Solo', ru: 'Соло' }, icon: '🎤' },
          { value: 'interview', label: { ka: 'ინტერვიუ', en: 'Interview', ru: 'Интервью' }, icon: '🎙' },
          { value: 'debate',    label: { ka: 'დებატი', en: 'Debate', ru: 'Дебаты' }, icon: '⚡' },
          { value: 'story',     label: { ka: 'სტორი / ნარატივი', en: 'Story / Narrative', ru: 'Нарратив' }, icon: '📖' },
        ],
      },
      {
        id: 'duration',
        text: { ka: 'სიგრძე?', en: 'Duration?', ru: 'Длина?' },
        type: 'chips',
        options: [
          { value: '5min',  label: { ka: '5 წთ', en: '5 min', ru: '5 мин' } },
          { value: '15min', label: { ka: '15 წთ', en: '15 min', ru: '15 мин' } },
          { value: '30min', label: { ka: '30 წთ', en: '30 min', ru: '30 мин' } },
          { value: '60min', label: { ka: '60 წთ', en: '60 min', ru: '60 мин' } },
        ],
      },
    ],
    creditFormula: (a) => a.duration === '60min' ? 20 : a.duration === '30min' ? 12 : a.duration === '15min' ? 7 : 4,
    timeFormula: (a) => a.duration === '60min' ? 120 : a.duration === '30min' ? 60 : 20,
    buildPrompt: (input, a) =>
      `You are a professional podcast producer and scriptwriter. Create a complete ${a.duration ?? '15min'} ${a.format ?? 'solo'} podcast script about:\n\n${input}\n\nScript must include:\n- Intro with hook\n- Main segments with transitions\n- Key talking points and quotes\n- Outro with CTA\n\nFormat: Full word-for-word script in markdown. Mark speakers and segments clearly.`,
  },

  // ── EVENT STUDIO ─────────────────────────────────────────────────────────
  event: {
    questions: [
      {
        id: 'event_type',
        text: { ka: 'ივენთის ტიპი?', en: 'Event type?', ru: 'Тип мероприятия?' },
        type: 'chips',
        options: [
          { value: 'conference',  label: { ka: 'კონფერენცია', en: 'Conference', ru: 'Конференция' }, icon: '🎤' },
          { value: 'wedding',     label: { ka: 'ქორწინება', en: 'Wedding', ru: 'Свадьба' }, icon: '💍' },
          { value: 'corporate',   label: { ka: 'კორპორატიული', en: 'Corporate', ru: 'Корпоратив' }, icon: '🏢' },
          { value: 'concert',     label: { ka: 'კონცერტი', en: 'Concert', ru: 'Концерт' }, icon: '🎵' },
          { value: 'launch',      label: { ka: 'პროდუქტის გაშვება', en: 'Product Launch', ru: 'Запуск продукта' }, icon: '🚀' },
          { value: 'festival',    label: { ka: 'ფესტივალი', en: 'Festival', ru: 'Фестиваль' }, icon: '🎪' },
        ],
      },
      {
        id: 'deliverable',
        text: { ka: 'რა გჭირდება?', en: 'What do you need?', ru: 'Что нужно?' },
        type: 'multi',
        options: [
          { value: 'program',    label: { ka: 'პროგრამა / განრიგი', en: 'Program / Schedule', ru: 'Программа' } },
          { value: 'script',     label: { ka: 'MC სკრიპტი', en: 'MC Script', ru: 'Сценарий ведущего' } },
          { value: 'promo',      label: { ka: 'სარეკლამო ტექსტი', en: 'Promo Copy', ru: 'Рекламный текст' } },
          { value: 'invitations',label: { ka: 'მოწვევის ტექსტი', en: 'Invitation Copy', ru: 'Текст приглашений' } },
        ],
      },
    ],
    creditFormula: () => 5,
    timeFormula: () => 10,
    buildPrompt: (input, a) => {
      const deliverables = Array.isArray(a.deliverable) ? (a.deliverable as string[]).join(', ') : String(a.deliverable ?? 'program, script');
      return `You are a professional event producer. Create complete event materials for a ${a.event_type ?? 'corporate'} event.\n\nEvent details: ${input}\n\nDeliverables needed: ${deliverables}\n\nFormat everything in clean markdown with clear sections. Include Georgian cultural elements where relevant.`;
    },
  },

  // ── CHARACTER AI ─────────────────────────────────────────────────────────
  character: {
    questions: [
      {
        id: 'personality',
        text: { ka: 'პერსონაჟის ტიპი?', en: 'Character type?', ru: 'Тип персонажа?' },
        type: 'chips',
        options: [
          { value: 'mentor',    label: { ka: 'მენტორი', en: 'Mentor', ru: 'Ментор' }, icon: '🧠' },
          { value: 'hero',      label: { ka: 'გმირი', en: 'Hero', ru: 'Герой' }, icon: '⚔️' },
          { value: 'companion', label: { ka: 'კომპანიონი', en: 'Companion', ru: 'Компаньон' }, icon: '🤝' },
          { value: 'villain',   label: { ka: 'ანტაგონისტი', en: 'Villain', ru: 'Злодей' }, icon: '😈' },
          { value: 'trickster', label: { ka: 'ტრიქსტერი', en: 'Trickster', ru: 'Трикстер' }, icon: '🃏' },
          { value: 'sage',      label: { ka: 'ბრძენი', en: 'Sage', ru: 'Мудрец' }, icon: '🌟' },
        ],
      },
      {
        id: 'context',
        text: { ka: 'გამოყენება?', en: 'Usage?', ru: 'Использование?' },
        type: 'chips',
        options: [
          { value: 'game',       label: { ka: 'თამაში / NPC', en: 'Game / NPC', ru: 'Игра / NPC' } },
          { value: 'education',  label: { ka: 'სასწავლო', en: 'Educational', ru: 'Учебный' } },
          { value: 'roleplay',   label: { ka: 'Role-play', en: 'Role-play', ru: 'Ролевая игра' } },
          { value: 'assistant',  label: { ka: 'AI ასისტენტი', en: 'AI Assistant', ru: 'AI-ассистент' } },
        ],
      },
    ],
    creditFormula: () => 5,
    timeFormula: () => 12,
    buildPrompt: (input, a) =>
      `Create a detailed ${a.personality ?? 'mentor'} AI character for ${a.context ?? 'roleplay'} use.\n\nCharacter concept: ${input}\n\nDeliver:\n1. Character name and background (100-150 words)\n2. Personality traits (5-7 key traits)\n3. Speech patterns and vocabulary style\n4. Core motivations and fears\n5. Sample dialogue (3-5 exchanges)\n6. Georgian cultural touchpoints if applicable\n\nFormat: Rich markdown with headers.`,
  },
  tourism: {
    questions: [
      {
        id: 'trip_type',
        text: { ka: 'მოგზაურობის ტიპი?', en: 'Trip type?', ru: 'Тип поездки?' },
        type: 'chips',
        options: [
          { value: 'itinerary',   label: { ka: 'სრული მარშრუტი',  en: 'Full Itinerary', ru: 'Полный маршрут' },   icon: '🗺️' },
          { value: 'guide',       label: { ka: 'ადგილობრივი გიდი', en: 'Local Guide',    ru: 'Местный гид' },      icon: '📍' },
          { value: 'hidden_gems', label: { ka: 'ფარული ადგილები', en: 'Hidden Gems',    ru: 'Скрытые места' },     icon: '💎' },
          { value: 'weekend',     label: { ka: 'უიქენდ',          en: 'Weekend Escape', ru: 'Уикенд' },           icon: '🌄' },
          { value: 'budget',      label: { ka: 'ბიუჯეტური',       en: 'Budget Plan',    ru: 'Бюджетный план' },   icon: '💰' },
        ],
      },
      {
        id: 'travel_style',
        text: { ka: 'მოგზაურობის სტილი?', en: 'Travel style?', ru: 'Стиль путешествия?' },
        type: 'chips',
        options: [
          { value: 'cultural',   label: { ka: 'კულტურული',    en: 'Cultural',   ru: 'Культурный' },   icon: '🏛️' },
          { value: 'adventure',  label: { ka: 'სათავგადასავლო', en: 'Adventure',  ru: 'Приключения' }, icon: '🏔️' },
          { value: 'food',       label: { ka: 'კვება / გასტრო', en: 'Food & Gastro', ru: 'Гастро' },  icon: '🍽️' },
          { value: 'luxury',     label: { ka: 'ლუქსი',         en: 'Luxury',     ru: 'Люкс' },        icon: '✨' },
          { value: 'family',     label: { ka: 'ოჯახური',       en: 'Family',     ru: 'Семейный' },    icon: '👨‍👩‍👧' },
        ],
      },
    ],
    creditFormula: () => 4,
    timeFormula: () => 10,
    buildPrompt: (input, a) =>
      `You are an expert travel consultant. Create a detailed ${a.trip_type ?? 'itinerary'} travel plan.\n\nDestination / query: ${input}\n\nTravel style preference: ${a.travel_style ?? 'cultural'}\n\nInclude: daily schedule, top attractions, local food picks, transport tips, accommodation suggestions, hidden gems, and practical advice. Format in clean markdown.`,
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
