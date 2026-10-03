/**
 * lib/services/workspaceForms.ts — what each /{lang}/services/<slug> page offers (components/services/unified/ServiceWorkspaceView).
 *
 * Two kinds of page:
 *   • STUDIO — the service is a tool of the studio (lib/studio/tools.ts). The page names that tool and its one action
 *     opens it: `/{lang}/dashboard?tool=<id>`. It used to carry a PARALLEL generator of its own that posted to
 *     /api/pipeline, /api/replicate/photo or /api/editing/jobs — none of which charges the credit it printed on its
 *     button (the pipeline says so itself: "this legacy surface has no credit charge of its own"), /api/replicate/photo
 *     does not exist, and the pipeline's video leg answers 409 „video_moved". The studio's panels are the priced,
 *     maintained path. Services that never had a generator here (agent-g, text, media, …) open the chat, which is the hub.
 *   • FORM — a text service the studio has no tool for (tourism, game, podcast, …). The page keeps its own form and posts
 *     to the same route as before, with the same field ids and option VALUES (the routes read them: tourism's prompt says
 *     "Duration: <value> days"). Only the visible labels are localised ka · en · ru. No price is shown: these routes
 *     charge none (docs/DESIGN.md §7 — the button carries the number the route charges, and here that number is nothing).
 *
 * Pure and isomorphic; lib/services/workspaceForms.test.ts holds the values and the three languages in place.
 */
import { isToolId, type ToolId } from '@/lib/studio/tools';

export type WorkspaceLang = 'ka' | 'en' | 'ru';
export type L10n = Record<WorkspaceLang, string>;

export interface WorkspaceOption {
  /** Sent to the route — never change it for copy reasons. */
  value: string;
  label: L10n;
}

export interface WorkspaceField {
  id: string;
  type: 'textarea' | 'select';
  label: L10n;
  placeholder?: L10n;
  options?: WorkspaceOption[];
  defaultValue?: string;
}

/** Which route a form posts to. `pipeline` = /api/pipeline `generate`, as `serviceId` (prompt → prompt-builder). */
export type FormRoute =
  | { kind: 'pipeline'; serviceId: string; output: 'text' | 'audio' }
  | { kind: 'code' }
  | { kind: 'business-chat' };

export interface ServiceForm {
  fields: WorkspaceField[];
  actionLabel: L10n;
  previewHint: L10n;
  route: FormRoute;
}

export type ServicePlan = { kind: 'studio'; tool: ToolId } | { kind: 'form'; form: ServiceForm };

export const workspaceLang = (locale: string | null | undefined): WorkspaceLang =>
  locale === 'en' || locale === 'ru' ? locale : 'ka';

/** Option labels that are names (languages, frameworks, models) read the same in every UI language. */
const same = (name: string): L10n => ({ ka: name, en: name, ru: name });

/**
 * The studio tool each service hands over to. Every slug that is neither here nor in SERVICE_FORMS opens the chat
 * (servicePlan below) — agent-g, text, media, visual-intel, shop, workflow and next are listed only to say so out loud.
 */
export const SERVICE_STUDIO_TOOL: Readonly<Record<string, ToolId>> = {
  video: 'video',
  image: 'image',
  music: 'music',
  avatar: 'avatar',
  interior: 'interior',
  // „AI ფოტო სტუდია" — studio-quality photos of you: the photographer. NOT `photo` (on-device culling, no generation).
  photo: 'photoshoot',
  // One editor for every video edit (docs/DESIGN.md §8 Montage).
  editing: 'montage',
  'agent-g': 'chat',
  text: 'chat',
  media: 'chat',
  'visual-intel': 'chat',
  shop: 'chat',
  workflow: 'chat',
  next: 'chat',
};

