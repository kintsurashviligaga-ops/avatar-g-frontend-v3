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
   AGENT G SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const agentGConfig: ServiceChatConfig = {
  slug: 'agent-g',
  agentId: 'agent-g',
  icon: '🤖',
  name: { en: 'Agent G', ka: 'აგენტი G', ru: 'Агент G' },
  description: {
    en: 'Coordinate autonomous workflows across your AI workspace',
    ka: 'მართე ავტონომიური პროცესები შენს AI სამუშაო გარემოში',
    ru: 'Координируйте автономные процессы в вашем AI-рабочем пространстве',
  },
  accentColor: '#22D3EE',
  accentGlow: 'rgba(34,211,238,0.15)',
  welcomeMessage: {
    en: "I'm Agent G — your AI orchestrator. I can coordinate tasks across all services, manage workflows, and help you achieve complex goals autonomously.",
    ka: 'მე ვარ აგენტი G — თქვენი AI ორკესტრატორი. შემიძლია ყველა სერვისის კოორდინაცია.',
    ru: 'Я Агент G — ваш AI-оркестратор. Координирую задачи между всеми сервисами.',
  },
  agentModeLabel: { en: 'Full Autonomy', ka: 'სრული ავტონომია', ru: 'Полная автономия' },
  placeholders: {
    default: { en: 'Tell Agent G what you need...', ka: 'უთხარი აგენტ G-ს რა გჭირდება...', ru: 'Скажите Агенту G, что вам нужно...' },
    agent: { en: 'Agent G autonomous mode — describe your goal', ka: 'აგენტი G ავტონომიურ რეჟიმში', ru: 'Агент G в автономном режиме — опишите цель' },
  },
  previewType: 'text',
  quickActions: [
    { id: 'new-workflow', label: { en: 'New Workflow', ka: 'ახალი პროცესი', ru: 'Новый процесс' }, icon: 'GitBranch', action: 'new-workflow', category: 'create' },
    { id: 'multi-service', label: { en: 'Multi-Service Task', ka: 'მრავალ-სერვისი', ru: 'Мульти-сервис' }, icon: 'Layers', action: 'multi-service', category: 'create' },
    { id: 'analyze', label: { en: 'Analyze Project', ka: 'პროექტის ანალიზი', ru: 'Анализ проекта' }, icon: 'Brain', action: 'analyze', category: 'tools' },
    { id: 'automate', label: { en: 'Automate', ka: 'ავტომატიზაცია', ru: 'Автоматизация' }, icon: 'Zap', action: 'automate', category: 'tools' },
    { id: 'status', label: { en: 'Task Status', ka: 'ამოცანის სტატუსი', ru: 'Статус задачи' }, icon: 'BarChart3', action: 'status', category: 'manage' },
    { id: 'delegate', label: { en: 'Delegate', ka: 'დელეგირება', ru: 'Делегировать' }, icon: 'ArrowRight', action: 'delegate', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Session', ka: 'ახალი სესია', ru: 'Новая сессия' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-tasks', label: { en: 'My Tasks', ka: 'ჩემი ამოცანები', ru: 'Мои задачи' }, icon: 'List', action: 'my-tasks' },
    { id: 'active-workflows', label: { en: 'Active Workflows', ka: 'აქტიური პროცესები', ru: 'Активные процессы' }, icon: 'GitBranch', action: 'active-workflows' },
    { id: 'service-status', label: { en: 'Service Status', ka: 'სერვისების სტატუსი', ru: 'Статус сервисов' }, icon: 'BarChart3', action: 'service-status', divider: true },
    { id: 'orchestration-log', label: { en: 'Orchestration Log', ka: 'ორკესტრაციის ლოგი', ru: 'Лог оркестрации' }, icon: 'FileText', action: 'orchestration-log' },
    { id: 'settings', label: { en: 'Agent Settings', ka: 'აგენტის პარამეტრები', ru: 'Настройки агента' }, icon: 'Settings2', action: 'settings' },
  ],
  toolPanels: [
    {
      id: 'orchestration', label: { en: 'Orchestration', ka: 'ორკესტრაცია', ru: 'Оркестрация' }, icon: 'Settings2',
      options: [
        { id: 'autonomy', label: { en: 'Autonomy Level', ka: 'ავტონომიის დონე', ru: 'Уровень автономии' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
        { id: 'confirm-actions', label: { en: 'Confirm Actions', ka: 'მოქმედებების დადასტურება', ru: 'Подтверждать действия' }, type: 'toggle', defaultValue: true },
        { id: 'parallel', label: { en: 'Parallel Execution', ka: 'პარალელური შესრულება', ru: 'Параллельное выполнение' }, type: 'toggle', defaultValue: false },
      ],
    },
  ],
  transferActions: [
    { id: 'to-workflow', label: { en: 'Open Workflow Builder', ka: 'გახსენი Workflow', ru: 'Открыть Workflow' }, icon: 'GitBranch', targetService: 'workflow', description: { en: 'Design this as a reusable workflow', ka: 'მრავალჯერადი workflow-ის შექმნა', ru: 'Создать переиспользуемый workflow' } },
    { id: 'to-business', label: { en: 'Business Analysis', ka: 'ბიზნეს ანალიზი', ru: 'Бизнес-анализ' }, icon: 'Briefcase', targetService: 'business', description: { en: 'Send to Business Agent for analysis', ka: 'გაგზავნე ბიზნეს აგენტთან', ru: 'Отправить бизнес-агенту' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   PHOTO SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const photoConfig: ServiceChatConfig = {
  slug: 'photo',
  agentId: 'photo-agent',
  icon: '📸',
  name: { en: 'Photo Studio', ka: 'ფოტო სტუდია', ru: 'Фотостудия' },
  description: {
    en: 'Create editorial photo outputs and campaign image sets',
    ka: 'შექმენი სარედაქციო ფოტოები და კამპანიური ვიზუალები',
    ru: 'Создавайте фотоконтент и визуалы для кампаний',
  },
  accentColor: '#FB923C',
  accentGlow: 'rgba(251,146,60,0.15)',
  welcomeMessage: {
    en: "Welcome to Photo Studio! I can enhance, retouch, and create stunning editorial photos. Upload a photo or describe what you need.",
    ka: 'კეთილი იყოს თქვენი მობრძანება ფოტო სტუდიაში! ატვირთეთ ფოტო ან აღწერეთ რა გჭირდებათ.',
    ru: 'Добро пожаловать в Фотостудию! Загрузите фото или опишите, что хотите создать.',
  },
  agentModeLabel: { en: 'Photo Agent', ka: 'ფოტო აგენტი', ru: 'Фото агент' },
  placeholders: {
    default: { en: 'Describe your photo or upload an image...', ka: 'აღწერეთ ფოტო ან ატვირთეთ სურათი...', ru: 'Опишите фото или загрузите изображение...' },
    agent: { en: 'Photo Agent ready — what should I create?', ka: 'ფოტო აგენტი მზადაა', ru: 'Фото агент готов — что создать?' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'upload-photo', label: { en: 'Upload Photo', ka: 'ფოტოს ატვირთვა', ru: 'Загрузить фото' }, icon: 'Upload', action: 'upload-photo', category: 'create' },
    { id: 'enhance', label: { en: 'AI Enhance', ka: 'AI გაუმჯობესება', ru: 'AI улучшение' }, icon: 'Sparkles', action: 'enhance', category: 'edit' },
    { id: 'retouch', label: { en: 'Retouch', ka: 'რეტუში', ru: 'Ретушь' }, icon: 'Wand2', action: 'retouch', category: 'edit' },
    { id: 'portrait-mode', label: { en: 'Portrait', ka: 'პორტრეტი', ru: 'Портрет' }, icon: 'Camera', action: 'portrait-mode', category: 'style' },
    { id: 'background-remove', label: { en: 'Remove BG', ka: 'ფონის წაშლა', ru: 'Удалить фон' }, icon: 'Eraser', action: 'background-remove', category: 'edit' },
    { id: 'batch-edit', label: { en: 'Batch Edit', ka: 'პაკეტური რედაქტირება', ru: 'Пакетная обработка' }, icon: 'Layers', action: 'batch-edit', category: 'tools' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Session', ka: 'ახალი სესია', ru: 'Новая сессия' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-photos', label: { en: 'My Photos', ka: 'ჩემი ფოტოები', ru: 'Мои фото' }, icon: 'FolderOpen', action: 'my-photos' },
    { id: 'camera-capture', label: { en: 'Camera Capture', ka: 'კამერის გადაღება', ru: 'Снять с камеры' }, icon: 'Camera', action: 'camera-capture' },
    { id: 'filters', label: { en: 'Filter Presets', ka: 'ფილტრის პრესეტები', ru: 'Пресеты фильтров' }, icon: 'Aperture', action: 'filters', divider: true },
    { id: 'export', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'to-image', label: { en: 'Edit in Image Creator', ka: 'Image Creator-ში', ru: 'В Image Creator' }, icon: 'ImagePlus', action: 'transfer-image', divider: true },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg' },
  ],
  toolPanels: [
    {
      id: 'photo-tools', label: { en: 'Photo Tools', ka: 'ფოტო ხელსაწყოები', ru: 'Фото-инструменты' }, icon: 'Aperture',
      options: [
        { id: 'enhancement', label: { en: 'Enhancement', ka: 'გაუმჯობესება', ru: 'Улучшение' }, type: 'chips', options: [
          { value: 'auto', label: { en: 'Auto', ka: 'ავტო', ru: 'Авто' } },
          { value: 'portrait', label: { en: 'Portrait', ka: 'პორტრეტი', ru: 'Портрет' } },
          { value: 'landscape', label: { en: 'Landscape', ka: 'ლანდშაფტი', ru: 'Пейзаж' } },
          { value: 'product', label: { en: 'Product', ka: 'პროდუქტი', ru: 'Продукт' } },
        ], defaultValue: 'auto' },
        { id: 'quality-boost', label: { en: 'Quality Boost', ka: 'ხარისხის ამაღლება', ru: 'Повышение качества' }, type: 'slider', min: 1, max: 4, step: 1, defaultValue: 2 },
        { id: 'preserve-original', label: { en: 'Preserve Original', ka: 'ორიგინალის შენახვა', ru: 'Сохранить оригинал' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-image', label: { en: 'Edit in Image Creator', ka: 'სურათის რედაქტირება', ru: 'В Image Creator' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Continue editing in Image Creator', ka: 'გააგრძელე Image Creator-ში', ru: 'Продолжить в Image Creator' } },
    { id: 'to-video', label: { en: 'Use in Video', ka: 'ვიდეოში გამოყენება', ru: 'В видео' }, icon: 'Video', targetService: 'video', description: { en: 'Use this photo in a video project', ka: 'გამოიყენე ეს ფოტო ვიდეოში', ru: 'Использовать фото в видео' } },
    { id: 'to-avatar', label: { en: 'Create Avatar', ka: 'ავატარის შექმნა', ru: 'Создать аватар' }, icon: 'UserCircle', targetService: 'avatar', description: { en: 'Create avatar from this photo', ka: 'შექმენი ავატარი ამ ფოტოდან', ru: 'Создать аватар из этого фото' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   MEDIA PRODUCTION SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const mediaConfig: ServiceChatConfig = {
  slug: 'media',
  agentId: 'media-agent',
  icon: '📽️',
  name: { en: 'Media Production', ka: 'მედია წარმოება', ru: 'Медиапроизводство' },
  description: {
    en: 'Build complete multimedia outputs for campaigns',
    ka: 'მოამზადე სრულფასოვანი მედია-კონტენტი',
    ru: 'Создавайте медиаконтент для кампаний',
  },
  accentColor: '#E879F9',
  accentGlow: 'rgba(232,121,249,0.15)',
  welcomeMessage: {
    en: "Welcome to Media Production! I can help you create complete multimedia campaigns — combining video, audio, images, and text into unified media outputs.",
    ka: 'კეთილი იყოს თქვენი მობრძანება მედია წარმოებაში! შევქმნით სრულფასოვან მედია-კამპანიებს.',
    ru: 'Добро пожаловать в Медиапроизводство! Создавайте мультимедийные кампании.',
  },
  agentModeLabel: { en: 'Media Agent', ka: 'მედია აგენტი', ru: 'Медиа агент' },
  placeholders: {
    default: { en: 'Describe your media project or upload assets...', ka: 'აღწერეთ მედია პროექტი...', ru: 'Опишите медиа-проект или загрузите материалы...' },
    agent: { en: 'Media Agent active — describe your campaign', ka: 'მედია აგენტი აქტიურია', ru: 'Медиа агент активен — опишите кампанию' },
  },
  previewType: 'video',
  quickActions: [
    { id: 'new-campaign', label: { en: 'New Campaign', ka: 'ახალი კამპანია', ru: 'Новая кампания' }, icon: 'Megaphone', action: 'new-campaign', category: 'create' },
    { id: 'upload-assets', label: { en: 'Upload Assets', ka: 'მასალის ატვირთვა', ru: 'Загрузить материалы' }, icon: 'Upload', action: 'upload-assets', category: 'create' },
    { id: 'combine-media', label: { en: 'Combine Media', ka: 'მედიის გაერთიანება', ru: 'Объединить медиа' }, icon: 'Combine', action: 'combine-media', category: 'tools' },
    { id: 'social-format', label: { en: 'Social Formats', ka: 'სოციალური ფორმატები', ru: 'Соцсети форматы' }, icon: 'Share2', action: 'social-format', category: 'tools' },
    { id: 'brand-kit', label: { en: 'Brand Kit', ka: 'ბრენდ კიტი', ru: 'Brand Kit' }, icon: 'Palette', action: 'brand-kit', category: 'tools' },
    { id: 'publish', label: { en: 'Publish', ka: 'გამოქვეყნება', ru: 'Публикация' }, icon: 'ExternalLink', action: 'publish', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Project', ka: 'ახალი პროექტი', ru: 'Новый проект' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-projects', label: { en: 'My Projects', ka: 'ჩემი პროექტები', ru: 'Мои проекты' }, icon: 'FolderOpen', action: 'my-projects' },
    { id: 'templates', label: { en: 'Campaign Templates', ka: 'კამპანიის შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates' },
    { id: 'asset-library', label: { en: 'Asset Library', ka: 'მასალების ბიბლიოთეკა', ru: 'Библиотека' }, icon: 'FolderOpen', action: 'asset-library', divider: true },
    { id: 'export-all', label: { en: 'Export All', ka: 'ყველას ექსპორტი', ru: 'Экспорт всего' }, icon: 'Download', action: 'export-all' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'media-settings', label: { en: 'Media Settings', ka: 'მედია პარამეტრები', ru: 'Настройки медиа' }, icon: 'Settings2',
      options: [
        { id: 'output-format', label: { en: 'Output', ka: 'ფორმატი', ru: 'Формат' }, type: 'chips', options: [
          { value: 'social', label: { en: 'Social', ka: 'სოციალური', ru: 'Соцсети' } },
          { value: 'web', label: { en: 'Web', ka: 'ვებ', ru: 'Веб' } },
          { value: 'print', label: { en: 'Print', ka: 'ბეჭდვა', ru: 'Печать' } },
          { value: 'broadcast', label: { en: 'Broadcast', ka: 'ტელევიზია', ru: 'ТВ' } },
        ], defaultValue: 'social' },
        { id: 'quality', label: { en: 'Quality', ka: 'ხარისხი', ru: 'Качество' }, type: 'slider', min: 1, max: 4, step: 1, defaultValue: 3 },
      ],
    },
  ],
  transferActions: [
    { id: 'to-video', label: { en: 'Edit Video', ka: 'ვიდეოს რედაქტირება', ru: 'Редактировать видео' }, icon: 'Video', targetService: 'video', description: { en: 'Edit video component separately', ka: 'ვიდეო კომპონენტის რედაქტირება', ru: 'Редактировать видео отдельно' } },
    { id: 'to-image', label: { en: 'Edit Images', ka: 'სურათების რედაქტირება', ru: 'Редактировать изображения' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Edit image assets in Image Creator', ka: 'სურათების რედაქტირება', ru: 'Редактировать изображения' } },
    { id: 'to-music', label: { en: 'Create Audio', ka: 'აუდიოს შექმნა', ru: 'Создать аудио' }, icon: 'Music', targetService: 'music', description: { en: 'Create audio track for this campaign', ka: 'აუდიო ტრეკის შექმნა', ru: 'Создать аудиотрек' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   PROMPT BUILDER SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const promptConfig: ServiceChatConfig = {
  slug: 'prompt',
  agentId: 'prompt-agent',
  icon: '🧩',
  name: { en: 'Prompt Builder', ka: 'პრომპტების კონსტრუქტორი', ru: 'Конструктор промптов' },
  description: {
    en: 'Design reusable prompt systems for consistent AI results',
    ka: 'ააგე prompt სისტემები სტაბილური შედეგებისთვის',
    ru: 'Создавайте промпт-системы для стабильных результатов',
  },
  accentColor: '#FBBF24',
  accentGlow: 'rgba(251,191,36,0.15)',
  welcomeMessage: {
    en: "Welcome to Prompt Builder! I'll help you design, test, and refine reusable prompts for all AI services. Describe what you want to achieve.",
    ka: 'კეთილი იყოს თქვენი მობრძანება! დავეხმარები prompt-ების შექმნაში ყველა სერვისისთვის.',
    ru: 'Добро пожаловать! Помогу создать, протестировать и улучшить промпты для всех сервисов.',
  },
  agentModeLabel: { en: 'Prompt Agent', ka: 'პრომპტის აგენტი', ru: 'Промпт агент' },
  placeholders: {
    default: { en: 'Describe your prompt goal or paste an existing prompt...', ka: 'აღწერეთ prompt-ის მიზანი...', ru: 'Опишите цель промпта или вставьте существующий...' },
    agent: { en: 'Prompt Agent active — describe the AI task', ka: 'პრომპტის აგენტი აქტიურია', ru: 'Промпт агент активен — опишите задачу' },
  },
  previewType: 'text',
  quickActions: [
    { id: 'new-prompt', label: { en: 'New Prompt', ka: 'ახალი პრომპტი', ru: 'Новый промпт' }, icon: 'Plus', action: 'new-prompt', category: 'create' },
    { id: 'optimize', label: { en: 'Optimize Prompt', ka: 'ოპტიმიზაცია', ru: 'Оптимизировать' }, icon: 'Sparkles', action: 'optimize', category: 'tools' },
    { id: 'test-prompt', label: { en: 'Test Run', ka: 'ტესტი', ru: 'Тест-запуск' }, icon: 'Play', action: 'test-prompt', category: 'tools' },
    { id: 'templates', label: { en: 'Templates', ka: 'შაბლონები', ru: 'Шаблоны' }, icon: 'LayoutTemplate', action: 'templates', category: 'create' },
    { id: 'chain', label: { en: 'Prompt Chain', ka: 'ჯაჭვი', ru: 'Цепь промптов' }, icon: 'GitBranch', action: 'chain', category: 'tools' },
    { id: 'variables', label: { en: 'Variables', ka: 'ცვლადები', ru: 'Переменные' }, icon: 'Puzzle', action: 'variables', category: 'tools' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Prompt', ka: 'ახალი პრომპტი', ru: 'Новый промпт' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-prompts', label: { en: 'My Prompts', ka: 'ჩემი პრომპტები', ru: 'Мои промпты' }, icon: 'FolderOpen', action: 'my-prompts' },
    { id: 'prompt-library', label: { en: 'Prompt Library', ka: 'ბიბლიოთეკა', ru: 'Библиотека промптов' }, icon: 'BookOpen', action: 'prompt-library' },
    { id: 'test-history', label: { en: 'Test History', ka: 'ტესტის ისტორია', ru: 'История тестов' }, icon: 'Clock', action: 'test-history', divider: true },
    { id: 'export', label: { en: 'Export Prompt', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'prompt-settings', label: { en: 'Prompt Settings', ka: 'პრომპტის პარამეტრები', ru: 'Настройки промпта' }, icon: 'Settings2',
      options: [
        { id: 'target-service', label: { en: 'Target Service', ka: 'სამიზნე სერვისი', ru: 'Целевой сервис' }, type: 'chips', options: [
          { value: 'general', label: { en: 'General', ka: 'ზოგადი', ru: 'Общий' } },
          { value: 'image', label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' } },
          { value: 'video', label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' } },
          { value: 'text', label: { en: 'Text', ka: 'ტექსტი', ru: 'Текст' } },
        ], defaultValue: 'general' },
        { id: 'creativity', label: { en: 'Creativity', ka: 'კრეატიულობა', ru: 'Креативность' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
        { id: 'include-examples', label: { en: 'Include Examples', ka: 'მაგალითების ჩართვა', ru: 'Включить примеры' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-text', label: { en: 'Use in Text', ka: 'ტექსტში გამოყენება', ru: 'В текст' }, icon: 'Type', targetService: 'text', description: { en: 'Apply this prompt in Text Intelligence', ka: 'გამოიყენე ტექსტში', ru: 'Применить в Text Intelligence' } },
    { id: 'to-image', label: { en: 'Use for Images', ka: 'სურათებისთვის', ru: 'Для изображений' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Use this prompt for image generation', ka: 'გამოიყენე სურათების გენერაციისთვის', ru: 'Для генерации изображений' } },
    { id: 'to-workflow', label: { en: 'Add to Workflow', ka: 'Workflow-ში', ru: 'В Workflow' }, icon: 'GitBranch', targetService: 'workflow', description: { en: 'Add prompt to an automation workflow', ka: 'დაამატე workflow-ში', ru: 'Добавить в автопроцесс' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   VISUAL INTELLIGENCE SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const visualIntelConfig: ServiceChatConfig = {
  slug: 'visual-intel',
  agentId: 'visual-intel-agent',
  icon: '🧠',
  name: { en: 'Visual Intelligence', ka: 'ვიზუალური ინტელექტი', ru: 'Визуальный интеллект' },
  description: {
    en: 'Analyze and optimize visual creative assets',
    ka: 'გააანალიზე ვიზუალური მასალები AI-ით',
    ru: 'Анализируйте визуальные материалы с помощью AI',
  },
  accentColor: '#34D399',
  accentGlow: 'rgba(52,211,153,0.15)',
  welcomeMessage: {
    en: "Welcome to Visual Intelligence! I can analyze images, detect objects, extract text, assess composition quality, and provide creative insights.",
    ka: 'კეთილი იყოს თქვენი მობრძანება! გავაანალიზებ სურათებს, გამოვავლენ ობიექტებს და ამოვიცნობ ტექსტს.',
    ru: 'Добро пожаловать! Анализирую изображения, определяю объекты, извлекаю текст.',
  },
  agentModeLabel: { en: 'Vision Agent', ka: 'ვიჟენ აგენტი', ru: 'Визуальный агент' },
  placeholders: {
    default: { en: 'Upload an image to analyze or describe your task...', ka: 'ატვირთეთ სურათი ანალიზისთვის...', ru: 'Загрузите изображение для анализа...' },
    agent: { en: 'Vision Agent active — upload an image', ka: 'ვიჟენ აგენტი აქტიურია', ru: 'Визуальный агент активен — загрузите изображение' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'upload-analyze', label: { en: 'Upload & Analyze', ka: 'ატვირთე და გააანალიზე', ru: 'Загрузить и анализировать' }, icon: 'Upload', action: 'upload-analyze', category: 'create' },
    { id: 'detect-objects', label: { en: 'Detect Objects', ka: 'ობიექტების გამოვლენა', ru: 'Обнаружить объекты' }, icon: 'Search', action: 'detect-objects', category: 'tools' },
    { id: 'extract-text', label: { en: 'Extract Text (OCR)', ka: 'ტექსტის ამოცნობა', ru: 'Извлечь текст (OCR)' }, icon: 'Type', action: 'extract-text', category: 'tools' },
    { id: 'composition', label: { en: 'Composition Check', ka: 'კომპოზიციის შემოწმება', ru: 'Проверка композиции' }, icon: 'Focus', action: 'composition', category: 'tools' },
    { id: 'color-analysis', label: { en: 'Color Analysis', ka: 'ფერების ანალიზი', ru: 'Анализ цвета' }, icon: 'Palette', action: 'color-analysis', category: 'tools' },
    { id: 'compare', label: { en: 'Compare Images', ka: 'სურათების შედარება', ru: 'Сравнить изображения' }, icon: 'Combine', action: 'compare', category: 'tools' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Analysis', ka: 'ახალი ანალიზი', ru: 'Новый анализ' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-analyses', label: { en: 'My Analyses', ka: 'ჩემი ანალიზები', ru: 'Мои анализы' }, icon: 'FolderOpen', action: 'my-analyses' },
    { id: 'batch-analyze', label: { en: 'Batch Analyze', ka: 'პაკეტური ანალიზი', ru: 'Пакетный анализ' }, icon: 'Layers', action: 'batch-analyze' },
    { id: 'report', label: { en: 'Generate Report', ka: 'ანგარიშის შექმნა', ru: 'Создать отчёт' }, icon: 'FileText', action: 'report', divider: true },
    { id: 'export', label: { en: 'Export Results', ka: 'შედეგების ექსპორტი', ru: 'Экспорт результатов' }, icon: 'Download', action: 'export' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'analysis-settings', label: { en: 'Analysis Settings', ka: 'ანალიზის პარამეტრები', ru: 'Настройки анализа' }, icon: 'Settings2',
      options: [
        { id: 'depth', label: { en: 'Analysis Depth', ka: 'ანალიზის სიღრმე', ru: 'Глубина анализа' }, type: 'chips', options: [
          { value: 'quick', label: { en: 'Quick', ka: 'სწრაფი', ru: 'Быстрый' } },
          { value: 'standard', label: { en: 'Standard', ka: 'სტანდარტული', ru: 'Стандартный' } },
          { value: 'deep', label: { en: 'Deep', ka: 'ღრმა', ru: 'Глубокий' } },
        ], defaultValue: 'standard' },
        { id: 'include-suggestions', label: { en: 'Include Suggestions', ka: 'რეკომენდაციები', ru: 'Включить рекомендации' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-image', label: { en: 'Edit Image', ka: 'სურათის რედაქტირება', ru: 'Редактировать' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Edit this image based on analysis', ka: 'სურათის რედაქტირება ანალიზის მიხედვით', ru: 'Редактировать по результатам анализа' } },
    { id: 'to-photo', label: { en: 'Photo Enhance', ka: 'ფოტოს გაუმჯობესება', ru: 'Улучшить фото' }, icon: 'Camera', targetService: 'photo', description: { en: 'Enhance in Photo Studio', ka: 'გააუმჯობესე ფოტო სტუდიაში', ru: 'Улучшить в Фотостудии' } },
    { id: 'to-text', label: { en: 'Extract to Text', ka: 'ტექსტში ექსტრაქცია', ru: 'Извлечь в текст' }, icon: 'Type', targetService: 'text', description: { en: 'Send extracted text to Text Intelligence', ka: 'ტექსტის გაგზავნა', ru: 'Отправить текст в Text Intelligence' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   SOFTWARE DEV SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const softwareConfig: ServiceChatConfig = {
  slug: 'software',
  agentId: 'software-agent',
  icon: '💻',
  name: { en: 'Software Dev', ka: 'პროგრამული უზრუნველყოფა', ru: 'Разработка ПО' },
  description: {
    en: 'AI-assisted code generation, review, and deployment',
    ka: 'AI-ით კოდის გენერაცია, მიმოხილვა და დეპლოი',
    ru: 'Генерация кода, ревью и деплой с помощью AI',
  },
  accentColor: '#60A5FA',
  accentGlow: 'rgba(96,165,250,0.15)',
  welcomeMessage: {
    en: "Welcome to Software Dev! I can generate code, review pull requests, debug issues, and help deploy your applications. What are you building?",
    ka: 'კეთილი იყოს თქვენი მობრძანება! შემიძლია კოდის გენერაცია, PR-ების მიმოხილვა და დეპლოი.',
    ru: 'Добро пожаловать! Генерация кода, ревью PR, отладка и помощь с деплоем.',
  },
  agentModeLabel: { en: 'Dev Agent', ka: 'დეველოპერ აგენტი', ru: 'Агент разработки' },
  placeholders: {
    default: { en: 'Describe what you want to build or paste code...', ka: 'აღწერეთ რა გსურთ აშენოთ ან ჩასვით კოდი...', ru: 'Опишите задачу или вставьте код...' },
    agent: { en: 'Dev Agent active — describe the project', ka: 'დეველოპერ აგენტი აქტიურია', ru: 'Агент разработки активен — опишите проект' },
  },
  previewType: 'text',
  quickActions: [
    { id: 'generate-code', label: { en: 'Generate Code', ka: 'კოდის გენერაცია', ru: 'Сгенерировать код' }, icon: 'Code', action: 'generate-code', category: 'create' },
    { id: 'review', label: { en: 'Code Review', ka: 'კოდის მიმოხილვა', ru: 'Ревью кода' }, icon: 'Search', action: 'review', category: 'tools' },
    { id: 'debug', label: { en: 'Debug', ka: 'დებაგი', ru: 'Отладить' }, icon: 'Bug', action: 'debug', category: 'tools' },
    { id: 'deploy', label: { en: 'Deploy', ka: 'დეპლოი', ru: 'Деплой' }, icon: 'Rocket', action: 'deploy', category: 'manage' },
    { id: 'terminal', label: { en: 'Terminal', ka: 'ტერმინალი', ru: 'Терминал' }, icon: 'Terminal', action: 'terminal', category: 'tools' },
    { id: 'api-design', label: { en: 'API Design', ka: 'API დიზაინი', ru: 'Дизайн API' }, icon: 'Globe', action: 'api-design', category: 'create' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Project', ka: 'ახალი პროექტი', ru: 'Новый проект' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-projects', label: { en: 'My Projects', ka: 'ჩემი პროექტები', ru: 'Мои проекты' }, icon: 'FolderOpen', action: 'my-projects' },
    { id: 'git-repos', label: { en: 'Git Repositories', ka: 'Git რეპოზიტორიები', ru: 'Git репозитории' }, icon: 'GitBranch', action: 'git-repos' },
    { id: 'snippets', label: { en: 'Code Snippets', ka: 'კოდის ფრაგმენტები', ru: 'Сниппеты' }, icon: 'Code', action: 'snippets', divider: true },
    { id: 'database', label: { en: 'Database', ka: 'მონაცემთა ბაზა', ru: 'База данных' }, icon: 'Database', action: 'database' },
    { id: 'cloud', label: { en: 'Cloud Services', ka: 'ღრუბლოვანი სერვისები', ru: 'Облачные сервисы' }, icon: 'Cloud', action: 'cloud' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'dev-settings', label: { en: 'Dev Settings', ka: 'პარამეტრები', ru: 'Настройки' }, icon: 'Settings2',
      options: [
        { id: 'language', label: { en: 'Language', ka: 'ენა', ru: 'Язык' }, type: 'chips', options: [
          { value: 'typescript', label: { en: 'TypeScript', ka: 'TypeScript', ru: 'TypeScript' } },
          { value: 'python', label: { en: 'Python', ka: 'Python', ru: 'Python' } },
          { value: 'rust', label: { en: 'Rust', ka: 'Rust', ru: 'Rust' } },
          { value: 'go', label: { en: 'Go', ka: 'Go', ru: 'Go' } },
        ], defaultValue: 'typescript' },
        { id: 'framework', label: { en: 'Framework', ka: 'ფრეიმვორკი', ru: 'Фреймворк' }, type: 'chips', options: [
          { value: 'nextjs', label: { en: 'Next.js', ka: 'Next.js', ru: 'Next.js' } },
          { value: 'react', label: { en: 'React', ka: 'React', ru: 'React' } },
          { value: 'node', label: { en: 'Node.js', ka: 'Node.js', ru: 'Node.js' } },
          { value: 'fastapi', label: { en: 'FastAPI', ka: 'FastAPI', ru: 'FastAPI' } },
        ], defaultValue: 'nextjs' },
        { id: 'auto-deploy', label: { en: 'Auto Deploy', ka: 'ავტო-დეპლოი', ru: 'Авто-деплой' }, type: 'toggle', defaultValue: false },
      ],
    },
  ],
  transferActions: [
    { id: 'to-workflow', label: { en: 'Add to Workflow', ka: 'Workflow-ში', ru: 'В Workflow' }, icon: 'GitBranch', targetService: 'workflow', description: { en: 'Add as a step in a workflow', ka: 'დაამატე workflow-ს ნაბიჯად', ru: 'Добавить как шаг в workflow' } },
    { id: 'to-text', label: { en: 'Generate Docs', ka: 'დოკუმენტაცია', ru: 'Документация' }, icon: 'FileText', targetService: 'text', description: { en: 'Generate documentation in Text Intelligence', ka: 'დოკუმენტაციის შექმნა', ru: 'Создать документацию' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   BUSINESS AGENT SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const businessConfig: ServiceChatConfig = {
  slug: 'business',
  agentId: 'business-agent',
  icon: '💼',
  name: { en: 'Business Agent', ka: 'ბიზნეს აგენტი', ru: 'Бизнес-агент' },
  description: {
    en: 'Market research, pitch decks, and financial modeling',
    ka: 'ბაზრის კვლევა, პრეზენტაციები და ფინანსური მოდელირება',
    ru: 'Исследование рынка, питч-деки и финансовое моделирование',
  },
  accentColor: '#818CF8',
  accentGlow: 'rgba(129,140,248,0.15)',
  welcomeMessage: {
    en: "Welcome to Business Agent! I can conduct market research, create pitch decks, build financial models, and develop business strategies. What do you need?",
    ka: 'კეთილი იყოს თქვენი მობრძანება! ვატარებ ბაზრის კვლევას, ვქმნი პრეზენტაციებს და ფინანსურ მოდელებს.',
    ru: 'Добро пожаловать! Маркетинговые исследования, питч-деки, финансовые модели и бизнес-стратегии.',
  },
  agentModeLabel: { en: 'Business Agent', ka: 'ბიზნეს აგენტი', ru: 'Бизнес-агент' },
  placeholders: {
    default: { en: 'Describe your business question or goal...', ka: 'აღწერეთ ბიზნეს კითხვა ან მიზანი...', ru: 'Опишите бизнес-задачу или цель...' },
    agent: { en: 'Business Agent active — what should I research?', ka: 'ბიზნეს აგენტი აქტიურია', ru: 'Бизнес-агент активен — что исследовать?' },
  },
  previewType: 'text',
  quickActions: [
    { id: 'market-research', label: { en: 'Market Research', ka: 'ბაზრის კვლევა', ru: 'Исследование рынка' }, icon: 'Search', action: 'market-research', category: 'create' },
    { id: 'pitch-deck', label: { en: 'Pitch Deck', ka: 'პრეზენტაცია', ru: 'Питч-дек' }, icon: 'Presentation', action: 'pitch-deck', category: 'create' },
    { id: 'financial-model', label: { en: 'Financial Model', ka: 'ფინანსური მოდელი', ru: 'Финансовая модель' }, icon: 'TrendingUp', action: 'financial-model', category: 'create' },
    { id: 'competitor', label: { en: 'Competitor Analysis', ka: 'კონკურენტის ანალიზი', ru: 'Анализ конкурентов' }, icon: 'Target', action: 'competitor', category: 'tools' },
    { id: 'strategy', label: { en: 'Strategy', ka: 'სტრატეგია', ru: 'Стратегия' }, icon: 'Lightbulb', action: 'strategy', category: 'tools' },
    { id: 'report', label: { en: 'Generate Report', ka: 'ანგარიში', ru: 'Создать отчёт' }, icon: 'FileSpreadsheet', action: 'report', category: 'manage' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Analysis', ka: 'ახალი ანალიზი', ru: 'Новый анализ' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-projects', label: { en: 'My Projects', ka: 'ჩემი პროექტები', ru: 'Мои проекты' }, icon: 'FolderOpen', action: 'my-projects' },
    { id: 'templates', label: { en: 'Business Templates', ka: 'ბიზნეს შაბლონები', ru: 'Бизнес-шаблоны' }, icon: 'LayoutTemplate', action: 'templates' },
    { id: 'data-sources', label: { en: 'Data Sources', ka: 'მონაცემთა წყაროები', ru: 'Источники данных' }, icon: 'Database', action: 'data-sources', divider: true },
    { id: 'export', label: { en: 'Export Report', ka: 'ანგარიშის ექსპორტი', ru: 'Экспорт отчёта' }, icon: 'Download', action: 'export' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'business-settings', label: { en: 'Business Settings', ka: 'ბიზნეს პარამეტრები', ru: 'Настройки' }, icon: 'Briefcase',
      options: [
        { id: 'industry', label: { en: 'Industry', ka: 'ინდუსტრია', ru: 'Отрасль' }, type: 'chips', options: [
          { value: 'tech', label: { en: 'Tech', ka: 'ტექ', ru: 'Тех' } },
          { value: 'finance', label: { en: 'Finance', ka: 'ფინანსები', ru: 'Финансы' } },
          { value: 'retail', label: { en: 'Retail', ka: 'საცალო', ru: 'Ритейл' } },
          { value: 'saas', label: { en: 'SaaS', ka: 'SaaS', ru: 'SaaS' } },
        ], defaultValue: 'tech' },
        { id: 'detail-level', label: { en: 'Detail Level', ka: 'დეტალურობა', ru: 'Уровень деталей' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
        { id: 'include-charts', label: { en: 'Include Charts', ka: 'გრაფიკების ჩართვა', ru: 'Включить графики' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-text', label: { en: 'Create Content', ka: 'კონტენტის შექმნა', ru: 'Создать контент' }, icon: 'Type', targetService: 'text', description: { en: 'Create marketing content from business insights', ka: 'კონტენტის შექმნა ბიზნეს ინსაიტებიდან', ru: 'Создать контент из бизнес-инсайтов' } },
    { id: 'to-media', label: { en: 'Create Campaign', ka: 'კამპანიის შექმნა', ru: 'Создать кампанию' }, icon: 'Megaphone', targetService: 'media', description: { en: 'Launch a media campaign from strategy', ka: 'მედია კამპანიის გაშვება', ru: 'Запустить кампанию из стратегии' } },
    { id: 'to-workflow', label: { en: 'Automate Process', ka: 'პროცესის ავტომატიზაცია', ru: 'Автоматизировать' }, icon: 'GitBranch', targetService: 'workflow', description: { en: 'Automate this business process', ka: 'ბიზნეს პროცესის ავტომატიზაცია', ru: 'Автоматизировать бизнес-процесс' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   TOURISM AI SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const tourismConfig: ServiceChatConfig = {
  slug: 'tourism',
  agentId: 'tourism-agent',
  icon: '✈️',
  name: { en: 'Tourism AI', ka: 'ტურიზმი AI', ru: 'Туризм AI' },
  description: {
    en: 'AI-powered travel planning, itinerary building, and local guide',
    ka: 'AI მოგზაურობის დაგეგმვა, მარშრუტი და ადგილობრივი გიდი',
    ru: 'AI-планирование путешествий, маршруты и местный гид',
  },
  accentColor: '#2DD4BF',
  accentGlow: 'rgba(45,212,191,0.15)',
  welcomeMessage: {
    en: "Welcome to Tourism AI! I can plan trips, build itineraries, recommend destinations, find accommodations, and serve as your personal travel guide.",
    ka: 'კეთილი იყოს თქვენი მობრძანება! დავგეგმავ მოგზაურობას, ავაშენებ მარშრუტს და ვიქნები თქვენი გიდი.',
    ru: 'Добро пожаловать! Планирование путешествий, маршруты, рекомендации и личный гид.',
  },
  agentModeLabel: { en: 'Travel Agent', ka: 'ტურისტული აგენტი', ru: 'Турагент' },
  placeholders: {
    default: { en: 'Where would you like to go? Describe your trip...', ka: 'სად გსურთ წასვლა? აღწერეთ მოგზაურობა...', ru: 'Куда хотите поехать? Опишите поездку...' },
    agent: { en: 'Travel Agent active — plan your perfect trip', ka: 'ტურისტული აგენტი აქტიურია', ru: 'Турагент активен — спланируем идеальную поездку' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'plan-trip', label: { en: 'Plan Trip', ka: 'მოგზაურობის დაგეგმვა', ru: 'Спланировать поездку' }, icon: 'Plane', action: 'plan-trip', category: 'create' },
    { id: 'itinerary', label: { en: 'Build Itinerary', ka: 'მარშრუტის აშენება', ru: 'Составить маршрут' }, icon: 'Map', action: 'itinerary', category: 'create' },
    { id: 'find-hotels', label: { en: 'Find Hotels', ka: 'სასტუმროები', ru: 'Найти отели' }, icon: 'Building', action: 'find-hotels', category: 'tools' },
    { id: 'local-guide', label: { en: 'Local Guide', ka: 'ადგილობრივი გიდი', ru: 'Местный гид' }, icon: 'MapPin', action: 'local-guide', category: 'tools' },
    { id: 'budget', label: { en: 'Budget Planner', ka: 'ბიუჯეტის დაგეგმვა', ru: 'Бюджет поездки' }, icon: 'DollarSign', action: 'budget', category: 'manage' },
    { id: 'explore', label: { en: 'Explore', ka: 'აღმოაჩინე', ru: 'Исследовать' }, icon: 'Compass', action: 'explore', category: 'tools' },
  ],
  hamburgerMenu: [
    { id: 'new-session', label: { en: 'New Trip', ka: 'ახალი მოგზაურობა', ru: 'Новая поездка' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-trips', label: { en: 'My Trips', ka: 'ჩემი მოგზაურობები', ru: 'Мои поездки' }, icon: 'FolderOpen', action: 'my-trips' },
    { id: 'saved-places', label: { en: 'Saved Places', ka: 'შენახული ადგილები', ru: 'Сохранённые места' }, icon: 'Bookmark', action: 'saved-places' },
    { id: 'calendar', label: { en: 'Travel Calendar', ka: 'კალენდარი', ru: 'Календарь' }, icon: 'CalendarDays', action: 'calendar', divider: true },
    { id: 'export-itinerary', label: { en: 'Export Itinerary', ka: 'მარშრუტის ექსპორტი', ru: 'Экспорт маршрута' }, icon: 'Download', action: 'export-itinerary' },
    { id: 'to-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg', divider: true },
  ],
  toolPanels: [
    {
      id: 'travel-settings', label: { en: 'Travel Preferences', ka: 'მოგზაურობის პარამეტრები', ru: 'Настройки путешествия' }, icon: 'Compass',
      options: [
        { id: 'travel-style', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'chips', options: [
          { value: 'budget', label: { en: 'Budget', ka: 'ეკონომ', ru: 'Бюджет' } },
          { value: 'comfort', label: { en: 'Comfort', ka: 'კომფორტი', ru: 'Комфорт' } },
          { value: 'luxury', label: { en: 'Luxury', ka: 'ლუქსი', ru: 'Люкс' } },
          { value: 'adventure', label: { en: 'Adventure', ka: 'თავგადასავალი', ru: 'Приключения' } },
        ], defaultValue: 'comfort' },
        { id: 'trip-duration', label: { en: 'Duration (days)', ka: 'ხანგრძლივობა (დღე)', ru: 'Длительность (дни)' }, type: 'slider', min: 1, max: 30, step: 1, defaultValue: 7 },
        { id: 'include-local-food', label: { en: 'Local Cuisine', ka: 'ადგილობრივი სამზარეულო', ru: 'Местная кухня' }, type: 'toggle', defaultValue: true },
      ],
    },
  ],
  transferActions: [
    { id: 'to-media', label: { en: 'Create Travel Content', ka: 'კონტენტის შექმნა', ru: 'Создать контент' }, icon: 'Megaphone', targetService: 'media', description: { en: 'Create travel content for social media', ka: 'სოციალური მედიის კონტენტი', ru: 'Создать контент для соцсетей' } },
    { id: 'to-image', label: { en: 'Generate Visuals', ka: 'ვიზუალების შექმნა', ru: 'Создать визуалы' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Generate destination visuals', ka: 'დეზინაციის ვიზუალები', ru: 'Создать визуалы направлений' } },
    { id: 'to-text', label: { en: 'Travel Guide Text', ka: 'გიდის ტექსტი', ru: 'Текст гида' }, icon: 'FileText', targetService: 'text', description: { en: 'Generate detailed travel guide text', ka: 'გიდის ტექსტის შექმნა', ru: 'Создать текст путеводителя' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   GAME CREATION SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const gameConfig: ServiceChatConfig = {
  slug: 'game',
  agentId: 'game-creator',
  icon: '🎮',
  name: { en: 'Game Creator', ka: 'თამაშის შემქმნელი', ru: 'Создатель игр' },
  description: {
    en: 'Build AI-powered games, simulations, and interactive experiences',
    ka: 'შექმენი AI თამაშები, სიმულაციები და ინტერაქტიული გამოცდილებები',
    ru: 'Создавайте AI-игры, симуляции и интерактивные сцены',
  },
  accentColor: '#34D399',
  accentGlow: 'rgba(52,211,153,0.15)',
  welcomeMessage: {
    en: "Welcome to Game Creator! Build interactive games and simulations with AI. Design scenes, turn your avatars into game characters, generate soundtracks, and share playable experiences.",
    ka: 'კეთილი იყოს თქვენი მობრძანება თამაშის შემქმნელში! შექმენით ინტერაქტიული თამაშები AI-ით.',
    ru: 'Добро пожаловать в Создатель игр! Создавайте интерактивные игры и симуляции с помощью AI.',
  },
  agentModeLabel: { en: 'Game Agent', ka: 'თამაშის აგენტი', ru: 'Агент игр' },
  placeholders: {
    default: { en: 'Describe your game idea or scene...', ka: 'აღწერეთ თქვენი თამაშის იდეა ან სცენა...', ru: 'Опишите идею игры или сцену...' },
    agent: { en: 'Game Agent ready — what should we build?', ka: 'თამაშის აგენტი მზადაა — რა შევქმნათ?', ru: 'Агент игр готов — что создадим?' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'new-scene', label: { en: 'New Scene', ka: 'ახალი სცენა', ru: 'Новая сцена' }, icon: 'Layers', action: 'new-scene', category: 'create' },
    { id: 'import-avatar', label: { en: 'Import Avatar', ka: 'ავატარის იმპორტი', ru: 'Импорт аватара' }, icon: 'User', action: 'import-avatar', category: 'create' },
    { id: 'add-character', label: { en: 'Add Character', ka: 'პერსონაჟის დამატება', ru: 'Добавить персонажа' }, icon: 'Gamepad2', action: 'add-character', category: 'create' },
    { id: 'game-logic', label: { en: 'Game Logic', ka: 'თამაშის ლოგიკა', ru: 'Логика игры' }, icon: 'Brain', action: 'game-logic', category: 'configure' },
    { id: 'play-test', label: { en: 'Play Test', ka: 'ტესტის გაშვება', ru: 'Тест-игра' }, icon: 'Play', action: 'play-test', category: 'test' },
    { id: 'share-game', label: { en: 'Share Game', ka: 'თამაშის გაზიარება', ru: 'Поделиться' }, icon: 'Share2', action: 'share-game', category: 'export' },
  ],
  hamburgerMenu: [
    { id: 'new-game', label: { en: 'New Game', ka: 'ახალი თამაში', ru: 'Новая игра' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-games', label: { en: 'My Games', ka: 'ჩემი თამაშები', ru: 'Мои игры' }, icon: 'FolderOpen', action: 'my-games' },
    { id: 'scene-builder', label: { en: 'Scene Builder', ka: 'სცენის შემქმნელი', ru: 'Конструктор сцен' }, icon: 'Layers', action: 'scene-builder' },
    { id: 'character-editor', label: { en: 'Character Editor', ka: 'პერსონაჟის რედაქტორი', ru: 'Редактор персонажей' }, icon: 'Gamepad2', action: 'character-editor' },
    { id: 'game-logic-menu', label: { en: 'Game Logic', ka: 'თამაშის ლოგიკა', ru: 'Логика игры' }, icon: 'Brain', action: 'game-logic', divider: true },
    { id: 'soundtrack-gen', label: { en: 'Generate Soundtrack', ka: 'საუნდტრეკის გენერაცია', ru: 'Сгенерировать саундтрек' }, icon: 'Music', action: 'generate-soundtrack' },
    { id: 'play-online', label: { en: 'Play Online', ka: 'ონლაინ თამაში', ru: 'Играть онлайн' }, icon: 'Globe', action: 'play-online', divider: true },
    { id: 'continue-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg' },
  ],
  toolPanels: [
    {
      id: 'scene-settings', label: { en: 'Scene Settings', ka: 'სცენის პარამეტრები', ru: 'Настройки сцены' }, icon: 'Layers',
      options: [
        { id: 'environment', label: { en: 'Environment', ka: 'გარემო', ru: 'Окружение' }, type: 'chips', options: [
          { value: 'fantasy', label: { en: 'Fantasy', ka: 'ფენტეზი', ru: 'Фэнтези' } },
          { value: 'sci-fi', label: { en: 'Sci-Fi', ka: 'სай-ფაი', ru: 'Научная фантастика' } },
          { value: 'realistic', label: { en: 'Realistic', ka: 'რეალისტური', ru: 'Реалистичное' } },
          { value: 'abstract', label: { en: 'Abstract', ka: 'აბსტრაქტული', ru: 'Абстрактное' } },
        ], defaultValue: 'fantasy' },
        { id: 'lighting', label: { en: 'Lighting', ka: 'განათება', ru: 'Освещение' }, type: 'chips', options: [
          { value: 'day', label: { en: 'Day', ka: 'დღე', ru: 'День' } },
          { value: 'night', label: { en: 'Night', ka: 'ღამე', ru: 'Ночь' } },
          { value: 'sunset', label: { en: 'Sunset', ka: 'მზის ჩასვლა', ru: 'Закат' } },
          { value: 'neon', label: { en: 'Neon', ka: 'ნეონი', ru: 'Неон' } },
        ], defaultValue: 'day' },
        { id: 'complexity', label: { en: 'Complexity', ka: 'სირთულე', ru: 'Сложность' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
      ],
    },
    {
      id: 'game-rules', label: { en: 'Game Rules', ka: 'თამაშის წესები', ru: 'Правила игры' }, icon: 'Brain',
      options: [
        { id: 'game-type', label: { en: 'Game Type', ka: 'თამაშის ტიპი', ru: 'Тип игры' }, type: 'chips', options: [
          { value: 'adventure', label: { en: 'Adventure', ka: 'თავგადასავალი', ru: 'Приключение' } },
          { value: 'puzzle', label: { en: 'Puzzle', ka: 'თავსატეხი', ru: 'Головоломка' } },
          { value: 'simulation', label: { en: 'Simulation', ka: 'სიმულაცია', ru: 'Симуляция' } },
          { value: 'arcade', label: { en: 'Arcade', ka: 'არქეიდი', ru: 'Аркада' } },
        ], defaultValue: 'adventure' },
        { id: 'difficulty', label: { en: 'Difficulty', ka: 'სირთულე', ru: 'Сложность' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 2 },
      ],
    },
  ],
  transferActions: [
    { id: 'to-avatar', label: { en: 'Import Avatar', ka: 'ავატარის იმპორტი', ru: 'Импорт аватара' }, icon: 'ScanFace', targetService: 'avatar', description: { en: 'Import your avatar as a game character', ka: 'იმპორტირე ავატარი როგორც თამაშის პერსონაჟი', ru: 'Импортировать аватар как персонажа' } },
    { id: 'to-music', label: { en: 'Create Soundtrack', ka: 'საუნდტრეკის შექმნა', ru: 'Создать саундтрек' }, icon: 'Music', targetService: 'music', description: { en: 'Generate a custom game soundtrack', ka: 'არჩიე საუნდტრეკის გენერაცია', ru: 'Сгенерировать саундтрек' } },
    { id: 'to-image', label: { en: 'Create Game Assets', ka: 'ასეტების შექმნა', ru: 'Создать ассеты' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Generate textures and sprites for your game', ka: 'ტექსტურების და სპრაიტების გენერაცია', ru: 'Создать текстуры и спрайты' } },
    { id: 'to-video', label: { en: 'Create Trailer', ka: 'ტრეილერის შექმნა', ru: 'Создать трейлер' }, icon: 'Video', targetService: 'video', description: { en: 'Generate a cinematic game trailer', ka: 'კინემატოგრაფიული ტრეილერის გენერაცია', ru: 'Создать кинематографичный трейлер' } },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   INTERIOR DESIGNER SERVICE
   ═══════════════════════════════════════════════════════════════════ */
export const interiorConfig: ServiceChatConfig = {
  slug: 'interior',
  agentId: 'interior-designer',
  icon: '🏠',
  name: { en: 'Interior Designer', ka: 'ინტერიერის დიზაინერი', ru: 'Дизайнер интерьеров' },
  description: {
    en: 'Redesign rooms and spaces with AI-powered interior design',
    ka: 'გადააპროექტე ოთახები და სივრცეები AI ინტერიერის დიზაინით',
    ru: 'Переоформите комнаты и пространства с AI-дизайном интерьеров',
  },
  accentColor: '#F59E0B',
  accentGlow: 'rgba(245,158,11,0.15)',
  welcomeMessage: {
    en: "Welcome to Interior Designer! Upload a photo or video of any room, and I'll help you redesign it professionally. Choose a style, compare variations, refine every detail — from wall colors to furniture, lighting to decor. Let's transform your space.",
    ka: 'კეთილი იყოს თქვენი მობრძანება ინტერიერის დიზაინერში! ატვირთეთ ოთახის ფოტო ან ვიდეო და დაგეხმარებით პროფესიონალურ გადაპროექტებაში.',
    ru: 'Добро пожаловать в Дизайнер интерьеров! Загрузите фото или видео комнаты, и я помогу профессионально её переоформить.',
  },
  agentModeLabel: { en: 'Design Agent', ka: 'დიზაინის აგენტი', ru: 'Агент дизайна' },
  placeholders: {
    default: { en: 'Describe how you want to redesign this space...', ka: 'აღწერეთ როგორ გსურთ ამ სივრცის გადაპროექტება...', ru: 'Опишите, как хотите переоформить это пространство...' },
    agent: { en: 'Design Agent ready — upload a room photo or describe your vision', ka: 'დიზაინის აგენტი მზადაა — ატვირთეთ ფოტო ან აღწერეთ ხედვა', ru: 'Агент дизайна готов — загрузите фото или опишите видение' },
  },
  previewType: 'image',
  quickActions: [
    { id: 'upload-room', label: { en: 'Upload Room Photo', ka: 'ოთახის ფოტოს ატვირთვა', ru: 'Загрузить фото комнаты' }, icon: 'Upload', action: 'upload-room', category: 'input' },
    { id: 'capture-room', label: { en: 'Capture Room', ka: 'ოთახის გადაღება', ru: 'Снять комнату' }, icon: 'Camera', action: 'capture-room', category: 'input' },
    { id: 'redesign', label: { en: 'Redesign Space', ka: 'სივრცის გადაპროექტება', ru: 'Переоформить' }, icon: 'Paintbrush', action: 'redesign', category: 'create' },
    { id: 'change-style', label: { en: 'Change Style', ka: 'სტილის შეცვლა', ru: 'Сменить стиль' }, icon: 'Palette', action: 'change-style', category: 'create' },
    { id: 'compare', label: { en: 'Compare Versions', ka: 'ვერსიების შედარება', ru: 'Сравнить версии' }, icon: 'Layers', action: 'compare', category: 'review' },
    { id: 'export-design', label: { en: 'Export Design', ka: 'დიზაინის ექსპორტი', ru: 'Экспорт дизайна' }, icon: 'Download', action: 'export-design', category: 'export' },
  ],
  hamburgerMenu: [
    { id: 'new-project', label: { en: 'New Project', ka: 'ახალი პროექტი', ru: 'Новый проект' }, icon: 'Plus', action: 'new-session' },
    { id: 'my-designs', label: { en: 'My Interior Designs', ka: 'ჩემი ინტერიერის დიზაინები', ru: 'Мои дизайны интерьеров' }, icon: 'FolderOpen', action: 'my-designs' },
    { id: 'upload-photo-menu', label: { en: 'Upload Photo', ka: 'ფოტოს ატვირთვა', ru: 'Загрузить фото' }, icon: 'Upload', action: 'upload-photo' },
    { id: 'upload-video-menu', label: { en: 'Upload Video', ka: 'ვიდეოს ატვირთვა', ru: 'Загрузить видео' }, icon: 'Video', action: 'upload-video' },
    { id: 'live-scan', label: { en: 'Live Scan', ka: 'პირდაპირი სკანირება', ru: 'Живое сканирование' }, icon: 'Camera', action: 'live-scan', divider: true },
    { id: 'style-presets-menu', label: { en: 'Style Presets', ka: 'სტილის პრესეტები', ru: 'Стиль-пресеты' }, icon: 'Palette', action: 'style-presets' },
    { id: 'room-type-menu', label: { en: 'Room Type', ka: 'ოთახის ტიპი', ru: 'Тип комнаты' }, icon: 'Home', action: 'room-type' },
    { id: 'saved-variations', label: { en: 'Saved Variations', ka: 'შენახული ვარიაციები', ru: 'Сохранённые вариации' }, icon: 'Bookmark', action: 'saved-variations', divider: true },
    { id: 'simulation-view', label: { en: 'Simulation View', ka: 'სიმულაციის ხედი', ru: 'Вид симуляции' }, icon: 'Maximize', action: 'simulation-view' },
    { id: 'export-menu', label: { en: 'Export', ka: 'ექსპორტი', ru: 'Экспорт' }, icon: 'Download', action: 'export' },
    { id: 'share-menu', label: { en: 'Share', ka: 'გაზიარება', ru: 'Поделиться' }, icon: 'Share2', action: 'share' },
    { id: 'continue-agentg', label: { en: 'Continue with Agent G', ka: 'გაგრძელება Agent G-ით', ru: 'Продолжить с Agent G' }, icon: 'Bot', action: 'transfer-agentg' },
  ],
  toolPanels: [
    {
      id: 'design-style', label: { en: 'Design Style', ka: 'დიზაინის სტილი', ru: 'Стиль дизайна' }, icon: 'Palette',
      options: [
        { id: 'style', label: { en: 'Style', ka: 'სტილი', ru: 'Стиль' }, type: 'chips', options: [
          { value: 'modern', label: { en: 'Modern', ka: 'თანამედროვე', ru: 'Современный' } },
          { value: 'minimalist', label: { en: 'Minimalist', ka: 'მინიმალისტური', ru: 'Минимализм' } },
          { value: 'luxury', label: { en: 'Luxury', ka: 'ლაქს', ru: 'Люкс' } },
          { value: 'scandinavian', label: { en: 'Scandinavian', ka: 'სკანდინავიური', ru: 'Скандинавский' } },
          { value: 'japandi', label: { en: 'Japandi', ka: 'ჯაპანდი', ru: 'Джапанди' } },
          { value: 'industrial', label: { en: 'Industrial', ka: 'ინდუსტრიული', ru: 'Индустриальный' } },
          { value: 'futuristic', label: { en: 'Futuristic', ka: 'ფუტურისტული', ru: 'Футуристичный' } },
          { value: 'classic', label: { en: 'Classic', ka: 'კლასიკური', ru: 'Классический' } },
          { value: 'cozy', label: { en: 'Cozy', ka: 'კოზი', ru: 'Уютный' } },
          { value: 'dark-elegant', label: { en: 'Dark Elegant', ka: 'მუქი ელეგანტური', ru: 'Тёмный элегантный' } },
          { value: 'family-warm', label: { en: 'Family Warm', ka: 'ოჯახური თბილი', ru: 'Семейный тёплый' } },
          { value: 'smart-home', label: { en: 'Smart Home', ka: 'სმარტ სახლი', ru: 'Умный дом' } },
          { value: 'office', label: { en: 'Office / Productivity', ka: 'ოფისი / პროდუქტიულობა', ru: 'Офис / Продуктивность' } },
        ], defaultValue: 'modern' },
        { id: 'intensity', label: { en: 'Redesign Intensity', ka: 'გადაპროექტების ინტენსივობა', ru: 'Интенсивность' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
      ],
    },
    {
      id: 'room-settings', label: { en: 'Room Settings', ka: 'ოთახის პარამეტრები', ru: 'Настройки комнаты' }, icon: 'Home',
      options: [
        { id: 'room-type', label: { en: 'Room Type', ka: 'ოთახის ტიპი', ru: 'Тип комнаты' }, type: 'chips', options: [
          { value: 'bedroom', label: { en: 'Bedroom', ka: 'საძინებელი', ru: 'Спальня' } },
          { value: 'living-room', label: { en: 'Living Room', ka: 'მისაღები', ru: 'Гостиная' } },
          { value: 'kitchen', label: { en: 'Kitchen', ka: 'სამზარეულო', ru: 'Кухня' } },
          { value: 'bathroom', label: { en: 'Bathroom', ka: 'აბაზანა', ru: 'Ванная' } },
          { value: 'dining', label: { en: 'Dining Area', ka: 'სასადილო', ru: 'Столовая' } },
          { value: 'office', label: { en: 'Office', ka: 'ოფისი', ru: 'Кабинет' } },
          { value: 'studio', label: { en: 'Studio Apartment', ka: 'სტუდიო-ბინა', ru: 'Студия' } },
          { value: 'hallway', label: { en: 'Hallway', ka: 'დერეფანი', ru: 'Прихожая' } },
          { value: 'balcony', label: { en: 'Balcony', ka: 'აივანი', ru: 'Балкон' } },
          { value: 'full-apartment', label: { en: 'Full Apartment', ka: 'სრული ბინა', ru: 'Вся квартира' } },
        ], defaultValue: 'living-room' },
        { id: 'lighting-mood', label: { en: 'Lighting Mood', ka: 'განათების განწყობა', ru: 'Настроение освещения' }, type: 'chips', options: [
          { value: 'bright', label: { en: 'Bright & Airy', ka: 'ნათელი', ru: 'Светлый' } },
          { value: 'warm', label: { en: 'Warm Ambient', ka: 'თბილი', ru: 'Тёплый' } },
          { value: 'dramatic', label: { en: 'Dramatic', ka: 'დრამატული', ru: 'Драматичный' } },
          { value: 'natural', label: { en: 'Natural Light', ka: 'ბუნებრივი', ru: 'Естественный' } },
        ], defaultValue: 'warm' },
      ],
    },
    {
      id: 'detail-controls', label: { en: 'Detail Controls', ka: 'დეტალების კონტროლი', ru: 'Управление деталями' }, icon: 'SlidersHorizontal',
      options: [
        { id: 'wall-treatment', label: { en: 'Wall Treatment', ka: 'კედლის მოპირკეთება', ru: 'Отделка стен' }, type: 'chips', options: [
          { value: 'paint', label: { en: 'Paint', ka: 'საღებავი', ru: 'Краска' } },
          { value: 'wallpaper', label: { en: 'Wallpaper', ka: 'შპალერი', ru: 'Обои' } },
          { value: 'wood-panel', label: { en: 'Wood Panel', ka: 'ხის პანელი', ru: 'Деревянные панели' } },
          { value: 'stone', label: { en: 'Stone / Brick', ka: 'ქვა / აგური', ru: 'Камень / Кирпич' } },
        ], defaultValue: 'paint' },
        { id: 'floor-type', label: { en: 'Floor Type', ka: 'იატაკის ტიპი', ru: 'Тип пола' }, type: 'chips', options: [
          { value: 'hardwood', label: { en: 'Hardwood', ka: 'ხის იატაკი', ru: 'Паркет' } },
          { value: 'tile', label: { en: 'Tile', ka: 'ფილა', ru: 'Плитка' } },
          { value: 'carpet', label: { en: 'Carpet', ka: 'ხალიჩა', ru: 'Ковёр' } },
          { value: 'concrete', label: { en: 'Polished Concrete', ka: 'ბეტონი', ru: 'Бетон' } },
        ], defaultValue: 'hardwood' },
        { id: 'decor-level', label: { en: 'Decor Intensity', ka: 'დეკორის ინტენსივობა', ru: 'Интенсивность декора' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
        { id: 'color-temp', label: { en: 'Color Temperature', ka: 'ფერის ტემპერატურა', ru: 'Цветовая температура' }, type: 'slider', min: 1, max: 5, step: 1, defaultValue: 3 },
      ],
    },
  ],
  transferActions: [
    { id: 'to-image', label: { en: 'Create Mood Board', ka: 'მუდ-ბორდის შექმნა', ru: 'Создать муд-борд' }, icon: 'ImagePlus', targetService: 'image', description: { en: 'Generate mood board visuals from your design', ka: 'ვიზუალური მუდ-ბორდის გენერაცია', ru: 'Создать визуалы муд-борда' } },
    { id: 'to-video', label: { en: 'Room Walkthrough', ka: 'ოთახის ტური', ru: 'Обзор комнаты' }, icon: 'Video', targetService: 'video', description: { en: 'Generate a walkthrough video of the redesigned space', ka: 'გადაპროექტებული სივრცის ვიდეო-ტურის გენერაცია', ru: 'Создать видео-обзор переоформленного пространства' } },
    { id: 'to-text', label: { en: 'Design Brief', ka: 'დიზაინის ბრიფი', ru: 'Дизайн-бриф' }, icon: 'FileText', targetService: 'text', description: { en: 'Generate a professional design brief document', ka: 'პროფესიონალური დიზაინ-ბრიფის გენერაცია', ru: 'Создать профессиональный дизайн-бриф' } },
    { id: 'to-shop', label: { en: 'Shop Furniture', ka: 'ავეჯის შეძენა', ru: 'Купить мебель' }, icon: 'ShoppingCart', targetService: 'shop', description: { en: 'Find and shop furniture matching your design', ka: 'მოძებნეთ და შეიძინეთ ავეჯი', ru: 'Найти и купить мебель по вашему дизайну' } },
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
  'agent-g': agentGConfig,
  photo: photoConfig,
  media: mediaConfig,
  prompt: promptConfig,
  'visual-intel': visualIntelConfig,
  software: softwareConfig,
  business: businessConfig,
  tourism: tourismConfig,
  game: gameConfig,
  interior: interiorConfig,
};

export function getServiceConfig(slug: string): ServiceChatConfig | undefined {
  return SERVICE_CONFIGS[slug];
}

export const ALL_SERVICE_SLUGS = Object.keys(SERVICE_CONFIGS);
