/**
 * Single source of truth for all MyAvatar.ge services.
 *
 * Every component that renders service information (FeatureGrid, SuggestionCards,
 * SearchBar, SidebarMenu, services page) should import from here.
 */

export type ServiceCategory = 'create' | 'edit' | 'analyze' | 'automate' | 'scale';

export interface ServiceDefinition {
  slug: string;
  /** Emoji icon fallback — used where inline SVG isn't practical */
  icon: string;
  title: { en: string; ka: string; ru: string };
  description: { en: string; ka: string; ru: string };
  category: ServiceCategory;
}

/* ─── 16 Services ────────────────────────────────────────────────── */

export const SERVICES: ServiceDefinition[] = [
  {
    slug: 'avatar',
    icon: '👤',
    title: { en: 'Avatar Studio', ka: 'ავატარ სტუდია', ru: 'Аватар-студия' },
    description: {
      en: 'Create photorealistic digital humans and identity assets',
      ka: 'შექმენი ფოტორეალისტური ციფრული ადამიანები',
      ru: 'Создайте фотореалистичные цифровые аватары',
    },
    category: 'create',
  },
  {
    slug: 'video',
    icon: '🎬',
    title: { en: 'Video Generation', ka: 'ვიდეო გენერაცია', ru: 'Генерация видео' },
    description: {
      en: 'Generate cinematic AI video from text or image prompts',
      ka: 'შექმენი კინემატოგრაფიული ვიდეო ტექსტიდან ან სურათიდან',
      ru: 'Генерируйте кинематографическое видео из текста или изображения',
    },
    category: 'create',
  },
  {
    slug: 'image',
    icon: '🖼️',
    title: { en: 'Image Generation', ka: 'სურათის გენერაცია', ru: 'Генерация изображений' },
    description: {
      en: 'Create campaign-grade visuals and commercial imagery',
      ka: 'შექმენი კამპანიის დონის ვიზუალი და კომერციული სურათები',
      ru: 'Создайте визуалы коммерческого качества',
    },
    category: 'create',
  },
  {
    slug: 'music',
    icon: '🎵',
    title: { en: 'Music Production', ka: 'მუსიკის პროდაქშენი', ru: 'Музыкальное производство' },
    description: {
      en: 'Compose original beats, scores, and soundscapes with AI',
      ka: 'შექმენი ორიგინალური ბითები და საუნდსკეიფები',
      ru: 'Создавайте оригинальные биты и саундскейпы',
    },
    category: 'create',
  },
  {
    slug: 'text',
    icon: '✍️',
    title: { en: 'Text & Copy', ka: 'ტექსტი და კოპი', ru: 'Текст и копирайтинг' },
    description: {
      en: 'Write marketing copy, scripts, articles, and translations',
      ka: 'დაწერე მარკეტინგული ტექსტი, სცენარები და თარგმანები',
      ru: 'Пишите маркетинговые тексты, сценарии и переводы',
    },
    category: 'create',
  },
  {
    slug: 'editing',
    icon: '✂️',
    title: { en: 'Video Editing', ka: 'ვიდეო ედიტინგი', ru: 'Видеомонтаж' },
    description: {
      en: 'Professional post-production, colour grading, and assembly',
      ka: 'პროფესიონალური პოსტ-პროდაქშენი და კოლორ გრეიდინგი',
      ru: 'Профессиональный постпродакшн и цветокоррекция',
    },
    category: 'edit',
  },
  {
    slug: 'photo',
    icon: '📷',
    title: { en: 'Photo Enhancement', ka: 'ფოტოს გაუმჯობესება', ru: 'Улучшение фото' },
    description: {
      en: 'Upscale, retouch, and enhance photos to studio quality',
      ka: 'გაზარდე, რეტუშირე და გააუმჯობესე ფოტოები',
      ru: 'Масштабируйте, ретушируйте и улучшайте фото',
    },
    category: 'edit',
  },
  {
    slug: 'visual-intel',
    icon: '🔍',
    title: { en: 'Visual Intelligence', ka: 'ვიზუალური ინტელექტი', ru: 'Визуальный ИИ' },
    description: {
      en: 'Analyze, tag, and extract insights from images and video',
      ka: 'გაანალიზე, მოანიშნე და ამოიღე ინფორმაცია სურათებიდან',
      ru: 'Анализируйте, тегируйте и извлекайте данные из изображений',
    },
    category: 'analyze',
  },
  {
    slug: 'prompt',
    icon: '💡',
    title: { en: 'Prompt Engineering', ka: 'პრომპტ ინჟინერია', ru: 'Промпт-инженерия' },
    description: {
      en: 'Craft and optimise prompts for maximum AI output quality',
      ka: 'შექმენი და ოპტიმიზე პრომპტები მაქსიმალური ხარისხისთვის',
      ru: 'Создавайте и оптимизируйте промпты для максимального качества',
    },
    category: 'analyze',
  },
  {
    slug: 'media',
    icon: '📊',
    title: { en: 'Media Production', ka: 'მედია პროდაქშენი', ru: 'Медиа-продакшн' },
    description: {
      en: 'Multi-format content hub — video, image, audio, text in one',
      ka: 'მულტიფორმატის კონტენტ ჰაბი — ვიდეო, სურათი, აუდიო, ტექსტი',
      ru: 'Мультиформатный хаб — видео, изображения, аудио, текст',
    },
    category: 'analyze',
  },
  {
    slug: 'workflow',
    icon: '⚡',
    title: { en: 'Workflow Builder', ka: 'ვორქფლოუ ბილდერი', ru: 'Конструктор воркфлоу' },
    description: {
      en: 'Build automated multi-step AI pipelines visually',
      ka: 'ააწყვე ავტომატიზირებული მრავალსაფეხურიანი AI პაიპლაინები',
      ru: 'Создавайте автоматизированные многоступенчатые пайплайны',
    },
    category: 'automate',
  },
  {
    slug: 'agent-g',
    icon: '🤖',
    title: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    description: {
      en: 'Your AI orchestrator — routes tasks across all services',
      ka: 'თქვენი AI ორკესტრატორი — ანაწილებს ამოცანებს სერვისებზე',
      ru: 'Ваш AI-оркестратор — распределяет задачи по сервисам',
    },
    category: 'automate',
  },
  {
    slug: 'business',
    icon: '💼',
    title: { en: 'Business Intelligence', ka: 'ბიზნეს ინტელექტი', ru: 'Бизнес-аналитика' },
    description: {
      en: 'Generate reports, dashboards, and strategic business content',
      ka: 'შექმენი ანგარიშები, დეშბორდები და ბიზნეს კონტენტი',
      ru: 'Генерируйте отчёты, дашборды и бизнес-контент',
    },
    category: 'scale',
  },
  {
    slug: 'shop',
    icon: '🛒',
    title: { en: 'Digital Shop', ka: 'ციფრული მაღაზია', ru: 'Цифровой магазин' },
    description: {
      en: 'Launch and manage AI-powered digital storefronts',
      ka: 'გაუშვი და მართე AI-ით მართული ციფრული მაღაზიები',
      ru: 'Запускайте и управляйте цифровыми магазинами',
    },
    category: 'scale',
  },
  {
    slug: 'software',
    icon: '💻',
    title: { en: 'Software Studio', ka: 'სოფტ სტუდია', ru: 'Студия ПО' },
    description: {
      en: 'Generate code, prototypes, and software architectures',
      ka: 'გენერირე კოდი, პროტოტიპები და არქიტექტურა',
      ru: 'Генерируйте код, прототипы и архитектуру',
    },
    category: 'scale',
  },
  {
    slug: 'tourism',
    icon: '🗺️',
    title: { en: 'Tourism Intelligence', ka: 'ტურიზმის ინტელექტი', ru: 'Туристический ИИ' },
    description: {
      en: 'Smart travel planning, guides, and destination content',
      ka: 'ჭკვიანი სამოგზაურო დაგეგმვა და დესტინაციის კონტენტი',
      ru: 'Умное планирование путешествий и контент',
    },
    category: 'scale',
  },
];