const PROMPT_BUILDER: ServiceForm = {
  fields: [
    {
      id: 'prompt', type: 'textarea',
      label: { ka: 'საწყისი პრომპტი', en: 'Base prompt', ru: 'Исходный промпт' },
      placeholder: { ka: 'ჩასვი პრომპტი, რომელიც უნდა გაუმჯობესდეს…', en: 'Paste the prompt to improve…', ru: 'Вставьте промпт, который нужно улучшить…' },
    },
    {
      id: 'target', type: 'select',
      label: { ka: 'სამიზნე მოდელი', en: 'Target model', ru: 'Целевая модель' },
      options: [
        { value: 'gpt4', label: { ka: 'GPT-4o (ჩატი)', en: 'GPT-4o (chat)', ru: 'GPT-4o (чат)' } },
        { value: 'claude', label: { ka: 'Claude (ჩატი)', en: 'Claude (chat)', ru: 'Claude (чат)' } },
        { value: 'gemini', label: { ka: 'Gemini (ჩატი)', en: 'Gemini (chat)', ru: 'Gemini (чат)' } },
        { value: 'flux', label: { ka: 'FLUX (სურათი)', en: 'FLUX (image)', ru: 'FLUX (изображение)' } },
        { value: 'midjourney', label: { ka: 'Midjourney (სურათი)', en: 'Midjourney (image)', ru: 'Midjourney (изображение)' } },
        { value: 'dalle', label: { ka: 'DALL-E (სურათი)', en: 'DALL-E (image)', ru: 'DALL-E (изображение)' } },
        { value: 'kling', label: { ka: 'Kling (ვიდეო)', en: 'Kling (video)', ru: 'Kling (видео)' } },
        { value: 'sora', label: { ka: 'Sora (ვიდეო)', en: 'Sora (video)', ru: 'Sora (видео)' } },
      ],
      defaultValue: 'gpt4',
    },
    {
      id: 'style', type: 'select',
      label: { ka: 'როგორი იყოს', en: 'Optimization style', ru: 'Стиль оптимизации' },
      options: [
        { value: 'detailed', label: { ka: 'დეტალური და კონკრეტული', en: 'Detailed and specific', ru: 'Подробный и конкретный' } },
        { value: 'concise', label: { ka: 'მოკლე და პირდაპირი', en: 'Concise and direct', ru: 'Краткий и прямой' } },
        { value: 'creative', label: { ka: 'კრეატიული და ექსპრესიული', en: 'Creative and expressive', ru: 'Креативный и выразительный' } },
        { value: 'technical', label: { ka: 'ტექნიკური და ზუსტი', en: 'Technical and precise', ru: 'Технический и точный' } },
        { value: 'cinematic', label: { ka: 'კინემატოგრაფიული (ვიზუალი)', en: 'Cinematic (visual)', ru: 'Кинематографичный (визуал)' } },
      ],
      defaultValue: 'detailed',
    },
  ],
  actionLabel: { ka: 'პრომპტის გაუმჯობესება', en: 'Improve the prompt', ru: 'Улучшить промпт' },
  previewHint: { ka: 'გაუმჯობესებული პრომპტი აქ გამოჩნდება — კოპირებისთვის მზად', en: 'The improved prompt appears here, ready to copy', ru: 'Улучшенный промпт появится здесь — готовым к копированию' },
  route: { kind: 'pipeline', serviceId: 'prompt-builder', output: 'text' },
};

const LANGUAGE_OPTIONS: WorkspaceOption[] = [
  { value: 'ka', label: same('ქართული') },
  { value: 'en', label: same('English') },
  { value: 'ru', label: same('Русский') },
];

