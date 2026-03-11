/**
 * Registry of services available as pipeline steps.
 *
 * Each entry defines what a service can receive as input,
 * what it produces as output, and which services it can
 * logically connect to — used by the pipeline builder UI.
 */

export interface PipelineServiceDef {
  id: string;
  name: Record<string, string>;
  shortName: string;
  description: Record<string, string>;
  icon: string;
  category: 'create' | 'edit' | 'analyze' | 'automate' | 'scale';
  /** CSS accent colour for the node */
  accent: string;
  /** What this service can accept */
  inputTypes: InputOutputType[];
  /** What this service produces */
  outputTypes: InputOutputType[];
  /** Default prompt template shown when step is added */
  defaultPrompt: string;
  /** Parameter presets shown in the step configurator */
  parameterPresets: ParameterPreset[];
}

export type InputOutputType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'avatar'
  | 'media-pack'
  | 'document'
  | 'analysis'
  | 'product'
  | 'any';

export interface ParameterPreset {
  key: string;
  label: string;
  values: string[];
  defaultValue: string;
}

export const PIPELINE_SERVICES: PipelineServiceDef[] = [
  {
    id: 'avatar',
    name: { en: 'AI Avatar', ka: 'AI ავატარი', ru: 'AI Аватар' },
    shortName: 'Avatar',
    description: { en: 'Generate identity-grade avatars', ka: 'ავატარების გენერაცია', ru: 'Генерация аватаров' },
    icon: '⬡',
    category: 'create',
    accent: '#a78bfa',
    inputTypes: ['text', 'image', 'any'],
    outputTypes: ['avatar', 'image'],
    defaultPrompt: 'Create a professional avatar based on the input',
    parameterPresets: [
      { key: 'style', label: 'Style', values: ['Realistic', 'Cinematic', 'Stylized'], defaultValue: 'Realistic' },
      { key: 'quality', label: 'Quality', values: ['Standard', 'High', 'Ultra'], defaultValue: 'High' },
      { key: 'pose', label: 'Pose', values: ['Portrait', 'Half Body', 'Full Body'], defaultValue: 'Portrait' },
    ],
  },
  {
    id: 'video',
    name: { en: 'Video Studio', ka: 'ვიდეო სტუდია', ru: 'Видео-студия' },
    shortName: 'Video',
    description: { en: 'Generate cinematic video sequences', ka: 'ვიდეო სეკვენციების გენერაცია', ru: 'Генерация видео' },
    icon: '▶',
    category: 'create',
    accent: '#60a5fa',
    inputTypes: ['text', 'image', 'avatar', 'any'],
    outputTypes: ['video'],
    defaultPrompt: 'Generate a cinematic video from the provided assets',
    parameterPresets: [
      { key: 'quality', label: 'Quality', values: ['HD', 'Full HD', '4K'], defaultValue: 'Full HD' },
      { key: 'ratio', label: 'Ratio', values: ['16:9', '9:16', '1:1'], defaultValue: '16:9' },
      { key: 'duration', label: 'Duration', values: ['5s', '10s', '15s', '30s'], defaultValue: '10s' },
    ],
  },
  {
    id: 'editing',
    name: { en: 'Video Editing', ka: 'ვიდეო რედაქტირება', ru: 'Видеомонтаж' },
    shortName: 'Edit',
    description: { en: 'Post-production editing pipeline', ka: 'პოსტ-პროდაქშენი', ru: 'Пост-продакшн' },
    icon: '✂',
    category: 'edit',
    accent: '#2dd4bf',
    inputTypes: ['video', 'audio', 'any'],
    outputTypes: ['video', 'media-pack'],
    defaultPrompt: 'Edit and polish the video with professional color grading',
    parameterPresets: [
      { key: 'style', label: 'Edit Style', values: ['Social Cut', 'Cinematic', 'Documentary'], defaultValue: 'Cinematic' },
      { key: 'captions', label: 'Captions', values: ['None', 'Auto', 'Styled'], defaultValue: 'Auto' },
    ],
  },
  {
    id: 'music',
    name: { en: 'Music Studio', ka: 'მუსიკის სტუდია', ru: 'Музыка' },
    shortName: 'Music',
    description: { en: 'Compose adaptive soundtracks', ka: 'საუნდტრეკების შექმნა', ru: 'Создание саундтреков' },
    icon: '♪',
    category: 'create',
    accent: '#c084fc',
    inputTypes: ['text', 'video', 'any'],
    outputTypes: ['audio'],
    defaultPrompt: 'Compose a soundtrack that matches the mood of the content',
    parameterPresets: [
      { key: 'genre', label: 'Genre', values: ['Ambient', 'Cinematic', 'Electronic', 'Orchestral'], defaultValue: 'Cinematic' },
      { key: 'mood', label: 'Mood', values: ['Calm', 'Epic', 'Energetic', 'Luxury'], defaultValue: 'Epic' },
      { key: 'length', label: 'Length', values: ['15s', '30s', '60s', '90s'], defaultValue: '30s' },
    ],
  },
  {
    id: 'photo',
    name: { en: 'Photo Studio', ka: 'ფოტო სტუდია', ru: 'Фото-студия' },
    shortName: 'Photo',
    description: { en: 'Enhance and produce studio photos', ka: 'სტუდიური ფოტოები', ru: 'Студийные фото' },
    icon: '◈',
    category: 'create',
    accent: '#94a3b8',
    inputTypes: ['image', 'avatar', 'any'],
    outputTypes: ['image'],
    defaultPrompt: 'Enhance photo quality with studio-grade processing',
    parameterPresets: [
      { key: 'mode', label: 'Mode', values: ['Enhance', 'Upscale', 'Remove BG'], defaultValue: 'Enhance' },
      { key: 'quality', label: 'Quality', values: ['Standard', 'High', 'Ultra'], defaultValue: 'High' },
    ],
  },
  {
    id: 'image',
    name: { en: 'Image Creator', ka: 'სურათის შემქმნელი', ru: 'Генерация изображений' },
    shortName: 'Image',
    description: { en: 'Generate campaign-quality visuals', ka: 'ვიზუალების გენერაცია', ru: 'Генерация визуалов' },
    icon: '◆',
    category: 'create',
    accent: '#f472b6',
    inputTypes: ['text', 'any'],
    outputTypes: ['image'],
    defaultPrompt: 'Generate a high-quality visual based on the prompt',
    parameterPresets: [
      { key: 'style', label: 'Style', values: ['Photoreal', '3D Render', 'Illustration', 'Brand Poster'], defaultValue: 'Photoreal' },
      { key: 'ratio', label: 'Ratio', values: ['1:1', '16:9', '9:16', '4:3'], defaultValue: '1:1' },
    ],
  },
  {
    id: 'media',
    name: { en: 'Media Production', ka: 'მედია პროდაქშენი', ru: 'Медиа-продакшн' },
    shortName: 'Media',
    description: { en: 'Multi-format production hub', ka: 'მრავალფორმატის ჰაბი', ru: 'Мультиформатный хаб' },
    icon: '⬡',
    category: 'edit',
    accent: '#818cf8',
    inputTypes: ['image', 'video', 'audio', 'text', 'avatar', 'any'],
    outputTypes: ['media-pack'],
    defaultPrompt: 'Package all assets into a coordinated media production kit',
    parameterPresets: [
      { key: 'package', label: 'Package', values: ['Social Kit', 'Launch Kit', 'Omni Campaign'], defaultValue: 'Social Kit' },
      { key: 'channels', label: 'Channels', values: ['Instagram', 'YouTube', 'Cross-platform'], defaultValue: 'Cross-platform' },
    ],
  },
  {
    id: 'text',
    name: { en: 'Text Intelligence', ka: 'ტექსტის ინტელექტი', ru: 'Текст AI' },
    shortName: 'Text',
    description: { en: 'AI-powered copywriting and content', ka: 'AI კოპირაიტინგი', ru: 'AI-копирайтинг' },
    icon: '¶',
    category: 'analyze',
    accent: '#4ade80',
    inputTypes: ['text', 'any'],
    outputTypes: ['text', 'document'],
    defaultPrompt: 'Generate optimized copy for the given context',
    parameterPresets: [
      { key: 'tone', label: 'Tone', values: ['Professional', 'Casual', 'Persuasive', 'Executive'], defaultValue: 'Professional' },
      { key: 'format', label: 'Format', values: ['Short Copy', 'Article', 'Script', 'Ad Copy'], defaultValue: 'Short Copy' },
    ],
  },
  {
    id: 'prompt',
    name: { en: 'Prompt Builder', ka: 'პრომფტ ბილდერი', ru: 'Промпт-билдер' },
    shortName: 'Prompt',
    description: { en: 'Optimize AI prompts at scale', ka: 'პრომფტების ოპტიმიზაცია', ru: 'Оптимизация промптов' },
    icon: '⚡',
    category: 'analyze',
    accent: '#fbbf24',
    inputTypes: ['text', 'any'],
    outputTypes: ['text'],
    defaultPrompt: 'Optimize and structure this prompt for best AI output quality',
    parameterPresets: [
      { key: 'target', label: 'Target Model', values: ['General', 'Image Gen', 'Video Gen', 'Audio Gen'], defaultValue: 'General' },
    ],
  },
  {
    id: 'visual-intel',
    name: { en: 'Visual Intelligence', ka: 'ვიზუალური ინტელექტი', ru: 'Визуальный AI' },
    shortName: 'V-Intel',
    description: { en: 'Evaluate and analyze visuals', ka: 'ვიზუალების ანალიზი', ru: 'Анализ визуалов' },
    icon: '◉',
    category: 'analyze',
    accent: '#22d3ee',
    inputTypes: ['image', 'video', 'avatar', 'any'],
    outputTypes: ['analysis', 'text'],
    defaultPrompt: 'Analyze the visual quality, composition, and brand alignment',
    parameterPresets: [
      { key: 'mode', label: 'Analysis', values: ['Quality Check', 'Brand Audit', 'Caption', 'Full Report'], defaultValue: 'Quality Check' },
    ],
  },
  {
    id: 'business',
    name: { en: 'Business Agent', ka: 'ბიზნეს აგენტი', ru: 'Бизнес-агент' },
    shortName: 'Business',
    description: { en: 'Strategy, marketing, and operations', ka: 'სტრატეგია და ოპერაციები', ru: 'Стратегия и операции' },
    icon: '◎',
    category: 'scale',
    accent: '#818cf8',
    inputTypes: ['text', 'analysis', 'document', 'any'],
    outputTypes: ['document', 'text'],
    defaultPrompt: 'Produce a strategic business analysis and action plan',
    parameterPresets: [
      { key: 'output', label: 'Output', values: ['Plan', 'Report', 'Deck Outline', 'Investor Memo'], defaultValue: 'Report' },
      { key: 'tone', label: 'Tone', values: ['Formal', 'Executive', 'Persuasive'], defaultValue: 'Executive' },
    ],
  },
  {
    id: 'shop',
    name: { en: 'Online Shop', ka: 'ონლაინ მაღაზია', ru: 'Онлайн-магазин' },
    shortName: 'Shop',
    description: { en: 'Publish products and commerce', ka: 'პროდუქციის გამოქვეყნება', ru: 'Товары и коммерция' },
    icon: '⊞',
    category: 'scale',
    accent: '#fb7185',
    inputTypes: ['image', 'text', 'media-pack', 'any'],
    outputTypes: ['product'],
    defaultPrompt: 'Create optimized product listings from the provided assets',
    parameterPresets: [
      { key: 'format', label: 'Listing Format', values: ['Standard', 'Premium', 'Campaign'], defaultValue: 'Standard' },
    ],
  },
];

