/**
 * lib/agents/pipelines.ts
 * =======================
 * Pre-built multi-agent pipeline definitions.
 *
 * These are the "playbooks" that Agent G can execute.
 * Each pipeline is a DAG of agent steps with dependencies.
 */

import type { AgentGBundle, BundleType } from '@/types/agents';

// ─── Extended Pipeline Types ─────────────────────────────────────────────────

export type ExtendedPipelineType =
  | BundleType
  | 'creator_starter'
  | 'store_launch'
  | 'startup_pack'
  | 'full_launch'
  | 'content_machine'
  | 'music_video_pack'
  | 'seo_blitz'
  | 'enterprise_audit';

export interface PipelineDefinition {
  type: ExtendedPipelineType;
  label: { en: string; ka: string; ru: string };
  description: { en: string; ka: string; ru: string };
  category: 'creator' | 'commerce' | 'business' | 'enterprise';
  estimatedMinutes: number;
  requiredPlan: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  steps: PipelineStep[];
}

export interface PipelineStep {
  agentId: string;
  label: { en: string; ka: string; ru: string };
  dependsOn: number[];
}

// ─── Pipeline Definitions ────────────────────────────────────────────────────

export const PIPELINE_DEFINITIONS: PipelineDefinition[] = [

  // ── Creator Pipelines ────────────────────────────────────────────

  {
    type: 'reels_pack_10',
    label: { en: 'Reels Pack 10', ka: 'რილს პაკი 10', ru: 'Пак рилсов 10' },
    description: {
      en: '10 short-form videos from one source asset',
      ka: '10 მოკლე ვიდეო ერთი ორიგინალიდან',
      ru: '10 коротких видео из одного исходника',
    },
    category: 'creator',
    estimatedMinutes: 15,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'avatar-agent', label: { en: 'Generate avatar/character', ka: 'ავატარის შექმნა', ru: 'Создание аватара' }, dependsOn: [] },
      { agentId: 'video-editor-agent', label: { en: 'Cut 10 clips from source', ka: '10 კლიპის ჭრა', ru: 'Нарезка 10 клипов' }, dependsOn: [0] },
      { agentId: 'music-agent', label: { en: 'Generate background tracks', ka: 'ბექგრაუნდ ტრეკები', ru: 'Фоновые треки' }, dependsOn: [0] },
      { agentId: 'video-editor-agent', label: { en: 'Add music + captions', ka: 'მუსიკა + სუბტიტრები', ru: 'Музыка + субтитры' }, dependsOn: [1, 2] },
      { agentId: 'thumbnail-agent', label: { en: 'Generate 10 thumbnails', ka: '10 მინიატურა', ru: '10 миниатюр' }, dependsOn: [1] },
      { agentId: 'content-agent', label: { en: 'Write captions + hooks', ka: 'კეპშენები + ჰუკები', ru: 'Подписи + хуки' }, dependsOn: [0] },
      { agentId: 'qa-agent', label: { en: 'QA score all outputs', ka: 'QA ქულები', ru: 'QA оценка' }, dependsOn: [3, 4, 5] },
    ],
  },

  {
    type: 'song_cover_clip',
    label: { en: 'Song + Cover + Clip', ka: 'სიმღერა + გარეკანი + კლიპი', ru: 'Песня + обложка + клип' },
    description: {
      en: 'Full single release pack',
      ka: 'სრული სინგლის პაკი',
      ru: 'Полный пакет релиза сингла',
    },
    category: 'creator',
    estimatedMinutes: 20,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'music-agent', label: { en: 'Produce track + stems', ka: 'ტრეკის პროდაქშენი', ru: 'Продакшн трека' }, dependsOn: [] },
      { agentId: 'image-agent', label: { en: 'Generate album cover art', ka: 'ალბომის გარეკანი', ru: 'Обложка альбома' }, dependsOn: [0] },
      { agentId: 'video-agent', label: { en: 'Generate lyric video', ka: 'ლირიკ ვიდეო', ru: 'Лирик-видео' }, dependsOn: [0, 1] },
      { agentId: 'video-editor-agent', label: { en: 'Final mix + export', ka: 'ფინალური მიქსი', ru: 'Финальный микс' }, dependsOn: [0, 2] },
      { agentId: 'content-agent', label: { en: 'Write press release', ka: 'პრესრელიზი', ru: 'Пресс-релиз' }, dependsOn: [0] },
      { agentId: 'qa-agent', label: { en: 'Final QA pass', ka: 'ფინალური QA', ru: 'Финальная QA' }, dependsOn: [3, 4] },
    ],
  },

  {
    type: 'music_video_pack',
    label: { en: 'Music Video Pack', ka: 'მუსიკალური ვიდეო პაკი', ru: 'Пак музыкальных видео' },
    description: {
      en: 'Full music video with avatar performer and visual effects',
      ka: 'სრული მუსიკალური ვიდეო ავატარით',
      ru: 'Полный музыкальный клип с аватаром',
    },
    category: 'creator',
    estimatedMinutes: 25,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'music-agent', label: { en: 'Produce track', ka: 'ტრეკის პროდაქშენი', ru: 'Продакшн трека' }, dependsOn: [] },
      { agentId: 'avatar-agent', label: { en: 'Create performer avatar', ka: 'პერფორმერის ავატარი', ru: 'Аватар исполнителя' }, dependsOn: [] },
      { agentId: 'video-agent', label: { en: 'Generate music video scenes', ka: 'მუზ. ვიდეო სცენები', ru: 'Сцены клипа' }, dependsOn: [0, 1] },
      { agentId: 'subtitle-agent', label: { en: 'Add lyrics overlay', ka: 'ლირიკების დამატება', ru: 'Добавить текст' }, dependsOn: [0, 2] },
      { agentId: 'video-editor-agent', label: { en: 'Final edit + color grade', ka: 'ფინალური ედიტი', ru: 'Финальный монтаж' }, dependsOn: [3] },
      { agentId: 'thumbnail-agent', label: { en: 'Video thumbnail', ka: 'ვიდეო მინიატურა', ru: 'Миниатюра' }, dependsOn: [2] },
      { agentId: 'qa-agent', label: { en: 'Quality check', ka: 'ხარისხის შემოწმება', ru: 'Проверка качества' }, dependsOn: [4, 5] },
    ],
  },

  {
    type: 'content_machine',
    label: { en: 'Content Machine', ka: 'კონტენტ მანქანა', ru: 'Контент-машина' },
    description: {
      en: '30-day content calendar with posts, reels, and stories',
      ka: '30-დღიანი კონტენტ კალენდარი',
      ru: '30-дневный контент-план',
    },
    category: 'creator',
    estimatedMinutes: 30,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'marketing-agent', label: { en: 'Build content strategy', ka: 'კონტენტ სტრატეგია', ru: 'Контент-стратегия' }, dependsOn: [] },
      { agentId: 'content-agent', label: { en: 'Write 30 captions', ka: '30 პოსტის ტექსტი', ru: '30 подписей' }, dependsOn: [0] },
      { agentId: 'image-agent', label: { en: 'Generate 30 post visuals', ka: '30 ვიზუალი', ru: '30 визуалов' }, dependsOn: [0] },
      { agentId: 'reels-agent', label: { en: 'Create 10 reels', ka: '10 რილსი', ru: '10 рилсов' }, dependsOn: [0, 1] },
      { agentId: 'seo-agent', label: { en: 'Optimize hashtags + SEO', ka: 'ჰეშთეგები + SEO', ru: 'Хештеги + SEO' }, dependsOn: [1] },
      { agentId: 'qa-agent', label: { en: 'Content quality audit', ka: 'კონტენტის აუდიტი', ru: 'Аудит контента' }, dependsOn: [2, 3, 4] },
    ],
  },

  // ── Commerce Pipelines ───────────────────────────────────────────

  {
    type: 'product_promo_kit',
    label: { en: 'Product Promo Kit', ka: 'პროდუქტის პრომო', ru: 'Промо-пакет продукта' },
    description: {
      en: 'Ad-ready product campaign pack',
      ka: 'სარეკლამო კამპანიის პაკი',
      ru: 'Рекламный пакет продукта',
    },
    category: 'commerce',
    estimatedMinutes: 15,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'thumbnail-agent', label: { en: 'Product photography set', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' }, dependsOn: [] },
      { agentId: 'image-agent', label: { en: 'Ad creatives (1:1, 9:16, 16:9)', ka: 'ბანერები', ru: 'Баннеры' }, dependsOn: [0] },
      { agentId: 'video-agent', label: { en: 'Product demo video', ka: 'დემო ვიდეო', ru: 'Демо-видео' }, dependsOn: [0] },
      { agentId: 'video-editor-agent', label: { en: 'Edit + captions + music', ka: 'ედიტი + მუსიკა', ru: 'Монтаж' }, dependsOn: [2] },
      { agentId: 'content-agent', label: { en: 'Write ad copy variants', ka: 'სარეკლამო ტექსტი', ru: 'Рекламный текст' }, dependsOn: [0] },
      { agentId: 'marketing-agent', label: { en: 'Compile campaign deliverables', ka: 'კამპანიის პაკეტი', ru: 'Пакет кампании' }, dependsOn: [1, 3, 4] },
      { agentId: 'qa-agent', label: { en: 'Creative scoring + QA', ka: 'QA ქულა', ru: 'QA оценка' }, dependsOn: [5] },
    ],
  },

  {
    type: 'store_launch',
    label: { en: 'Store Launch Pack', ka: 'მაღაზიის გახსნის პაკი', ru: 'Пакет запуска магазина' },
    description: {
      en: 'Product photos → Listings → Store SEO → Launch campaign',
      ka: 'ფოტო → განცხადებები → SEO → კამპანია',
      ru: 'Фото → Объявления → SEO → Кампания',
    },
    category: 'commerce',
    estimatedMinutes: 20,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'thumbnail-agent', label: { en: 'Product photography set', ka: 'პროდუქტის ფოტო', ru: 'Предметная съёмка' }, dependsOn: [] },
      { agentId: 'content-agent', label: { en: 'Write product descriptions', ka: 'აღწერები', ru: 'Описания товаров' }, dependsOn: [0] },
      { agentId: 'store-agent', label: { en: 'Create store listings', ka: 'განცხადებები', ru: 'Объявления' }, dependsOn: [0, 1] },
      { agentId: 'seo-agent', label: { en: 'SEO optimization', ka: 'SEO ოპტიმიზაცია', ru: 'SEO оптимизация' }, dependsOn: [2] },
      { agentId: 'marketing-agent', label: { en: 'Launch campaign plan', ka: 'ლონჩის კამპანია', ru: 'План запуска' }, dependsOn: [2, 3] },
      { agentId: 'image-agent', label: { en: 'Social media assets', ka: 'სოშალ ბანერები', ru: 'Соц. баннеры' }, dependsOn: [0] },
      { agentId: 'qa-agent', label: { en: 'Store audit', ka: 'მაღაზიის აუდიტი', ru: 'Аудит магазина' }, dependsOn: [3, 4, 5] },
    ],
  },

  // ── Business Pipelines ───────────────────────────────────────────

  {
    type: 'brand_launch_kit',
    label: { en: 'Brand Launch Kit', ka: 'ბრენდის ლონჩ ნაკრები', ru: 'Бренд-пакет' },
    description: {
      en: 'Full brand identity pack',
      ka: 'სრული ბრენდის იდენტობის პაკი',
      ru: 'Полный пакет бренда',
    },
    category: 'business',
    estimatedMinutes: 20,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'image-agent', label: { en: 'Generate logo variants', ka: 'ლოგოს ვარიანტები', ru: 'Варианты логотипа' }, dependsOn: [] },
      { agentId: 'thumbnail-agent', label: { en: 'Create brand photography set', ka: 'ბრენდის ფოტო', ru: 'Фото бренда' }, dependsOn: [0] },
      { agentId: 'content-agent', label: { en: 'Write brand voice guide', ka: 'ტონის გზამკვლევი', ru: 'Голос бренда' }, dependsOn: [0] },
      { agentId: 'marketing-agent', label: { en: 'Assemble brand kit', ka: 'ბრენდ ნაკრები', ru: 'Бренд-кит' }, dependsOn: [0, 1, 2] },
      { agentId: 'prompt-agent', label: { en: 'Generate reusable prompt cards', ka: 'პრომპტ ბარათები', ru: 'Промпт-карточки' }, dependsOn: [0, 2] },
      { agentId: 'risk-agent', label: { en: 'Brand consistency audit', ka: 'ბრენდის აუდიტი', ru: 'Аудит бренда' }, dependsOn: [3] },
    ],
  },

  {
    type: 'startup_pack',
    label: { en: 'Startup Pack', ka: 'სტარტაპ პაკი', ru: 'Стартап-пакет' },
    description: {
      en: 'Strategy → App Spec → Brand → Landing Page content',
      ka: 'სტრატეგია → სპეკი → ბრენდი → ლენდინგი',
      ru: 'Стратегия → Спец. → Бренд → Лендинг',
    },
    category: 'business',
    estimatedMinutes: 25,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'business-agent', label: { en: 'Market analysis + strategy', ka: 'ბაზრის ანალიზი', ru: 'Анализ рынка' }, dependsOn: [] },
      { agentId: 'dev-agent', label: { en: 'Application spec + architecture', ka: 'აპის სპეკი', ru: 'Спецификация' }, dependsOn: [0] },
      { agentId: 'image-agent', label: { en: 'Visual brand identity', ka: 'ვიზუალური ბრენდი', ru: 'Визуальный бренд' }, dependsOn: [0] },
      { agentId: 'content-agent', label: { en: 'Landing page copy', ka: 'ლენდინგის ტექსტი', ru: 'Текст лендинга' }, dependsOn: [0, 2] },
      { agentId: 'revenue-agent', label: { en: 'Revenue projections', ka: 'შემოსავლის პროგნოზი', ru: 'Прогноз доходов' }, dependsOn: [0] },
      { agentId: 'executive-agent', label: { en: 'Executive summary', ka: 'ექსიქ. შეჯამება', ru: 'Резюме' }, dependsOn: [0, 1, 4] },
    ],
  },

  {
    type: 'full_launch',
    label: { en: 'Full Launch Package', ka: 'სრული ლონჩ პაკეტი', ru: 'Полный пакет запуска' },
    description: {
      en: 'Complete go-to-market package: brand + content + store + ads',
      ka: 'სრული Go-To-Market: ბრენდი + კონტენტი + მაღაზია + რეკლამა',
      ru: 'Полный GTM: бренд + контент + магазин + реклама',
    },
    category: 'business',
    estimatedMinutes: 45,
    requiredPlan: 'PREMIUM',
    steps: [
      { agentId: 'business-agent', label: { en: 'Strategy brief', ka: 'სტრატეგია', ru: 'Стратегический бриф' }, dependsOn: [] },
      { agentId: 'image-agent', label: { en: 'Brand visual identity', ka: 'ბრენდის ვიზუალი', ru: 'Визуал бренда' }, dependsOn: [0] },
      { agentId: 'content-agent', label: { en: 'All copy + translations', ka: 'ტექსტი + თარგმანი', ru: 'Все тексты' }, dependsOn: [0, 1] },
      { agentId: 'thumbnail-agent', label: { en: 'Product photography', ka: 'პროდუქტის ფოტო', ru: 'Фото товара' }, dependsOn: [1] },
      { agentId: 'store-agent', label: { en: 'Store setup + listings', ka: 'მაღაზია', ru: 'Магазин' }, dependsOn: [2, 3] },
      { agentId: 'video-agent', label: { en: 'Promo video', ka: 'პრომო ვიდეო', ru: 'Промо-видео' }, dependsOn: [1, 2] },
      { agentId: 'reels-agent', label: { en: 'Social reel pack', ka: 'რილს პაკი', ru: 'Пак рилсов' }, dependsOn: [5] },
      { agentId: 'seo-agent', label: { en: 'Full SEO optimization', ka: 'SEO ოპტიმიზაცია', ru: 'SEO оптимизация' }, dependsOn: [2, 4] },
      { agentId: 'marketing-agent', label: { en: 'Launch campaign plan', ka: 'ლონჩის გეგმა', ru: 'План запуска' }, dependsOn: [4, 6, 7] },
      { agentId: 'qa-agent', label: { en: 'Full quality audit', ka: 'სრული აუდიტი', ru: 'Полный аудит' }, dependsOn: [8] },
    ],
  },

  // ── SEO Pipeline ─────────────────────────────────────────────────

  {
    type: 'seo_blitz',
    label: { en: 'SEO Blitz', ka: 'SEO ბლიცი', ru: 'SEO-блиц' },
    description: {
      en: 'Full SEO audit + optimized content + meta tags',
      ka: 'სრული SEO აუდიტი + ოპტიმიზებული კონტენტი',
      ru: 'Полный SEO-аудит + оптимизированный контент',
    },
    category: 'business',
    estimatedMinutes: 15,
    requiredPlan: 'PRO',
    steps: [
      { agentId: 'seo-agent', label: { en: 'Keyword research + audit', ka: 'კვლევა + აუდიტი', ru: 'Исследование + аудит' }, dependsOn: [] },
      { agentId: 'content-agent', label: { en: 'SEO-optimized content', ka: 'SEO კონტენტი', ru: 'SEO контент' }, dependsOn: [0] },
      { agentId: 'image-agent', label: { en: 'Optimized visual assets', ka: 'ოპტიმიზებული ვიზუალი', ru: 'Оптим. визуал' }, dependsOn: [0] },
      { agentId: 'qa-agent', label: { en: 'SEO score check', ka: 'SEO ქულის შემოწმება', ru: 'Проверка SEO' }, dependsOn: [1, 2] },
    ],
  },

  // ── Enterprise Pipelines ─────────────────────────────────────────

  {
    type: 'enterprise_audit',
    label: { en: 'Enterprise Audit', ka: 'ენტერპრაიზ აუდიტი', ru: 'Корпоративный аудит' },
    description: {
      en: 'Full platform audit: brand, content, risk, revenue',
      ka: 'სრული აუდიტი: ბრენდი, კონტენტი, რისკი, შემოსავალი',
      ru: 'Полный аудит: бренд, контент, риски, доход',
    },
    category: 'enterprise',
    estimatedMinutes: 30,
    requiredPlan: 'ENTERPRISE',
    steps: [
      { agentId: 'risk-agent', label: { en: 'Risk assessment', ka: 'რისკის შეფასება', ru: 'Оценка рисков' }, dependsOn: [] },
      { agentId: 'qa-agent', label: { en: 'Quality audit', ka: 'ხარისხის აუდიტი', ru: 'Аудит качества' }, dependsOn: [] },
      { agentId: 'seo-agent', label: { en: 'SEO audit', ka: 'SEO აუდიტი', ru: 'SEO аудит' }, dependsOn: [] },
      { agentId: 'revenue-agent', label: { en: 'Revenue analysis', ka: 'შემოსავლის ანალიზი', ru: 'Анализ доходов' }, dependsOn: [] },
      { agentId: 'business-agent', label: { en: 'Business review', ka: 'ბიზნეს მიმოხილვა', ru: 'Бизнес-обзор' }, dependsOn: [0, 1, 2, 3] },
      { agentId: 'executive-agent', label: { en: 'Executive summary report', ka: 'ექსიქ. ანგარიში', ru: 'Итоговый отчёт' }, dependsOn: [4] },
    ],
  },
];