export const SERVICE_FORMS: Readonly<Record<string, ServiceForm>> = {
  // The two prompt pages are one service: `prompt` used to answer with a canned „generic preview" line after a fake
  // 1.2 s wait; it now runs the real prompt builder.
  prompt: PROMPT_BUILDER,
  'prompt-builder': PROMPT_BUILDER,

  tourism: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'სად მიდიხარ?', en: 'Where are you going?', ru: 'Куда вы едете?' },
        placeholder: { ka: 'ქალაქი ან ქვეყანა, თარიღები, რა გაინტერესებს…', en: 'A city or country, dates, what you are into…', ru: 'Город или страна, даты, что вам интересно…' },
      },
      {
        id: 'type', type: 'select',
        label: { ka: 'გეგმის ტიპი', en: 'Plan type', ru: 'Тип плана' },
        options: [
          { value: 'itinerary', label: { ka: 'სრული მარშრუტი', en: 'Full itinerary', ru: 'Полный маршрут' } },
          { value: 'guide', label: { ka: 'ადგილობრივი გიდი', en: 'Local guide', ru: 'Местный гид' } },
          { value: 'budget', label: { ka: 'ბიუჯეტის გეგმა', en: 'Budget plan', ru: 'План бюджета' } },
          { value: 'hidden_gems', label: { ka: 'ნაკლებად ცნობილი ადგილები', en: 'Hidden gems', ru: 'Скрытые жемчужины' } },
          { value: 'weekend', label: { ka: 'შაბათ-კვირის გასვლა', en: 'Weekend escape', ru: 'Поездка на выходные' } },
        ],
        defaultValue: 'itinerary',
      },
      {
        id: 'duration', type: 'select',
        label: { ka: 'ხანგრძლივობა', en: 'Duration', ru: 'Длительность' },
        options: [
          { value: '1', label: { ka: '1 დღე', en: '1 day', ru: '1 день' } },
          { value: '3', label: { ka: '3 დღე', en: '3 days', ru: '3 дня' } },
          { value: '5', label: { ka: '5 დღე', en: '5 days', ru: '5 дней' } },
          { value: '7', label: { ka: '1 კვირა', en: '1 week', ru: '1 неделя' } },
          { value: '14', label: { ka: '2 კვირა', en: '2 weeks', ru: '2 недели' } },
        ],
        defaultValue: '5',
      },
      {
        id: 'style', type: 'select',
        label: { ka: 'მოგზაურობის სტილი', en: 'Travel style', ru: 'Стиль поездки' },
        options: [
          { value: 'cultural', label: { ka: 'კულტურა და ისტორია', en: 'Culture and history', ru: 'Культура и история' } },
          { value: 'adventure', label: { ka: 'თავგადასავალი და ბუნება', en: 'Adventure and outdoors', ru: 'Приключения и природа' } },
          { value: 'luxury', label: { ka: 'ლუქსი და კომფორტი', en: 'Luxury and comfort', ru: 'Роскошь и комфорт' } },
          { value: 'backpacker', label: { ka: 'ეკონომიური მოგზაურობა', en: 'Backpacker / budget', ru: 'Бэкпекинг / эконом' } },
          { value: 'family', label: { ka: 'ოჯახისთვის', en: 'Family-friendly', ru: 'Для семьи' } },
          { value: 'food', label: { ka: 'გასტრონომია', en: 'Food and cuisine', ru: 'Гастрономия' } },
        ],
        defaultValue: 'cultural',
      },
    ],
    actionLabel: { ka: 'მოგზაურობის დაგეგმვა', en: 'Plan my trip', ru: 'Спланировать поездку' },
    previewHint: { ka: 'შენი მოგზაურობის გეგმა აქ გამოჩნდება', en: 'Your travel plan appears here', ru: 'Ваш план поездки появится здесь' },
    route: { kind: 'pipeline', serviceId: 'tourism', output: 'text' },
  },

  'content-writer': {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'თემა და ბრიფი', en: 'Topic and brief', ru: 'Тема и бриф' },
        placeholder: { ka: 'რა უნდა დაიწეროს — თემა, აუდიტორია, მთავარი აზრები…', en: 'What to write: the topic, the audience, the key points…', ru: 'Что написать: тема, аудитория, ключевые мысли…' },
      },
      {
        id: 'type', type: 'select',
        label: { ka: 'ტექსტის ტიპი', en: 'Content type', ru: 'Тип текста' },
        options: [
          { value: 'article', label: { ka: 'ბლოგის სტატია', en: 'Blog article', ru: 'Статья для блога' } },
          { value: 'seo', label: { ka: 'SEO სტატია', en: 'SEO article', ru: 'SEO-статья' } },
          { value: 'social', label: { ka: 'პოსტი სოციალური ქსელისთვის', en: 'Social media post', ru: 'Пост для соцсетей' } },
          { value: 'email', label: { ka: 'ელფოსტის კამპანია', en: 'Email campaign', ru: 'Email-рассылка' } },
          { value: 'ad', label: { ka: 'სარეკლამო ტექსტი', en: 'Ad copy', ru: 'Рекламный текст' } },
          { value: 'product', label: { ka: 'პროდუქტის აღწერა', en: 'Product description', ru: 'Описание товара' } },
        ],
        defaultValue: 'article',
      },
      {
        id: 'tone', type: 'select',
        label: { ka: 'ტონი', en: 'Tone', ru: 'Тон' },
        options: [
          { value: 'professional', label: { ka: 'პროფესიული', en: 'Professional', ru: 'Деловой' } },
          { value: 'casual', label: { ka: 'თავისუფალი და მეგობრული', en: 'Casual and friendly', ru: 'Непринуждённый' } },
          { value: 'persuasive', label: { ka: 'დამაჯერებელი', en: 'Persuasive', ru: 'Убедительный' } },
          { value: 'educational', label: { ka: 'საგანმანათლებლო', en: 'Educational', ru: 'Обучающий' } },
          { value: 'creative', label: { ka: 'კრეატიული და თამამი', en: 'Creative and bold', ru: 'Креативный и смелый' } },
        ],
        defaultValue: 'professional',
      },
      { id: 'language', type: 'select', label: { ka: 'ენა', en: 'Language', ru: 'Язык' }, options: LANGUAGE_OPTIONS, defaultValue: 'ka' },
    ],
    actionLabel: { ka: 'ტექსტის დაწერა', en: 'Write it', ru: 'Написать текст' },
    previewHint: { ka: 'ტექსტი აქ გამოჩნდება', en: 'Your text appears here', ru: 'Текст появится здесь' },
    route: { kind: 'pipeline', serviceId: 'content-writer', output: 'text' },
  },

  podcast: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'ეპიზოდის თემა', en: 'Episode topic', ru: 'Тема выпуска' },
        placeholder: { ka: 'რაზეა ეპიზოდი — მთავარი თემები, სტუმრები, განწყობა…', en: 'What the episode is about: the key points, guests, mood…', ru: 'О чём выпуск: ключевые темы, гости, настроение…' },
      },
      {
        id: 'format', type: 'select',
        label: { ka: 'ფორმატი', en: 'Format', ru: 'Формат' },
        options: [
          { value: 'interview', label: { ka: 'ინტერვიუ', en: 'Interview', ru: 'Интервью' } },
          { value: 'solo', label: { ka: 'სოლო მონოლოგი', en: 'Solo monologue', ru: 'Сольный монолог' } },
          { value: 'panel', label: { ka: 'პანელური დისკუსია', en: 'Panel discussion', ru: 'Панельная дискуссия' } },
          { value: 'storytelling', label: { ka: 'მხატვრული თხრობა', en: 'Narrative storytelling', ru: 'Сторителлинг' } },
          { value: 'educational', label: { ka: 'სასწავლო / ინსტრუქცია', en: 'Educational / how-to', ru: 'Обучающий / инструкция' } },
        ],
        defaultValue: 'interview',
      },
      {
        id: 'duration', type: 'select',
        label: { ka: 'სიგრძე', en: 'Length', ru: 'Длительность' },
        options: [
          { value: '5', label: { ka: '5 წუთი', en: '5 minutes', ru: '5 минут' } },
          { value: '15', label: { ka: '15 წუთი', en: '15 minutes', ru: '15 минут' } },
          { value: '30', label: { ka: '30 წუთი', en: '30 minutes', ru: '30 минут' } },
          { value: '60', label: { ka: '1 საათი', en: '1 hour', ru: '1 час' } },
        ],
        defaultValue: '30',
      },
      {
        id: 'tone', type: 'select',
        label: { ka: 'ტონი', en: 'Tone', ru: 'Тон' },
        options: [
          { value: 'conversational', label: { ka: 'სასაუბრო', en: 'Conversational', ru: 'Разговорный' } },
          { value: 'professional', label: { ka: 'პროფესიული', en: 'Professional', ru: 'Деловой' } },
          { value: 'entertaining', label: { ka: 'გასართობი', en: 'Entertaining', ru: 'Развлекательный' } },
          { value: 'investigative', label: { ka: 'გამოძიებითი', en: 'Investigative', ru: 'Расследование' } },
        ],
        defaultValue: 'conversational',
      },
    ],
    actionLabel: { ka: 'სცენარის დაწერა', en: 'Write the script', ru: 'Написать сценарий' },
    previewHint: { ka: 'ეპიზოდის სრული სცენარი აქ გამოჩნდება', en: 'The full episode script appears here', ru: 'Полный сценарий выпуска появится здесь' },
    route: { kind: 'pipeline', serviceId: 'podcast', output: 'text' },
  },

  character: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'პერსონაჟის იდეა', en: 'Character concept', ru: 'Идея персонажа' },
        placeholder: { ka: 'როლი, ხასიათი, გარემო, მიზანი…', en: 'Role, personality, setting, purpose…', ru: 'Роль, характер, окружение, цель…' },
      },
      {
        id: 'archetype', type: 'select',
        label: { ka: 'არქეტიპი', en: 'Archetype', ru: 'Архетип' },
        options: [
          { value: 'hero', label: { ka: 'გმირი / მთავარი პერსონაჟი', en: 'Hero / protagonist', ru: 'Герой / протагонист' } },
          { value: 'villain', label: { ka: 'ბოროტმოქმედი / ანტაგონისტი', en: 'Villain / antagonist', ru: 'Злодей / антагонист' } },
          { value: 'mentor', label: { ka: 'მენტორი / მეგზური', en: 'Mentor / guide', ru: 'Наставник / проводник' } },
          { value: 'trickster', label: { ka: 'ცბიერი / ხუმარა', en: 'Trickster / joker', ru: 'Трикстер / шут' } },
          { value: 'npc', label: { ka: 'NPC / მეორეხარისხოვანი', en: 'NPC / supporting', ru: 'NPC / второстепенный' } },
          { value: 'ai', label: { ka: 'AI პერსონაჟი', en: 'AI character', ru: 'ИИ-персонаж' } },
        ],
        defaultValue: 'hero',
      },
      {
        id: 'world', type: 'select',
        label: { ka: 'სამყარო', en: 'World / setting', ru: 'Мир / сеттинг' },
        options: [
          { value: 'fantasy', label: { ka: 'ფენტეზი', en: 'Fantasy', ru: 'Фэнтези' } },
          { value: 'scifi', label: { ka: 'სამეცნიერო ფანტასტიკა', en: 'Sci-fi', ru: 'Научная фантастика' } },
          { value: 'modern', label: { ka: 'თანამედროვეობა', en: 'Modern day', ru: 'Современность' } },
          { value: 'historical', label: { ka: 'ისტორიული', en: 'Historical', ru: 'Исторический' } },
          { value: 'post_apocalyptic', label: { ka: 'პოსტაპოკალიფსი', en: 'Post-apocalyptic', ru: 'Постапокалипсис' } },
          { value: 'georgian', label: { ka: 'ქართული ფოლკლორი და კულტურა', en: 'Georgian folklore and culture', ru: 'Грузинский фольклор и культура' } },
        ],
        defaultValue: 'fantasy',
      },
      {
        id: 'depth', type: 'select',
        label: { ka: 'დეტალიზაცია', en: 'Detail level', ru: 'Детализация' },
        options: [
          { value: 'brief', label: { ka: 'მოკლე მიმოხილვა', en: 'Brief overview', ru: 'Краткий обзор' } },
          { value: 'standard', label: { ka: 'სტანდარტული პროფილი', en: 'Standard profile', ru: 'Стандартный профиль' } },
          { value: 'deep', label: { ka: 'სრული პროფილი და დიალოგი', en: 'Deep profile and dialogue', ru: 'Подробный профиль и диалог' } },
        ],
        defaultValue: 'standard',
      },
    ],
    actionLabel: { ka: 'პერსონაჟის შექმნა', en: 'Create the character', ru: 'Создать персонажа' },
    previewHint: { ka: 'პერსონაჟის პროფილი აქ გამოჩნდება', en: 'The character profile appears here', ru: 'Профиль персонажа появится здесь' },
    route: { kind: 'pipeline', serviceId: 'character', output: 'text' },
  },

  event: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'ღონისძიების აღწერა', en: 'Event description', ru: 'Описание мероприятия' },
        placeholder: { ka: 'ტიპი, აუდიტორია, თემა, თარიღი, მიზანი…', en: 'Type, audience, theme, date, goals…', ru: 'Тип, аудитория, тема, дата, цели…' },
      },
      {
        id: 'type', type: 'select',
        label: { ka: 'ღონისძიების ტიპი', en: 'Event type', ru: 'Тип мероприятия' },
        options: [
          { value: 'conference', label: { ka: 'კონფერენცია / სამიტი', en: 'Conference / summit', ru: 'Конференция / саммит' } },
          { value: 'wedding', label: { ka: 'ქორწილი', en: 'Wedding', ru: 'Свадьба' } },
          { value: 'concert', label: { ka: 'კონცერტი / ფესტივალი', en: 'Concert / festival', ru: 'Концерт / фестиваль' } },
          { value: 'corporate', label: { ka: 'კორპორატიული ღონისძიება', en: 'Corporate event', ru: 'Корпоративное мероприятие' } },
          { value: 'launch', label: { ka: 'პროდუქტის წარდგენა', en: 'Product launch', ru: 'Запуск продукта' } },
          { value: 'birthday', label: { ka: 'დაბადების დღე / ზეიმი', en: 'Birthday / celebration', ru: 'День рождения / праздник' } },
          { value: 'gala', label: { ka: 'გალა / დაჯილდოება', en: 'Gala / award ceremony', ru: 'Гала / церемония награждения' } },
        ],
        defaultValue: 'conference',
      },
      {
        id: 'output', type: 'select',
        label: { ka: 'რა მოვამზადოთ', en: 'What to make', ru: 'Что подготовить' },
        options: [
          { value: 'program', label: { ka: 'სრული პროგრამა', en: 'Full event program', ru: 'Полная программа' } },
          { value: 'mc_script', label: { ka: 'წამყვანის სცენარი', en: 'MC / host script', ru: 'Сценарий ведущего' } },
          { value: 'invitation', label: { ka: 'მოსაწვევის ტექსტი', en: 'Invitation text', ru: 'Текст приглашения' } },
          { value: 'promo', label: { ka: 'სარეკლამო ტექსტების პაკეტი', en: 'Promo copy pack', ru: 'Пакет промо-текстов' } },
          { value: 'full', label: { ka: 'ყველაფერი ერთად', en: 'Everything (full pack)', ru: 'Всё вместе (полный пакет)' } },
        ],
        defaultValue: 'full',
      },
    ],
    actionLabel: { ka: 'მასალების მომზადება', en: 'Prepare the materials', ru: 'Подготовить материалы' },
    previewHint: { ka: 'ღონისძიების მასალები აქ გამოჩნდება', en: 'The event materials appear here', ru: 'Материалы мероприятия появятся здесь' },
    route: { kind: 'pipeline', serviceId: 'event', output: 'text' },
  },

  terminal: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'დავალება', en: 'Task', ru: 'Задача' },
        placeholder: { ka: 'რა უნდა დაიწეროს — ფუნქცია, სკრიპტი, API, ალგორითმი…', en: 'What to code: a function, a script, an API, an algorithm…', ru: 'Что написать: функцию, скрипт, API, алгоритм…' },
      },
      {
        id: 'language', type: 'select',
        label: { ka: 'ენა / ფრეიმვორქი', en: 'Language / framework', ru: 'Язык / фреймворк' },
        options: [
          { value: 'typescript', label: same('TypeScript') },
          { value: 'python', label: same('Python') },
          { value: 'javascript', label: same('JavaScript') },
          { value: 'react', label: same('React / Next.js') },
          { value: 'swift', label: same('Swift (iOS)') },
          { value: 'kotlin', label: same('Kotlin (Android)') },
          { value: 'go', label: same('Go') },
          { value: 'rust', label: same('Rust') },
          { value: 'bash', label: same('Bash / Shell') },
          { value: 'sql', label: same('SQL') },
        ],
        defaultValue: 'typescript',
      },
      {
        id: 'style', type: 'select',
        label: { ka: 'კოდის სტილი', en: 'Code style', ru: 'Стиль кода' },
        options: [
          { value: 'production', label: { ka: 'მზად წარმოებისთვის', en: 'Production-ready', ru: 'Готов к продакшену' } },
          { value: 'minimal', label: { ka: 'მინიმალური და სუფთა', en: 'Minimal and clean', ru: 'Минимальный и чистый' } },
          { value: 'commented', label: { ka: 'დეტალური კომენტარებით', en: 'Heavily commented', ru: 'С подробными комментариями' } },
          { value: 'tests', label: { ka: 'ტესტებით', en: 'With tests', ru: 'С тестами' } },
        ],
        defaultValue: 'production',
      },
    ],
    actionLabel: { ka: 'კოდის დაწერა', en: 'Write the code', ru: 'Написать код' },
    previewHint: { ka: 'კოდი აქ გამოჩნდება', en: 'The code appears here', ru: 'Код появится здесь' },
    route: { kind: 'pipeline', serviceId: 'terminal', output: 'text' },
  },

  game: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'თამაშის იდეა', en: 'Game concept', ru: 'Идея игры' },
        placeholder: { ka: 'პერსონაჟები, სამყარო, მექანიკა, ვისთვისაა…', en: 'Characters, world, mechanics, who it is for…', ru: 'Персонажи, мир, механика, для кого игра…' },
      },
      {
        id: 'genre', type: 'select',
        label: { ka: 'ჟანრი', en: 'Genre', ru: 'Жанр' },
        options: [
          { value: 'puzzle', label: { ka: 'თავსატეხი', en: 'Puzzle', ru: 'Головоломка' } },
          { value: 'rpg', label: same('RPG') },
          { value: 'arcade', label: { ka: 'არკადა', en: 'Arcade', ru: 'Аркада' } },
          { value: 'simulation', label: { ka: 'სიმულატორი', en: 'Simulation', ru: 'Симулятор' } },
          { value: 'platformer', label: { ka: 'პლატფორმერი', en: 'Platformer', ru: 'Платформер' } },
          { value: 'strategy', label: { ka: 'სტრატეგია / RTS', en: 'Strategy / RTS', ru: 'Стратегия / RTS' } },
          { value: 'shooter', label: { ka: 'შუთერი / FPS', en: 'Shooter / FPS', ru: 'Шутер / FPS' } },
          { value: 'horror', label: { ka: 'ჰორორი / გადარჩენა', en: 'Horror / survival', ru: 'Хоррор / выживание' } },
          { value: 'adventure', label: { ka: 'თავგადასავალი', en: 'Adventure', ru: 'Приключения' } },
          { value: 'fighting', label: { ka: 'ფაიტინგი', en: 'Fighting', ru: 'Файтинг' } },
        ],
        defaultValue: 'rpg',
      },
      {
        id: 'platform', type: 'select',
        label: { ka: 'პლატფორმა', en: 'Platform', ru: 'Платформа' },
        options: [
          { value: 'mobile', label: { ka: 'მობილური (iOS/Android)', en: 'Mobile (iOS/Android)', ru: 'Мобильные (iOS/Android)' } },
          { value: 'pc', label: { ka: 'კომპიუტერი / Steam', en: 'PC / Steam', ru: 'ПК / Steam' } },
          { value: 'web', label: { ka: 'ბრაუზერი', en: 'Web browser', ru: 'Браузер' } },
          { value: 'console', label: { ka: 'კონსოლი', en: 'Console', ru: 'Консоль' } },
          { value: 'cross', label: { ka: 'ყველა პლატფორმა', en: 'Cross-platform', ru: 'Кроссплатформенная' } },
        ],
        defaultValue: 'mobile',
      },
      {
        id: 'art_style', type: 'select',
        label: { ka: 'ვიზუალური სტილი', en: 'Art style', ru: 'Визуальный стиль' },
        options: [
          { value: 'pixel', label: { ka: 'პიქსელ-არტი', en: 'Pixel art', ru: 'Пиксель-арт' } },
          { value: 'cartoon', label: { ka: 'მულტიპლიკაციური / 2D', en: 'Cartoon / 2D', ru: 'Мультяшный / 2D' } },
          { value: 'realistic', label: { ka: 'რეალისტური 3D', en: 'Realistic 3D', ru: 'Реалистичный 3D' } },
          { value: 'low_poly', label: { ka: 'დაბალპოლიგონური 3D', en: 'Low-poly 3D', ru: 'Низкополигональный 3D' } },
          { value: 'stylized', label: { ka: 'სტილიზებული / cel-shading', en: 'Stylized / cel-shaded', ru: 'Стилизованный / cel-shading' } },
          { value: 'anime', label: { ka: 'ანიმე / მანგა', en: 'Anime / manga', ru: 'Аниме / манга' } },
        ],
        defaultValue: 'pixel',
      },
    ],
    actionLabel: { ka: 'თამაშის დიზაინის შექმნა', en: 'Create the game design', ru: 'Создать дизайн игры' },
    previewHint: { ka: 'თამაშის დიზაინის დოკუმენტი (GDD) აქ გამოჩნდება', en: 'The game design document (GDD) appears here', ru: 'Дизайн-документ игры (GDD) появится здесь' },
    route: { kind: 'pipeline', serviceId: 'game', output: 'text' },
  },

  voice: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'გასახმოვანებელი ტექსტი', en: 'Text to speak', ru: 'Текст для озвучки' },
        placeholder: { ka: 'ჩაწერე ტექსტი, რომელიც ხმად უნდა იქცეს…', en: 'Type the text to turn into speech…', ru: 'Введите текст, который нужно озвучить…' },
      },
      {
        id: 'voice_style', type: 'select',
        label: { ka: 'ხმის სტილი', en: 'Voice style', ru: 'Стиль голоса' },
        options: [
          { value: 'neutral', label: { ka: 'ნეიტრალური / ბუნებრივი', en: 'Neutral / natural', ru: 'Нейтральный / естественный' } },
          { value: 'warm', label: { ka: 'თბილი და მეგობრული', en: 'Warm and friendly', ru: 'Тёплый и дружелюбный' } },
          { value: 'professional', label: { ka: 'პროფესიული', en: 'Professional', ru: 'Деловой' } },
          { value: 'dramatic', label: { ka: 'დრამატული / ექსპრესიული', en: 'Dramatic / expressive', ru: 'Драматичный / выразительный' } },
          { value: 'calm', label: { ka: 'მშვიდი', en: 'Calm and soothing', ru: 'Спокойный' } },
        ],
        defaultValue: 'neutral',
      },
      { id: 'language', type: 'select', label: { ka: 'ენა', en: 'Language', ru: 'Язык' }, options: LANGUAGE_OPTIONS, defaultValue: 'ka' },
    ],
    actionLabel: { ka: 'გახმოვანება', en: 'Make the voiceover', ru: 'Озвучить' },
    previewHint: { ka: 'აუდიო აქ დაიკვრება', en: 'The audio plays here', ru: 'Аудио появится здесь' },
    route: { kind: 'pipeline', serviceId: 'voice', output: 'audio' },
  },

  software: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'რა ავაწყოთ', en: 'What to build', ru: 'Что создать' },
        placeholder: { ka: 'აღწერე ფუნქცია, აპლიკაცია ან ინტეგრაცია…', en: 'Describe the feature, app or integration…', ru: 'Опишите функцию, приложение или интеграцию…' },
      },
      {
        id: 'language', type: 'select',
        label: { ka: 'ენა', en: 'Language', ru: 'Язык' },
        options: [
          { value: 'typescript', label: same('TypeScript') },
          { value: 'python', label: same('Python') },
          { value: 'react', label: same('React') },
          { value: 'swift', label: same('Swift') },
        ],
        defaultValue: 'typescript',
      },
    ],
    actionLabel: { ka: 'კოდის დაწერა', en: 'Write the code', ru: 'Написать код' },
    previewHint: { ka: 'კოდი აქ გამოჩნდება', en: 'The code appears here', ru: 'Код появится здесь' },
    route: { kind: 'code' },
  },

  business: {
    fields: [
      {
        id: 'prompt', type: 'textarea',
        label: { ka: 'ბიზნეს-კითხვა', en: 'Business question', ru: 'Бизнес-вопрос' },
        placeholder: { ka: 'რა უნდა გაიგო — ბაზარი, კონკურენტები, ფინანსები…', en: 'What you need to know: a market, competitors, numbers…', ru: 'Что нужно узнать: рынок, конкуренты, финансы…' },
      },
      {
        id: 'type', type: 'select',
        label: { ka: 'ანგარიშის ტიპი', en: 'Report type', ru: 'Тип отчёта' },
        options: [
          { value: 'market', label: { ka: 'ბაზრის კვლევა', en: 'Market research', ru: 'Исследование рынка' } },
          { value: 'pitch', label: { ka: 'საინვესტიციო პრეზენტაცია', en: 'Pitch deck', ru: 'Питч-дек' } },
          { value: 'financial', label: { ka: 'ფინანსური მოდელი', en: 'Financial model', ru: 'Финансовая модель' } },
          { value: 'competitor', label: { ka: 'კონკურენტების ანალიზი', en: 'Competitor analysis', ru: 'Анализ конкурентов' } },
        ],
        defaultValue: 'market',
      },
    ],
    actionLabel: { ka: 'ანგარიშის მომზადება', en: 'Prepare the report', ru: 'Подготовить отчёт' },
    previewHint: { ka: 'ანგარიში აქ გამოჩნდება', en: 'The report appears here', ru: 'Отчёт появится здесь' },
    route: { kind: 'business-chat' },
  },
};

