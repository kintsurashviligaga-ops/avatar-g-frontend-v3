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

/** Sidebar navigation categories */
export const NAV_CATEGORIES = [
  { slug: 'all', label: { en: 'All Services', ka: 'ყველა სერვისი', ru: 'Все сервисы' }, href: '/services' },
  { slug: 'avatar', label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' }, href: '/services/avatar' },
  { slug: 'video', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' }, href: '/services/video' },
  { slug: 'image', label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' }, href: '/services/image' },
  { slug: 'music', label: { en: 'Music', ka: 'მუსიკა', ru: 'Музыка' }, href: '/services/music' },
  { slug: 'business', label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' }, href: '/business' },
  { slug: 'pricing', label: { en: 'Pricing', ka: 'ფასები', ru: 'Цены' }, href: '/pricing' },
] as const;