// ─── Pipeline Helpers ────────────────────────────────────────────────────────

/** Get all pipeline definitions */
export function getAllPipelines(): PipelineDefinition[] {
  return PIPELINE_DEFINITIONS;
}

/** Get pipeline by type */
export function getPipeline(type: ExtendedPipelineType): PipelineDefinition | undefined {
  return PIPELINE_DEFINITIONS.find(p => p.type === type);
}

/** Get pipelines by category */
export function getPipelinesByCategory(category: PipelineDefinition['category']): PipelineDefinition[] {
  return PIPELINE_DEFINITIONS.filter(p => p.category === category);
}

/** Get pipelines available for a given plan tier */
export function getPipelinesForPlan(plan: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'): PipelineDefinition[] {
  const planRank: Record<string, number> = { FREE: 0, PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };
  const userRank = planRank[plan] ?? 0;
  return PIPELINE_DEFINITIONS.filter(p => (planRank[p.requiredPlan] ?? 0) <= userRank);
}

/** Get count of unique agents used across all pipelines */
export function getPipelineAgentCount(pipeline: PipelineDefinition): number {
  return new Set(pipeline.steps.map(s => s.agentId)).size;
}

/** Convert a PipelineDefinition to AgentGBundle format (backward compat) */
export function pipelineToBundle(pipeline: PipelineDefinition): AgentGBundle {
  return {
    type: pipeline.type as BundleType,
    label: pipeline.label.en,
    description: pipeline.description.en,
    steps: pipeline.steps.map(s => ({
      agentId: s.agentId,
      label: s.label.en,
      dependsOn: s.dependsOn.length > 0 ? s.dependsOn : undefined,
    })),
  };
}
