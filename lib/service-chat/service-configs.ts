/**
 * lib/service-chat/service-configs.ts
 * ====================================
 * Master configuration for every service chatbot in the platform.
 * Each config defines the service's unique personality, menus, tools,
 * quick actions, transfer targets, and agent mode behavior.
 */

import type { ServiceChatConfig } from '@/components/service-chat/types';

/* ═══════════════════════════════════════════════════════════════════
   AVATAR SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const avatarConfig: ServiceChatConfig = {
  slug: 'avatar',
  agentId: 'avatar-agent',
  icon: '🧑‍🎨',
  name: { en: 'Avatar Studio', ka: 'ავატარის სტუდია', ru: 'Студия аватаров' },
  description: {
    en: 'Create stunning AI avatars from photos',
    ka: 'შექმენით AI ავატარები ფოტოებიდან',
    ru: 'Создавайте потрясающие AI аватары из фото',
  },
  accentColor: '#A78BFA',
  accentGlow: 'rgba(167,139,250,0.15)',
  welcomeMessage: {
    en: "Welcome to Avatar Studio! I can create stunning AI avatars from your photos. Upload a face image or describe what you'd like.",
    ka: 'კეთილი იყოს თქვენი მობრძანება ავატარის სტუდიაში! ატვირთეთ სახის ფოტო ან აღწერეთ რა გსურთ.',
    ru: 'Добро пожаловать в Студию аватаров! Загрузите фото лица или опишите, что хотите создать.',
  },
  agentModeLabel: { en: 'Avatar Agent', ka: 'ავატარის აგენტი', ru: 'Агент аватаров' },
  placeholders: {
    default: { en: 'Describe your avatar or upload a photo...', ka: 'აღწერეთ ავატარი ან ატვირთეთ ფოტო...', ru: 'Опишите аватар или загрузите фото...' },
    agent: { en: 'Avatar Agent is ready — what should I create?', ka: 'ავატარის აგენტი მზადაა — რა შევქმნა?', ru: 'Агент аватаров готов — что создать?' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'face-scan', label: { en: 'Face Scan', ka: 'სახის სკანირება', ru: 'Скан лица' }, icon: 'ScanFace', action: 'face-scan', category: 'create' },
    { id: 'upload-photo', label: { en: 'Upload Photo', ka: 'ფოტოს ატვირთვა', ru: 'Загрузить фото' }, icon: 'Upload', action: 'upload-photo', category: 'create' },
    { id: 'style-portrait', label: { en: 'Portrait', ka: 'პორტრეტი', ru: 'Портрет' }, icon: 'UserCircle', action: 'style-portrait', category: 'style' },
    { id: 'style-full', label: { en: 'Full Body', ka: 'სრული სხეული', ru: 'В полный рост' }, icon: 'User', action: 'style-full', category: 'style' },
    { id: 'style-realistic', label: { en: 'Realistic', ka: 'რეალისტური', ru: 'Реалистичный' }, icon: 'Eye', action: 'style-realistic', category: 'style' },
    { id: 'style-anime', label: { en: 'Anime / Stylized', ka: 'ანიმე / სტილიზებული', ru: 'Аниме / Стилизованный' }, icon: 'Palette', action: 'style-anime', category: 'style' },
  ],
  hamburgerMenu: [
    { id: 'new-avatar', label: { en: 'New Avatar', ka: 'ახალი ავატარი', ru: 'Новый аватар' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-avatars', label: { en: 'My Avatars', ka: 'ჩემი ავატარები', ru: 'Мои аватары' }, icon: 'FolderOpen', action: 'my-avatars' },
    { id: 'face-scan-menu', label: { en: 'Face Scan', ka: 'სახის სკანირება', ru: 'Скан лица' }, icon: 'ScanFace', action: 'face-scan' },
    { id: 'upload-ref', label: { en: 'Upload Reference', ka: 'რეფერენსის ატვირთვა', ru: 'Загрузить референс' }, icon: 'Upload', action: 'upload-ref' },
    { id: 'style-presets', label: { en: 'Style Presets', ka: 'სტილის პრესეტები', ru: 'Стили' }, icon: 'Palette', action: 'style-presets', divider: true },
    { id: 'saved-results', label: { en: 'Saved Results', ka: 'შენახული შედეგები', ru: 'Сохранённые' }, icon: 'Bookmark', action: 'saved-results' },
    { id: 'use-in-video', label: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'Использовать в видео' }, icon: 'Video', action: 'transfer-video', divider: true },
    { id: 'continue-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg' },
  ],
  toolPanels: [
    {
      id: 'avatar-style', label: { en: 'Avatar Style', ka: 'ავატარის სტილი', ru: 'Стиль аватара' }, icon: 'Palette',
      options: [
        { id: 'avatar-type', label: { en: 'Type', ka: 'ტიპი', ru: 'Тип' }, type: 'chips', options: [
          { value: 'portrait', label: { en: 'Portrait', ka: 'პორტრეტი', ru: 'Портрет' } },
          { value: 'full-body', label: { en: 'Full Body', ka: 'სრული', ru: 'В рост' } },
          { value: 'headshot', label: { en: 'Headshot', ka: 'სახე', ru: 'Фото лица' } },
        ], defaultValue: 'portrait' },
        { id: 'style-mode', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'chips', options: [
          { value: 'realistic', label: { en: 'Realistic', ka: 'რეალისტური', ru: 'Реалистичный' } },
          { value: 'artistic', label: { en: 'Artistic', ka: 'მხატვრული', ru: 'Художественный' } },
          { value: 'anime', label: { en: 'Anime', ka: 'ანიმე', ru: 'Аниме' } },
          { value: '3d', label: { en: '3D', ka: '3D', ru: '3D' } },
        ], defaultValue: 'realistic' },
        { id: 'quality', label: { en: 'Quality', ka: 'ხარისხი', ru: 'Качество' }, type: 'slider', min: 1, max: 4, step: 1, defaultValue: 3 },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video', label: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'В видео' }, icon: 'Video', targetService: 'video', description: { en: 'Use this avatar in a video project', ka: 'გამოიყენეთ ეს ავატარი ვიდეო პროექტში', ru: 'Использовать аватар в видео' } },
    { id: 'to-image', label: { en: 'Edit as Image', ka: 'სურათის რედაქტირება', ru: 'Как изображение' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Open in Image Studio for further editing', ka: 'გახსენით სურათის სტუდიაში', ru: 'Открыть в студии изображений' } },
    { id: 'to-workflow', label: { en: 'Add to Workflow', ka: 'სამუშაო პროცესში', ru: 'В процесс' }, icon: 'GitBranch', targetService: 'workflow', description: { en: 'Add to an automated workflow', ka: 'დაამატეთ ავტომატურ პროცესში', ru: 'Добавить в автопроцесс' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   VIDEO SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const videoConfig: ServiceChatConfig = {
  slug: 'video',
  agentId: 'video-agent',
  icon: '🎬',
  name: { en: 'Video Studio', ka: 'ვიდეო სტუდია', ru: 'Видеостудия' },
  description: {
    en: 'Generate and edit AI videos',
    ka: 'შექმენით და დაარედაქტირეთ AI ვიდეოები',
    ru: 'Создавайте и редактируйте AI видео',
  },
  accentColor: '#F472B6',
  accentGlow: 'rgba(244,114,182,0.15)',
  welcomeMessage: {
    en: "Welcome to Video Studio! I can generate cinematic AI videos, add scenes, music, and subtitles. What would you like to create?",
    ka: 'კეთილი იყოს თქვენი მობრძანება ვიდეო სტუდიაში! შეგიძლიათ AI ვიდეოების შექმნა.',
    ru: 'Добро пожаловать в Видеостудию! Создавайте кинематографичные AI видео.',
  },
  agentModeLabel: { en: 'Video Agent', ka: 'ვიდეო აგენტი', ru: 'Видео агент' },
  placeholders: {
    default: { en: 'Describe your video scene or upload source...', ka: 'აღწერეთ ვიდეო სცენა...', ru: 'Опишите сцену или загрузите источник...' },
    agent: { en: 'Video Agent active — describe your vision', ka: 'ვიდეო აგენტი აქტიურია', ru: 'Видео агент активен — опишите идею' },
  },
  previewType: 'video',
  quickActions: [
    { id: 'new-video', label: { en: 'New Video', ka: 'ახალი ვიდეო', ru: 'Новое видео' }, icon: 'Clapperboard', action: 'new-video', category: 'create' },
    { id: 'scene-builder', label: { en: 'Scene Builder', ka: 'სცენის კონსტრუქტორი', ru: 'Конструктор сцен' }, icon: 'LayoutGrid', action: 'scene-builder', category: 'create' },
    { id: 'cinematic', label: { en: 'Cinematic Mode', ka: 'კინემატოგრაფიული', ru: 'Кинорежим' }, icon: 'Film', action: 'cinematic', category: 'mode' },
    { id: 'upload-source', label: { en: 'Upload Source', ka: 'წყაროს ატვირთვა', ru: 'Загрузить исходник' }, icon: 'Upload', action: 'upload-source', category: 'create' },
    { id: 'add-music', label: { en: 'Add Music', ka: 'მუსიკა', ru: 'Добавить музыку' }, icon: 'Music', action: 'add-music', category: 'enhance' },
    { id: 'add-subtitles', label: { en: 'Subtitles', ka: 'სუბტიტრები', ru: 'Субтитры' }, icon: 'Subtitles', action: 'add-subtitles', category: 'enhance' },
  ],
  hamburgerMenu: [
    { id: 'new-video-menu', label: { en: 'New Video', ka: 'ახალი ვიდეო', ru: 'Новое видео' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-videos', label: { en: 'My Videos', ka: 'ჩემი ვიდეოები', ru: 'Мои видео' }, icon: 'FolderOpen', action: 'my-videos' },
    { id: 'templates', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates' },
    { id: 'aspect-ratio', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Соотношение сторон' }, icon: 'Ratio', action: 'aspect-ratio' },
    { id: 'storyboard', label: { en: 'Storyboard', ka: 'რაკადრიანი', ru: 'Раскадровка' }, icon: 'LayoutGrid', action: 'storyboard', divider: true },
    { id: 'source-assets', label: { en: 'Source Assets', ka: 'საწყისი მასალები', ru: 'Исходные файлы' }, icon: 'FileVideo', action: 'source-assets' },
    { id: 'export-video', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'add-music-menu', label: { en: 'Add Music', ka: 'მუსიკა', ru: 'Музыка' }, icon: 'Music', action: 'transfer-music', divider: true },
    { id: 'continue-workflow', label: { en: 'Continue Workflow', ka: 'სამუშაო პროცესი', ru: 'Продолжить процесс' }, icon: 'GitBranch', action: 'transfer-workflow' },
  ],
  toolPanels: [
    {
      id: 'video-settings', label: { en: 'Video Settings', ka: 'ვიდეოს პარამეტრები', ru: 'Настройки видео' }, icon: 'Settings2',
      options: [
        { id: 'aspect', label: { en: 'Aspect Ratio', ka: 'პროპორცია', ru: 'Соотношение' }, type: 'chips', options: [
          { value: '16:9', label: { en: '16:9', ka: '16:9', ru: '16:9' } },
          { value: '9:16', label: { en: '9:16', ka: '9:16', ru: '9:16' } },
          { value: '1:1', label: { en: '1:1', ka: '1:1', ru: '1:1' } },
          { value: '4:3', label: { en: '4:3', ka: '4:3', ru: '4:3' } },
        ], defaultValue: '16:9' },
        { id: 'duration', label: { en: 'Duration', ka: 'ხანგრძლივობა', ru: 'Длительность' }, type: 'slider', min: 3, max: 60, step: 1, defaultValue: 10 },
        { id: 'cinematic-mode', label: { en: 'Cinematic', ka: 'კინემატოგრაფიული', ru: 'Кинорежим' }, type: 'toggle', defaultValue: false },
      ],
    },
  ],
  transferActions: [
    { id: 'to-music', label: { en: 'Add Music', ka: 'მუსიკა', ru: 'Музыка' }, icon: 'Music', targetService: 'music', description: { en: 'Create a soundtrack for this video', ka: 'შექმენით საუნდტრეკი', ru: 'Создать саундтрек' } },
    { id: 'to-editing', label: { en: 'Edit Video', ka: 'რედაქტირება', ru: 'Редактировать' }, icon: 'Scissors', targetService: 'editing', description: { en: 'Open in editing suite', ka: 'გახსენით რედაქტორში', ru: 'Открыть в редакторе' } },
    { id: 'to-shop', label: { en: 'Sell in Shop', ka: 'მაღაზიაში', ru: 'В магазин' }, icon: 'ShoppingBag', targetService: 'shop', description: { en: 'List as a product in your shop', ka: 'გაყიდეთ მაღაზიაში', ru: 'Разместить в магазине' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   IMAGE SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const imageConfig: ServiceChatConfig = {
  slug: 'image',
  agentId: 'image-agent',
  icon: '🖼️',
  name: { en: 'Image Studio', ka: 'სურათის სტუდია', ru: 'Студия изображений' },
  description: {
    en: 'Generate, edit, and enhance AI images',
    ka: 'შექმენით და გააუმჯობესეთ AI სურათები',
    ru: 'Создавайте и улучшайте AI изображения',
  },
  accentColor: '#34D399',
  accentGlow: 'rgba(52,211,153,0.15)',
  welcomeMessage: {
    en: "Welcome to Image Studio! I can generate posters, thumbnails, art, and more. Describe what you want or choose a mode below.",
    ka: 'კეთილი იყოს თქვენი მობრძანება სურათის სტუდიაში!',
    ru: 'Добро пожаловать в Студию изображений!',
  },
  agentModeLabel: { en: 'Image Agent', ka: 'სურათის აგენტი', ru: 'Агент изображений' },
  placeholders: {
    default: { en: 'Describe an image to generate...', ka: 'აღწერეთ სურათი...', ru: 'Опишите изображение...' },
    agent: { en: 'Image Agent ready — describe your vision', ka: 'სურათის აგენტი მზადაა', ru: 'Агент изображений готов' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'generate', label: { en: 'Generate Image', ka: 'სურათის შექმნა', ru: 'Создать изображение' }, icon: 'Sparkles', action: 'generate', category: 'create' },
    { id: 'poster-mode', label: { en: 'Poster', ka: 'პოსტერი', ru: 'Постер' }, icon: 'RectangleVertical', action: 'poster-mode', category: 'mode' },
    { id: 'thumbnail-mode', label: { en: 'Thumbnail', ka: 'მინიატურა', ru: 'Миниатюра' }, icon: 'ImageIcon', action: 'thumbnail-mode', category: 'mode' },
    { id: 'upscale', label: { en: 'Upscale', ka: 'გადიდება', ru: 'Увеличить' }, icon: 'Maximize', action: 'upscale', category: 'enhance' },
    { id: 'variations', label: { en: 'Variations', ka: 'ვარიაციები', ru: 'Вариации' }, icon: 'Copy', action: 'variations', category: 'enhance' },
    { id: 'style-transfer', label: { en: 'Style Transfer', ka: 'სტილის გადატანა', ru: 'Перенос стиля' }, icon: 'Palette', action: 'style-transfer', category: 'enhance' },
  ],
  hamburgerMenu: [
    { id: 'new-image', label: { en: 'New Image', ka: 'ახალი სურათი', ru: 'Новое изображение' }, icon: 'Plus', action: 'new-session' },
    { id: 'posters', label: { en: 'Posters', ka: 'პოსტერები', ru: 'Постеры' }, icon: 'RectangleVertical', action: 'posters' },
    { id: 'thumbnails', label: { en: 'Thumbnails', ka: 'მინიატურები', ru: 'Миниатюры' }, icon: 'ImageIcon', action: 'thumbnails' },
    { id: 'my-images', label: { en: 'My Images', ka: 'ჩემი სურათები', ru: 'Мои изображения' }, icon: 'FolderOpen', action: 'my-images' },
    { id: 'styles', label: { en: 'Styles', ka: 'სტილები', ru: 'Стили' }, icon: 'Palette', action: 'styles', divider: true },
    { id: 'variants', label: { en: 'Variants', ka: 'ვარიანტები', ru: 'Варианты' }, icon: 'Copy', action: 'variants' },
    { id: 'export-img', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'use-in-shop', label: { en: 'Use in Shop', ka: 'მაღაზიაში', ru: 'В магазин' }, icon: 'ShoppingBag', action: 'transfer-shop', divider: true },
  ],
  toolPanels: [
    {
      id: 'image-settings', label: { en: 'Image Settings', ka: 'პარამეტრები', ru: 'Настройки' }, icon: 'Settings2',
      options: [
        { id: 'img-size', label: { en: 'Size', ka: 'ზომა', ru: 'Размер' }, type: 'chips', options: [
          { value: '1024x1024', label: { en: '1:1', ka: '1:1', ru: '1:1' } },
          { value: '1024x1792', label: { en: '9:16', ka: '9:16', ru: '9:16' } },
          { value: '1792x1024', label: { en: '16:9', ka: '16:9', ru: '16:9' } },
        ], defaultValue: '1024x1024' },
        { id: 'img-style', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'chips', options: [
          { value: 'vivid', label: { en: 'Vivid', ka: 'ნათელი', ru: 'Яркий' } },
          { value: 'natural', label: { en: 'Natural', ka: 'ბუნებრივი', ru: 'Естественный' } },
        ], defaultValue: 'vivid' },
        { id: 'img-quality', label: { en: 'HD', ka: 'HD', ru: 'HD' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video-img', label: { en: 'Animate', ka: 'ანიმაცია', ru: 'Анимировать' }, icon: 'Video', targetService: 'video', description: { en: 'Turn this image into a video', ka: 'გადააქციეთ ვიდეოდ', ru: 'Превратить в видео' } },
    { id: 'to-shop-img', label: { en: 'Sell in Shop', ka: 'გაყიდვა', ru: 'Продать' }, icon: 'ShoppingBag', targetService: 'shop', description: { en: 'List as a product', ka: 'მაღაზიაში', ru: 'В магазин' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   MUSIC SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const musicConfig: ServiceChatConfig = {
  slug: 'music',
  agentId: 'music-agent',
  icon: '🎵',
  name: { en: 'Music Studio', ka: 'მუსიკის სტუდია', ru: 'Музыкальная студия' },
  description: {
    en: 'Generate AI music, soundtracks, and audio',
    ka: 'შექმენით AI მუსიკა და საუნდტრეკები',
    ru: 'Создавайте AI музыку и саундтреки',
  },
  accentColor: '#FBBF24',
  accentGlow: 'rgba(251,191,36,0.15)',
  welcomeMessage: {
    en: "Welcome to Music Studio! I can generate music tracks, soundtracks, and audio. Choose a genre or describe what you need.",
    ka: 'კეთილი იყოს თქვენი მობრძანება მუსიკის სტუდიაში!',
    ru: 'Добро пожаловать в Музыкальную студию!',
  },
  agentModeLabel: { en: 'Music Agent', ka: 'მუსიკის აგენტი', ru: 'Музыкальный агент' },
  placeholders: {
    default: { en: 'Describe the music you want to create...', ka: 'აღწერეთ მუსიკა...', ru: 'Опишите музыку...' },
    agent: { en: 'Music Agent composing — what mood?', ka: 'მუსიკის აგენტი მზადაა', ru: 'Музыкальный агент готов' },
  },
  previewType: 'audio',
  quickActions: [
    { id: 'gen-track', label: { en: 'Generate Track', ka: 'ტრეკის შექმნა', ru: 'Создать трек' }, icon: 'Music', action: 'generate-track', category: 'create' },
    { id: 'soundtrack', label: { en: 'Soundtrack', ka: 'საუნდტრეკი', ru: 'Саундтрек' }, icon: 'Film', action: 'soundtrack', category: 'mode' },
    { id: 'instrumental', label: { en: 'Instrumental', ka: 'ინსტრუმენტალი', ru: 'Инструментал' }, icon: 'Piano', action: 'instrumental', category: 'mode' },
    { id: 'vocal', label: { en: 'With Vocals', ka: 'ვოკალით', ru: 'С вокалом' }, icon: 'Mic', action: 'vocal', category: 'mode' },
    { id: 'remix', label: { en: 'Remix', ka: 'რემიქსი', ru: 'Ремикс' }, icon: 'Shuffle', action: 'remix', category: 'enhance' },
    { id: 'extend', label: { en: 'Extend Track', ka: 'გაგრძელება', ru: 'Продлить' }, icon: 'ArrowRight', action: 'extend', category: 'enhance' },
  ],
  hamburgerMenu: [
    { id: 'new-track', label: { en: 'New Track', ka: 'ახალი ტრეკი', ru: 'Новый трек' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-tracks', label: { en: 'My Tracks', ka: 'ჩემი ტრეკები', ru: 'Мои треки' }, icon: 'FolderOpen', action: 'my-tracks' },
    { id: 'genre-presets', label: { en: 'Genre Presets', ka: 'ჟანრები', ru: 'Жанры' }, icon: 'ListMusic', action: 'genre-presets' },
    { id: 'mood-board', label: { en: 'Mood Board', ka: 'განწყობა', ru: 'Настроение' }, icon: 'Heart', action: 'mood-board', divider: true },
    { id: 'soundtracks-lib', label: { en: 'Soundtracks', ka: 'საუნდტრეკები', ru: 'Саундтреки' }, icon: 'Film', action: 'soundtracks' },
    { id: 'export-audio', label: { en: 'Export Audio', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'use-in-video-music', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', action: 'transfer-video', divider: true },
  ],
  toolPanels: [
    {
      id: 'music-settings', label: { en: 'Music Settings', ka: 'მუსიკის პარამეტრები', ru: 'Настройки музыки' }, icon: 'Settings2',
      options: [
        { id: 'genre', label: { en: 'Genre', ka: 'ჟანრი', ru: 'Жанр' }, type: 'chips', options: [
          { value: 'pop', label: { en: 'Pop', ka: 'პოპ', ru: 'Поп' } },
          { value: 'rock', label: { en: 'Rock', ka: 'როკი', ru: 'Рок' } },
          { value: 'electronic', label: { en: 'Electronic', ka: 'ელექტრონული', ru: 'Электронная' } },
          { value: 'classical', label: { en: 'Classical', ka: 'კლასიკური', ru: 'Классическая' } },
          { value: 'ambient', label: { en: 'Ambient', ka: 'ემბიენტი', ru: 'Эмбиент' } },
        ], defaultValue: 'electronic' },
        { id: 'mood', label: { en: 'Mood', ka: 'განწყობა', ru: 'Настроение' }, type: 'chips', options: [
          { value: 'energetic', label: { en: 'Energetic', ka: 'ენერგიული', ru: 'Энергичное' } },
          { value: 'calm', label: { en: 'Calm', ka: 'მშვიდი', ru: 'Спокойное' } },
          { value: 'dark', label: { en: 'Dark', ka: 'ბნელი', ru: 'Тёмное' } },
          { value: 'uplifting', label: { en: 'Uplifting', ka: 'სასიხარულო', ru: 'Воодушевляющее' } },
        ], defaultValue: 'energetic' },
        { id: 'duration-sec', label: { en: 'Duration (sec)', ka: 'ხანგრძლივობა', ru: 'Длительность' }, type: 'slider', min: 15, max: 180, step: 5, defaultValue: 60 },
        { id: 'has-vocals', label: { en: 'Vocals', ka: 'ვოკალი', ru: 'Вокал' }, type: 'toggle', defaultValue: false },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video-music', label: { en: 'Add to Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', targetService: 'video', description: { en: 'Use as video soundtrack', ka: 'ვიდეოს საუნდტრეკად', ru: 'Как саундтрек видео' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   TEXT SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const textConfig: ServiceChatConfig = {
  slug: 'text',
  agentId: 'text-agent',
  icon: '✍️',
  name: { en: 'Text Studio', ka: 'ტექსტის სტუდია', ru: 'Текстовая студия' },
  description: {
    en: 'Generate AI text, captions, scripts, and copy',
    ka: 'შექმენით AI ტექსტი, სცენარები და კოპი',
    ru: 'Создавайте AI тексты, сценарии и копирайтинг',
  },
  accentColor: '#60A5FA',
  accentGlow: 'rgba(96,165,250,0.15)',
  welcomeMessage: {
    en: "Welcome to Text Studio! I can write captions, scripts, ad copy, blog posts, and more. Choose a content type or just tell me what you need.",
    ka: 'კეთილი იყოს თქვენი მობრძანება ტექსტის სტუდიაში!',
    ru: 'Добро пожаловать в Текстовую студию!',
  },
  agentModeLabel: { en: 'Text Agent', ka: 'ტექსტის აგენტი', ru: 'Текстовый агент' },
  placeholders: {
    default: { en: 'What would you like me to write?', ka: 'რის დაწერა გნებავთ?', ru: 'Что написать?' },
    agent: { en: 'Text Agent writing — what content?', ka: 'ტექსტის აგენტი მზადაა', ru: 'Текстовый агент готов' },
  },
  previewType: 'text',
  quickActions: [
    { id: 'caption', label: { en: 'Caption', ka: 'წარწერა', ru: 'Подпись' }, icon: 'Type', action: 'caption', category: 'type' },
    { id: 'script', label: { en: 'Script', ka: 'სცენარი', ru: 'Сценарий' }, icon: 'FileText', action: 'script', category: 'type' },
    { id: 'ad-copy', label: { en: 'Ad Copy', ka: 'სარეკლამო', ru: 'Рекламный текст' }, icon: 'Megaphone', action: 'ad-copy', category: 'type' },
    { id: 'blog', label: { en: 'Blog Post', ka: 'ბლოგი', ru: 'Блог' }, icon: 'BookOpen', action: 'blog', category: 'type' },
    { id: 'rewrite', label: { en: 'Rewrite', ka: 'ხელახლა დაწერა', ru: 'Переписать' }, icon: 'RefreshCw', action: 'rewrite', category: 'enhance' },
    { id: 'improve', label: { en: 'Improve', ka: 'გაუმჯობესება', ru: 'Улучшить' }, icon: 'Sparkles', action: 'improve', category: 'enhance' },
  ],
  hamburgerMenu: [
    { id: 'new-text', label: { en: 'New Text', ka: 'ახალი ტექსტი', ru: 'Новый текст' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-texts', label: { en: 'My Texts', ka: 'ჩემი ტექსტები', ru: 'Мои тексты' }, icon: 'FolderOpen', action: 'my-texts' },
    { id: 'content-types', label: { en: 'Content Types', ka: 'კონტენტის ტიპები', ru: 'Типы контента' }, icon: 'List', action: 'content-types' },
    { id: 'tone-presets', label: { en: 'Tone Presets', ka: 'ტონის პრესეტები', ru: 'Пресеты тона' }, icon: 'Smile', action: 'tone-presets', divider: true },
    { id: 'templates-text', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates' },
    { id: 'export-text', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'use-in-video-text', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', action: 'transfer-video', divider: true },
  ],
  toolPanels: [
    {
      id: 'text-settings', label: { en: 'Text Settings', ka: 'ტექსტის პარამეტრები', ru: 'Настройки текста' }, icon: 'Settings2',
      options: [
        { id: 'content-type', label: { en: 'Type', ka: 'ტიპი', ru: 'Тип' }, type: 'chips', options: [
          { value: 'caption', label: { en: 'Caption', ka: 'წარწერა', ru: 'Подпись' } },
          { value: 'script', label: { en: 'Script', ka: 'სცენარი', ru: 'Сценарий' } },
          { value: 'ad', label: { en: 'Ad Copy', ka: 'რეკლამა', ru: 'Реклама' } },
          { value: 'blog', label: { en: 'Blog', ka: 'ბლოგი', ru: 'Блог' } },
        ], defaultValue: 'caption' },
        { id: 'tone', label: { en: 'Tone', ka: 'ტონი', ru: 'Тон' }, type: 'chips', options: [
          { value: 'professional', label: { en: 'Professional', ka: 'პროფესიონალური', ru: 'Профессиональный' } },
          { value: 'casual', label: { en: 'Casual', ka: 'თავისუფალი', ru: 'Неформальный' } },
          { value: 'creative', label: { en: 'Creative', ka: 'შემოქმედებითი', ru: 'Творческий' } },
          { value: 'formal', label: { en: 'Formal', ka: 'ფორმალური', ru: 'Формальный' } },
        ], defaultValue: 'professional' },
        { id: 'length', label: { en: 'Length', ka: 'სიგრძე', ru: 'Длина' }, type: 'chips', options: [
          { value: 'short', label: { en: 'Short', ka: 'მოკლე', ru: 'Короткий' } },
          { value: 'medium', label: { en: 'Medium', ka: 'საშუალო', ru: 'Средний' } },
          { value: 'long', label: { en: 'Long', ka: 'გრძელი', ru: 'Длинный' } },
        ], defaultValue: 'medium' },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video-text', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', targetService: 'video', description: { en: 'Use as video script/subtitle', ka: 'ვიდეოს სცენარად', ru: 'Как сценарий видео' } },
    { id: 'to-image-text', label: { en: 'Create Image', ka: 'სურათი', ru: 'В изображение' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Generate image from this text', ka: 'სურათის შექმნა', ru: 'Создать изображение' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   WORKFLOW SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const workflowConfig: ServiceChatConfig = {
  slug: 'workflow',
  agentId: 'workflow-agent',
  icon: '⚡',
  name: { en: 'Workflow Studio', ka: 'სამუშაო პროცესი', ru: 'Студия процессов' },
  description: {
    en: 'Build and run automated AI workflows',
    ka: 'შექმენით ავტომატური AI სამუშაო პროცესები',
    ru: 'Создавайте автоматические AI процессы',
  },
  accentColor: '#F97316',
  accentGlow: 'rgba(249,115,22,0.15)',
  welcomeMessage: {
    en: "Welcome to Workflow Studio! I can build automated pipelines combining multiple services. Describe your workflow or choose a template.",
    ka: 'კეთილი იყოს თქვენი მობრძანება სამუშაო პროცესებში!',
    ru: 'Добро пожаловать в Студию процессов!',
  },
  agentModeLabel: { en: 'Workflow Agent', ka: 'პროცესის აგენტი', ru: 'Агент процессов' },
  placeholders: {
    default: { en: 'Describe your workflow or add a step...', ka: 'აღწერეთ პროცესი...', ru: 'Опишите процесс...' },
    agent: { en: 'Workflow Agent orchestrating — what pipeline?', ka: 'პროცესის აგენტი მზადაა', ru: 'Агент процессов готов' },
  },
  previewType: 'workflow',
  quickActions: [
    { id: 'new-flow', label: { en: 'New Workflow', ka: 'ახალი პროცესი', ru: 'Новый процесс' }, icon: 'Zap', action: 'new-workflow', category: 'create' },
    { id: 'add-step', label: { en: 'Add Step', ka: 'ნაბიჯის დამატება', ru: 'Добавить шаг' }, icon: 'Plus', action: 'add-step', category: 'create' },
    { id: 'run-flow', label: { en: 'Run Workflow', ka: 'გაშვება', ru: 'Запустить' }, icon: 'Play', action: 'run-workflow', category: 'execute' },
    { id: 'templates-wf', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates', category: 'create' },
    { id: 'save-flow', label: { en: 'Save Flow', ka: 'შენახვა', ru: 'Сохранить' }, icon: 'Save', action: 'save-flow', category: 'manage' },
    { id: 'preview-flow', label: { en: 'Preview', ka: 'პრევიუ', ru: 'Просмотр' }, icon: 'Eye', action: 'preview-flow', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-wf', label: { en: 'New Workflow', ka: 'ახალი', ru: 'Новый' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-workflows', label: { en: 'My Workflows', ka: 'ჩემი პროცესები', ru: 'Мои процессы' }, icon: 'FolderOpen', action: 'my-workflows' },
    { id: 'templates-menu-wf', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates' },
    { id: 'pipeline-controls', label: { en: 'Pipeline Controls', ka: 'კონტროლი', ru: 'Управление' }, icon: 'Settings2', action: 'pipeline-controls', divider: true },
    { id: 'run-history', label: { en: 'Run History', ka: 'ისტორია', ru: 'История' }, icon: 'Clock', action: 'run-history' },
    { id: 'export-wf', label: { en: 'Export Flow', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
  ],
  toolPanels: [
    {
      id: 'workflow-settings', label: { en: 'Workflow Settings', ka: 'პარამეტრები', ru: 'Настройки' }, icon: 'Settings2',
      options: [
        { id: 'auto-run', label: { en: 'Auto-run', ka: 'ავტო-გაშვება', ru: 'Авто-запуск' }, type: 'toggle', defaultValue: false },
        { id: 'parallel', label: { en: 'Parallel Steps', ka: 'პარალელური', ru: 'Параллельные шаги' }, type: 'toggle', defaultValue: false },
      ],
    },
  ],
  transferActions: [],
};

/* ═══════════════════════════════════════════════════════════════════
   STORE / COMMERCE SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const shopConfig: ServiceChatConfig = {
  slug: 'shop',
  agentId: 'commerce-agent',
  icon: '🛍️',
  name: { en: 'Commerce Studio', ka: 'კომერციის სტუდია', ru: 'Студия коммерции' },
  description: {
    en: 'Manage your AI-powered online shop',
    ka: 'მართეთ AI მაღაზია',
    ru: 'Управляйте AI магазином',
  },
  accentColor: '#EC4899',
  accentGlow: 'rgba(236,72,153,0.15)',
  welcomeMessage: {
    en: "Welcome to Commerce Studio! I can help you list products, manage orders, set pricing, and grow your shop. What would you like to do?",
    ka: 'კეთილი იყოს მობრძანება კომერციის სტუდიაში!',
    ru: 'Добро пожаловать в Студию коммерции!',
  },
  agentModeLabel: { en: 'Commerce Agent', ka: 'კომერციის აგენტი', ru: 'Агент коммерции' },
  placeholders: {
    default: { en: 'Manage your shop — list products, check orders...', ka: 'მართეთ მაღაზია...', ru: 'Управляйте магазином...' },
    agent: { en: 'Commerce Agent managing — what task?', ka: 'კომერციის აგენტი მზადაა', ru: 'Агент коммерции готов' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'list-product', label: { en: 'List Product', ka: 'პროდუქტი', ru: 'Товар' }, icon: 'Tag', action: 'list-product', category: 'create' },
    { id: 'orders', label: { en: 'Orders', ka: 'შეკვეთები', ru: 'Заказы' }, icon: 'ShoppingCart', action: 'orders', category: 'manage' },
    { id: 'pricing', label: { en: 'Pricing', ka: 'ფასები', ru: 'Цены' }, icon: 'DollarSign', action: 'pricing', category: 'manage' },
    { id: 'analytics', label: { en: 'Analytics', ka: 'ანალიტიკა', ru: 'Аналитика' }, icon: 'BarChart3', action: 'analytics', category: 'manage' },
    { id: 'marketing', label: { en: 'Marketing', ka: 'მარკეტინგი', ru: 'Маркетинг' }, icon: 'Megaphone', action: 'marketing', category: 'grow' },
    { id: 'inventory', label: { en: 'Inventory', ka: 'ინვენტარი', ru: 'Инвентарь' }, icon: 'Package', action: 'inventory', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-product', label: { en: 'New Product', ka: 'ახალი პროდუქტი', ru: 'Новый товар' }, icon: 'Plus', action: 'new-product' },
    { id: 'my-shop', label: { en: 'My Shop', ka: 'ჩემი მაღაზია', ru: 'Мой магазин' }, icon: 'Store', action: 'my-shop' },
    { id: 'orders-menu', label: { en: 'Orders', ka: 'შეკვეთები', ru: 'Заказы' }, icon: 'ShoppingCart', action: 'orders' },
    { id: 'customers', label: { en: 'Customers', ka: 'მომხმარებლები', ru: 'Клиенты' }, icon: 'Users', action: 'customers', divider: true },
    { id: 'analytics-menu', label: { en: 'Analytics', ka: 'ანალიტიკა', ru: 'Аналитика' }, icon: 'BarChart3', action: 'analytics' },
    { id: 'settings-shop', label: { en: 'Shop Settings', ka: 'პარამეტრები', ru: 'Настройки' }, icon: 'Settings2', action: 'settings' },
  ],
  toolPanels: [],
  transferActions: [
    { id: 'to-image-shop', label: { en: 'Create Image', ka: 'სურათი', ru: 'Изображение' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Generate product image', ka: 'პროდუქტის სურათი', ru: 'Изображение товара' } },
    { id: 'to-text-shop', label: { en: 'Write Copy', ka: 'ტექსტი', ru: 'Текст' }, icon: 'FileText', targetService: 'text', description: { en: 'Generate product description', ka: 'აღწერა', ru: 'Описание товара' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   EDITING / MEDIA SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const editingConfig: ServiceChatConfig = {
  slug: 'editing',
  agentId: 'editing-agent',
  icon: '✂️',
  name: { en: 'Editing Suite', ka: 'რედაქტირების სტუდია', ru: 'Монтажная студия' },
  description: {
    en: 'Professional AI media editing tools',
    ka: 'პროფესიონალური AI მედია რედაქტირება',
    ru: 'Профессиональный AI монтаж',
  },
  accentColor: '#F43F5E',
  accentGlow: 'rgba(244,63,94,0.15)',
  welcomeMessage: {
    en: "Welcome to the Editing Suite! I can help you trim, cut, enhance, and polish your media. Upload a file or describe what you need.",
    ka: 'კეთილი იყოს მობრძანება რედაქტირების სტუდიაში!',
    ru: 'Добро пожаловать в Монтажную студию!',
  },
  agentModeLabel: { en: 'Editing Agent', ka: 'რედაქტირების აგენტი', ru: 'Агент монтажа' },
  placeholders: {
    default: { en: 'Describe your edit or upload media...', ka: 'აღწერეთ რედაქტირება...', ru: 'Опишите правку или загрузите...' },
    agent: { en: 'Editing Agent ready — what needs editing?', ka: 'რედაქტირების აგენტი მზადაა', ru: 'Агент монтажа готов' },
  },
  previewType: 'video',
  quickActions: [
    { id: 'trim', label: { en: 'Trim', ka: 'მოჭრა', ru: 'Обрезать' }, icon: 'Scissors', action: 'trim', category: 'edit' },
    { id: 'enhance', label: { en: 'Enhance', ka: 'გაუმჯობესება', ru: 'Улучшить' }, icon: 'Sparkles', action: 'enhance', category: 'edit' },
    { id: 'bg-remove', label: { en: 'Remove BG', ka: 'ფონი', ru: 'Удалить фон' }, icon: 'Eraser', action: 'bg-remove', category: 'edit' },
    { id: 'color-grade', label: { en: 'Color Grade', ka: 'ფერი', ru: 'Цветокоррекция' }, icon: 'Palette', action: 'color-grade', category: 'enhance' },
    { id: 'add-effects', label: { en: 'Effects', ka: 'ეფექტები', ru: 'Эффекты' }, icon: 'Wand2', action: 'add-effects', category: 'enhance' },
    { id: 'export-edit', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-edit', label: { en: 'New Edit', ka: 'ახალი', ru: 'Новая правка' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-edits', label: { en: 'My Edits', ka: 'ჩემი რედაქტირებები', ru: 'Мои правки' }, icon: 'FolderOpen', action: 'my-edits' },
    { id: 'upload-media', label: { en: 'Upload Media', ka: 'მედიის ატვირთვა', ru: 'Загрузить медиа' }, icon: 'Upload', action: 'upload-media' },
    { id: 'effects-lib', label: { en: 'Effects Library', ka: 'ეფექტები', ru: 'Библиотека эффектов' }, icon: 'Wand2', action: 'effects-library', divider: true },
    { id: 'export-edit-menu', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'use-in-video-edit', label: { en: 'Use in Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', action: 'transfer-video', divider: true },
  ],
  toolPanels: [
    {
      id: 'edit-settings', label: { en: 'Edit Settings', ka: 'პარამეტრები', ru: 'Настройки' }, icon: 'Settings2',
      options: [
        { id: 'output-format', label: { en: 'Format', ka: 'ფორმატი', ru: 'Формат' }, type: 'chips', options: [
          { value: 'mp4', label: { en: 'MP4', ka: 'MP4', ru: 'MP4' } },
          { value: 'webm', label: { en: 'WebM', ka: 'WebM', ru: 'WebM' } },
          { value: 'gif', label: { en: 'GIF', ka: 'GIF', ru: 'GIF' } },
          { value: 'png', label: { en: 'PNG', ka: 'PNG', ru: 'PNG' } },
        ], defaultValue: 'mp4' },
        { id: 'edit-quality', label: { en: 'HD Output', ka: 'HD', ru: 'HD' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video-edit', label: { en: 'Open in Video', ka: 'ვიდეოში', ru: 'В видео' }, icon: 'Video', targetService: 'video', description: { en: 'Continue in Video Studio', ka: 'ვიდეო სტუდიაში', ru: 'В Видеостудии' } },
    { id: 'to-shop-edit', label: { en: 'Sell in Shop', ka: 'მაღაზიაში', ru: 'В магазин' }, icon: 'ShoppingBag', targetService: 'shop', description: { en: 'List as product', ka: 'პროდუქტად', ru: 'Как товар' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   CONFIG REGISTRY
   ═══════════════════════════════════════════════════════════════════ */

export const SERVICE_CONFIGS: Record<string, ServiceChatConfig> = {
  avatar: avatarConfig,
  video: videoConfig,
  image: imageConfig,
  music: musicConfig,
  text: textConfig,
  workflow: workflowConfig,
  shop: shopConfig,
  editing: editingConfig,
};

export function getServiceConfig(slug: string): ServiceChatConfig | undefined {
  return SERVICE_CONFIGS[slug];
}

export const ALL_SERVICE_SLUGS = Object.keys(SERVICE_CONFIGS);
