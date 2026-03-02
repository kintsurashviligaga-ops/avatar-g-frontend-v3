// lib/services/metadata.ts
// Rich metadata for each service — used by dynamic service pages

export type ServiceMeta = { icon: string; headline: string; description: string; features: string[] }

export type LocalizedServiceMeta = {
  icon: string;
  headline: Record<string, string>;
  description: Record<string, string>;
  features: Record<string, string[]>;
  agentId: string;
}

/** Get localized metadata for a service */
export function getLocalizedMeta(slug: string, locale: string): ServiceMeta | undefined {
  const m = LOCALIZED_SERVICE_META[slug];
  if (!m) return undefined;
  return {
    icon: m.icon,
    headline: m.headline[locale] ?? m.headline['en']!,
    description: m.description[locale] ?? m.description['en']!,
    features: m.features[locale] ?? m.features['en']!,
  };
}

export function getAgentIdForService(slug: string): string {
  return LOCALIZED_SERVICE_META[slug]?.agentId ?? 'main-assistant';
}

const LOCALIZED_SERVICE_META: Record<string, LocalizedServiceMeta> = {
  'avatar': {
    icon: '⬡',
    agentId: 'main-assistant',
    headline: {
      en: 'Build Your AI Avatar',
      ka: 'შექმენი შენი AI ავატარი',
      ru: 'Создайте свой AI-аватар',
    },
    description: {
      en: 'Create photorealistic, stylized, or full-body avatars from a single photo. Export to GLB, poster, PNG, and turntable video.',
      ka: 'შექმენი ფოტორეალისტური, სტილიზებული ან სრული სხეულის ავატარები ერთი ფოტოდან. ექსპორტი GLB, პოსტერი, PNG და ბრუნვის ვიდეო.',
      ru: 'Создавайте фотореалистичные, стилизованные или полноростовые аватары с одного фото. Экспорт в GLB, постер, PNG и видео.',
    },
    features: {
      en: ['Scan · Studio · Stylized modes', 'Full-body guarantee', 'Outfit + pose + lighting presets', 'Export pack: GLB + Poster + Turntable'],
      ka: ['სკანი · სტუდია · სტილიზებული რეჟიმები', 'სრული სხეულის გარანტია', 'ტანსაცმელი + პოზა + განათების პრესეტები', 'ექსპორტი: GLB + პოსტერი + ბრუნვა'],
      ru: ['Скан · Студия · Стилизованные режимы', 'Гарантия полного тела', 'Одежда + поза + пресеты освещения', 'Экспорт: GLB + Постер + Вращение'],
    },
  },
  'agent-g': {
    icon: '◈',
    agentId: 'executive-agent-g',
    headline: {
      en: 'Agent G — Your AI Director',
      ka: 'აგენტი G — შენი AI დირექტორი',
      ru: 'Агент G — Ваш AI-директор',
    },
    description: {
      en: 'The orchestration brain behind every service. Give it a goal, it builds the plan and executes it end-to-end.',
      ka: 'ორკესტრაციის ტვინი ყველა სერვისის უკან. მიეცით მიზანი, ის აგებს გეგმას და ასრულებს ბოლომდე.',
      ru: 'Мозг оркестровки за каждым сервисом. Дайте цель — он составит план и выполнит его от начала до конца.',
    },
    features: {
      en: ['Multi-step pipeline orchestration', 'Quality gate enforcement', 'Multi-language output', 'One-click bundle execution'],
      ka: ['მრავალეტაპიანი ორკესტრაცია', 'ხარისხის კონტროლი', 'მრავალენოვანი გამომავალი', 'ერთი დაწკაპუნებით შესრულება'],
      ru: ['Многоэтапная оркестровка', 'Контроль качества', 'Многоязычный вывод', 'Выполнение в один клик'],
    },
  },
  'workflow': {
    icon: '⬡',
    agentId: 'automation-agent',
    headline: {
      en: 'Build Automated Workflows',
      ka: 'ავტომატური სამუშაო პროცესები',
      ru: 'Автоматизированные рабочие процессы',
    },
    description: {
      en: 'Design drag-and-drop automation pipelines connecting every AI service. Schedule, trigger, and approve automatically.',
      ka: 'შექმენი ავტომატიზაციის პროცესები, რომლებიც აკავშირებს ყველა AI სერვისს. დაგეგმე, გააქტიურე და დაამტკიცე ავტომატურად.',
      ru: 'Создавайте пайплайны автоматизации для всех AI-сервисов. Планируйте, запускайте и утверждайте автоматически.',
    },
    features: {
      en: ['Visual DAG editor', 'Retry + cost strategies', 'Schedule + approval gates', 'Workflow templates'],
      ka: ['ვიზუალური DAG რედაქტორი', 'განმეორება + ხარჯების სტრატეგიები', 'გრაფიკი + დამტკიცების კარიბჭეები', 'შაბლონები'],
      ru: ['Визуальный DAG-редактор', 'Стратегии повторов + затрат', 'Расписание + утверждение', 'Шаблоны процессов'],
    },
  },
  'video': {
    icon: '▷',
    agentId: 'video-agent',
    headline: {
      en: 'AI Video Studio',
      ka: 'AI ვიდეო სტუდია',
      ru: 'AI Видеостудия',
    },
    description: {
      en: 'From storyboard to final export. Generate shot lists, b-roll, captions, and multi-platform aspect ratios automatically.',
      ka: 'სტორიბორდიდან საბოლოო ექსპორტამდე. გენერირება: კადრების სია, b-roll, სუბტიტრები და მულტიპლატფორმის ფორმატები.',
      ru: 'От раскадровки до финального экспорта. Генерация списков кадров, b-roll, субтитров и форматов для всех платформ.',
    },
    features: {
      en: ['Storyboard generation', 'Auto b-roll + shot list', 'Caption styles (14+ presets)', '9:16 · 1:1 · 16:9 exports'],
      ka: ['სტორიბორდის გენერაცია', 'ავტო b-roll + კადრების სია', 'სუბტიტრების სტილები (14+ პრესეტი)', '9:16 · 1:1 · 16:9 ექსპორტი'],
      ru: ['Генерация раскадровки', 'Авто b-roll + список кадров', 'Стили субтитров (14+ пресетов)', 'Экспорт 9:16 · 1:1 · 16:9'],
    },
  },
  'editing': {
    icon: '⬡',
    agentId: 'video-agent',
    headline: {
      en: 'Universal Video Editing',
      ka: 'უნივერსალური ვიდეო რედაქტირება',
      ru: 'Универсальный видеоредактор',
    },
    description: {
      en: 'CapCut-level editing powered by AI. Trim, transition, subtitle, lip-sync, color grade, and watermark — automated.',
      ka: 'AI-ით მართული რედაქტირება. მორთვა, გადასვლა, სუბტიტრები, ლიპ-სინქ, ფერის კორექცია და ვოტერმარკი — ავტომატურად.',
      ru: 'Редактирование на уровне CapCut с AI. Обрезка, переходы, субтитры, липсинк, цветокоррекция и водяной знак — автоматически.',
    },
    features: {
      en: ['Auto subtitles (Whisper ASR)', 'Lip sync + color grade', 'Loudness normalization', 'Multi-format batch export'],
      ka: ['ავტო სუბტიტრები (Whisper ASR)', 'ლიპ-სინქ + ფერის კორექცია', 'ხმის ნორმალიზაცია', 'მულტიფორმატის ექსპორტი'],
      ru: ['Авто субтитры (Whisper ASR)', 'Липсинк + цветокоррекция', 'Нормализация громкости', 'Пакетный экспорт'],
    },
  },
  'music': {
    icon: '♪',
    agentId: 'audio-agent',
    headline: {
      en: 'AI Music Studio',
      ka: 'AI მუსიკის სტუდია',
      ru: 'AI Музыкальная студия',
    },
    description: {
      en: 'Generate original tracks, apply vocal chains, mix and master — with Georgian syllable alignment built in.',
      ka: 'შექმენი ორიგინალური ტრეკები, ვოკალური ჯაჭვები, მიქსი და მასტერინგი — ქართული სილაბური გასწორებით.',
      ru: 'Создавайте оригинальные треки, вокальные цепочки, сведение и мастеринг — с грузинской слоговой синхронизацией.',
    },
    features: {
      en: ['Beat + vocal presets', 'Mix & master engine', 'Stems export (premium)', 'KA syllable alignment'],
      ka: ['ბითი + ვოკალური პრესეტები', 'მიქსი და მასტერინგი', 'სტემების ექსპორტი (პრემიუმ)', 'KA სილაბური გასწორება'],
      ru: ['Бит + вокальные пресеты', 'Движок сведения/мастеринга', 'Экспорт стемов (премиум)', 'Слоговая синхронизация'],
    },
  },
  'media': {
    icon: '⬡',
    agentId: 'content-agent',
    headline: {
      en: 'Media Production Hub',
      ka: 'მედია პროდუქციის ჰაბი',
      ru: 'Хаб медиапроизводства',
    },
    description: {
      en: 'Generate complete campaign packs. Brand kit consistency, deliverables checklist, and brief parsing — automated.',
      ka: 'შექმენი სრული კამპანიის პაკეტები. ბრენდის კიტის თანმიმდევრულობა, მიღწევების ჩამონათვალი — ავტომატურად.',
      ru: 'Создавайте полные пакеты кампаний. Согласованность брендбука, чек-лист результатов и парсинг брифа — автоматически.',
    },
    features: {
      en: ['Campaign pack generator', 'Brand kit enforcement', 'Deliverables checklist', 'Brief → asset pipeline'],
      ka: ['კამპანიის პაკეტის გენერატორი', 'ბრენდის კიტის კონტროლი', 'მიღწევების ჩამონათვალი', 'ბრიფი → აქტივების პაიპლაინი'],
      ru: ['Генератор пакетов кампаний', 'Контроль брендбука', 'Чек-лист результатов', 'Бриф → пайплайн активов'],
    },
  },
  'photo': {
    icon: '◎',
    agentId: 'image-agent',
    headline: {
      en: 'AI Photo Studio',
      ka: 'AI ფოტო სტუდია',
      ru: 'AI Фотостудия',
    },
    description: {
      en: 'Background removal, professional retouching, and batch processing for entire photo sets in seconds.',
      ka: 'ფონის წაშლა, პროფესიონალური რეტუში და ფოტო ნაკრებების ჯგუფური დამუშავება წამებში.',
      ru: 'Удаление фона, профессиональная ретушь и пакетная обработка целых фотосетов за секунды.',
    },
    features: {
      en: ['Background remove + replace', 'Retouch preset library', 'Batch processing', 'Before/after comparison'],
      ka: ['ფონის წაშლა + ჩანაცვლება', 'რეტუშის პრესეტების ბიბლიოთეკა', 'ჯგუფური დამუშავება', 'შედარება: წინ/შემდეგ'],
      ru: ['Удаление + замена фона', 'Библиотека ретушь-пресетов', 'Пакетная обработка', 'Сравнение до/после'],
    },
  },
  'image': {
    icon: '⬡',
    agentId: 'image-agent',
    headline: {
      en: 'AI Image Creator',
      ka: 'AI სურათების შემქმნელი',
      ru: 'AI Генератор изображений',
    },
    description: {
      en: 'Generate posters, thumbnails, and ad-ready images with platform-specific safe zones and style packs.',
      ka: 'შექმენი პოსტერები, მინიატურები და სარეკლამო სურათები პლატფორმის უსაფრთხო ზონებით და სტილის პაკეტებით.',
      ru: 'Создавайте постеры, миниатюры и рекламные изображения с безопасными зонами и стилевыми пакетами.',
    },
    features: {
      en: ['Poster + thumbnail + ad formats', 'Style pack library', 'Safe area enforcement', 'Prompt variation engine'],
      ka: ['პოსტერი + მინიატურა + რეკლამის ფორმატები', 'სტილის პაკეტების ბიბლიოთეკა', 'უსაფრთხო ზონების კონტროლი', 'პრომპტის ვარიაციების ძრავი'],
      ru: ['Постер + миниатюра + рекламные форматы', 'Библиотека стилевых пакетов', 'Контроль безопасных зон', 'Движок вариаций промптов'],
    },
  },
  'visual-intel': {
    icon: '◉',
    agentId: 'research-agent',
    headline: {
      en: 'Visual Intelligence',
      ka: 'ვიზუალური ინტელექტი',
      ru: 'Визуальный интеллект',
    },
    description: {
      en: 'Score your creative work 0–100. Get fail reasons, auto-improve suggestions, and brand consistency audits.',
      ka: 'შეაფასე შენი სამუშაო 0–100. მიიღე წარუმატებლობის მიზეზები, გაუმჯობესების წინადადებები და ბრენდის აუდიტი.',
      ru: 'Оцените работу от 0 до 100. Получите причины ошибок, рекомендации и аудит бренда.',
    },
    features: {
      en: ['Creative scoring 0–100', 'Fail reason analysis', 'Auto-improve suggestions', 'Brand consistency audit'],
      ka: ['კრეატიული შეფასება 0–100', 'წარუმატებლობის ანალიზი', 'ავტო-გაუმჯობესება', 'ბრენდის თანმიმდევრულობის აუდიტი'],
      ru: ['Креативная оценка 0–100', 'Анализ причин ошибок', 'Авто-улучшение', 'Аудит бренда'],
    },
  },
  'text': {
    icon: '⬡',
    agentId: 'content-agent',
    headline: {
      en: 'Text Intelligence',
      ka: 'ტექსტის ინტელექტი',
      ru: 'Текстовый интеллект',
    },
    description: {
      en: 'Write ads, landing pages, scripts, and docs using AIDA/PAS frameworks — in KA, EN, and RU simultaneously.',
      ka: 'დაწერე რეკლამა, ლენდინგები, სკრიპტები და დოკუმენტები AIDA/PAS ჩარჩოებით — KA, EN და RU-ზე ერთდროულად.',
      ru: 'Пишите рекламу, лендинги, сценарии и документы на AIDA/PAS — одновременно на KA, EN и RU.',
    },
    features: {
      en: ['Ads · Landing pages · Scripts', 'AIDA / PAS frameworks', 'SEO pack', 'KA / EN / RU output'],
      ka: ['რეკლამა · ლენდინგები · სკრიპტები', 'AIDA / PAS ჩარჩოები', 'SEO პაკეტი', 'KA / EN / RU გამომავალი'],
      ru: ['Реклама · Лендинги · Сценарии', 'Фреймворки AIDA / PAS', 'SEO-пакет', 'Вывод KA / EN / RU'],
    },
  },
  'prompt': {
    icon: '⬡',
    agentId: 'content-agent',
    headline: {
      en: 'Prompt Builder',
      ka: 'პრომპტის მშენებელი',
      ru: 'Конструктор промптов',
    },
    description: {
      en: 'Design, test, and export reusable prompt cards for consistent AI generation across all scenes and sessions.',
      ka: 'შექმენი, შეამოწმე და ექსპორტე მრავალჯერადი პრომპტ ბარათები AI გენერაციის თანმიმდევრულობისთვის.',
      ru: 'Создавайте, тестируйте и экспортируйте многоразовые карточки промптов для единообразной AI-генерации.',
    },
    features: {
      en: ['Prompt card library', 'Negative prompt sets', 'Scene consistency engine', 'Export JSON pack'],
      ka: ['პრომპტ ბარათების ბიბლიოთეკა', 'ნეგატიური პრომპტები', 'სცენის თანმიმდევრულობა', 'JSON პაკეტის ექსპორტი'],
      ru: ['Библиотека карточек', 'Наборы негативных промптов', 'Движок сценарной целостности', 'Экспорт JSON-пакета'],
    },
  },
  'shop': {
    icon: '⬡',
    agentId: 'marketplace-agent',
    headline: {
      en: 'Online Shop',
      ka: 'ონლაინ მაღაზია',
      ru: 'Интернет-магазин',
    },
    description: {
      en: 'Create listings, set up subscriptions, manage affiliate links, and run store audits — all AI-driven.',
      ka: 'შექმენი განცხადებები, გამოწერები, აფილიატე ლინკები და მაღაზიის აუდიტი — ყველაფერი AI-ით.',
      ru: 'Создавайте листинги, подписки, партнёрские ссылки и аудиты магазина — всё с помощью AI.',
    },
    features: {
      en: ['Listing creation + optimization', 'Subscription setup', 'Affiliate link system', 'Store audit report'],
      ka: ['განცხადებების შექმნა + ოპტიმიზაცია', 'გამოწერის დაყენება', 'აფილიატე ლინკების სისტემა', 'მაღაზიის აუდიტის ანგარიში'],
      ru: ['Создание + оптимизация листингов', 'Настройка подписок', 'Партнёрская система', 'Аудит магазина'],
    },
  },
  'software': {
    icon: '💻',
    agentId: 'dev-agent',
    headline: {
      en: 'Software Development',
      ka: 'პროგრამული უზრუნველყოფა',
      ru: 'Разработка ПО',
    },
    description: {
      en: 'AI-assisted code generation, review, refactoring, and deployment pipelines for any stack.',
      ka: 'AI-ით კოდის გენერაცია, მიმოხილვა, რეფაქტორინგი და დეპლოი ნებისმიერი სტეკისთვის.',
      ru: 'AI-генерация кода, ревью, рефакторинг и деплой-пайплайны для любого стека.',
    },
    features: {
      en: ['Code generation (any language)', 'PR review + refactor', 'CI/CD pipeline builder', 'Architecture diagrams'],
      ka: ['კოდის გენერაცია (ნებისმიერი ენა)', 'PR მიმოხილვა + რეფაქტორინგი', 'CI/CD პაიპლაინი', 'არქიტექტურის დიაგრამები'],
      ru: ['Генерация кода (любой язык)', 'Ревью PR + рефакторинг', 'CI/CD пайплайн', 'Архитектурные диаграммы'],
    },
  },
  'business': {
    icon: '💼',
    agentId: 'business-agent',
    headline: {
      en: 'Business Agent',
      ka: 'ბიზნეს აგენტი',
      ru: 'Бизнес-агент',
    },
    description: {
      en: 'Market research, competitive analysis, pitch decks, financial modeling, and strategy reports — automated.',
      ka: 'ბაზრის კვლევა, კონკურენტული ანალიზი, პრეზენტაციები, ფინანსური მოდელირება — ავტომატურად.',
      ru: 'Исследование рынка, конкурентный анализ, питч-деки, финансовое моделирование — автоматически.',
    },
    features: {
      en: ['Market research reports', 'Pitch deck generator', 'Financial projections', 'Competitor analysis'],
      ka: ['ბაზრის კვლევის ანგარიშები', 'პრეზენტაციის გენერატორი', 'ფინანსური პროგნოზები', 'კონკურენტის ანალიზი'],
      ru: ['Отчёты маркетинговых исследований', 'Генератор питч-деков', 'Финансовые прогнозы', 'Анализ конкурентов'],
    },
  },
  'tourism': {
    icon: '✈️',
    agentId: 'tourism-agent',
    headline: {
      en: 'Tourism AI',
      ka: 'ტურიზმი AI',
      ru: 'Туризм AI',
    },
    description: {
      en: 'AI-powered travel planning, smart itineraries, local dining & culture guides, and booking optimization.',
      ka: 'AI მოგზაურობის დაგეგმვა, ჭკვიანი მარშრუტები, ადგილობრივი გიდი და ჯავშნის ოპტიმიზაცია.',
      ru: 'AI-планирование путешествий, умные маршруты, местные гиды и оптимизация бронирований.',
    },
    features: {
      en: ['Smart itinerary builder', 'Local dining & culture guide', 'Booking price optimizer', 'Multi-city planner'],
      ka: ['ჭკვიანი მარშრუტის შემქმნელი', 'ადგილობრივი კულტურის გიდი', 'ჯავშნის ფასის ოპტიმიზატორი', 'მრავალქალაქიანი დაგეგმვა'],
      ru: ['Умный планировщик маршрутов', 'Гид по местной культуре', 'Оптимизатор цен бронирования', 'Мультигородской планировщик'],
    },
  },
};

// Legacy flat English-only format for backward compatibility
export const SERVICE_META: { [key: string]: ServiceMeta } = Object.fromEntries(
  Object.entries(LOCALIZED_SERVICE_META).map(([key, val]) => [
    key,
    {
      icon: val.icon,
      headline: val.headline['en']!,
      description: val.description['en']!,
      features: val.features['en']!,
    },
  ])
);
