/**
 * Service Workspace Configuration
 * 
 * Defines the per-service hamburger menu items, quick actions,
 * tool panels, and cross-service transfer actions for every MyAvatar.ge service.
 */

export type LocaleText = { en: string; ka: string; ru: string }

/* ─── Menu Item ─────────────────────────────────────────────────── */
export interface ServiceMenuItem {
  id: string
  icon: string   // emoji or icon key
  label: LocaleText
  action: 'navigate' | 'toggle' | 'transfer' | 'preset'
  /** For navigate: relative slug; for transfer: target service slug */
  target?: string
  /** Prefill prompt for preset actions */
  prompt?: string
  divider?: boolean
}

/* ─── Quick Action ──────────────────────────────────────────────── */
export interface ServiceQuickAction {
  id: string
  icon: string
  label: LocaleText
  prompt: string
}

/* ─── Tool Panel ────────────────────────────────────────────────── */
export interface ServiceTool {
  id: string
  icon: string
  label: LocaleText
  type: 'toggle' | 'select' | 'slider' | 'upload' | 'camera'
  options?: { value: string; label: LocaleText }[]
  defaultValue?: string
}

/* ─── Transfer Action ───────────────────────────────────────────── */
export interface TransferAction {
  id: string
  targetService: string
  icon: string
  label: LocaleText
  description: LocaleText
}

/* ─── Full Service Workspace Config ─────────────────────────────── */
export interface ServiceWorkspaceConfig {
  serviceId: string
  menuItems: ServiceMenuItem[]
  quickActions: ServiceQuickAction[]
  tools: ServiceTool[]
  transfers: TransferAction[]
  welcomeHint: LocaleText
  outputLabel: LocaleText
}

/* ════════════════════════════════════════════════════════════════════
   SERVICE CONFIGURATIONS
   ════════════════════════════════════════════════════════════════════ */

