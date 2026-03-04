export interface ServiceDefinition {
  slug: string;
  title: string;
  href: string;
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  enabled: boolean;
  localized?: {
    en: { name: string; description: string };
    ka: { name: string; description: string };
    ru: { name: string; description: string };
  };
}

/**
 * Unified service registry — SHORT slugs matching metadata.ts and [slug]/page.tsx
 * 16 services total (13 original + software, business, tourism)
 */
export const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    slug: 'avatar', title: 'Avatar Builder', href: '/services/avatar', id: 'avatar',
    name: 'Avatar Builder', description: 'Create and manage your premium digital identity.',
    icon: '🧑', route: '/services/avatar', enabled: true,
    localized: {
      en: { name: 'Avatar Builder', description: 'Create and manage your premium digital identity.' },
      ka: { name: 'ავატარის კონსტრუქტორი', description: 'შექმენი და მართე შენი პრემიუმ ციფრული იდენტობა.' },
      ru: { name: 'Конструктор аватаров', description: 'Создавайте и управляйте своей цифровой идентичностью.' },
    },
  },
  {
    slug: 'agent-g', title: 'Agent G', href: '/services/agent-g', id: 'agent-g',
    name: 'Agent G', description: 'Coordinate autonomous workflows across your AI workspace.',
    icon: '🤖', route: '/services/agent-g', enabled: true,
    localized: {
      en: { name: 'Agent G', description: 'Coordinate autonomous workflows across your AI workspace.' },
      ka: { name: 'აგენტი G', description: 'მართე ავტონომიური პროცესები შენს AI სამუშაო გარემოში.' },
      ru: { name: 'Агент G', description: 'Координируйте автономные процессы в вашем AI-рабочем пространстве.' },
    },
  },
  {
    slug: 'workflow', title: 'Workflow Builder', href: '/services/workflow', id: 'workflow',
    name: 'Workflow Builder', description: 'Design chained automation pipelines across services.',
    icon: '🧭', route: '/services/workflow', enabled: true,
    localized: {
      en: { name: 'Workflow Builder', description: 'Design chained automation pipelines across services.' },
      ka: { name: 'პროცესების კონსტრუქტორი', description: 'დაგეგმე მრავალსაფეხურიანი ავტომატიზაციები.' },
      ru: { name: 'Конструктор процессов', description: 'Проектируйте автоматизации в едином потоке.' },
    },
  },
  {
    slug: 'video', title: 'Video Studio', href: '/services/video', id: 'video',
    name: 'Video Studio', description: 'Produce cinematic video sequences from guided prompts.',
    icon: '🎬', route: '/services/video', enabled: true,
    localized: {
      en: { name: 'Video Studio', description: 'Produce cinematic video sequences from guided prompts.' },
      ka: { name: 'ვიდეო სტუდია', description: 'შექმენი კინემატოგრაფიული ვიდეო სცენები.' },
      ru: { name: 'Видеостудия', description: 'Создавайте кинематографичные видеосцены.' },
    },
  },
  {
    slug: 'editing', title: 'Video Editing', href: '/services/editing', id: 'editing',
    name: 'Video Editing', description: 'Universal video editing powered by AI.',
    icon: '✂️', route: '/services/editing', enabled: true,
    localized: {
      en: { name: 'Video Editing', description: 'Universal video editing powered by AI.' },
      ka: { name: 'ვიდეო რედაქტირება', description: 'AI-ით მართული ვიდეო რედაქტირება.' },
      ru: { name: 'Видеоредактор', description: 'Редактирование видео с помощью AI.' },
    },
  },
  {
    slug: 'music', title: 'Music Studio', href: '/services/music', id: 'music',
    name: 'Music Studio', description: 'Generate songs, stems, and production-ready audio.',
    icon: '🎵', route: '/services/music', enabled: true,
    localized: {
      en: { name: 'Music Studio', description: 'Generate songs, stems, and production-ready audio.' },
      ka: { name: 'მუსიკის სტუდია', description: 'შექმენი მუსიკა, სტემები და სტუდიური ხარისხის აუდიო.' },
      ru: { name: 'Музыкальная студия', description: 'Создавайте музыку и аудио студийного уровня.' },
    },
  },
  {
    slug: 'photo', title: 'Photo Studio', href: '/services/photo', id: 'photo',
    name: 'Photo Studio', description: 'Create editorial photo outputs and campaign image sets.',
    icon: '📸', route: '/services/photo', enabled: true,
    localized: {
      en: { name: 'Photo Studio', description: 'Create editorial photo outputs and campaign image sets.' },
      ka: { name: 'ფოტო სტუდია', description: 'შექმენი სარედაქციო ფოტოები და კამპანიური ვიზუალები.' },
      ru: { name: 'Фотостудия', description: 'Создавайте редакционный фотоконтент и визуалы.' },
    },
  },
  {
    slug: 'image', title: 'Image Creator', href: '/services/image', id: 'image',
    name: 'Image Creator', description: 'Generate design-ready visuals and concept imagery.',
    icon: '🖼️', route: '/services/image', enabled: true,
    localized: {
      en: { name: 'Image Creator', description: 'Generate design-ready visuals and concept imagery.' },
      ka: { name: 'სურათების გენერატორი', description: 'შექმენი დიზაინისთვის მზა ვიზუალები.' },
      ru: { name: 'Генератор изображений', description: 'Генерируйте готовые визуалы и концепт-изображения.' },
    },
  },
  {
    slug: 'media', title: 'Media Production', href: '/services/media', id: 'media',
    name: 'Media Production', description: 'Build complete multimedia outputs for campaigns.',
    icon: '📽️', route: '/services/media', enabled: true,
    localized: {
      en: { name: 'Media Production', description: 'Build complete multimedia outputs for campaigns.' },
      ka: { name: 'მედია წარმოება', description: 'მოამზადე სრულფასოვანი მედია-კონტენტი.' },
      ru: { name: 'Медиапроизводство', description: 'Создавайте медиаконтент для кампаний.' },
    },
  },
  {
    slug: 'text', title: 'Text Intelligence', href: '/services/text', id: 'text',
    name: 'Text Intelligence', description: 'Generate, optimize, and analyze strategic text content.',
    icon: '📝', route: '/services/text', enabled: true,
    localized: {
      en: { name: 'Text Intelligence', description: 'Generate, optimize, and analyze strategic text content.' },
      ka: { name: 'ტექსტური ინტელექტი', description: 'შექმენი და გააანალიზე სტრატეგიული ტექსტები.' },
      ru: { name: 'Текстовый интеллект', description: 'Создавайте и анализируйте стратегический контент.' },
    },
  },
  {
    slug: 'prompt', title: 'Prompt Builder', href: '/services/prompt', id: 'prompt',
    name: 'Prompt Builder', description: 'Design reusable prompt systems for consistent AI results.',
    icon: '🧩', route: '/services/prompt', enabled: true,
    localized: {
      en: { name: 'Prompt Builder', description: 'Design reusable prompt systems for consistent AI results.' },
      ka: { name: 'პრომპტების კონსტრუქტორი', description: 'ააგე prompt სისტემები სტაბილური შედეგებისთვის.' },
      ru: { name: 'Конструктор промптов', description: 'Создавайте промпт-системы для стабильных результатов.' },
    },
  },
  {
    slug: 'visual-intel', title: 'Visual Intelligence', href: '/services/visual-intel', id: 'visual-intel',
    name: 'Visual Intelligence', description: 'Analyze and optimize visual creative assets.',
    icon: '🧠', route: '/services/visual-intel', enabled: true,
    localized: {
      en: { name: 'Visual Intelligence', description: 'Analyze and optimize visual creative assets.' },
      ka: { name: 'ვიზუალური ინტელექტი', description: 'გააანალიზე ვიზუალური მასალები AI-ით.' },
      ru: { name: 'Визуальный интеллект', description: 'Анализируйте визуальные материалы с помощью AI.' },
    },
  },
  {
    slug: 'shop', title: 'Online Shop', href: '/services/shop', id: 'shop',
    name: 'Online Shop', description: 'Launch and operate your commerce storefront.',
    icon: '🛍️', route: '/services/shop', enabled: true,
    localized: {
      en: { name: 'Online Shop', description: 'Launch and operate your commerce storefront.' },
      ka: { name: 'ონლაინ მაღაზია', description: 'გაუშვი ონლაინ მაღაზია და მართე შეკვეთები.' },
      ru: { name: 'Онлайн-магазин', description: 'Запустите магазин и управляйте заказами.' },
    },
  },
  // ── New services ──────────────────────────
  {
    slug: 'software', title: 'Software Dev', href: '/services/software', id: 'software',
    name: 'Software Dev', description: 'AI-assisted code generation, review, and deployment.',
    icon: '💻', route: '/services/software', enabled: true,
    localized: {
      en: { name: 'Software Dev', description: 'AI-assisted code generation, review, and deployment.' },
      ka: { name: 'პროგრამული უზრუნველყოფა', description: 'AI-ით კოდის გენერაცია, მიმოხილვა და დეპლოი.' },
      ru: { name: 'Разработка ПО', description: 'Генерация кода, ревью и деплой с помощью AI.' },
    },
  },
  {
    slug: 'business', title: 'Business Agent', href: '/services/business', id: 'business',
    name: 'Business Agent', description: 'Market research, pitch decks, and financial modeling.',
    icon: '💼', route: '/services/business', enabled: true,
    localized: {
      en: { name: 'Business Agent', description: 'Market research, pitch decks, and financial modeling.' },
      ka: { name: 'ბიზნეს აგენტი', description: 'ბაზრის კვლევა, პრეზენტაციები და ფინანსური მოდელირება.' },
      ru: { name: 'Бизнес-агент', description: 'Исследование рынка, питч-деки и финансовое моделирование.' },
    },
  },
  {
    slug: 'tourism', title: 'Tourism AI', href: '/services/tourism', id: 'tourism',
    name: 'Tourism AI', description: 'AI-powered travel planning, itinerary building, and local guide.',
    icon: '✈️', route: '/services/tourism', enabled: true,
    localized: {
      en: { name: 'Tourism AI', description: 'AI-powered travel planning, itinerary building, and local guide.' },
      ka: { name: 'ტურიზმი AI', description: 'AI მოგზაურობის დაგეგმვა, მარშრუტი და ადგილობრივი გიდი.' },
      ru: { name: 'Туризм AI', description: 'AI-планирование путешествий, маршруты и местный гид.' },
    },
  },
  {
    slug: 'next', title: 'Expansion Slot', href: '/services/next', id: 'next',
    name: 'Expansion Slot', description: 'Reserved route for the next enterprise service module.',
    icon: '🚀', route: '/services/next', enabled: true,
    localized: {
      en: { name: 'Expansion Slot', description: 'Reserved route for the next enterprise service module.' },
      ka: { name: 'გაფართოების სლოტი', description: 'რეზერვირებული მარშრუტი შემდეგი enterprise სერვისისთვის.' },
      ru: { name: 'Слот расширения', description: 'Резервный маршрут для следующего enterprise-сервиса.' },
    },
  },
];

export function getLocalizedServices(locale: string): ServiceDefinition[] {
  if (!['en', 'ka', 'ru'].includes(locale)) {
    return SERVICE_REGISTRY;
  }

  return SERVICE_REGISTRY.map((service) => {
    const localizedEntry = service.localized?.[locale as 'en' | 'ka' | 'ru'];
    if (!localizedEntry) {
      return service;
    }

    return {
      ...service,
      title: localizedEntry.name,
      name: localizedEntry.name,
      description: localizedEntry.description,
    };
  });
}