/** What the page for `slug` offers: its own form, or the studio tool it opens (the chat when nothing else fits). */
export function servicePlan(slug: string): ServicePlan {
  const form = Object.prototype.hasOwnProperty.call(SERVICE_FORMS, slug) ? SERVICE_FORMS[slug] : undefined;
  if (form) return { kind: 'form', form };
  const tool = SERVICE_STUDIO_TOOL[slug];
  return { kind: 'studio', tool: isToolId(tool) ? tool : 'chat' };
}

/** The studio, opened on `tool` (OmniStudio reads `?tool=` once and removes it). */
export function studioToolHref(locale: string, tool: ToolId): string {
  return `/${workspaceLang(locale)}/dashboard?tool=${tool}`;
}

/** Every field's starting value — what the route receives for a select the user never touched. */
export function formDefaults(form: ServiceForm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of form.fields) if (f.defaultValue !== undefined) out[f.id] = f.defaultValue;
  return out;
}

/**
 * The request a form sends — the same route and body shape the page sent before this file existed; `locale` is new on
 * the pipeline (its schema already took it and defaulted to 'ka', so /en and /ru pages got Georgian answers).
 */
export function buildGenerateRequest(
  form: ServiceForm,
  values: Record<string, string>,
  opts: { sessionId: string; locale: WorkspaceLang },
): { path: string; body: Record<string, unknown> } {
  const prompt = String(values.prompt ?? '').trim();
  const route = form.route;
  if (route.kind === 'code') {
    return {
      path: '/api/orbit/code-generation',
      body: { prompt, language: String(values.language || 'typescript'), framework: 'MyAvatar workspace' },
    };
  }
  if (route.kind === 'business-chat') {
    const reportType = String(values.type || 'market');
    return {
      path: '/api/chat',
      body: {
        message: `${prompt}\n\nReport type: ${reportType}. Return an executive summary, key findings, risks, and concrete next actions.`,
        context: 'business',
        serviceId: 'business',
        language: opts.locale,
        locale: opts.locale,
      },
    };
  }
  const answers: Record<string, string> = {};
  for (const f of form.fields) {
    if (f.id === 'prompt') continue;
    const v = values[f.id];
    if (v !== undefined) answers[f.id] = String(v);
  }
  return {
    path: '/api/pipeline',
    body: { action: 'generate', serviceId: route.serviceId, sessionId: opts.sessionId, userInput: prompt, answers, locale: opts.locale },
  };
}