export const SERVICE_WORKSPACE_CONFIGS: Record<string, ServiceWorkspaceConfig> = {

  /* ─── 1. AVATAR ───────────────────────────────────────────────── */
  avatar: {
    serviceId: 'avatar',
    welcomeHint: {
      en: 'Create photorealistic avatars from text or photos',
      ka: 'შექმენი ფოტორეალისტური ავატარები ტექსტიდან ან ფოტოდან',
      ru: 'Создавайте фотореалистичные аватары из текста или фото',
    },
    outputLabel: { en: 'Avatar Preview', ka: 'ავატარის გადახედვა', ru: 'Просмотр аватара' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Avatar', ka: 'ახალი ავატარი', ru: 'Новый аватар' }, action: 'preset', prompt: 'Create a new avatar' },
      { id: 'my-avatars', icon: '👤', label: { en: 'My Avatars', ka: 'ჩემი ავატარები', ru: 'Мои аватары' }, action: 'navigate', target: 'gallery' },
      { id: 'reference', icon: '📎', label: { en: 'Upload Reference', ka: 'რეფერენსის ატვირთვა', ru: 'Загрузить референс' }, action: 'toggle', target: 'upload' },
      { id: 'styles', icon: '🎨', label: { en: 'Style Presets', ka: 'სტილის პრესეტები', ru: 'Стили' }, action: 'toggle', target: 'styles' },
      { id: 'export', icon: '📤', label: { en: 'Export Options', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-video', icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'В видео' }, action: 'transfer', target: 'video' },
      { id: 'to-image', icon: '🖼️', label: { en: 'Use in Poster', ka: 'პოსტერში გამოყენება', ru: 'В постер' }, action: 'transfer', target: 'image' },
      { id: 'to-workflow', icon: '⚡', label: { en: 'Add to Workflow', ka: 'Workflow-ში დამატება', ru: 'В воркфлоу' }, action: 'transfer', target: 'workflow' },
      { id: 'to-agent', icon: '🤖', label: { en: 'Continue with Agent G', ka: 'Agent G-ით გაგრძელება', ru: 'Продолжить с Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'realistic', icon: '📸', label: { en: 'Realistic Portrait', ka: 'რეალისტური პორტრეტი', ru: 'Реалистичный портрет' }, prompt: 'Generate a photorealistic portrait avatar with studio lighting' },
      { id: 'anime', icon: '🎌', label: { en: 'Anime Style', ka: 'ანიმე სტილი', ru: 'Аниме стиль' }, prompt: 'Generate an anime-style character avatar with vibrant colors' },
      { id: 'business', icon: '💼', label: { en: 'Business Headshot', ka: 'ბიზნეს ფოტო', ru: 'Бизнес-фото' }, prompt: 'Create a professional business headshot avatar' },
      { id: '3d-body', icon: '🧍', label: { en: '3D Full Body', ka: '3D სრული სხეული', ru: '3D в полный рост' }, prompt: 'Generate a full-body 3D avatar model with detailed clothing' },
    ],
    tools: [
      { id: 'style', icon: '🎨', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'select', options: [
        { value: 'realistic', label: { en: 'Realistic', ka: 'რეალისტური', ru: 'Реалистичный' } },
        { value: 'stylized', label: { en: 'Stylized', ka: 'სტილიზებული', ru: 'Стилизованный' } },
        { value: 'anime', label: { en: 'Anime', ka: 'ანიმე', ru: 'Аниме' } },
        { value: 'cinematic', label: { en: 'Cinematic', ka: 'კინემატოგრაფიული', ru: 'Кинематографический' } },
      ], defaultValue: 'realistic' },
      { id: 'body', icon: '🧍', label: { en: 'Body Type', ka: 'სხეულის ტიპი', ru: 'Тип тела' }, type: 'select', options: [
        { value: 'portrait', label: { en: 'Portrait', ka: 'პორტრეტი', ru: 'Портрет' } },
        { value: 'fullbody', label: { en: 'Full Body', ka: 'სრული სხეული', ru: 'В полный рост' } },
      ], defaultValue: 'portrait' },
      { id: 'upload-ref', icon: '📎', label: { en: 'Reference Image', ka: 'რეფერენსი', ru: 'Референс' }, type: 'upload' },
      { id: 'camera', icon: '📷', label: { en: 'Selfie / Camera', ka: 'სელფი / კამერა', ru: 'Селфи / Камера' }, type: 'camera' },
    ],
    transfers: [
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, description: { en: 'Send avatar to Video Generation', ka: 'ავატარის გაგზავნა ვიდეო სერვისში', ru: 'Отправить аватар в видео' } },
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Create Poster', ka: 'პოსტერი', ru: 'Постер' }, description: { en: 'Use avatar in Image/Poster service', ka: 'ავატარით პოსტერის შექმნა', ru: 'Использовать в постере' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'List in Shop', ka: 'მაღაზიაში', ru: 'В магазин' }, description: { en: 'Sell avatar in Digital Shop', ka: 'ავატარის გაყიდვა მაღაზიაში', ru: 'Продать в магазине' } },
      { id: 'to-workflow', targetService: 'workflow', icon: '⚡', label: { en: 'Add to Workflow', ka: 'Workflow', ru: 'В воркфлоу' }, description: { en: 'Continue in automated workflow', ka: 'ავტომატიზებულ workflow-ში გაგრძელება', ru: 'В автоматизированный воркфлоу' } },
    ],
  },

  /* ─── 2. VIDEO ────────────────────────────────────────────────── */
  video: {
    serviceId: 'video',
    welcomeHint: {
      en: 'Generate cinematic AI videos from text or images',
      ka: 'გენერირე კინემატოგრაფიული AI ვიდეოები',
      ru: 'Генерируйте кинематографические AI-видео',
    },
    outputLabel: { en: 'Video Preview', ka: 'ვიდეოს გადახედვა', ru: 'Просмотр видео' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Video', ka: 'ახალი ვიდეო', ru: 'Новое видео' }, action: 'preset', prompt: 'Create a new video' },
      { id: 'my-videos', icon: '🎬', label: { en: 'My Videos', ka: 'ჩემი ვიდეოები', ru: 'Мои видео' }, action: 'navigate', target: 'gallery' },
      { id: 'templates', icon: '📋', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, action: 'toggle', target: 'templates' },
      { id: 'ratios', icon: '📐', label: { en: 'Aspect Ratios', ka: 'პროპორციები', ru: 'Соотношения' }, action: 'toggle', target: 'ratios' },
      { id: 'storyboard', icon: '📖', label: { en: 'Storyboard', ka: 'სტორიბორდი', ru: 'Раскадровка' }, action: 'toggle', target: 'storyboard' },
      { id: 'upload', icon: '📎', label: { en: 'Upload Source', ka: 'წყაროს ატვირთვა', ru: 'Загрузить источник' }, action: 'toggle', target: 'upload' },
      { id: 'export', icon: '📤', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-editing', icon: '✂️', label: { en: 'Send to Editing', ka: 'ედიტინგში', ru: 'В монтаж' }, action: 'transfer', target: 'editing' },
      { id: 'to-music', icon: '🎵', label: { en: 'Add Music', ka: 'მუსიკის დამატება', ru: 'Добавить музыку' }, action: 'transfer', target: 'music' },
      { id: 'to-text', icon: '✍️', label: { en: 'Add Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, action: 'transfer', target: 'text' },
      { id: 'to-agent', icon: '🤖', label: { en: 'Continue with Agent G', ka: 'Agent G-ით გაგრძელება', ru: 'Продолжить с Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'cinematic', icon: '🎥', label: { en: 'Cinematic Short', ka: 'კინემატოგრაფიული', ru: 'Кинематографический' }, prompt: 'Generate a 10-second cinematic video clip with dramatic lighting' },
      { id: 'reel', icon: '📱', label: { en: 'Social Reel 9:16', ka: 'სოც. რილსი', ru: 'Рилс 9:16' }, prompt: 'Generate a vertical 9:16 social media reel' },
      { id: 'product', icon: '📦', label: { en: 'Product Demo', ka: 'პროდუქტის დემო', ru: 'Демо продукта' }, prompt: 'Create a clean product demonstration video' },
      { id: 'scene', icon: '🎬', label: { en: 'Scene Builder', ka: 'სცენების შექმნა', ru: 'Построитель сцен' }, prompt: 'Build a multi-scene video sequence with custom transitions' },
    ],
    tools: [
      { id: 'ratio', icon: '📐', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Соотношение' }, type: 'select', options: [
        { value: '16:9', label: { en: '16:9 Landscape', ka: '16:9 ლენდსკეიპი', ru: '16:9 Альбом' } },
        { value: '9:16', label: { en: '9:16 Portrait', ka: '9:16 პორტრეტი', ru: '9:16 Портрет' } },
        { value: '1:1', label: { en: '1:1 Square', ka: '1:1 კვადრატი', ru: '1:1 Квадрат' } },
      ], defaultValue: '16:9' },
      { id: 'style', icon: '🎨', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'select', options: [
        { value: 'cinematic', label: { en: 'Cinematic', ka: 'კინო', ru: 'Кино' } },
        { value: 'animated', label: { en: 'Animated', ka: 'ანიმაცია', ru: 'Анимация' } },
        { value: 'realistic', label: { en: 'Realistic', ka: 'რეალისტური', ru: 'Реалистичный' } },
      ], defaultValue: 'cinematic' },
      { id: 'upload-src', icon: '📎', label: { en: 'Source Media', ka: 'წყარო', ru: 'Источник' }, type: 'upload' },
    ],
    transfers: [
      { id: 'to-editing', targetService: 'editing', icon: '✂️', label: { en: 'Edit Video', ka: 'რედაქტირება', ru: 'Монтаж' }, description: { en: 'Send to Video Editing', ka: 'ვიდეო ედიტინგში გაგზავნა', ru: 'На монтаж' } },
      { id: 'to-music', targetService: 'music', icon: '🎵', label: { en: 'Add Soundtrack', ka: 'საუნდტრეკი', ru: 'Саундтрек' }, description: { en: 'Add music to your video', ka: 'მუსიკის დამატება ვიდეოზე', ru: 'Добавить музыку' } },
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Add Captions', ka: 'სუბტიტრები', ru: 'Субтитры' }, description: { en: 'Generate captions & subtitles', ka: 'სუბტიტრების გენერაცია', ru: 'Генерация субтитров' } },
      { id: 'to-media', targetService: 'media', icon: '📊', label: { en: 'Media Production', ka: 'მედია', ru: 'Медиа' }, description: { en: 'Send to Media Production', ka: 'მედია პროდაქშენში', ru: 'В медиа-продакшн' } },
    ],
  },

  /* ─── 3. IMAGE ────────────────────────────────────────────────── */
  image: {
    serviceId: 'image',
    welcomeHint: {
      en: 'Create posters, thumbnails, and visual assets with AI',
      ka: 'შექმენი პოსტერები, მინიატურები და ვიზუალები',
      ru: 'Создавайте постеры, обложки и визуалы',
    },
    outputLabel: { en: 'Image Output', ka: 'სურათის შედეგი', ru: 'Результат' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Image', ka: 'ახალი სურათი', ru: 'Новое изображение' }, action: 'preset', prompt: 'Create a new image' },
      { id: 'posters', icon: '📰', label: { en: 'Posters', ka: 'პოსტერები', ru: 'Постеры' }, action: 'preset', prompt: 'Create a professional poster' },
      { id: 'thumbnails', icon: '🖼️', label: { en: 'Thumbnails', ka: 'მინიატურები', ru: 'Обложки' }, action: 'preset', prompt: 'Create a thumbnail' },
      { id: 'styles', icon: '🎨', label: { en: 'Style Presets', ka: 'სტილები', ru: 'Стили' }, action: 'toggle', target: 'styles' },
      { id: 'my-images', icon: '📁', label: { en: 'My Images', ka: 'ჩემი სურათები', ru: 'Мои изображения' }, action: 'navigate', target: 'gallery' },
      { id: 'reference', icon: '📎', label: { en: 'Upload Reference', ka: 'რეფერენსი', ru: 'Референс' }, action: 'toggle', target: 'upload' },
      { id: 'variants', icon: '🔄', label: { en: 'Generate Variants', ka: 'ვარიანტები', ru: 'Вариации' }, action: 'preset', prompt: 'Generate variants of the last image' },
      { id: 'export', icon: '📤', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-video', icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, action: 'transfer', target: 'video' },
      { id: 'to-shop', icon: '🛒', label: { en: 'Use in Shop', ka: 'მაღაზიაში', ru: 'В магазин' }, action: 'transfer', target: 'shop' },
      { id: 'to-agent', icon: '🤖', label: { en: 'Continue with Agent G', ka: 'Agent G-ით', ru: 'С Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'poster', icon: '📰', label: { en: 'Campaign Poster', ka: 'კამპანიის პოსტერი', ru: 'Постер' }, prompt: 'Generate a professional marketing campaign poster' },
      { id: 'social', icon: '📱', label: { en: 'Social Post', ka: 'სოც. პოსტი', ru: 'Пост' }, prompt: 'Create an eye-catching social media image' },
      { id: 'product', icon: '📦', label: { en: 'Product Photo', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' }, prompt: 'Generate a studio-quality product photo' },
      { id: 'concept', icon: '🎨', label: { en: 'Concept Art', ka: 'კონცეფტ არტი', ru: 'Концепт' }, prompt: 'Create detailed concept art' },
    ],
    tools: [
      { id: 'format', icon: '📐', label: { en: 'Format', ka: 'ფორმატი', ru: 'Формат' }, type: 'select', options: [
        { value: 'poster', label: { en: 'Poster', ka: 'პოსტერი', ru: 'Постер' } },
        { value: 'thumbnail', label: { en: 'Thumbnail', ka: 'მინიატურა', ru: 'Обложка' } },
        { value: 'square', label: { en: 'Square', ka: 'კვადრატი', ru: 'Квадрат' } },
        { value: 'banner', label: { en: 'Banner', ka: 'ბანერი', ru: 'Баннер' } },
      ], defaultValue: 'poster' },
      { id: 'style', icon: '🎨', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'select', options: [
        { value: 'photorealistic', label: { en: 'Photorealistic', ka: 'ფოტორეალისტური', ru: 'Фотореалистичный' } },
        { value: 'illustration', label: { en: 'Illustration', ka: 'ილუსტრაცია', ru: 'Иллюстрация' } },
        { value: 'minimal', label: { en: 'Minimal', ka: 'მინიმალისტური', ru: 'Минимализм' } },
      ], defaultValue: 'photorealistic' },
      { id: 'upload-ref', icon: '📎', label: { en: 'Reference', ka: 'რეფერენსი', ru: 'Референс' }, type: 'upload' },
    ],
    transfers: [
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Animate', ka: 'ანიმაცია', ru: 'Анимировать' }, description: { en: 'Animate image as video', ka: 'სურათის ვიდეოდ გადაქცევა', ru: 'Анимировать изображение' } },
      { id: 'to-photo', targetService: 'photo', icon: '📷', label: { en: 'Enhance', ka: 'გაუმჯობესება', ru: 'Улучшить' }, description: { en: 'Enhance quality with AI', ka: 'ხარისხის გაზრდა AI-ით', ru: 'Улучшить качество' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Sell', ka: 'გაყიდვა', ru: 'Продать' }, description: { en: 'List as product in shop', ka: 'მაღაზიაში გამოქვეყნება', ru: 'Разместить в магазине' } },
    ],
  },

  /* ─── 4. MUSIC ────────────────────────────────────────────────── */
  music: {
    serviceId: 'music',
    welcomeHint: {
      en: 'Compose original music, beats, and soundscapes',
      ka: 'შექმენი ორიგინალური მუსიკა და ბითები',
      ru: 'Создавайте оригинальную музыку и биты',
    },
    outputLabel: { en: 'Audio Player', ka: 'აუდიო პლეერი', ru: 'Аудио плеер' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Track', ka: 'ახალი ტრეკი', ru: 'Новый трек' }, action: 'preset', prompt: 'Create a new music track' },
      { id: 'my-music', icon: '🎵', label: { en: 'My Music', ka: 'ჩემი მუსიკა', ru: 'Моя музыка' }, action: 'navigate', target: 'gallery' },
      { id: 'genres', icon: '🎸', label: { en: 'Genre Presets', ka: 'ჟანრები', ru: 'Жанры' }, action: 'toggle', target: 'genres' },
      { id: 'moods', icon: '🎭', label: { en: 'Mood Presets', ka: 'მუდი', ru: 'Настроения' }, action: 'toggle', target: 'moods' },
      { id: 'vocal', icon: '🎤', label: { en: 'Instrumental / Vocal', ka: 'ინსტრუმენტ. / ვოკალი', ru: 'Инструм. / Вокал' }, action: 'toggle', target: 'vocal-mode' },
      { id: 'reference', icon: '📎', label: { en: 'Reference Input', ka: 'რეფერენსი', ru: 'Референс' }, action: 'toggle', target: 'upload' },
      { id: 'export', icon: '📤', label: { en: 'Export Audio', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-video', icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, action: 'transfer', target: 'video' },
      { id: 'to-media', icon: '📊', label: { en: 'Media Production', ka: 'მედია', ru: 'Медиа' }, action: 'transfer', target: 'media' },
      { id: 'to-agent', icon: '🤖', label: { en: 'Continue with Agent G', ka: 'Agent G-ით', ru: 'С Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'lofi', icon: '🎧', label: { en: 'Lo-Fi Beat', ka: 'ლო-ფაი', ru: 'Лоу-фай' }, prompt: 'Compose a chill lo-fi hip-hop beat with vinyl crackle and soft piano' },
      { id: 'epic', icon: '🎻', label: { en: 'Epic Score', ka: 'ეპიკური', ru: 'Эпический' }, prompt: 'Create an epic orchestral score with dramatic builds' },
      { id: 'jingle', icon: '📣', label: { en: 'Brand Jingle', ka: 'ჯინგლი', ru: 'Джингл' }, prompt: 'Produce a catchy 15-second brand jingle' },
      { id: 'ambient', icon: '🌊', label: { en: 'Ambient', ka: 'ამბიენტი', ru: 'Эмбиент' }, prompt: 'Generate ambient soundscape for relaxation or meditation' },
    ],
    tools: [
      { id: 'genre', icon: '🎸', label: { en: 'Genre', ka: 'ჟანრი', ru: 'Жанр' }, type: 'select', options: [
        { value: 'hiphop', label: { en: 'Hip-Hop', ka: 'ჰიპ-ჰოპი', ru: 'Хип-хоп' } },
        { value: 'electronic', label: { en: 'Electronic', ka: 'ელექტრონული', ru: 'Электроника' } },
        { value: 'orchestral', label: { en: 'Orchestral', ka: 'ორკესტრი', ru: 'Оркестр' } },
        { value: 'ambient', label: { en: 'Ambient', ka: 'ამბიენტი', ru: 'Эмбиент' } },
      ], defaultValue: 'electronic' },
      { id: 'mood', icon: '🎭', label: { en: 'Mood', ka: 'მუდი', ru: 'Настроение' }, type: 'select', options: [
        { value: 'happy', label: { en: 'Happy', ka: 'მხიარული', ru: 'Весёлый' } },
        { value: 'dramatic', label: { en: 'Dramatic', ka: 'დრამატული', ru: 'Драматичный' } },
        { value: 'chill', label: { en: 'Chill', ka: 'მშვიდი', ru: 'Спокойный' } },
        { value: 'energetic', label: { en: 'Energetic', ka: 'ენერგიული', ru: 'Энергичный' } },
      ], defaultValue: 'chill' },
      { id: 'vocal-mode', icon: '🎤', label: { en: 'Vocals', ka: 'ვოკალი', ru: 'Вокал' }, type: 'toggle' },
    ],
    transfers: [
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Add to Video', ka: 'ვიდეოში', ru: 'В видео' }, description: { en: 'Use as video soundtrack', ka: 'ვიდეოს საუნდტრეკად', ru: 'Как саундтрек' } },
      { id: 'to-media', targetService: 'media', icon: '📊', label: { en: 'Media Production', ka: 'მედია', ru: 'Медиа' }, description: { en: 'Add to media project', ka: 'მედია პროექტში', ru: 'В медиа-проект' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Sell Track', ka: 'გაყიდვა', ru: 'Продать' }, description: { en: 'List track in shop', ka: 'მაღაზიაში განთავსება', ru: 'Продать в магазине' } },
    ],
  },

  /* ─── 5. TEXT ──────────────────────────────────────────────────── */
  text: {
    serviceId: 'text',
    welcomeHint: {
      en: 'Write scripts, ads, captions, and marketing copy',
      ka: 'დაწერე სცენარები, რეკლამები და მარკეტინგული ტექსტი',
      ru: 'Пишите сценарии, рекламу и маркетинговые тексты',
    },
    outputLabel: { en: 'Text Output', ka: 'ტექსტის შედეგი', ru: 'Текстовый результат' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Text', ka: 'ახალი ტექსტი', ru: 'Новый текст' }, action: 'preset', prompt: 'Start writing new content' },
      { id: 'ad-copy', icon: '📣', label: { en: 'Ad Copy', ka: 'სარეკლამო', ru: 'Реклама' }, action: 'preset', prompt: 'Write compelling ad copy' },
      { id: 'script', icon: '🎬', label: { en: 'Script Writing', ka: 'სცენარი', ru: 'Сценарий' }, action: 'preset', prompt: 'Write a video/ad script' },
      { id: 'captions', icon: '💬', label: { en: 'Captions', ka: 'წარწერები', ru: 'Подписи' }, action: 'preset', prompt: 'Generate social media captions' },
      { id: 'product-desc', icon: '📦', label: { en: 'Product Description', ka: 'პროდუქტის აღწერა', ru: 'Описание товара' }, action: 'preset', prompt: 'Write product descriptions' },
      { id: 'seo', icon: '🔍', label: { en: 'SEO Text', ka: 'SEO ტექსტი', ru: 'SEO текст' }, action: 'preset', prompt: 'Write SEO-optimized content' },
      { id: 'my-docs', icon: '📁', label: { en: 'My Documents', ka: 'ჩემი ტექსტები', ru: 'Мои тексты' }, action: 'navigate', target: 'gallery' },
      { id: 'export', icon: '📤', label: { en: 'Export Text', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-video', icon: '🎬', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, action: 'transfer', target: 'video' },
      { id: 'to-shop', icon: '🛒', label: { en: 'Use in Store', ka: 'მაღაზიაში', ru: 'В магазин' }, action: 'transfer', target: 'shop' },
      { id: 'to-agent', icon: '🤖', label: { en: 'Continue with Agent G', ka: 'Agent G-ით', ru: 'С Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'ad', icon: '📣', label: { en: 'Ad Copy', ka: 'რეკლამა', ru: 'Реклама' }, prompt: 'Write compelling ad copy for a product launch' },
      { id: 'blog', icon: '📝', label: { en: 'Blog Article', ka: 'ბლოგი', ru: 'Статья' }, prompt: 'Write an SEO-optimized blog article' },
      { id: 'landing', icon: '🌐', label: { en: 'Landing Page', ka: 'ლენდინგი', ru: 'Лендинг' }, prompt: 'Generate landing page copy' },
      { id: 'translate', icon: '🌍', label: { en: 'Multi-Language', ka: 'მრავალენოვანი', ru: 'Мультиязычный' }, prompt: 'Translate and adapt content for EN, KA, RU' },
    ],
    tools: [
      { id: 'tone', icon: '🎯', label: { en: 'Tone', ka: 'ტონი', ru: 'Тон' }, type: 'select', options: [
        { value: 'professional', label: { en: 'Professional', ka: 'პროფესიონალური', ru: 'Профессиональный' } },
        { value: 'casual', label: { en: 'Casual', ka: 'არაფორმალური', ru: 'Неформальный' } },
        { value: 'persuasive', label: { en: 'Persuasive', ka: 'დამაჯერებელი', ru: 'Убедительный' } },
        { value: 'creative', label: { en: 'Creative', ka: 'კრეატიული', ru: 'Креативный' } },
      ], defaultValue: 'professional' },
      { id: 'length', icon: '📏', label: { en: 'Length', ka: 'სიგრძე', ru: 'Длина' }, type: 'select', options: [
        { value: 'short', label: { en: 'Short', ka: 'მოკლე', ru: 'Короткий' } },
        { value: 'medium', label: { en: 'Medium', ka: 'საშუალო', ru: 'Средний' } },
        { value: 'long', label: { en: 'Long', ka: 'გრძელი', ru: 'Длинный' } },
      ], defaultValue: 'medium' },
    ],
    transfers: [
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Video Captions', ka: 'ვიდეო წარწერები', ru: 'Субтитры' }, description: { en: 'Use as video captions', ka: 'ვიდეოს სუბტიტრებად', ru: 'Как субтитры видео' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Product Text', ka: 'პროდუქტის ტექსტი', ru: 'Текст товара' }, description: { en: 'Use in shop listings', ka: 'მაღაზიის განცხადებაში', ru: 'Для листинга магазина' } },
      { id: 'to-business', targetService: 'business', icon: '💼', label: { en: 'Business Report', ka: 'ბიზნეს ანგარიში', ru: 'Бизнес-отчёт' }, description: { en: 'Send to business tools', ka: 'ბიზნეს ინსტრუმენტებში', ru: 'В бизнес-инструменты' } },
    ],
  },

  /* ─── 6. EDITING ──────────────────────────────────────────────── */
  editing: {
    serviceId: 'editing',
    welcomeHint: { en: 'Professional video post-production', ka: 'პროფესიონალური ვიდეო პოსტ-პროდაქშენი', ru: 'Профессиональный видеомонтаж' },
    outputLabel: { en: 'Edited Video', ka: 'რედაქტირებული ვიდეო', ru: 'Смонтированное видео' },
    menuItems: [
      { id: 'auto-cut', icon: '✂️', label: { en: 'Auto Cut', ka: 'ავტო მონტაჟი', ru: 'Авто монтаж' }, action: 'preset', prompt: 'Auto-cut footage into polished edit' },
      { id: 'color', icon: '🎨', label: { en: 'Color Grade', ka: 'კოლორ გრეიდი', ru: 'Цветокоррекция' }, action: 'preset', prompt: 'Apply cinematic color grading' },
      { id: 'subtitles', icon: '💬', label: { en: 'Burn Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, action: 'preset', prompt: 'Auto-detect speech and burn subtitles' },
      { id: 'upload', icon: '📎', label: { en: 'Upload Video', ka: 'ვიდეოს ატვირთვა', ru: 'Загрузить видео' }, action: 'toggle', target: 'upload' },
      { id: 'export', icon: '📤', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, action: 'toggle', target: 'export' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-music', icon: '🎵', label: { en: 'Replace Audio', ka: 'აუდიო ჩანაცვლება', ru: 'Заменить аудио' }, action: 'transfer', target: 'music' },
      { id: 'to-text', icon: '✍️', label: { en: 'Add Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, action: 'transfer', target: 'text' },
      { id: 'to-shop', icon: '🛒', label: { en: 'Publish', ka: 'გამოქვეყნება', ru: 'Опубликовать' }, action: 'transfer', target: 'shop' },
    ],
    quickActions: [
      { id: 'auto-cut', icon: '✂️', label: { en: 'Auto Cut', ka: 'ავტო მონტაჟი', ru: 'Авто монтаж' }, prompt: 'Auto-cut raw footage into a polished edit' },
      { id: 'color', icon: '🎨', label: { en: 'Color Grade', ka: 'კოლორ გრეიდი', ru: 'Цветокоррекция' }, prompt: 'Apply cinematic color grading' },
      { id: 'subtitles', icon: '💬', label: { en: 'Burn Subtitles', ka: 'სუბტიტრები', ru: 'Вшить субтитры' }, prompt: 'Auto-detect speech and burn subtitles' },
    ],
    tools: [
      { id: 'upload-vid', icon: '📎', label: { en: 'Upload Video', ka: 'ვიდეოს ატვირთვა', ru: 'Загрузить видео' }, type: 'upload' },
    ],
    transfers: [
      { id: 'to-music', targetService: 'music', icon: '🎵', label: { en: 'Replace Audio', ka: 'აუდიო', ru: 'Аудио' }, description: { en: 'Replace video audio track', ka: 'აუდიო ტრეკის ჩანაცვლება', ru: 'Заменить аудиодорожку' } },
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, description: { en: 'Generate subtitle text', ka: 'სუბტიტრების გენერაცია', ru: 'Генерация субтитров' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Publish', ka: 'გამოქვეყნება', ru: 'Опубликовать' }, description: { en: 'Publish in Digital Shop', ka: 'ციფრულ მაღაზიაში', ru: 'В цифровой магазин' } },
    ],
  },

  /* ─── 7. PHOTO ────────────────────────────────────────────────── */
  photo: {
    serviceId: 'photo',
    welcomeHint: { en: 'Enhance, upscale, and retouch photos', ka: 'გააუმჯობესე და გაზარდე ფოტოები', ru: 'Улучшайте и масштабируйте фото' },
    outputLabel: { en: 'Enhanced Photo', ka: 'გაუმჯობესებული ფოტო', ru: 'Улучшенное фото' },
    menuItems: [
      { id: 'bg-remove', icon: '🔲', label: { en: 'Remove Background', ka: 'ფონის წაშლა', ru: 'Удалить фон' }, action: 'preset', prompt: 'Remove background from photo' },
      { id: 'retouch', icon: '✨', label: { en: 'Portrait Retouch', ka: 'რეტუში', ru: 'Ретушь' }, action: 'preset', prompt: 'Professional portrait retouching' },
      { id: 'upscale', icon: '🔍', label: { en: 'Upscale 4x', ka: '4x გადიდება', ru: 'Увеличить 4x' }, action: 'preset', prompt: 'Upscale image 4x with AI' },
      { id: 'upload', icon: '📎', label: { en: 'Upload Photo', ka: 'ფოტოს ატვირთვა', ru: 'Загрузить фото' }, action: 'toggle', target: 'upload' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-avatar', icon: '👤', label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' }, action: 'transfer', target: 'avatar' },
      { id: 'to-video', icon: '🎬', label: { en: 'Animate Photo', ka: 'ანიმაცია', ru: 'Анимировать' }, action: 'transfer', target: 'video' },
    ],
    quickActions: [
      { id: 'bg-remove', icon: '🔲', label: { en: 'Remove BG', ka: 'ფონი', ru: 'Удалить фон' }, prompt: 'Remove the background from this photo' },
      { id: 'retouch', icon: '✨', label: { en: 'Retouch', ka: 'რეტუში', ru: 'Ретушь' }, prompt: 'Professional skin retouching' },
      { id: 'upscale', icon: '🔍', label: { en: 'Upscale 4x', ka: 'გადიდება', ru: 'Увеличить' }, prompt: 'Upscale this image 4x' },
    ],
    tools: [
      { id: 'upload-photo', icon: '📎', label: { en: 'Upload Photo', ka: 'ფოტო', ru: 'Фото' }, type: 'upload' },
    ],
    transfers: [
      { id: 'to-avatar', targetService: 'avatar', icon: '👤', label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' }, description: { en: 'Create avatar from photo', ka: 'ავატარის შექმნა ფოტოდან', ru: 'Создать аватар из фото' } },
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Generate Variations', ka: 'ვარიანტები', ru: 'Вариации' }, description: { en: 'Generate AI variations', ka: 'ვარიაციების გენერაცია', ru: 'Генерация вариаций' } },
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Animate', ka: 'ანიმაცია', ru: 'Анимировать' }, description: { en: 'Animate enhanced photo', ka: 'ფოტოს ანიმაცია', ru: 'Анимировать фото' } },
    ],
  },

  /* ─── 8. VISUAL INTELLIGENCE ──────────────────────────────────── */
  'visual-intel': {
    serviceId: 'visual-intel',
    welcomeHint: { en: 'Analyze images and extract insights', ka: 'გაანალიზე სურათები', ru: 'Анализируйте изображения' },
    outputLabel: { en: 'Analysis Report', ka: 'ანალიზის ანგარიში', ru: 'Отчёт анализа' },
    menuItems: [
      { id: 'brand-audit', icon: '🔍', label: { en: 'Brand Audit', ka: 'ბრენდის აუდიტი', ru: 'Аудит бренда' }, action: 'preset', prompt: 'Analyze this for brand consistency' },
      { id: 'score', icon: '📊', label: { en: 'Creative Score', ka: 'კრეატიული ქულა', ru: 'Оценка' }, action: 'preset', prompt: 'Score this creative asset' },
      { id: 'upload', icon: '📎', label: { en: 'Upload Image', ka: 'ატვირთვა', ru: 'Загрузить' }, action: 'toggle', target: 'upload' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-text', icon: '✍️', label: { en: 'Write Report', ka: 'ანგარიში', ru: 'Отчёт' }, action: 'transfer', target: 'text' },
      { id: 'to-image', icon: '🖼️', label: { en: 'Improve Visual', ka: 'ვიზუალის გაუმჯობესება', ru: 'Улучшить' }, action: 'transfer', target: 'image' },
    ],
    quickActions: [
      { id: 'audit', icon: '🔍', label: { en: 'Brand Audit', ka: 'აუდიტი', ru: 'Аудит' }, prompt: 'Analyze for brand consistency' },
      { id: 'score', icon: '📊', label: { en: 'Creative Score', ka: 'ქულა', ru: 'Оценка' }, prompt: 'Score engagement potential' },
      { id: 'deep', icon: '🧠', label: { en: 'Deep Analysis', ka: 'ღრმა ანალიზი', ru: 'Глубокий анализ' }, prompt: 'Perform detailed technical analysis' },
    ],
    tools: [
      { id: 'upload-img', icon: '📎', label: { en: 'Upload Image', ka: 'სურათი', ru: 'Изображение' }, type: 'upload' },
    ],
    transfers: [
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Report', ka: 'ანგარიში', ru: 'Отчёт' }, description: { en: 'Generate written report', ka: 'ანგარიშის დაწერა', ru: 'Написать отчёт' } },
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Improve', ka: 'გაუმჯობესება', ru: 'Улучшить' }, description: { en: 'Improve visual based on analysis', ka: 'ვიზუალის გაუმჯობესება', ru: 'Улучшить визуал' } },
    ],
  },

  /* ─── 9. PROMPT ENGINEERING ───────────────────────────────────── */
  prompt: {
    serviceId: 'prompt',
    welcomeHint: { en: 'Craft and optimize AI prompts', ka: 'შექმენი და ოპტიმიზე პრომპტები', ru: 'Создавайте и оптимизируйте промпты' },
    outputLabel: { en: 'Optimized Prompt', ka: 'ოპტიმიზებული პრომპტი', ru: 'Оптимизированный промпт' },
    menuItems: [
      { id: 'image-prompt', icon: '🖼️', label: { en: 'Image Prompt', ka: 'სურათის პრომპტი', ru: 'Промпт изображения' }, action: 'preset', prompt: 'Design prompt for image generation' },
      { id: 'video-prompt', icon: '🎬', label: { en: 'Video Prompt', ka: 'ვიდეო პრომპტი', ru: 'Промпт видео' }, action: 'preset', prompt: 'Create video generation prompt' },
      { id: 'negative', icon: '🚫', label: { en: 'Negative Prompts', ka: 'ნეგატ. პრომპტი', ru: 'Негативный промпт' }, action: 'preset', prompt: 'Generate negative prompts' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-image', icon: '🖼️', label: { en: 'Test on Image', ka: 'სურათზე ტესტი', ru: 'Тест на изображении' }, action: 'transfer', target: 'image' },
      { id: 'to-video', icon: '🎬', label: { en: 'Test on Video', ka: 'ვიდეოზე ტესტი', ru: 'Тест на видео' }, action: 'transfer', target: 'video' },
    ],
    quickActions: [
      { id: 'image', icon: '🖼️', label: { en: 'Image Prompt', ka: 'სურათი', ru: 'Изображение' }, prompt: 'Design an optimized image generation prompt' },
      { id: 'video', icon: '🎬', label: { en: 'Video Prompt', ka: 'ვიდეო', ru: 'Видео' }, prompt: 'Create a detailed video generation prompt' },
      { id: 'negative', icon: '🚫', label: { en: 'Negative Set', ka: 'ნეგატიური', ru: 'Негативный' }, prompt: 'Generate optimized negative prompts' },
    ],
    tools: [],
    transfers: [
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Test Image', ka: 'ტესტი', ru: 'Тест' }, description: { en: 'Test prompt on Image service', ka: 'პრომპტის ტესტი სურათზე', ru: 'Тест на изображении' } },
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Test Video', ka: 'ტესტი', ru: 'Тест' }, description: { en: 'Test prompt on Video service', ka: 'პრომპტის ტესტი ვიდეოზე', ru: 'Тест на видео' } },
    ],
  },

  /* ─── 10. MEDIA PRODUCTION ────────────────────────────────────── */
  media: {
    serviceId: 'media',
    welcomeHint: { en: 'Multi-format content hub', ka: 'მულტიფორმატის კონტენტ ჰაბი', ru: 'Мультиформатный контент-хаб' },
    outputLabel: { en: 'Media Assets', ka: 'მედია აქტივები', ru: 'Медиа-активы' },
    menuItems: [
      { id: 'campaign', icon: '🎯', label: { en: 'Campaign Pack', ka: 'კამპანია', ru: 'Кампания' }, action: 'preset', prompt: 'Generate a complete campaign media pack' },
      { id: 'brand-kit', icon: '🏷️', label: { en: 'Brand Kit', ka: 'ბრენდ კიტი', ru: 'Бренд-кит' }, action: 'preset', prompt: 'Create a comprehensive brand media kit' },
      { id: 'pipeline', icon: '⚡', label: { en: 'Asset Pipeline', ka: 'პაიპლაინი', ru: 'Пайплайн' }, action: 'preset', prompt: 'Build multi-format asset pipeline' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-editing', icon: '✂️', label: { en: 'Edit Output', ka: 'რედაქტირება', ru: 'Редактировать' }, action: 'transfer', target: 'editing' },
      { id: 'to-shop', icon: '🛒', label: { en: 'Publish Assets', ka: 'გამოქვეყნება', ru: 'Опубликовать' }, action: 'transfer', target: 'shop' },
      { id: 'to-business', icon: '💼', label: { en: 'Business Report', ka: 'ანგარიში', ru: 'Отчёт' }, action: 'transfer', target: 'business' },
    ],
    quickActions: [
      { id: 'campaign', icon: '🎯', label: { en: 'Campaign Pack', ka: 'კამპანია', ru: 'Кампания' }, prompt: 'Generate campaign media pack: poster, video, audio, copy' },
      { id: 'brand', icon: '🏷️', label: { en: 'Brand Kit', ka: 'ბრენდი', ru: 'Бренд' }, prompt: 'Create a comprehensive brand media kit' },
    ],
    tools: [],
    transfers: [
      { id: 'to-editing', targetService: 'editing', icon: '✂️', label: { en: 'Edit', ka: 'რედაქტირება', ru: 'Редакция' }, description: { en: 'Edit media outputs', ka: 'მედია შედეგების რედაქტირება', ru: 'Редактировать' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Publish', ka: 'გამოქვეყნება', ru: 'Опубликовать' }, description: { en: 'Publish to Digital Shop', ka: 'მაღაზიაში გამოქვეყნება', ru: 'В магазин' } },
    ],
  },

  /* ─── 11. WORKFLOW ─────────────────────────────────────────────── */
  workflow: {
    serviceId: 'workflow',
    welcomeHint: { en: 'Build automated multi-step AI pipelines', ka: 'ააწყვე ავტომატიზებული პაიპლაინები', ru: 'Создавайте автоматизированные пайплайны' },
    outputLabel: { en: 'Workflow Output', ka: 'Workflow შედეგი', ru: 'Результат воркфлоу' },
    menuItems: [
      { id: 'new', icon: '✨', label: { en: 'New Workflow', ka: 'ახალი Workflow', ru: 'Новый воркфлоу' }, action: 'preset', prompt: 'Create a new multi-step workflow' },
      { id: 'my-flows', icon: '📁', label: { en: 'My Workflows', ka: 'ჩემი Workflows', ru: 'Мои воркфлоу' }, action: 'navigate', target: 'gallery' },
      { id: 'templates', icon: '📋', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, action: 'toggle', target: 'templates' },
      { id: 'avatar-video', icon: '👤→🎬', label: { en: 'Avatar → Video', ka: 'ავატარი → ვიდეო', ru: 'Аватар → Видео' }, action: 'preset', prompt: 'Build avatar to video pipeline' },
      { id: 'video-music', icon: '🎬→🎵', label: { en: 'Video → Music → Export', ka: 'ვიდეო → მუსიკა', ru: 'Видео → Музыка' }, action: 'preset', prompt: 'Build video + music + export pipeline' },
      { id: 'poster-shop', icon: '🖼️→🛒', label: { en: 'Poster → Shop', ka: 'პოსტერი → მაღაზია', ru: 'Постер → Магазин' }, action: 'preset', prompt: 'Build poster to shop pipeline' },
      { id: 'content-ad', icon: '✍️→📣', label: { en: 'Content → Ad', ka: 'კონტენტი → რეკლამა', ru: 'Контент → Реклама' }, action: 'preset', prompt: 'Build content to ad campaign pipeline' },
      { id: 'settings', icon: '⚙️', label: { en: 'Automation Settings', ka: 'პარამეტრები', ru: 'Настройки' }, action: 'toggle', target: 'settings' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-agent', icon: '🤖', label: { en: 'Run with Agent G', ka: 'Agent G-ით გაშვება', ru: 'Запустить с Agent G' }, action: 'transfer', target: 'agent-g' },
    ],
    quickActions: [
      { id: 'brand-starter', icon: '🏷️', label: { en: 'Brand Starter', ka: 'ბრენდი', ru: 'Бренд' }, prompt: 'Build brand starter pack: Logo → Avatar → Copy → Social' },
      { id: 'music-launch', icon: '🎵', label: { en: 'Music Launch', ka: 'მუსიკა', ru: 'Музыка' }, prompt: 'Build music launch: Track → Cover → Promo Video → Social' },
      { id: 'store-launch', icon: '🛒', label: { en: 'Store Launch', ka: 'მაღაზია', ru: 'Магазин' }, prompt: 'Build store launch: Photos → Listings → SEO → Campaign' },
    ],
    tools: [],
    transfers: [
      { id: 'to-agent', targetService: 'agent-g', icon: '🤖', label: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' }, description: { en: 'Execute with Agent G', ka: 'Agent G-ით შესრულება', ru: 'Выполнить с Agent G' } },
    ],
  },

  /* ─── 12. AGENT G ─────────────────────────────────────────────── */
  'agent-g': {
    serviceId: 'agent-g',
    welcomeHint: { en: 'Your AI orchestrator across all services', ka: 'AI ორკესტრატორი ყველა სერვისისთვის', ru: 'AI-оркестратор всех сервисов' },
    outputLabel: { en: 'Agent G Output', ka: 'Agent G შედეგი', ru: 'Результат Agent G' },
    menuItems: [
      { id: 'full-task', icon: '🎯', label: { en: 'Full Task', ka: 'სრული დავალება', ru: 'Полная задача' }, action: 'preset', prompt: 'Plan and execute a complete multi-service task' },
      { id: 'quality', icon: '✅', label: { en: 'Quality Check', ka: 'ხარისხის შემოწმება', ru: 'Проверка качества' }, action: 'preset', prompt: 'Review and quality-check all outputs' },
      { id: 'bundle', icon: '📦', label: { en: 'Bundle Run', ka: 'პარტიული გაშვება', ru: 'Пакетный запуск' }, action: 'preset', prompt: 'Execute batch of tasks across services' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-avatar', icon: '👤', label: { en: 'Avatar Studio', ka: 'ავატარი', ru: 'Аватар' }, action: 'transfer', target: 'avatar' },
      { id: 'to-video', icon: '🎬', label: { en: 'Video Generation', ka: 'ვიდეო', ru: 'Видео' }, action: 'transfer', target: 'video' },
      { id: 'to-image', icon: '🖼️', label: { en: 'Image Generation', ka: 'სურათი', ru: 'Изображение' }, action: 'transfer', target: 'image' },
      { id: 'to-music', icon: '🎵', label: { en: 'Music Production', ka: 'მუსიკა', ru: 'Музыка' }, action: 'transfer', target: 'music' },
      { id: 'to-text', icon: '✍️', label: { en: 'Text & Copy', ka: 'ტექსტი', ru: 'Текст' }, action: 'transfer', target: 'text' },
      { id: 'to-workflow', icon: '⚡', label: { en: 'Workflow Builder', ka: 'Workflow', ru: 'Воркфлоу' }, action: 'transfer', target: 'workflow' },
    ],
    quickActions: [
      { id: 'avatar', icon: '👤', label: { en: 'Create Avatar', ka: 'ავატარი', ru: 'Аватар' }, prompt: 'I want to create a professional AI avatar' },
      { id: 'video', icon: '🎬', label: { en: 'Generate Video', ka: 'ვიდეო', ru: 'Видео' }, prompt: 'Generate a cinematic AI video' },
      { id: 'image', icon: '🖼️', label: { en: 'Create Image', ka: 'სურათი', ru: 'Изображение' }, prompt: 'Create an AI-generated image or poster' },
      { id: 'music', icon: '🎵', label: { en: 'Produce Music', ka: 'მუსიკა', ru: 'Музыка' }, prompt: 'Compose AI music' },
      { id: 'text', icon: '✍️', label: { en: 'Write Content', ka: 'ტექსტი', ru: 'Текст' }, prompt: 'Write marketing copy or scripts' },
      { id: 'workflow', icon: '⚡', label: { en: 'Build Workflow', ka: 'Workflow', ru: 'Воркфлоу' }, prompt: 'Build multi-step AI workflow' },
    ],
    tools: [],
    transfers: [],
  },

  /* ─── 13. BUSINESS ────────────────────────────────────────────── */
  business: {
    serviceId: 'business',
    welcomeHint: { en: 'Generate reports, dashboards, and strategy', ka: 'შექმენი ანგარიშები და სტრატეგია', ru: 'Генерируйте отчёты и стратегию' },
    outputLabel: { en: 'Business Output', ka: 'ბიზნეს შედეგი', ru: 'Бизнес-результат' },
    menuItems: [
      { id: 'strategy', icon: '📋', label: { en: 'Strategy Brief', ka: 'სტრატეგია', ru: 'Стратегия' }, action: 'preset', prompt: 'Generate a strategic business brief' },
      { id: 'revenue', icon: '💰', label: { en: 'Revenue Plan', ka: 'შემოსავალი', ru: 'Доходы' }, action: 'preset', prompt: 'Build revenue projection plan' },
      { id: 'summary', icon: '📊', label: { en: 'Executive Summary', ka: 'შეჯამება', ru: 'Резюме' }, action: 'preset', prompt: 'Create executive summary' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-text', icon: '✍️', label: { en: 'Write Copy', ka: 'ტექსტი', ru: 'Текст' }, action: 'transfer', target: 'text' },
      { id: 'to-image', icon: '🖼️', label: { en: 'Create Visual', ka: 'ვიზუალი', ru: 'Визуал' }, action: 'transfer', target: 'image' },
      { id: 'to-shop', icon: '🛒', label: { en: 'Launch Store', ka: 'მაღაზია', ru: 'Магазин' }, action: 'transfer', target: 'shop' },
    ],
    quickActions: [
      { id: 'strategy', icon: '📋', label: { en: 'Strategy Brief', ka: 'სტრატეგია', ru: 'Стратегия' }, prompt: 'Generate strategic business brief with market analysis' },
      { id: 'revenue', icon: '💰', label: { en: 'Revenue Plan', ka: 'შემოსავალი', ru: 'Доходы' }, prompt: 'Build detailed revenue projection plan' },
      { id: 'summary', icon: '📊', label: { en: 'Executive Summary', ka: 'შეჯამება', ru: 'Резюме' }, prompt: 'Create executive summary for stakeholder presentation' },
    ],
    tools: [],
    transfers: [
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Copy', ka: 'ტექსტი', ru: 'Текст' }, description: { en: 'Write business copy', ka: 'ბიზნეს ტექსტი', ru: 'Бизнес-текст' } },
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Visual', ka: 'ვიზუალი', ru: 'Визуал' }, description: { en: 'Create business visuals', ka: 'ბიზნეს ვიზუალი', ru: 'Бизнес-визуал' } },
      { id: 'to-shop', targetService: 'shop', icon: '🛒', label: { en: 'Store', ka: 'მაღაზია', ru: 'Магазин' }, description: { en: 'Launch digital store', ka: 'ციფრული მაღაზია', ru: 'Цифровой магазин' } },
    ],
  },

  /* ─── 14. SHOP ────────────────────────────────────────────────── */
  shop: {
    serviceId: 'shop',
    welcomeHint: { en: 'Launch and manage digital storefronts', ka: 'გაუშვი ციფრული მაღაზია', ru: 'Запускайте цифровые магазины' },
    outputLabel: { en: 'Store Output', ka: 'მაღაზიის შედეგი', ru: 'Результат магазина' },
    menuItems: [
      { id: 'listing', icon: '📦', label: { en: 'Quick Listing', ka: 'განცხადება', ru: 'Объявление' }, action: 'preset', prompt: 'Create a product listing with AI-optimized content' },
      { id: 'seo', icon: '🔍', label: { en: 'SEO Optimize', ka: 'SEO', ru: 'SEO' }, action: 'preset', prompt: 'Optimize store listings for search engines' },
      { id: 'audit', icon: '📊', label: { en: 'Store Audit', ka: 'აუდიტი', ru: 'Аудит' }, action: 'preset', prompt: 'Full audit of store listings' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-image', icon: '🖼️', label: { en: 'Product Photos', ka: 'ფოტოები', ru: 'Фото товара' }, action: 'transfer', target: 'image' },
      { id: 'to-text', icon: '✍️', label: { en: 'Write Description', ka: 'აღწერა', ru: 'Описание' }, action: 'transfer', target: 'text' },
      { id: 'to-business', icon: '💼', label: { en: 'Revenue Report', ka: 'ანგარიში', ru: 'Отчёт' }, action: 'transfer', target: 'business' },
    ],
    quickActions: [
      { id: 'listing', icon: '📦', label: { en: 'Quick Listing', ka: 'განცხადება', ru: 'Объявление' }, prompt: 'Create AI-optimized product listing' },
      { id: 'seo', icon: '🔍', label: { en: 'SEO Optimize', ka: 'SEO', ru: 'SEO' }, prompt: 'Optimize store for search engines' },
      { id: 'audit', icon: '📊', label: { en: 'Store Audit', ka: 'აუდიტი', ru: 'Аудит' }, prompt: 'Full audit: SEO, pricing, imagery, conversion' },
    ],
    tools: [],
    transfers: [
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Photos', ka: 'ფოტო', ru: 'Фото' }, description: { en: 'Generate product photos', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' } },
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Description', ka: 'აღწერა', ru: 'Описание' }, description: { en: 'Write product description', ka: 'პროდუქტის აღწერა', ru: 'Описание товара' } },
    ],
  },

  /* ─── 15. SOFTWARE ────────────────────────────────────────────── */
  software: {
    serviceId: 'software',
    welcomeHint: { en: 'Generate code, prototypes, and architectures', ka: 'გენერირე კოდი და არქიტექტურა', ru: 'Генерируйте код и архитектуру' },
    outputLabel: { en: 'Code Output', ka: 'კოდის შედეგი', ru: 'Результат кода' },
    menuItems: [
      { id: 'app-spec', icon: '📋', label: { en: 'App Spec', ka: 'სპეციფიკაცია', ru: 'Спецификация' }, action: 'preset', prompt: 'Generate application specification' },
      { id: 'review', icon: '🔍', label: { en: 'Code Review', ka: 'კოდის რევიუ', ru: 'Ревью кода' }, action: 'preset', prompt: 'Review code and suggest improvements' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-workflow', icon: '⚡', label: { en: 'Build Pipeline', ka: 'პაიპლაინი', ru: 'Пайплайн' }, action: 'transfer', target: 'workflow' },
      { id: 'to-business', icon: '💼', label: { en: 'Roadmap Report', ka: 'როუდმაპი', ru: 'Роадмап' }, action: 'transfer', target: 'business' },
    ],
    quickActions: [
      { id: 'spec', icon: '📋', label: { en: 'App Spec', ka: 'სპეცი', ru: 'Спец.' }, prompt: 'Generate complete application specification' },
      { id: 'review', icon: '🔍', label: { en: 'Code Review', ka: 'რევიუ', ru: 'Ревью' }, prompt: 'Review code and suggest improvements' },
    ],
    tools: [],
    transfers: [
      { id: 'to-workflow', targetService: 'workflow', icon: '⚡', label: { en: 'Pipeline', ka: 'პაიპლაინი', ru: 'Пайплайн' }, description: { en: 'Build deployment pipeline', ka: 'პაიპლაინის აგება', ru: 'Создать пайплайн' } },
      { id: 'to-business', targetService: 'business', icon: '💼', label: { en: 'Roadmap', ka: 'როუდმაპი', ru: 'Роадмап' }, description: { en: 'Generate roadmap report', ka: 'როუდმაპის ანგარიში', ru: 'Отчёт по роадмапу' } },
    ],
  },

  /* ─── 16. TOURISM ─────────────────────────────────────────────── */
  tourism: {
    serviceId: 'tourism',
    welcomeHint: { en: 'Smart travel planning and destination content', ka: 'ჭკვიანი სამოგზაურო დაგეგმვა', ru: 'Умное планирование путешествий' },
    outputLabel: { en: 'Travel Output', ka: 'ტურიზმის შედეგი', ru: 'Результат путешествия' },
    menuItems: [
      { id: 'itinerary', icon: '🗺️', label: { en: 'Smart Itinerary', ka: 'მარშრუტი', ru: 'Маршрут' }, action: 'preset', prompt: 'Create a detailed travel itinerary' },
      { id: 'promo', icon: '📣', label: { en: 'Destination Promo', ka: 'პრომო', ru: 'Промо' }, action: 'preset', prompt: 'Generate destination promotional content' },
      { id: 'div1', icon: '', label: { en: '', ka: '', ru: '' }, action: 'navigate', divider: true },
      { id: 'to-image', icon: '🖼️', label: { en: 'Create Promo', ka: 'პრომო ვიზუალი', ru: 'Промо-визуал' }, action: 'transfer', target: 'image' },
      { id: 'to-text', icon: '✍️', label: { en: 'Translate Guide', ka: 'თარგმანი', ru: 'Перевод' }, action: 'transfer', target: 'text' },
      { id: 'to-video', icon: '🎬', label: { en: 'Travel Video', ka: 'ვიდეო', ru: 'Видео' }, action: 'transfer', target: 'video' },
    ],
    quickActions: [
      { id: 'itinerary', icon: '🗺️', label: { en: 'Itinerary', ka: 'მარშრუტი', ru: 'Маршрут' }, prompt: 'Create a detailed travel itinerary with activities and dining' },
      { id: 'promo', icon: '📣', label: { en: 'Destination Promo', ka: 'პრომო', ru: 'Промо' }, prompt: 'Generate promotional content for a travel destination' },
    ],
    tools: [],
    transfers: [
      { id: 'to-image', targetService: 'image', icon: '🖼️', label: { en: 'Promo', ka: 'პრომო', ru: 'Промо' }, description: { en: 'Create promo visuals', ka: 'პრომო ვიზუალი', ru: 'Промо-визуалы' } },
      { id: 'to-text', targetService: 'text', icon: '✍️', label: { en: 'Guide', ka: 'გიდი', ru: 'Гид' }, description: { en: 'Translate travel guide', ka: 'გიდის თარგმნა', ru: 'Перевести гид' } },
      { id: 'to-video', targetService: 'video', icon: '🎬', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' }, description: { en: 'Create travel video', ka: 'სამოგზაურო ვიდეო', ru: 'Видео о путешествии' } },
    ],
  },
}

/** Get workspace config, returns agent-g config as fallback */
export function getServiceWorkspaceConfig(serviceId: string): ServiceWorkspaceConfig {
  return SERVICE_WORKSPACE_CONFIGS[serviceId] || SERVICE_WORKSPACE_CONFIGS['agent-g']!
}