export const PIPELINE_SERVICES_MAP = new Map(
  PIPELINE_SERVICES.map((s) => [s.id, s])
);

/** Predefined workflow templates users can start from */
export interface PipelineTemplate {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  steps: { serviceId: string; prompt: string }[];
  tags: string[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'avatar-to-video',
    name: { en: 'Avatar → Video Campaign', ka: 'ავატარი → ვიდეო კამპანია', ru: 'Аватар → Видео-кампания' },
    description: {
      en: 'Create an avatar, generate a video featuring it, add music, and package for distribution.',
      ka: 'შექმენი ავატარი, დააგენერირე ვიდეო, დაამატე მუსიკა და მოამზადე დისტრიბუციისთვის.',
      ru: 'Создайте аватар, сгенерируйте видео, добавьте музыку и подготовьте к дистрибуции.',
    },
    steps: [
      { serviceId: 'avatar', prompt: 'Create a professional brand avatar with cinematic quality' },
      { serviceId: 'video', prompt: 'Generate a 15-second promotional video featuring the avatar' },
      { serviceId: 'music', prompt: 'Compose an energetic soundtrack matching the video mood' },
      { serviceId: 'editing', prompt: 'Combine video and music, add captions and color grading' },
      { serviceId: 'media', prompt: 'Package final video for Instagram, YouTube, and TikTok' },
    ],
    tags: ['popular', 'video', 'avatar'],
  },
  {
    id: 'content-factory',
    name: { en: 'Content Factory', ka: 'კონტენტ ფაბრიკა', ru: 'Фабрика контента' },
    description: {
      en: 'Generate images, write copy, analyze quality, and create a full social media content pack.',
      ka: 'სურათების გენერაცია, კოპის წერა, ხარისხის ანალიზი და სოციალური მედიის პაკეტი.',
      ru: 'Генерация изображений, копирайтинг, анализ качества и создание SMM-пакета.',
    },
    steps: [
      { serviceId: 'image', prompt: 'Generate 4 campaign poster visuals with modern aesthetic' },
      { serviceId: 'text', prompt: 'Write compelling ad copy for each visual' },
      { serviceId: 'visual-intel', prompt: 'Audit visual quality and brand consistency' },
      { serviceId: 'media', prompt: 'Package everything as a social media launch kit' },
    ],
    tags: ['marketing', 'social'],
  },
  {
    id: 'photo-to-shop',
    name: { en: 'Photo → Product Listing', ka: 'ფოტო → პროდუქტი', ru: 'Фото → Товар' },
    description: {
      en: 'Enhance product photos, generate descriptions, and publish to your shop.',
      ka: 'გააუმჯობესე ფოტოები, დაწერე აღწერა და გამოაქვეყნე მაღაზიაში.',
      ru: 'Улучшение фото, генерация описаний и публикация в магазине.',
    },
    steps: [
      { serviceId: 'photo', prompt: 'Upscale and enhance product photos to studio quality' },
      { serviceId: 'text', prompt: 'Write SEO-optimized product descriptions' },
      { serviceId: 'shop', prompt: 'Create premium product listings with enhanced assets' },
    ],
    tags: ['commerce', 'shop'],
  },
  {
    id: 'brand-identity',
    name: { en: 'Brand Identity Pack', ka: 'ბრენდის იდენტობა', ru: 'Бренд-пакет' },
    description: {
      en: 'Build a complete brand identity: avatar, visuals, copy, and business plan.',
      ka: 'სრული ბრენდის იდენტობა: ავატარი, ვიზუალები, ტექსტი და ბიზნეს გეგმა.',
      ru: 'Полный бренд-пакет: аватар, визуалы, копирайтинг и бизнес-план.',
    },
    steps: [
      { serviceId: 'avatar', prompt: 'Create a distinctive brand mascot avatar' },
      { serviceId: 'image', prompt: 'Generate brand visuals: logo concepts, hero banners, social covers' },
      { serviceId: 'text', prompt: 'Write brand voice guidelines, taglines, and mission statement' },
      { serviceId: 'business', prompt: 'Compile a brand strategy deck with positioning and go-to-market plan' },
    ],
    tags: ['brand', 'strategy'],
  },
  {
    id: 'music-video',
    name: { en: 'AI Music Video', ka: 'AI მუსიკალური კლიპი', ru: 'AI Музыкальное видео' },
    description: {
      en: 'Compose original music, generate matching visuals, and produce a finished music video.',
      ka: 'ორიგინალი მუსიკის შექმნა, ვიზუალების გენერაცია და მზა მუზიკალური კლიპი.',
      ru: 'Сочинение музыки, генерация визуалов и готовое музыкальное видео.',
    },
    steps: [
      { serviceId: 'music', prompt: 'Compose an original 60-second cinematic track' },
      { serviceId: 'image', prompt: 'Generate visual scenes that match the music mood' },
      { serviceId: 'video', prompt: 'Create a music video from the visuals synchronized to the beat' },
      { serviceId: 'editing', prompt: 'Final polish: transitions, color grade, and effects' },
    ],
    tags: ['music', 'video', 'creative'],
  },
];
