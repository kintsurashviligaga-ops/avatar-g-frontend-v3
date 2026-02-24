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

export const SERVICE_REGISTRY: ServiceDefinition[] = [
  {
    slug: 'workflow-builder',
    title: 'Workflow Builder',
    href: '/services/workflow-builder',
    id: 'workflow-builder',
    name: 'Workflow Builder',
    description: 'Design chained automation pipelines across services with queue-based orchestration.',
    icon: '🧭',
    route: '/services/workflow-builder',
    enabled: true,
    localized: {
      en: {
        name: 'Workflow Builder',
        description: 'Design chained automation pipelines across services with queue-based orchestration.',
      },
      ka: {
        name: 'სამუშაო პროცესების კონსტრუქტორი',
        description: 'დაგეგმე მრავალსაფეხურიანი ავტომატიზაციები ერთიან სამუშაო ნაკადად.',
      },
      ru: {
        name: 'Конструктор процессов',
        description: 'Проектируйте многошаговые автоматизации в едином рабочем потоке.',
      },
    },
  },
  {
    slug: 'online-shop',
    title: 'Online Shop',
    href: '/services/online-shop',
    id: 'online-shop',
    name: 'Online Shop',
    description: 'Launch and operate your commerce storefront with fulfillment-ready workflows.',
    icon: '🛍️',
    route: '/services/online-shop',
    enabled: true,
    localized: {
      en: {
        name: 'Online Shop',
        description: 'Launch and operate your commerce storefront with fulfillment-ready workflows.',
      },
      ka: {
        name: 'ონლაინ მაღაზია',
        description: 'გაუშვი ონლაინ მაღაზია და მართე შეკვეთები მზა პროცესებით.',
      },
      ru: {
        name: 'Онлайн-магазин',
        description: 'Запустите онлайн-магазин и управляйте заказами через готовые процессы.',
      },
    },
  },
  {
    slug: 'avatar-builder',
    title: 'Avatar Builder',
    href: '/services/avatar-builder',
    id: 'avatar-builder',
    name: 'Avatar Builder',
    description: 'Create and manage your premium digital identity.',
    icon: '🧑',
    route: '/services/avatar-builder',
    enabled: true,
    localized: {
      en: {
        name: 'Avatar Builder',
        description: 'Create and manage your premium digital identity.',
      },
      ka: {
        name: 'ავატარის კონსტრუქტორი',
        description: 'შექმენი და მართე შენი პრემიუმ ციფრული იდენტობა.',
      },
      ru: {
        name: 'Конструктор аватаров',
        description: 'Создавайте и управляйте своей цифровой идентичностью.',
      },
    },
  },
  {
    slug: 'music-studio',
    title: 'Music Studio',
    href: '/services/music-studio',
    id: 'music-studio',
    name: 'Music Studio',
    description: 'Generate songs, stems, and production-ready audio drafts.',
    icon: '🎵',
    route: '/services/music-studio',
    enabled: true,
    localized: {
      en: {
        name: 'Music Studio',
        description: 'Generate songs, stems, and production-ready audio drafts.',
      },
      ka: {
        name: 'მუსიკის სტუდია',
        description: 'შექმენი მუსიკა, სტემები და სტუდიური ხარისხის აუდიო.',
      },
      ru: {
        name: 'Музыкальная студия',
        description: 'Создавайте музыку, стемы и аудио-заготовки студийного уровня.',
      },
    },
  },
  {
    slug: 'video-studio',
    title: 'Video Studio',
    href: '/services/video-studio',
    id: 'video-studio',
    name: 'Video Studio',
    description: 'Produce cinematic video sequences from guided prompts.',
    icon: '🎬',
    route: '/services/video-studio',
    enabled: true,
    localized: {
      en: {
        name: 'Video Studio',
        description: 'Produce cinematic video sequences from guided prompts.',
      },
      ka: {
        name: 'ვიდეო სტუდია',
        description: 'შექმენი კინემატოგრაფიული ვიდეო სცენები ტექსტური მითითებებით.',
      },
      ru: {
        name: 'Видеостудия',
        description: 'Создавайте кинематографичные видеосцены по текстовым инструкциям.',
      },
    },
  },
  {
    slug: 'media-production',
    title: 'Media Production',
    href: '/services/media-production',
    id: 'media-production',
    name: 'Media Production',
    description: 'Build complete multimedia outputs for campaigns and storytelling.',
    icon: '📽️',
    route: '/services/media-production',
    enabled: true,
    localized: {
      en: {
        name: 'Media Production',
        description: 'Build complete multimedia outputs for campaigns and storytelling.',
      },
      ka: {
        name: 'მედია წარმოება',
        description: 'მოამზადე სრულფასოვანი მედია-კონტენტი კამპანიებისთვის.',
      },
      ru: {
        name: 'Медиапроизводство',
        description: 'Создавайте полноценный медиаконтент для кампаний и сторителлинга.',
      },
    },
  },
  {
    slug: 'visual-intelligence',
    title: 'Visual Intelligence',
    href: '/services/visual-intelligence',
    id: 'visual-intelligence',
    name: 'Visual Intelligence',
    description: 'Analyze and orchestrate visual assets with AI-assisted decision support.',
    icon: '🧠',
    route: '/services/visual-intelligence',
    enabled: true,
    localized: {
      en: {
        name: 'Visual Intelligence',
        description: 'Analyze and orchestrate visual assets with AI-assisted decision support.',
      },
      ka: {
        name: 'ვიზუალური ინტელექტი',
        description: 'გააანალიზე ვიზუალური მასალები და მიიღე AI-ზე დაფუძნებული გადაწყვეტილებები.',
      },
      ru: {
        name: 'Визуальный интеллект',
        description: 'Анализируйте визуальные материалы и принимайте решения с помощью AI.',
      },
    },
  },
  {
    slug: 'image-creator',
    title: 'Image Creator',
    href: '/services/image-creator',
    id: 'image-creator',
    name: 'Image Creator',
    description: 'Generate design-ready visuals and concept imagery at scale.',
    icon: '🖼️',
    route: '/services/image-creator',
    enabled: true,
    localized: {
      en: {
        name: 'Image Creator',
        description: 'Generate design-ready visuals and concept imagery at scale.',
      },
      ka: {
        name: 'სურათების გენერატორი',
        description: 'შექმენი დიზაინისთვის მზა ვიზუალები და კონცეპტ-გამოსახულებები.',
      },
      ru: {
        name: 'Генератор изображений',
        description: 'Генерируйте готовые к дизайну визуалы и концепт-изображения.',
      },
    },
  },
  {
    slug: 'agent-g',
    title: 'Agent G',
    href: '/services/agent-g',
    id: 'agent-g',
    name: 'Agent G',
    description: 'Coordinate autonomous workflows across your AI workspace.',
    icon: '🤖',
    route: '/services/agent-g',
    enabled: true,
    localized: {
      en: {
        name: 'Agent G',
        description: 'Coordinate autonomous workflows across your AI workspace.',
      },
      ka: {
        name: 'აგენტი G',
        description: 'მართე ავტონომიური პროცესები შენს AI სამუშაო გარემოში.',
      },
      ru: {
        name: 'Агент G',
        description: 'Координируйте автономные процессы в вашем AI-рабочем пространстве.',
      },
    },
  },
  {
    slug: 'social-media-manager',
    title: 'Social Media Manager',
    href: '/services/social-media-manager',
    id: 'social-media-manager',
    name: 'Social Media Manager',
    description: 'Create social content pipelines and publishing-ready outputs.',
    icon: '📣',
    route: '/services/social-media-manager',
    enabled: true,
    localized: {
      en: {
        name: 'Social Media Manager',
        description: 'Create social content pipelines and publishing-ready outputs.',
      },
      ka: {
        name: 'სოციალური მედიის მენეჯერი',
        description: 'შექმენი სოციალური მედიის კონტენტი და გამოაქვეყნე ავტომატურად.',
      },
      ru: {
        name: 'Менеджер соцсетей',
        description: 'Создавайте контент для соцсетей и публикуйте его автоматически.',
      },
    },
  },
  {
    slug: 'prompt-builder',
    title: 'Prompt Builder',
    href: '/services/prompt-builder',
    id: 'prompt-builder',
    name: 'Prompt Builder',
    description: 'Design reusable prompt systems for consistent AI performance.',
    icon: '🧩',
    route: '/services/prompt-builder',
    enabled: true,
    localized: {
      en: {
        name: 'Prompt Builder',
        description: 'Design reusable prompt systems for consistent AI performance.',
      },
      ka: {
        name: 'პრომპტების კონსტრუქტორი',
        description: 'ააგე მრავალჯერ გამოყენებადი prompt სისტემები სტაბილური შედეგებისთვის.',
      },
      ru: {
        name: 'Конструктор промптов',
        description: 'Создавайте переиспользуемые промпт-системы для стабильных результатов.',
      },
    },
  },
  {
    slug: 'text-intelligence',
    title: 'Text Intelligence',
    href: '/services/text-intelligence',
    id: 'text-intelligence',
    name: 'Text Intelligence',
    description: 'Generate, optimize, and analyze strategic text content.',
    icon: '📝',
    route: '/services/text-intelligence',
    enabled: true,
    localized: {
      en: {
        name: 'Text Intelligence',
        description: 'Generate, optimize, and analyze strategic text content.',
      },
      ka: {
        name: 'ტექსტური ინტელექტი',
        description: 'შექმენი, გააუმჯობესე და გააანალიზე სტრატეგიული ტექსტური კონტენტი.',
      },
      ru: {
        name: 'Текстовый интеллект',
        description: 'Создавайте, оптимизируйте и анализируйте стратегический текстовый контент.',
      },
    },
  },
  {
    slug: 'photo-studio',
    title: 'Photo Studio',
    href: '/services/photo-studio',
    id: 'photo-studio',
    name: 'Photo Studio',
    description: 'Create editorial photo outputs and campaign image sets.',
    icon: '📸',
    route: '/services/photo-studio',
    enabled: true,
    localized: {
      en: {
        name: 'Photo Studio',
        description: 'Create editorial photo outputs and campaign image sets.',
      },
      ka: {
        name: 'ფოტო სტუდია',
        description: 'დაამზადე სარედაქციო ფოტოკონტენტი და კამპანიური ვიზუალები.',
      },
      ru: {
        name: 'Фотостудия',
        description: 'Создавайте редакционный фотоконтент и визуалы для кампаний.',
      },
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