// ── reading the answers ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

/** `{ data: {...} }` envelopes and bare bodies alike. */
export function unwrapApiData(payload: unknown): JsonRecord {
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as JsonRecord;
  if (record.data && typeof record.data === 'object') return record.data as JsonRecord;
  return record;
}

/**
 * The sentence to show for a failed request, or null when the body carries none. A snake_case `error` is a CODE
 * („auth_required", „video_moved") — the body's own `message` is the sentence then.
 */
export function apiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as JsonRecord;
  const error = typeof record.error === 'string' ? record.error.trim() : '';
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (error && message && /^[a-z0-9_]+$/.test(error)) return message;
  if (error) return error;
  if (message) return message;
  if (record.data && typeof record.data === 'object') return apiErrorMessage(record.data);
  return null;
}

/** A 401 from lib/auth/generationGate (`authRequired: true`) — the page offers „შესვლა" instead of a dead end. */
export function isAuthRequired(status: number, payload: unknown): boolean {
  if (status === 401) return true;
  return !!payload && typeof payload === 'object' && (payload as JsonRecord).authRequired === true;
}

export function extractOutputUrl(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.startsWith('http') || payload.startsWith('data:') ? payload : null;
  if (Array.isArray(payload)) return extractOutputUrl(payload[0]);
  if (typeof payload === 'object') {
    const record = payload as JsonRecord;
    for (const key of ['result_url', 'url', 'audio', 'audioUrl', 'output']) {
      const value = record[key];
      if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) return value;
    }
    if (record.normalized && typeof record.normalized === 'object') return extractOutputUrl(record.normalized);
  }
  return null;
}

export function extractOutputText(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    const values = payload.filter((item): item is string => typeof item === 'string');
    return values.length > 0 ? values.join('\n') : null;
  }
  if (typeof payload === 'object') {
    const record = payload as JsonRecord;
    for (const key of ['response', 'result', 'output', 'detail', 'text', 'summary']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) return value;
    }
    if (record.normalized && typeof record.normalized === 'object') return extractOutputText(record.normalized);
  }
  return null;
}