/* ─── Category labels ─────────────────────────────────────────────── */

export const CATEGORY_LABELS: Record<ServiceCategory, { en: string; ka: string; ru: string }> = {
  create:   { en: 'Create',   ka: 'შექმნა',     ru: 'Создание'     },
  edit:     { en: 'Edit',     ka: 'რედაქტირება', ru: 'Редактирование' },
  analyze:  { en: 'Analyze',  ka: 'ანალიზი',    ru: 'Анализ'       },
  automate: { en: 'Automate', ka: 'ავტომატიზაცია', ru: 'Автоматизация' },
  scale:    { en: 'Scale',    ka: 'გაფართოება',  ru: 'Масштабирование' },
};

/* ─── Helpers ─────────────────────────────────────────────────────── */

export function getServiceBySlug(slug: string): ServiceDefinition | undefined {
  return SERVICES.find(s => s.slug === slug);
}

export function getServicesByCategory(category: ServiceCategory): ServiceDefinition[] {
  return SERVICES.filter(s => s.category === category);
}

/** Quick-suggestion cards for the landing page (subset of 8 popular services) */
export const SUGGESTION_SLUGS = [
  'avatar', 'image', 'video', 'music', 'photo', 'media', 'business', 'agent-g',
] as const;

/** Sidebar navigation categories (legacy flat list) */
export const NAV_CATEGORIES = [
  { slug: 'all', label: { en: 'All Services', ka: 'ყველა სერვისი', ru: 'Все сервисы' }, href: '/services' },
  { slug: 'avatar', label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' }, href: '/services/avatar' },
  { slug: 'video', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' }, href: '/services/video' },
  { slug: 'image', label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' }, href: '/services/image' },
  { slug: 'music', label: { en: 'Music', ka: 'მუსიკა', ru: 'Музыка' }, href: '/services/music' },
  { slug: 'business', label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' }, href: '/business' },
  { slug: 'pricing', label: { en: 'Pricing', ka: 'ფასები', ru: 'Цены' }, href: '/pricing' },
] as const;

/* ─── Navigation Groups (Grouped sidebar) ─────────────────────────── */

export type NavGroupId = 'creative' | 'content' | 'commerce' | 'business' | 'developer';

export interface NavGroup {
  id: NavGroupId;
  label: { en: string; ka: string; ru: string };
  icon: string;
  services: string[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'creative',
    label: { en: 'Creative Studio', ka: 'კრეატიული სტუდია', ru: 'Креативная студия' },
    icon: '🎨',
    services: ['avatar', 'video', 'image', 'music', 'text'],
  },
  {
    id: 'content',
    label: { en: 'Content Studio', ka: 'კონტენტ სტუდია', ru: 'Контент-студия' },
    icon: '✂️',
    services: ['editing', 'photo', 'media'],
  },
  {
    id: 'commerce',
    label: { en: 'Commerce Tools', ka: 'კომერციის ხელსაწყოები', ru: 'Коммерция' },
    icon: '🛒',
    services: ['shop'],
  },
  {
    id: 'business',
    label: { en: 'Business Tools', ka: 'ბიზნეს ხელსაწყოები', ru: 'Бизнес-инструменты' },
    icon: '💼',
    services: ['business', 'tourism'],
  },
  {
    id: 'developer',
    label: { en: 'Developer Tools', ka: 'დეველოპერის ხელსაწყოები', ru: 'Инструменты разработчика' },
    icon: '💻',
    services: ['software', 'workflow', 'prompt', 'visual-intel'],
  },
];

/* ─── Service Contracts ───────────────────────────────────────────── */

export type MediaType = 'text' | 'image' | 'video' | 'audio' | 'file' | '3d-model' | 'document';
export type ExportFormat = 'png' | 'jpg' | 'webp' | 'mp4' | 'webm' | 'mp3' | 'wav' | 'flac' | 'pdf' | 'json' | 'csv' | 'glb' | 'svg' | 'txt' | 'docx';

export interface ServiceContract {
  serviceId: string;
  inputTypes: MediaType[];
  outputTypes: MediaType[];
  nextTools: { slug: string; label: { en: string; ka: string; ru: string } }[];
  exportFormats: ExportFormat[];
}

export const SERVICE_CONTRACTS: Record<string, ServiceContract> = {
  avatar: {
    serviceId: 'avatar',
    inputTypes: ['text', 'image'],
    outputTypes: ['image', '3d-model'],
    nextTools: [
      { slug: 'video', label: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'Использовать в видео' } },
      { slug: 'image', label: { en: 'Create Thumbnail', ka: 'მინიატურის შექმნა', ru: 'Создать обложку' } },
      { slug: 'shop', label: { en: 'List in Shop', ka: 'მაღაზიაში გამოქვეყნება', ru: 'Разместить в магазине' } },
    ],
    exportFormats: ['png', 'jpg', 'webp', 'glb'],
  },
  video: {
    serviceId: 'video',
    inputTypes: ['text', 'image', 'video'],
    outputTypes: ['video'],
    nextTools: [
      { slug: 'editing', label: { en: 'Edit Video', ka: 'ვიდეოს რედაქტირება', ru: 'Редактировать видео' } },
      { slug: 'music', label: { en: 'Add Soundtrack', ka: 'საუნდტრეკის დამატება', ru: 'Добавить саундтрек' } },
      { slug: 'text', label: { en: 'Add Captions', ka: 'სუბტიტრების დამატება', ru: 'Добавить субтитры' } },
    ],
    exportFormats: ['mp4', 'webm'],
  },
  image: {
    serviceId: 'image',
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    nextTools: [
      { slug: 'video', label: { en: 'Animate Image', ka: 'სურათის ანიმაცია', ru: 'Анимировать изображение' } },
      { slug: 'photo', label: { en: 'Enhance Quality', ka: 'ხარისხის გაზრდა', ru: 'Улучшить качество' } },
      { slug: 'shop', label: { en: 'List as Product', ka: 'პროდუქტად გამოქვეყნება', ru: 'Опубликовать как товар' } },
    ],
    exportFormats: ['png', 'jpg', 'webp', 'svg'],
  },
  music: {
    serviceId: 'music',
    inputTypes: ['text', 'audio'],
    outputTypes: ['audio'],
    nextTools: [
      { slug: 'video', label: { en: 'Add to Video', ka: 'ვიდეოში დამატება', ru: 'Добавить в видео' } },
      { slug: 'shop', label: { en: 'Sell as Track', ka: 'ტრეკად გაყიდვა', ru: 'Продать как трек' } },
      { slug: 'text', label: { en: 'Generate Lyrics', ka: 'ტექსტის გენერაცია', ru: 'Сгенерировать текст' } },
    ],
    exportFormats: ['mp3', 'wav', 'flac'],
  },
  text: {
    serviceId: 'text',
    inputTypes: ['text', 'document'],
    outputTypes: ['text', 'document'],
    nextTools: [
      { slug: 'image', label: { en: 'Create Visual', ka: 'ვიზუალის შექმნა', ru: 'Создать визуал' } },
      { slug: 'video', label: { en: 'Create Video', ka: 'ვიდეოს შექმნა', ru: 'Создать видео' } },
      { slug: 'business', label: { en: 'Business Report', ka: 'ბიზნეს ანგარიში', ru: 'Бизнес-отчёт' } },
    ],
    exportFormats: ['txt', 'pdf', 'docx', 'json'],
  },
  editing: {
    serviceId: 'editing',
    inputTypes: ['video', 'audio', 'image'],
    outputTypes: ['video'],
    nextTools: [
      { slug: 'music', label: { en: 'Replace Audio', ka: 'აუდიოს ჩანაცვლება', ru: 'Заменить аудио' } },
      { slug: 'text', label: { en: 'Add Subtitles', ka: 'სუბტიტრების დამატება', ru: 'Добавить субтитры' } },
      { slug: 'shop', label: { en: 'Publish', ka: 'გამოქვეყნება', ru: 'Опубликовать' } },
    ],
    exportFormats: ['mp4', 'webm'],
  },
  photo: {
    serviceId: 'photo',
    inputTypes: ['image'],
    outputTypes: ['image'],
    nextTools: [
      { slug: 'avatar', label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' } },
      { slug: 'image', label: { en: 'Generate Variations', ka: 'ვარიაციების გენერაცია', ru: 'Создать вариации' } },
      { slug: 'video', label: { en: 'Animate Photo', ka: 'ფოტოს ანიმაცია', ru: 'Анимировать фото' } },
    ],
    exportFormats: ['png', 'jpg', 'webp'],
  },
  'visual-intel': {
    serviceId: 'visual-intel',
    inputTypes: ['image', 'video'],
    outputTypes: ['text', 'document'],
    nextTools: [
      { slug: 'text', label: { en: 'Write Report', ka: 'ანგარიშის დაწერა', ru: 'Написать отчёт' } },
      { slug: 'image', label: { en: 'Improve Visual', ka: 'ვიზუალის გაუმჯობესება', ru: 'Улучшить визуал' } },
      { slug: 'prompt', label: { en: 'Refine Prompt', ka: 'პრომპტის გაუმჯობესება', ru: 'Улучшить промпт' } },
    ],
    exportFormats: ['json', 'csv', 'pdf', 'txt'],
  },
  prompt: {
    serviceId: 'prompt',
    inputTypes: ['text'],
    outputTypes: ['text'],
    nextTools: [
      { slug: 'image', label: { en: 'Test on Image', ka: 'სურათზე ტესტი', ru: 'Тест на изображении' } },
      { slug: 'video', label: { en: 'Test on Video', ka: 'ვიდეოზე ტესტი', ru: 'Тест на видео' } },
      { slug: 'avatar', label: { en: 'Test on Avatar', ka: 'ავატარზე ტესტი', ru: 'Тест на аватаре' } },
    ],
    exportFormats: ['json', 'txt'],
  },
  media: {
    serviceId: 'media',
    inputTypes: ['text', 'image', 'video', 'audio'],
    outputTypes: ['image', 'video', 'audio', 'text'],
    nextTools: [
      { slug: 'editing', label: { en: 'Edit Output', ka: 'რედაქტირება', ru: 'Редактировать' } },
      { slug: 'shop', label: { en: 'Publish Assets', ka: 'აქტივების გამოქვეყნება', ru: 'Опубликовать' } },
      { slug: 'business', label: { en: 'Campaign Report', ka: 'კამპანიის ანგარიში', ru: 'Отчёт кампании' } },
    ],
    exportFormats: ['png', 'mp4', 'mp3', 'pdf'],
  },
  workflow: {
    serviceId: 'workflow',
    inputTypes: ['text'],
    outputTypes: ['text', 'document'],
    nextTools: [
      { slug: 'agent-g', label: { en: 'Run with Agent G', ka: 'Agent G-ით გაშვება', ru: 'Запустить с Agent G' } },
      { slug: 'business', label: { en: 'Business Report', ka: 'ბიზნეს ანგარიში', ru: 'Бизнес-отчёт' } },
    ],
    exportFormats: ['json', 'pdf'],
  },
  'agent-g': {
    serviceId: 'agent-g',
    inputTypes: ['text', 'image', 'video', 'audio', 'file'],
    outputTypes: ['text', 'image', 'video', 'audio', 'document'],
    nextTools: [],
    exportFormats: ['json', 'pdf', 'txt'],
  },
  business: {
    serviceId: 'business',
    inputTypes: ['text', 'document'],
    outputTypes: ['text', 'document'],
    nextTools: [
      { slug: 'text', label: { en: 'Write Copy', ka: 'ტექსტის დაწერა', ru: 'Написать текст' } },
      { slug: 'image', label: { en: 'Create Visual', ka: 'ვიზუალის შექმნა', ru: 'Создать визуал' } },
      { slug: 'shop', label: { en: 'Launch Store', ka: 'მაღაზიის გაშვება', ru: 'Запустить магазин' } },
    ],
    exportFormats: ['pdf', 'csv', 'json', 'docx'],
  },
  shop: {
    serviceId: 'shop',
    inputTypes: ['text', 'image'],
    outputTypes: ['text', 'document'],
    nextTools: [
      { slug: 'image', label: { en: 'Product Photos', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' } },
      { slug: 'text', label: { en: 'Write Description', ka: 'აღწერის დაწერა', ru: 'Написать описание' } },
      { slug: 'business', label: { en: 'Revenue Report', ka: 'შემოსავლის ანგარიში', ru: 'Отчёт о доходах' } },
    ],
    exportFormats: ['csv', 'json', 'pdf'],
  },
  software: {
    serviceId: 'software',
    inputTypes: ['text', 'document'],
    outputTypes: ['text', 'document', 'file'],
    nextTools: [
      { slug: 'workflow', label: { en: 'Build Pipeline', ka: 'პაიპლაინის აგება', ru: 'Создать пайплайн' } },
      { slug: 'business', label: { en: 'Roadmap Report', ka: 'გზამკვლევის ანგარიში', ru: 'Отчёт по роадмапу' } },
    ],
    exportFormats: ['json', 'txt', 'pdf'],
  },
  tourism: {
    serviceId: 'tourism',
    inputTypes: ['text', 'image'],
    outputTypes: ['text', 'document', 'image'],
    nextTools: [
      { slug: 'image', label: { en: 'Create Promo', ka: 'პრომოს შექმნა', ru: 'Создать промо' } },
      { slug: 'text', label: { en: 'Translate Guide', ka: 'გიდის თარგმნა', ru: 'Перевести гид' } },
      { slug: 'video', label: { en: 'Travel Video', ka: 'სამოგზაურო ვიდეო', ru: 'Видео о путешествии' } },
    ],
    exportFormats: ['pdf', 'json', 'txt'],
  },
};

/* ─── Quick Presets (per service) ─────────────────────────────────── */

export interface ServicePreset {
  id: string;
  label: { en: string; ka: string; ru: string };
  prompt: string;
  mode: 'beginner' | 'advanced' | 'both';
}

export const SERVICE_PRESETS: Record<string, ServicePreset[]> = {
  avatar: [
    { id: 'realistic-portrait', label: { en: 'Realistic Portrait', ka: 'რეალისტური პორტრეტი', ru: 'Реалистичный портрет' }, prompt: 'Generate a photorealistic portrait avatar with studio lighting', mode: 'both' },
    { id: 'anime-style', label: { en: 'Anime Style', ka: 'ანიმე სტილი', ru: 'Аниме стиль' }, prompt: 'Generate an anime-style character avatar with vibrant colors', mode: 'both' },
    { id: 'business-headshot', label: { en: 'Business Headshot', ka: 'ბიზნეს ფოტო', ru: 'Бизнес-фото' }, prompt: 'Create a professional business headshot avatar with neutral background', mode: 'beginner' },
    { id: 'full-body-3d', label: { en: '3D Full Body', ka: '3D სრული ტანი', ru: '3D в полный рост' }, prompt: 'Generate a full-body 3D avatar model with detailed clothing and texturing', mode: 'advanced' },
  ],
  video: [
    { id: 'cinematic-short', label: { en: 'Cinematic Short', ka: 'კინემატოგრაფიული მოკლე', ru: 'Кинематографический ролик' }, prompt: 'Generate a 10-second cinematic video clip with dramatic lighting', mode: 'both' },
    { id: 'product-demo', label: { en: 'Product Demo', ka: 'პროდუქტის დემო', ru: 'Демо продукта' }, prompt: 'Create a clean product demonstration video with smooth transitions', mode: 'beginner' },
    { id: 'social-reel', label: { en: 'Social Reel', ka: 'სოციალური რილსი', ru: 'Рилс для соцсетей' }, prompt: 'Generate a vertical 9:16 social media reel with trending effects', mode: 'both' },
    { id: 'scene-builder', label: { en: 'Scene Builder', ka: 'სცენების შექმნა', ru: 'Построитель сцен' }, prompt: 'Build a multi-scene video sequence with custom transitions and timing', mode: 'advanced' },
  ],
  image: [
    { id: 'campaign-poster', label: { en: 'Campaign Poster', ka: 'კამპანიის პოსტერი', ru: 'Постер кампании' }, prompt: 'Generate a professional marketing campaign poster with bold typography', mode: 'both' },
    { id: 'social-post', label: { en: 'Social Post', ka: 'სოციალური პოსტი', ru: 'Пост для соцсетей' }, prompt: 'Create an eye-catching social media image post with modern design', mode: 'beginner' },
    { id: 'product-photo', label: { en: 'Product Photo', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' }, prompt: 'Generate a studio-quality product photo with clean white background', mode: 'both' },
    { id: 'concept-art', label: { en: 'Concept Art', ka: 'კონცეფტ არტი', ru: 'Концепт-арт' }, prompt: 'Create detailed concept art with cinematic composition and mood', mode: 'advanced' },
  ],
  music: [
    { id: 'lofi-beat', label: { en: 'Lo-Fi Beat', ka: 'ლო-ფაი ბითი', ru: 'Лоу-фай бит' }, prompt: 'Compose a chill lo-fi hip-hop beat with vinyl crackle and soft piano', mode: 'both' },
    { id: 'epic-score', label: { en: 'Epic Score', ka: 'ეპიკური მუსიკა', ru: 'Эпический саундтрек' }, prompt: 'Create an epic orchestral score with dramatic builds and cinematic drops', mode: 'both' },
    { id: 'brand-jingle', label: { en: 'Brand Jingle', ka: 'ბრენდის ჯინგლი', ru: 'Джингл бренда' }, prompt: 'Produce a catchy 15-second brand jingle with upbeat energy', mode: 'beginner' },
    { id: 'stem-separation', label: { en: 'Stem Separation', ka: 'სთემების გამოყოფა', ru: 'Разделение стемов' }, prompt: 'Upload audio and separate into individual stems: vocals, drums, bass, melody', mode: 'advanced' },
  ],
  text: [
    { id: 'ad-copy', label: { en: 'Ad Copy', ka: 'სარეკლამო ტექსტი', ru: 'Рекламный текст' }, prompt: 'Write compelling ad copy for a digital product launch campaign', mode: 'both' },
    { id: 'blog-article', label: { en: 'Blog Article', ka: 'ბლოგის სტატია', ru: 'Статья для блога' }, prompt: 'Write an SEO-optimized blog article with structured headings and call-to-action', mode: 'beginner' },
    { id: 'landing-page', label: { en: 'Landing Page', ka: 'სალენდინგე', ru: 'Лендинг' }, prompt: 'Generate full landing page copy: hero, features, testimonials, CTA sections', mode: 'both' },
    { id: 'multi-language', label: { en: 'Multi-Language', ka: 'მრავალენოვანი', ru: 'Мультиязычный' }, prompt: 'Translate and adapt content for EN, KA, and RU markets with cultural localization', mode: 'advanced' },
  ],
  editing: [
    { id: 'auto-cut', label: { en: 'Auto Cut', ka: 'ავტო მონტაჟი', ru: 'Авто монтаж' }, prompt: 'Automatically cut raw footage into a polished edit with smooth transitions', mode: 'beginner' },
    { id: 'color-grade', label: { en: 'Color Grade', ka: 'კოლორ გრეიდინგი', ru: 'Цветокоррекция' }, prompt: 'Apply cinematic color grading to the video for a professional look', mode: 'both' },
    { id: 'subtitle-burn', label: { en: 'Burn Subtitles', ka: 'სუბტიტრების ჩაწერა', ru: 'Вшить субтитры' }, prompt: 'Auto-detect speech and burn styled subtitles into the video', mode: 'both' },
    { id: 'batch-export', label: { en: 'Batch Export', ka: 'პარტიული ექსპორტი', ru: 'Пакетный экспорт' }, prompt: 'Export video in multiple formats and aspect ratios for different platforms', mode: 'advanced' },
  ],
  photo: [
    { id: 'bg-remove', label: { en: 'Remove Background', ka: 'ფონის წაშლა', ru: 'Удалить фон' }, prompt: 'Remove the background from this photo cleanly with edge refinement', mode: 'both' },
    { id: 'portrait-retouch', label: { en: 'Portrait Retouch', ka: 'პორტრეტის რეტუში', ru: 'Ретушь портрета' }, prompt: 'Professional skin retouching while preserving natural texture', mode: 'beginner' },
    { id: 'upscale-4x', label: { en: 'Upscale 4x', ka: '4x გადიდება', ru: 'Увеличение 4x' }, prompt: 'Upscale this image 4x while preserving sharpness and detail', mode: 'both' },
    { id: 'batch-enhance', label: { en: 'Batch Enhance', ka: 'პარტიული გაუმჯობესება', ru: 'Пакетное улучшение' }, prompt: 'Batch process multiple photos: auto-level, sharpen, and color-correct', mode: 'advanced' },
  ],
  'visual-intel': [
    { id: 'brand-audit', label: { en: 'Brand Audit', ka: 'ბრენდის აუდიტი', ru: 'Аудит бренда' }, prompt: 'Analyze this image for brand consistency, composition, and visual impact', mode: 'both' },
    { id: 'creative-score', label: { en: 'Creative Score', ka: 'კრეატიული ქულა', ru: 'Оценка креатива' }, prompt: 'Score this creative asset on engagement potential and visual quality', mode: 'beginner' },
    { id: 'detailed-analysis', label: { en: 'Deep Analysis', ka: 'ღრმა ანალიზი', ru: 'Глубокий анализ' }, prompt: 'Perform detailed technical analysis: composition, color theory, typography, hierarchy', mode: 'advanced' },
  ],
  prompt: [
    { id: 'image-prompt', label: { en: 'Image Prompt', ka: 'სურათის პრომპტი', ru: 'Промпт для изображения' }, prompt: 'Design an optimized prompt for high-quality image generation', mode: 'both' },
    { id: 'video-prompt', label: { en: 'Video Prompt', ka: 'ვიდეო პრომპტი', ru: 'Промпт для видео' }, prompt: 'Create a detailed video generation prompt with scene descriptions', mode: 'both' },
    { id: 'negative-prompt', label: { en: 'Negative Prompt Set', ka: 'უარყოფითი პრომპტი', ru: 'Негативный промпт' }, prompt: 'Generate optimized negative prompts to improve generation quality', mode: 'advanced' },
  ],
  media: [
    { id: 'campaign-pack', label: { en: 'Campaign Pack', ka: 'კამპანიის პაკეტი', ru: 'Пакет кампании' }, prompt: 'Generate a complete campaign media pack: poster, video, audio, copy', mode: 'both' },
    { id: 'brand-kit', label: { en: 'Brand Kit', ka: 'ბრენდის ნაკრები', ru: 'Бренд-кит' }, prompt: 'Create a comprehensive brand media kit with all asset types', mode: 'beginner' },
    { id: 'asset-pipeline', label: { en: 'Asset Pipeline', ka: 'აქტივების პაიპლაინი', ru: 'Пайплайн активов' }, prompt: 'Build a multi-format asset pipeline: source → variants → distribution-ready', mode: 'advanced' },
  ],
  workflow: [
    { id: 'content-pipeline', label: { en: 'Content Pipeline', ka: 'კონტენტ პაიპლაინი', ru: 'Контент-пайплайн' }, prompt: 'Build an automated content creation pipeline from brief to publish', mode: 'both' },
    { id: 'qa-gate', label: { en: 'QA Gate', ka: 'QA გეითი', ru: 'QA-гейт' }, prompt: 'Add quality assurance checkpoints between pipeline stages', mode: 'advanced' },
  ],
  'agent-g': [
    { id: 'full-task', label: { en: 'Full Task', ka: 'სრული დავალება', ru: 'Полная задача' }, prompt: 'Plan, route, and execute a complete multi-service task from my description', mode: 'both' },
    { id: 'quality-check', label: { en: 'Quality Check', ka: 'ხარისხის შემოწმება', ru: 'Проверка качества' }, prompt: 'Review and quality-check all outputs from the current project', mode: 'beginner' },
    { id: 'bundle-run', label: { en: 'Bundle Run', ka: 'პარტიული გაშვება', ru: 'Пакетный запуск' }, prompt: 'Execute a batch of tasks across multiple services simultaneously', mode: 'advanced' },
  ],
  business: [
    { id: 'strategy-brief', label: { en: 'Strategy Brief', ka: 'სტრატეგიის მოკლე', ru: 'Стратегический бриф' }, prompt: 'Generate a strategic business brief with market analysis and recommendations', mode: 'both' },
    { id: 'revenue-plan', label: { en: 'Revenue Plan', ka: 'შემოსავლის გეგმა', ru: 'План доходов' }, prompt: 'Build a detailed revenue projection plan with growth scenarios', mode: 'advanced' },
    { id: 'executive-summary', label: { en: 'Executive Summary', ka: 'ექსიქ. შეჯამება', ru: 'Резюме' }, prompt: 'Create a concise executive summary for stakeholder presentation', mode: 'beginner' },
  ],
  shop: [
    { id: 'quick-listing', label: { en: 'Quick Listing', ka: 'სწრაფი განცხადება', ru: 'Быстрое объявление' }, prompt: 'Create a product listing with AI-optimized title, description, and tags', mode: 'beginner' },
    { id: 'seo-optimize', label: { en: 'SEO Optimize', ka: 'SEO ოპტიმიზაცია', ru: 'SEO оптимизация' }, prompt: 'Optimize store listings for search engines with keyword analysis', mode: 'both' },
    { id: 'store-audit', label: { en: 'Store Audit', ka: 'მაღაზიის აუდიტი', ru: 'Аудит магазина' }, prompt: 'Full audit of store listings: SEO, pricing, imagery, conversion optimization', mode: 'advanced' },
  ],
  software: [
    { id: 'app-spec', label: { en: 'App Spec', ka: 'აპის სპეციფიკაცია', ru: 'Спецификация приложения' }, prompt: 'Generate a complete application specification from requirements description', mode: 'both' },
    { id: 'code-review', label: { en: 'Code Review', ka: 'კოდის რევიუ', ru: 'Ревью кода' }, prompt: 'Review code architecture, identify issues, and suggest improvements', mode: 'advanced' },
  ],
  tourism: [
    { id: 'itinerary', label: { en: 'Smart Itinerary', ka: 'ჭკვიანი მარშრუტი', ru: 'Умный маршрут' }, prompt: 'Create a detailed travel itinerary with activities, dining, and local tips', mode: 'both' },
    { id: 'destination-promo', label: { en: 'Destination Promo', ka: 'დესტინაციის პრომო', ru: 'Промо направления' }, prompt: 'Generate promotional content for a travel destination with visuals and copy', mode: 'beginner' },
  ],
};

/* ─── Workflow Templates ──────────────────────────────────────────── */

export interface WorkflowTemplate {
  id: string;
  label: { en: string; ka: string; ru: string };
  description: { en: string; ka: string; ru: string };
  steps: string[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'brand-starter',
    label: { en: 'Brand Starter Pack', ka: 'ბრენდის სტარტერ პაკი', ru: 'Стартовый бренд-пакет' },
    description: { en: 'Logo → Avatar → Brand Copy → Social Kit', ka: 'ლოგო → ავატარი → ბრენდის ტექსტი → სოც. კიტი', ru: 'Логотип → Аватар → Копирайт → Соцсети' },
    steps: ['image', 'avatar', 'text', 'media'],
  },
  {
    id: 'music-launch',
    label: { en: 'Music Launch Pack', ka: 'მუსიკის ლონჩ პაკი', ru: 'Пакет запуска музыки' },
    description: { en: 'Track → Cover Art → Promo Video → Social Kit', ka: 'ტრეკი → გარეკანი → პრომო ვიდეო → სოც. კიტი', ru: 'Трек → Обложка → Промо-видео → Соцсети' },
    steps: ['music', 'image', 'video', 'media'],
  },
  {
    id: 'store-launch',
    label: { en: 'Store Launch Pack', ka: 'მაღაზიის ლონჩ პაკი', ru: 'Пакет запуска магазина' },
    description: { en: 'Product Photos → Listings → Store SEO → Launch Campaign', ka: 'პროდუქტის ფოტო → განცხ. → SEO → კამპანია', ru: 'Фото товара → Объявления → SEO → Кампания' },
    steps: ['photo', 'shop', 'text', 'media'],
  },
  {
    id: 'startup-pack',
    label: { en: 'Startup Pack', ka: 'სტარტაპ პაკი', ru: 'Стартап-пакет' },
    description: { en: 'Strategy → App Spec → Brand → Landing Page', ka: 'სტრატეგია → აპის სპეკი → ბრენდი → ლენდინგი', ru: 'Стратегия → Спец. → Бренд → Лендинг' },
    steps: ['business', 'software', 'image', 'text'],
  },
];
