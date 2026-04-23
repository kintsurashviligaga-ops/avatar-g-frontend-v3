'use client';

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Briefcase,
  Camera,
  ChevronRight,
  Code2,
  Eye,
  Film,
  Gamepad2,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  Mic2,
  Music2,
  Plane,
  Scissors,
  ShoppingCart,
  Sofa,
  Sparkles,
  UserCircle2,
  Video,
  Wand2,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarPanel } from '@/components/hub/panels/AvatarPanel';
import { CopyPanel } from '@/components/hub/panels/CopyPanel';
import { GenericPanel } from '@/components/hub/panels/GenericPanel';
import { ImagePanel } from '@/components/hub/panels/ImagePanel';
import { MusicPanel } from '@/components/hub/panels/MusicPanel';
import { VideoPanel } from '@/components/hub/panels/VideoPanel';
import { WorkflowPanel } from '@/components/hub/panels/WorkflowPanel';
import { BottomBar } from '@/components/dashboard/BottomBar';
import { FloatingActions } from '@/components/dashboard/FloatingActions';
import { LeftSidebar } from '@/components/dashboard/LeftSidebar';
import { RightPanel } from '@/components/dashboard/RightPanel';
import { TopNavbar } from '@/components/dashboard/TopNavbar';
import AgentGInterface from '@/components/services/AgentGInterface';
import ServiceWorkspaceView from '@/components/services/unified/ServiceWorkspaceView';
import { getLocalizedMeta } from '@/lib/services/metadata';
import { selectBalance, selectHistory, useAiPipelineStore } from '@/store/useAiPipelineStore';
import type {
  DashboardJob,
  DashboardPreview,
  DashboardRecentRun,
  DashboardServiceGroup,
  NativeWorkspaceServiceMode,
  PanelRunCallbacks,
  ServiceDefinition,
  ServiceGroup,
  ServiceMode,
  SessionItem,
  SupportedLocale,
  WorkspaceResult,
} from '@/types/dashboard';

type OrbitResult = {
  service?: string;
  title?: string;
  status?: string;
  output?: string;
  audioUrl?: string;
  taskId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

const ACTIVE_SERVICE_KEY = 'myavatar.one-window.active-service';
const SESSION_ITEMS_KEY = 'myavatar.one-window.session-items';
const JOB_REMOVE_DELAY_MS = 2200;

const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'ka', 'ru'];
const SERVICE_GROUP_ORDER: ServiceGroup[] = ['featured', 'create', 'intelligence', 'automation'];
const DASHBOARD_VISIBLE_SERVICES: ServiceMode[] = [
  'agent-g',
  'business',
  'avatar',
  'video',
  'music',
  'image',
  'photo',
  'game',
  'text',
  'code',
  'prompt',
  'workflow',
  'media',
];
const DASHBOARD_VISIBLE_SERVICE_SET = new Set<ServiceMode>(DASHBOARD_VISIBLE_SERVICES);
const QUICK_SERVICE_ORDER: ServiceMode[] = ['agent-g', 'avatar', 'video', 'music', 'image', 'workflow'];

const SERVICE_LIBRARY: ServiceDefinition[] = [
  {
    id: 'overview',
    icon: LayoutDashboard,
    accent: 'from-slate-500 to-cyan-600',
    group: 'featured',
    cost: 0,
    featured: true,
    label: { en: 'Overview', ka: 'მიმოხილვა', ru: 'Обзор' },
    description: {
      en: 'A connected control room for all workspace services.',
      ka: 'ერთიანი საკონტროლო სივრცე ყველა სერვისისთვის.',
      ru: 'Единое пространство управления всеми сервисами.',
    },
    related: ['agent-g', 'workflow', 'text'],
    searchTerms: ['overview', 'dashboard', 'home', 'workspace'],
  },
  {
    id: 'agent-g',
    icon: Bot,
    accent: 'from-cyan-500 to-indigo-600',
    group: 'automation',
    cost: 0,
    featured: true,
    label: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    description: {
      en: 'Main orchestration interface for queued, multi-step tasks.',
      ka: 'მთავარი საორკესტრაციო ინტერფეისი რიგში დაყენებული ამოცანებისთვის.',
      ru: 'Главный интерфейс оркестрации для многошаговых задач в очереди.',
    },
    related: ['workflow', 'text', 'video'],
    searchTerms: ['agent', 'orchestrator', 'automation', 'director'],
  },
  {
    id: 'voice',
    icon: Mic2,
    accent: 'from-amber-500 to-orange-600',
    group: 'create',
    cost: 6,
    featured: true,
    label: { en: 'Voice', ka: 'ხმა', ru: 'Голос' },
    description: {
      en: 'Generate direct speech output from text inside the workspace.',
      ka: 'ტექსტიდან ხმის გენერაცია პირდაპირ სამუშაო სივრცეში.',
      ru: 'Генерация речи из текста прямо внутри рабочего пространства.',
    },
    related: ['music', 'video', 'agent-g'],
    searchTerms: ['voice', 'tts', 'speech', 'audio'],
  },
  {
    id: 'avatar',
    icon: UserCircle2,
    accent: 'from-violet-500 to-indigo-600',
    group: 'create',
    cost: 10,
    featured: true,
    label: { en: 'Avatar', ka: 'ავატარი', ru: 'Аватар' },
    description: {
      en: 'Build avatars, portraits, and prompt-driven identity assets.',
      ka: 'შექმენი ავატარები, პორტრეტები და პერსონალური ვიზუალური აქტივები.',
      ru: 'Создавайте аватары, портреты и визуальные identity-активы.',
    },
    related: ['video', 'voice', 'image'],
    searchTerms: ['avatar', 'portrait', 'identity', 'character'],
  },
  {
    id: 'video',
    icon: Video,
    accent: 'from-sky-500 to-blue-600',
    group: 'create',
    cost: 15,
    featured: true,
    label: { en: 'Video', ka: 'ვიდეო', ru: 'Видео' },
    description: {
      en: 'Create cinematic video sequences and scene-based outputs.',
      ka: 'შექმენი კინემატოგრაფიული ვიდეო სცენებითა და კონსტრუქციით.',
      ru: 'Создавайте кинематографические видео и сценовые последовательности.',
    },
    related: ['editing', 'music', 'agent-g'],
    searchTerms: ['video', 'cinematic', 'scene', 'film'],
  },
  {
    id: 'image',
    icon: ImageIcon,
    accent: 'from-emerald-500 to-teal-600',
    group: 'create',
    cost: 5,
    featured: true,
    label: { en: 'Image', ka: 'სურათი', ru: 'Изображение' },
    description: {
      en: 'Generate still imagery with visual controls and prompt tuning.',
      ka: 'სურათების გენერაცია ვიზუალური კონტროლებითა და პრომპტის მორგებით.',
      ru: 'Генерация изображений с визуальными настройками и тонкой настройкой промпта.',
    },
    related: ['photo', 'text', 'visual-intel'],
    searchTerms: ['image', 'photo', 'visual', 'art'],
  },
  {
    id: 'music',
    icon: Music2,
    accent: 'from-pink-500 to-rose-600',
    group: 'create',
    cost: 8,
    featured: true,
    label: { en: 'Music', ka: 'მუსიკა', ru: 'Музыка' },
    description: {
      en: 'Compose tracks and audio ideas without leaving the workspace.',
      ka: 'შექმენი მუსიკა და აუდიო იდეები სამუშაო სივრციდან გასვლის გარეშე.',
      ru: 'Создавайте музыку и аудио-идеи, не покидая рабочее пространство.',
    },
    related: ['voice', 'video', 'media'],
    searchTerms: ['music', 'track', 'audio', 'composition'],
  },
  {
    id: 'text',
    icon: Code2,
    accent: 'from-lime-500 to-green-600',
    group: 'intelligence',
    cost: 3,
    featured: true,
    label: { en: 'Text', ka: 'ტექსტი', ru: 'Текст' },
    description: {
      en: 'Generate copy, scripts, prompts, and structured marketing text.',
      ka: 'ტექსტის, სცენარების, პრომპტებისა და მარკეტინგული ტექსტის გენერაცია.',
      ru: 'Генерация копирайта, сценариев, промптов и структурированного текста.',
    },
    related: ['prompt', 'agent-g', 'workflow'],
    searchTerms: ['text', 'copy', 'script', 'seo', 'prompt'],
  },
  {
    id: 'workflow',
    icon: Workflow,
    accent: 'from-orange-500 to-amber-600',
    group: 'automation',
    cost: 0,
    featured: true,
    label: { en: 'Workflow', ka: 'პროცესი', ru: 'Процесс' },
    description: {
      en: 'Chain services into multi-step production flows and reusable templates.',
      ka: 'დააკავშირე სერვისები მრავალსაფეხურიან პროცესებად და შაბლონებად.',
      ru: 'Соединяйте сервисы в многошаговые процессы и повторно используемые шаблоны.',
    },
    related: ['agent-g', 'video', 'text'],
    searchTerms: ['workflow', 'automation', 'pipeline', 'steps'],
  },
  {
    id: 'code',
    icon: Code2,
    accent: 'from-cyan-500 to-blue-600',
    group: 'intelligence',
    cost: 3,
    featured: true,
    label: { en: 'Code', ka: 'კოდი', ru: 'Код' },
    description: {
      en: 'Generate implementation drafts and technical scaffolding in place.',
      ka: 'კოდის ვერსიებისა და ტექნიკური საწყისი სტრუქტურის გენერაცია ადგილზე.',
      ru: 'Генерация черновиков реализации и технических заготовок прямо здесь.',
    },
    related: ['software', 'workflow', 'agent-g'],
    searchTerms: ['code', 'software', 'typescript', 'implementation'],
  },
  {
    id: 'photo',
    icon: Camera,
    accent: 'from-blue-500 to-indigo-600',
    group: 'create',
    cost: 4,
    label: { en: 'Photo', ka: 'ფოტო', ru: 'Фото' },
    description: {
      en: 'Refine studio-style photography and ready-made campaign visuals.',
      ka: 'დახვეწე სტუდიური ფოტოები და მზა კამპანიის ვიზუალები.',
      ru: 'Дорабатывайте студийные фотографии и готовые визуалы для кампаний.',
    },
    related: ['image', 'avatar', 'visual-intel'],
    searchTerms: ['photo', 'studio', 'retouch', 'portrait'],
  },
  {
    id: 'editing',
    icon: Scissors,
    accent: 'from-orange-500 to-amber-600',
    group: 'create',
    cost: 12,
    label: { en: 'Editing', ka: 'მონტაჟი', ru: 'Монтаж' },
    description: {
      en: 'Polish raw video into launch-ready edits with export controls.',
      ka: 'გადაამუშავე ნედლი ვიდეო გაშვებისთვის მზა მონტაჟად.',
      ru: 'Превращайте сырое видео в готовый к публикации монтаж.',
    },
    related: ['video', 'media', 'music'],
    searchTerms: ['editing', 'cut', 'subtitle', 'export'],
  },
  {
    id: 'prompt',
    icon: Wand2,
    accent: 'from-yellow-500 to-orange-600',
    group: 'intelligence',
    cost: 1,
    label: { en: 'Prompt', ka: 'პრომპტი', ru: 'Промпт' },
    description: {
      en: 'Standardize and improve prompts for every generation mode.',
      ka: 'გააერთიანე და გააუმჯობესე პრომპტები ყველა რეჟიმისთვის.',
      ru: 'Стандартизируйте и улучшайте промпты для всех режимов генерации.',
    },
    related: ['text', 'image', 'video'],
    searchTerms: ['prompt', 'optimize', 'template', 'builder'],
  },
  {
    id: 'media',
    icon: Film,
    accent: 'from-red-500 to-rose-600',
    group: 'automation',
    cost: 6,
    label: { en: 'Media Hub', ka: 'მედია ჰაბი', ru: 'Медиа-хаб' },
    description: {
      en: 'Coordinate multi-format production, delivery, and output packaging.',
      ka: 'დააკოორდინირე მრავალფორმატიანი მედია წარმოება და მიწოდება.',
      ru: 'Координируйте многоформатное производство, доставку и упаковку результата.',
    },
    related: ['video', 'editing', 'shop'],
    searchTerms: ['media', 'distribution', 'production', 'hub'],
  },
  {
    id: 'visual-intel',
    icon: Eye,
    accent: 'from-indigo-500 to-violet-600',
    group: 'intelligence',
    cost: 3,
    label: { en: 'Visual Intel', ka: 'ვიზუალური ანალიტიკა', ru: 'Визуальная аналитика' },
    description: {
      en: 'Score visuals, compare assets, and identify quality gaps.',
      ka: 'შეაფასე ვიზუალები, შეადარე აქტივები და იპოვე ხარისხის ხარვეზები.',
      ru: 'Оценивайте визуалы, сравнивайте активы и находите проблемы качества.',
    },
    related: ['image', 'photo', 'video'],
    searchTerms: ['visual', 'intel', 'quality', 'analysis'],
  },
  {
    id: 'business',
    icon: Briefcase,
    accent: 'from-amber-500 to-yellow-600',
    group: 'business',
    cost: 10,
    label: { en: 'Business', ka: 'ბიზნესი', ru: 'Бизнес' },
    description: {
      en: 'Drive commercial strategy, planning, and monetization tasks.',
      ka: 'მართე კომერციული სტრატეგია, დაგეგმვა და მონეტიზაციის ამოცანები.',
      ru: 'Управляйте коммерческой стратегией, планированием и задачами монетизации.',
    },
    related: ['shop', 'software', 'agent-g'],
    searchTerms: ['business', 'strategy', 'market', 'finance'],
  },
  {
    id: 'shop',
    icon: ShoppingCart,
    accent: 'from-rose-500 to-pink-600',
    group: 'business',
    cost: 0,
    label: { en: 'Shop', ka: 'მაღაზია', ru: 'Магазин' },
    description: {
      en: 'Publish products, digital goods, and commerce-ready media.',
      ka: 'გამოაქვეყნე პროდუქტები, ციფრული საქონელი და კომერციული მედია.',
      ru: 'Публикуйте продукты, цифровые товары и коммерчески готовый контент.',
    },
    related: ['business', 'media', 'software'],
    searchTerms: ['shop', 'commerce', 'store', 'products'],
  },
  {
    id: 'software',
    icon: Code2,
    accent: 'from-cyan-500 to-sky-600',
    group: 'business',
    cost: 15,
    label: { en: 'Software', ka: 'პროგრამული უზრუნველყოფა', ru: 'Софт' },
    description: {
      en: 'Build APIs, integrations, and delivery logic around generated outputs.',
      ka: 'ააგე API-ები, ინტეგრაციები და მიწოდების ლოგიკა გენერირებულ შედეგებზე.',
      ru: 'Создавайте API, интеграции и логику доставки вокруг результатов генерации.',
    },
    related: ['code', 'business', 'workflow'],
    searchTerms: ['software', 'api', 'integration', 'dev'],
  },
  {
    id: 'tourism',
    icon: Plane,
    accent: 'from-sky-500 to-blue-600',
    group: 'business',
    cost: 5,
    label: { en: 'Tourism', ka: 'ტურიზმი', ru: 'Туризм' },
    description: {
      en: 'Create travel-facing experiences, itineraries, and localized content.',
      ka: 'შექმენი ტურიზმზე მორგებული გამოცდილებები და ლოკალიზებული კონტენტი.',
      ru: 'Создавайте travel-ориентированные сценарии, маршруты и локализованный контент.',
    },
    related: ['business', 'text', 'agent-g'],
    searchTerms: ['tourism', 'travel', 'itinerary', 'localization'],
  },
  {
    id: 'game',
    icon: Gamepad2,
    accent: 'from-lime-500 to-green-600',
    group: 'create',
    cost: 20,
    label: { en: 'Game', ka: 'თამაში', ru: 'Игра' },
    description: {
      en: 'Prototype game assets, scenes, and interactive content pipelines.',
      ka: 'დააპროტოტიპე თამაშის აქტივები, სცენები და ინტერაქტიული კონტენტის პროცესები.',
      ru: 'Прототипируйте игровые активы, сцены и интерактивные конвейеры контента.',
    },
    related: ['image', 'workflow', 'software'],
    searchTerms: ['game', 'prototype', 'assets', 'interactive'],
  },
  {
    id: 'interior',
    icon: Sofa,
    accent: 'from-amber-500 to-yellow-600',
    group: 'create',
    cost: 8,
    label: { en: 'Interior', ka: 'ინტერიერი', ru: 'Интерьер' },
    description: {
      en: 'Design rooms, layouts, and visual concepts for interior spaces.',
      ka: 'შექმენი ოთახების, განლაგებისა და ინტერიერის ვიზუალური კონცეფციები.',
      ru: 'Создавайте комнаты, планировки и визуальные концепции интерьера.',
    },
    related: ['image', 'visual-intel', 'business'],
    searchTerms: ['interior', 'room', 'design', 'layout'],
  },
];

const DASHBOARD_SERVICE_OVERRIDES: Partial<Record<ServiceMode, Partial<ServiceDefinition>>> = {
  'agent-g': {
    group: 'featured',
    featured: true,
    cost: 1,
    label: { en: 'Agent G', ka: 'Agent G', ru: 'Agent G' },
    description: {
      en: 'Streaming control chat for planning, prompting, and service routing.',
      ka: 'სტრიმინგ ჩატი დაგეგმვისთვის, პრომპტინგისთვის და სერვისების სამართავად.',
      ru: 'Потоковый чат управления для планирования, промптов и маршрутизации сервисов.',
    },
    related: ['workflow', 'text', 'business'],
    searchTerms: ['agent g', 'chat', 'orchestrator', 'assistant'],
  },
  business: {
    group: 'featured',
    featured: false,
    label: { en: 'Business Agent', ka: 'Business Agent', ru: 'Business Agent' },
    description: {
      en: 'Business planning, strategy, research, and report generation in one panel.',
      ka: 'ბიზნეს დაგეგმვა, სტრატეგია, კვლევა და ანგარიშები ერთ პანელში.',
      ru: 'Бизнес-планирование, стратегия, исследования и отчеты в одной панели.',
    },
    related: ['agent-g', 'text', 'workflow'],
    searchTerms: ['business agent', 'strategy', 'analysis', 'market'],
  },
  avatar: {
    label: { en: 'Avatar Studio', ka: 'Avatar Studio', ru: 'Avatar Studio' },
    description: {
      en: 'Create identity assets, avatars, portraits, and character concepts.',
      ka: 'შექმენი ავატარები, პორტრეტები და პერსონაჟის ვიზუალური იდენტობა.',
      ru: 'Создавайте аватары, портреты и визуальную identity персонажей.',
    },
    related: ['video', 'image', 'photo'],
  },
  video: {
    label: { en: 'Video Studio', ka: 'Video Studio', ru: 'Video Studio' },
    description: {
      en: 'Generate scene-based videos, shorts, demos, and cinematic assets.',
      ka: 'შექმენი სცენებზე დაფუძნებული ვიდეოები, შორტები და კინემატიკური კონტენტი.',
      ru: 'Создавайте сценовые видео, шорты, демо и кинематографический контент.',
    },
    related: ['avatar', 'music', 'workflow'],
  },
  music: {
    label: { en: 'Music Composer', ka: 'Music Composer', ru: 'Music Composer' },
    description: {
      en: 'Compose AI tracks, moods, loops, and soundtrack ideas in place.',
      ka: 'შექმენი AI ტრეკები, განწყობები, ლუპები და საუნდტრეკის იდეები.',
      ru: 'Создавайте AI-треки, настроения, лупы и идеи саундтреков прямо здесь.',
    },
    related: ['video', 'media', 'agent-g'],
  },
  image: {
    label: { en: 'Image Creator', ka: 'Image Creator', ru: 'Image Creator' },
    description: {
      en: 'Generate campaign visuals, product images, illustrations, and key art.',
      ka: 'გენერაცია კამპანიის ვიზუალების, პროდუქტის სურათების და key art-ისთვის.',
      ru: 'Генерация визуалов кампаний, product images, иллюстраций и key art.',
    },
    related: ['photo', 'avatar', 'prompt'],
  },
  photo: {
    label: { en: 'Photo Studio', ka: 'Photo Studio', ru: 'Photo Studio' },
    description: {
      en: 'Enhance, retouch, and prepare production-ready photography assets.',
      ka: 'გააუმჯობესე, დაარეტუშე და მოამზადე პროდაქშენ-მზა ფოტო აქტივები.',
      ru: 'Улучшайте, ретушируйте и готовьте фотоактивы к продакшену.',
    },
    related: ['image', 'avatar', 'text'],
  },
  game: {
    label: { en: 'Game Creator', ka: 'Game Creator', ru: 'Game Creator' },
    description: {
      en: 'Prototype game concepts, assets, worlds, and interactive content flows.',
      ka: 'დააპროტოტიპე თამაშის იდეები, აქტივები და ინტერაქტიული კონტენტის პროცესები.',
      ru: 'Прототипируйте игровые идеи, активы, миры и интерактивные процессы.',
    },
    related: ['image', 'workflow', 'prompt'],
  },
  text: {
    label: { en: 'Text Generator', ka: 'Text Generator', ru: 'Text Generator' },
    description: {
      en: 'Generate copy, scripts, briefs, SEO text, and structured content.',
      ka: 'შექმენი ტექსტები, სცენარები, ბრიფები, SEO ტექსტი და სტრუქტურირებული კონტენტი.',
      ru: 'Генерируйте тексты, сценарии, брифы, SEO и структурированный контент.',
    },
    related: ['code', 'prompt', 'workflow'],
  },
  code: {
    group: 'intelligence',
    featured: false,
    cost: 2,
    label: { en: 'Text Intelligence', ka: 'Text Intelligence', ru: 'Text Intelligence' },
    description: {
      en: 'Analyze, summarize, extract, and restructure text for clearer decisions.',
      ka: 'გაანალიზე, შეაჯამე, ამოიღე მნიშვნელოვანი ნაწილები და გადააწყე ტექსტი.',
      ru: 'Анализируйте, суммируйте, извлекайте важное и перестраивайте текст.',
    },
    related: ['text', 'prompt', 'business'],
    searchTerms: ['text intelligence', 'summary', 'analysis', 'rewrite'],
  },
  prompt: {
    label: { en: 'Prompt Builder', ka: 'Prompt Builder', ru: 'Prompt Builder' },
    description: {
      en: 'Tune prompts, templates, and variables before generation runs.',
      ka: 'მოარგე პრომპტები, შაბლონები და ცვლადები გენერაციამდე.',
      ru: 'Настраивайте промпты, шаблоны и переменные перед генерацией.',
    },
    related: ['text', 'image', 'agent-g'],
  },
  workflow: {
    label: { en: 'Pipeline Builder', ka: 'Pipeline Builder', ru: 'Pipeline Builder' },
    description: {
      en: 'Connect services into one-click production pipelines inside the dashboard.',
      ka: 'დააკავშირე სერვისები ერთი დაჭერით გასაშვებ პაიპლაინებად.',
      ru: 'Соединяйте сервисы в production-пайплайны с запуском в один клик.',
    },
    related: ['agent-g', 'media', 'text'],
  },
  media: {
    group: 'automation',
    label: { en: 'Auto Workflows', ka: 'Auto Workflows', ru: 'Auto Workflows' },
    description: {
      en: 'Set recurring automation flows, batch runs, and connected media jobs.',
      ka: 'დააყენე განმეორებადი ავტომატიზაცია, batch გაშვებები და დაკავშირებული სამუშაოები.',
      ru: 'Настраивайте повторяющиеся автоматизации, batch-запуски и связанные задачи.',
    },
    related: ['workflow', 'agent-g', 'business'],
    searchTerms: ['auto workflows', 'automation', 'batch', 'recurring'],
  },
};

const DASHBOARD_SERVICES: ServiceDefinition[] = SERVICE_LIBRARY
  .filter((service) => DASHBOARD_VISIBLE_SERVICE_SET.has(service.id))
  .map((service) => {
    const override = DASHBOARD_SERVICE_OVERRIDES[service.id] ?? {};

    return {
      ...service,
      ...override,
      label: override.label ?? service.label,
      description: override.description ?? service.description,
      related: override.related ?? service.related,
      searchTerms: override.searchTerms ?? service.searchTerms,
    };
  });

const DEFAULT_SERVICE: ServiceDefinition = DASHBOARD_SERVICES.find((service) => service.id === 'agent-g') ?? DASHBOARD_SERVICES[0] ?? SERVICE_LIBRARY[0]!;

const COPY = {
  en: {
    eyebrow: 'One Window Dashboard',
    title: 'MyAvatar.ge One Window Dashboard',
    subtitle: 'Stay inside one dashboard session and switch services through state, not page navigation.',
    opening: 'Opening',
    tokenBalance: 'Token Balance',
    tokenHint: 'Synced from your local AI session state.',
    connectedTools: 'connected tools',
    language: 'Language',
    recentRuns: 'Recent Runs',
    noRuns: 'No runs yet. Your latest outputs will appear here.',
    noRelatedServices: 'No related services yet.',
    workspaceSettings: 'Workspace Settings',
    workspaceSettingsDetail: 'Account, billing, and profile settings.',
    previewTitle: 'Live Preview',
    previewEmpty: 'The latest image, video, audio, or text output appears here.',
    previewDownload: 'Download latest output',
    activeJobsTitle: 'Active Jobs',
    jobTotal: 'total',
    noActiveJobs: 'No active jobs right now.',
    globalStatusReady: 'Workspace ready',
    globalStatusRunning: 'jobs running',
    switching: 'Switching',
    processing: 'Processing...',
    voiceToggleOn: 'Voice mode on',
    voiceToggleOff: 'Voice mode off',
    emergencyStop: 'Emergency Stop',
    serviceBrowserToggleOpen: 'Open services',
    serviceBrowserToggleClose: 'Hide services',
    serviceBrowser: 'Service Browser',
    searchPlaceholder: 'Search services, tools, workflows...',
    quickModes: 'Quick Modes',
    overviewTitle: 'Connected Workspace',
    overviewSubtitle: 'Start from a service, then chain into workflows and orchestration without leaving this dashboard.',
    openService: 'Open Service',
    activeServiceTitle: 'Active Service',
    activeContext: 'Live Context',
    activeServiceHint: 'Connected tools stay one click away inside the same workspace.',
    relatedServices: 'Connected Services',
    estimatedCost: 'Est. Cost',
    included: 'Included',
    jobStatusLabels: {
      queued: 'Queued',
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
    },
    groupLabels: {
      featured: 'AI Agents',
      create: 'Create',
      intelligence: 'Text',
      automation: 'Workflow',
      business: 'Business',
    },
    emptySearch: 'No services match the current search.',
    orchestratorsTitle: 'Connected Control',
    orchestratorsHint: 'Use Agent G to route tasks and Workflow Builder to chain them together.',
    openAgent: 'Open Agent G',
    openWorkflow: 'Open Workflow',
    modeLabels: {
      voice: 'Voice',
      code: 'Text Intelligence',
      'agent-g': 'Agent G',
    },
    voiceTitle: 'Voice Studio',
    voiceSubtitle: 'Generate speech from text and preview it inline.',
    voiceTextLabel: 'Script',
    voiceTextPlaceholder: 'Write the message, ad copy, or script you want voiced.',
    voiceProfileLabel: 'Voice Profile',
    voiceProfilePlaceholder: 'Optional ElevenLabs voice id',
    voiceGenerate: 'Generate Voice',
    voiceReady: 'Voice output is ready',
    codeTitle: 'Text Intelligence',
    codeSubtitle: 'Analyze, summarize, and restructure text without leaving the dashboard.',
    codePromptLabel: 'Source Text',
    codePromptPlaceholder: 'Paste the text, transcript, brief, or notes you want analyzed.',
    codeLanguageLabel: 'Analysis Mode',
    codeFrameworkLabel: 'Focus',
    codeFrameworkPlaceholder: 'Optional focus: SEO, clarity, structure, sales, summary...',
    codeGenerate: 'Analyze Text',
    codeResult: 'Intelligence Output',
    agentTitle: 'Agent G Control',
    agentSubtitle: 'Queue orchestration tasks and keep the full task context here.',
    agentGoalLabel: 'Goal',
    agentGoalPlaceholder: 'Describe the task Agent G should plan and execute.',
    agentLaunch: 'Queue Agent G Task',
    agentResult: 'Execution Result',
    submitError: 'Request failed. Please try again.',
  },
  ka: {
    eyebrow: 'One Window Dashboard',
    title: 'MyAvatar.ge ერთი ფანჯრის დეშბორდი',
    subtitle: 'დარჩი ერთ დეშბორდში და გადაერთე სერვისებს შორის მხოლოდ state-ით, გვერდის შეცვლის გარეშე.',
    opening: 'იხსნება',
    tokenBalance: 'ტოკენების ბალანსი',
    tokenHint: 'სინქრონიზებულია ლოკალური AI სესიიდან.',
    connectedTools: 'დაკავშირებული ხელსაწყო',
    language: 'ენა',
    recentRuns: 'ბოლო გაშვებები',
    noRuns: 'ჯერ შედეგი არ არის. ბოლო შედეგები აქ გამოჩნდება.',
    noRelatedServices: 'დაკავშირებული სერვისი ჯერ არ არის.',
    workspaceSettings: 'სამუშაო პარამეტრები',
    workspaceSettingsDetail: 'ანგარიში, ბილინგი და პროფილის პარამეტრები.',
    previewTitle: 'ცოცხალი პრევიუ',
    previewEmpty: 'ბოლო სურათი, ვიდეო, აუდიო ან ტექსტური შედეგი აქ გამოჩნდება.',
    previewDownload: 'ბოლო შედეგის ჩამოტვირთვა',
    activeJobsTitle: 'აქტიური სამუშაოები',
    jobTotal: 'სულ',
    noActiveJobs: 'აქტიური სამუშაო ამჟამად არ არის.',
    globalStatusReady: 'სამუშაო სივრცე მზად არის',
    globalStatusRunning: 'დავალება მიმდინარეობს',
    switching: 'იტვირთება',
    processing: 'მუშავდება...',
    voiceToggleOn: 'ხმის რეჟიმი ჩართულია',
    voiceToggleOff: 'ხმის რეჟიმი გამორთულია',
    emergencyStop: 'სასწრაფო გაჩერება',
    serviceBrowserToggleOpen: 'სერვისების გახსნა',
    serviceBrowserToggleClose: 'სერვისების დამალვა',
    serviceBrowser: 'სერვისების ბრაუზერი',
    searchPlaceholder: 'მოძებნე სერვისი, ხელსაწყო ან პროცესი...',
    quickModes: 'სწრაფი რეჟიმები',
    overviewTitle: 'დაკავშირებული სამუშაო სივრცე',
    overviewSubtitle: 'აირჩიე სერვისი და შემდეგ გადადი პროცესებსა და ორკესტრაციაზე ფანჯრის დატოვების გარეშე.',
    openService: 'სერვისის გახსნა',
    activeServiceTitle: 'აქტიური სერვისი',
    activeContext: 'ცოცხალი კონტექსტი',
    activeServiceHint: 'დაკავშირებული ხელსაწყოები ერთივე სივრცეში ერთი დაჭერით ხელმისაწვდომია.',
    relatedServices: 'დაკავშირებული სერვისები',
    estimatedCost: 'სავარაუდო ღირებულება',
    included: 'ჩართულია',
    jobStatusLabels: {
      queued: 'რიგში',
      running: 'მიმდინარე',
      completed: 'დასრულებული',
      failed: 'შეცდომა',
    },
    groupLabels: {
      featured: 'AI აგენტები',
      create: 'შექმნა',
      intelligence: 'ტექსტი',
      automation: 'Workflow',
      business: 'ბიზნესი',
    },
    emptySearch: 'ძებნას შესაბამისი სერვისი არ მოიძებნა.',
    orchestratorsTitle: 'მართვის ცენტრი',
    orchestratorsHint: 'გამოიყენე Agent G დავალებების გასანაწილებლად და Workflow Builder სერვისების დასაკავშირებლად.',
    openAgent: 'Agent G გახსნა',
    openWorkflow: 'პროცესის გახსნა',
    modeLabels: {
      voice: 'ხმა',
      code: 'Text Intelligence',
      'agent-g': 'Agent G',
    },
    voiceTitle: 'ხმის სტუდია',
    voiceSubtitle: 'შექმენი ხმა ტექსტიდან და მოუსმინე პირდაპირ აქვე.',
    voiceTextLabel: 'სცენარი',
    voiceTextPlaceholder: 'ჩაწერე ტექსტი, რეკლამა ან სცენარი, რომელსაც ხმა უნდა დაედოს.',
    voiceProfileLabel: 'ხმის პროფილი',
    voiceProfilePlaceholder: 'არასავალდებულო ElevenLabs voice id',
    voiceGenerate: 'ხმის გენერაცია',
    voiceReady: 'ხმა მზად არის',
    codeTitle: 'Text Intelligence',
    codeSubtitle: 'გაანალიზე, შეაჯამე და გადააწყე ტექსტი დეშბორდიდან გასვლის გარეშე.',
    codePromptLabel: 'საწყისი ტექსტი',
    codePromptPlaceholder: 'ჩასვი ტექსტი, ტრანსკრიპტი, ბრიფი ან ჩანაწერები ანალიზისთვის.',
    codeLanguageLabel: 'ანალიზის რეჟიმი',
    codeFrameworkLabel: 'ფოკუსი',
    codeFrameworkPlaceholder: 'არასავალდებულო ფოკუსი: SEO, სიზუსტე, სტრუქტურა, გაყიდვები...',
    codeGenerate: 'ტექსტის ანალიზი',
    codeResult: 'ინტელექტუალური შედეგი',
    agentTitle: 'Agent G მართვა',
    agentSubtitle: 'დააყენე ორკესტრაციის ამოცანები რიგში და შეინარჩუნე სრული კონტექსტი აქვე.',
    agentGoalLabel: 'მიზანი',
    agentGoalPlaceholder: 'აღწერე ამოცანა, რომელიც Agent G-მ უნდა დაგეგმოს და შეასრულოს.',
    agentLaunch: 'Agent G ამოცანის დაყენება',
    agentResult: 'შედეგი',
    submitError: 'მოთხოვნა ვერ შესრულდა. სცადე თავიდან.',
  },
  ru: {
    eyebrow: 'One Window Dashboard',
    title: 'MyAvatar.ge One Window Dashboard',
    subtitle: 'Оставайтесь внутри одного дашборда и переключайте сервисы через state, без переходов по страницам.',
    opening: 'Открывается',
    tokenBalance: 'Баланс токенов',
    tokenHint: 'Синхронизируется из локального состояния AI-сессии.',
    connectedTools: 'подключенных инструментов',
    language: 'Язык',
    recentRuns: 'Последние запуски',
    noRuns: 'Запусков пока нет. Последние результаты появятся здесь.',
    noRelatedServices: 'Связанных сервисов пока нет.',
    workspaceSettings: 'Настройки пространства',
    workspaceSettingsDetail: 'Аккаунт, биллинг и настройки профиля.',
    previewTitle: 'Live Preview',
    previewEmpty: 'Последний image, video, audio или text результат появится здесь.',
    previewDownload: 'Скачать последний результат',
    activeJobsTitle: 'Активные задачи',
    jobTotal: 'всего',
    noActiveJobs: 'Сейчас нет активных задач.',
    globalStatusReady: 'Рабочее пространство готово',
    globalStatusRunning: 'задач выполняется',
    switching: 'Переключение',
    processing: 'Обработка...',
    voiceToggleOn: 'Голосовой режим включен',
    voiceToggleOff: 'Голосовой режим выключен',
    emergencyStop: 'Экстренная остановка',
    serviceBrowserToggleOpen: 'Открыть сервисы',
    serviceBrowserToggleClose: 'Скрыть сервисы',
    serviceBrowser: 'Навигатор сервисов',
    searchPlaceholder: 'Ищите сервис, инструмент или workflow...',
    quickModes: 'Быстрые режимы',
    overviewTitle: 'Связанное рабочее пространство',
    overviewSubtitle: 'Начните с сервиса, затем переходите к workflow и оркестрации, не покидая эту панель.',
    openService: 'Открыть сервис',
    activeServiceTitle: 'Активный сервис',
    activeContext: 'Живой контекст',
    activeServiceHint: 'Связанные инструменты доступны в том же пространстве одним нажатием.',
    relatedServices: 'Связанные сервисы',
    estimatedCost: 'Оценка стоимости',
    included: 'Включено',
    jobStatusLabels: {
      queued: 'В очереди',
      running: 'Выполняется',
      completed: 'Завершено',
      failed: 'Ошибка',
    },
    groupLabels: {
      featured: 'AI Агенты',
      create: 'Создание',
      intelligence: 'Текст',
      automation: 'Workflow',
      business: 'Бизнес',
    },
    emptySearch: 'По текущему запросу сервисы не найдены.',
    orchestratorsTitle: 'Центр управления',
    orchestratorsHint: 'Используйте Agent G для маршрутизации задач, а Workflow Builder для связывания сервисов.',
    openAgent: 'Открыть Agent G',
    openWorkflow: 'Открыть Workflow',
    modeLabels: {
      voice: 'Голос',
      code: 'Text Intelligence',
      'agent-g': 'Agent G',
    },
    voiceTitle: 'Voice Studio',
    voiceSubtitle: 'Создавайте голос из текста и прослушивайте его прямо здесь.',
    voiceTextLabel: 'Текст',
    voiceTextPlaceholder: 'Введите сообщение, рекламный текст или сценарий для озвучивания.',
    voiceProfileLabel: 'Профиль голоса',
    voiceProfilePlaceholder: 'Необязательный ElevenLabs voice id',
    voiceGenerate: 'Сгенерировать голос',
    voiceReady: 'Голос готов',
    codeTitle: 'Text Intelligence',
    codeSubtitle: 'Анализируйте, суммируйте и перестраивайте текст, не покидая дашборд.',
    codePromptLabel: 'Исходный текст',
    codePromptPlaceholder: 'Вставьте текст, транскрипт, бриф или заметки для анализа.',
    codeLanguageLabel: 'Режим анализа',
    codeFrameworkLabel: 'Фокус',
    codeFrameworkPlaceholder: 'Необязательный фокус: SEO, ясность, структура, продажи...',
    codeGenerate: 'Анализировать текст',
    codeResult: 'Результат анализа',
    agentTitle: 'Пульт Agent G',
    agentSubtitle: 'Ставьте задачи оркестрации в очередь и держите весь контекст здесь.',
    agentGoalLabel: 'Цель',
    agentGoalPlaceholder: 'Опишите задачу, которую Agent G должен спланировать и выполнить.',
    agentLaunch: 'Поставить задачу Agent G',
    agentResult: 'Результат выполнения',
    submitError: 'Запрос не выполнен. Повторите попытку.',
  },
} as const;

function getLocale(locale: string): SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale)
    ? (locale as SupportedLocale)
    : 'en';
}

function getServiceDefinition(service: ServiceMode): ServiceDefinition {
  return DASHBOARD_SERVICES.find((item) => item.id === service) ?? DEFAULT_SERVICE;
}

function isServiceMode(value: string): value is ServiceMode {
  return DASHBOARD_VISIBLE_SERVICE_SET.has(value as ServiceMode);
}

function readSessionItems(): SessionItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SESSION_ITEMS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SessionItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessionItems(items: SessionItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SESSION_ITEMS_KEY, JSON.stringify(items.slice(0, 8)));
}

function addSessionItem(
  service: ServiceMode,
  title: string,
  detail: string,
  setItems: React.Dispatch<React.SetStateAction<SessionItem[]>>
) {
  setItems((current) => {
    const next = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        service,
        title,
        detail,
        timestamp: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 8);

    writeSessionItems(next);
    return next;
  });
}

function normalizeOrbitResult(input: unknown): OrbitResult {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const record = input as Record<string, unknown>;
  const job = record.job as Record<string, unknown> | undefined;
  const results = record.results as Record<string, unknown> | undefined;

  return {
    service: typeof record.service === 'string' ? record.service : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    status: typeof record.status === 'string'
      ? record.status
      : typeof job?.status === 'string'
        ? String(job.status)
        : undefined,
    output: typeof record.output === 'string'
      ? record.output
      : typeof results?.summary === 'string'
        ? String(results.summary)
        : typeof record.result === 'string'
          ? record.result
          : undefined,
    audioUrl: typeof record.audioUrl === 'string'
      ? record.audioUrl
      : typeof job?.output === 'object' && typeof (job.output as Record<string, unknown>).audio_url === 'string'
        ? String((job.output as Record<string, unknown>).audio_url)
        : undefined,
    taskId: typeof record.taskId === 'string'
      ? record.taskId
      : typeof record.task_id === 'string'
        ? (record.task_id as string)
        : undefined,
    detail: typeof record.detail === 'string'
      ? record.detail
      : typeof record.message === 'string'
        ? (record.message as string)
        : undefined,
    metadata: record,
  };
}

function prettyDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatCost(copy: (typeof COPY)[SupportedLocale], cost: number) {
  return cost > 0 ? `${cost} cr` : copy.included;
}

function getPreviewDownloadName(preview: DashboardPreview) {
  const safeService = preview.serviceId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  if (preview.kind === 'image') return `${safeService}-preview.png`;
  if (preview.kind === 'video') return `${safeService}-preview.mp4`;
  if (preview.kind === 'audio') return `${safeService}-preview.mp3`;
  return `${safeService}-preview.txt`;
}

function PanelFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="max-w-3xl text-sm text-slate-300/70">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function WorkspaceInput({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/40 focus:bg-cyan-400/[0.05]"
      />
    </label>
  );
}

function ResultCard({
  title,
  loading,
  error,
  result,
  emptyLabel,
  loadingLabel,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  result: OrbitResult | null;
  emptyLabel: string;
  loadingLabel: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">{title}</h3>
        {result?.status && (
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            {result.status}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-cyan-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingLabel}</span>
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : result ? (
        <div className="space-y-4 text-sm text-slate-200/90">
          {result.title && <p className="text-base font-semibold text-white">{result.title}</p>}
          {result.output && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-3xl border border-white/8 bg-white/[0.04] p-4 text-sm text-slate-200">
              {result.output}
            </pre>
          )}
          {!result.output && result.metadata && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-3xl border border-white/8 bg-white/[0.04] p-4 text-sm text-slate-200">
              {JSON.stringify(result.metadata, null, 2)}
            </pre>
          )}
          {result.audioUrl && (
            <audio controls className="w-full">
              <source src={result.audioUrl} />
            </audio>
          )}
        </div>
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-white/10 text-sm text-slate-500">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function NativeServiceWorkspacePanel({
  serviceId,
  locale,
  callbacks,
}: {
  serviceId: NativeWorkspaceServiceMode;
  locale: SupportedLocale;
  callbacks: PanelRunCallbacks;
}) {
  const meta = getLocalizedMeta(serviceId, locale);
  const fallback = getServiceDefinition(serviceId);

  return (
    <ServiceWorkspaceView
      serviceId={serviceId}
      serviceName={meta?.headline ?? fallback.label[locale]}
      serviceIcon={meta?.icon ?? '◈'}
      locale={locale}
      description={meta?.description ?? fallback.description[locale]}
      onJobStart={(label) => callbacks.onJobStart(serviceId, label)}
      onJobProgress={callbacks.onJobProgress}
      onJobComplete={(jobId, result) => {
        callbacks.onJobComplete(
          jobId,
          serviceId,
          result.title || meta?.headline || fallback.label[locale],
          result.detail || result.text || meta?.description || fallback.description[locale],
          result,
        );
      }}
      onJobError={callbacks.onJobError}
    />
  );
}

function WorkspaceOverviewPanel({
  locale,
  copy,
  onSelectService,
}: {
  locale: SupportedLocale;
  copy: (typeof COPY)[SupportedLocale];
  onSelectService: (service: ServiceMode) => void;
}) {
  const featuredServices = SERVICE_LIBRARY.filter((service) => service.featured && service.id !== 'overview');
  const groupSummaries = SERVICE_GROUP_ORDER.filter((group) => group !== 'featured').map((group) => ({
    group,
    services: SERVICE_LIBRARY.filter((service) => service.group === group),
  }));

  return (
    <PanelFrame title={copy.overviewTitle} subtitle={copy.overviewSubtitle}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredServices.map((service) => {
              const Icon = service.icon;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => onSelectService(service.id)}
                  className="group rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', service.accent)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">
                      {formatCost(copy, service.cost)}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-base font-semibold text-white">{service.label[locale]}</p>
                    <p className="text-sm text-slate-300/70">{service.description[locale]}</p>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-200 transition-colors group-hover:text-cyan-100">
                    {copy.openService}
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groupSummaries.map(({ group, services }) => {
              const lead = services[0];
              if (!lead) {
                return null;
              }

              const LeadIcon = lead.icon;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => onSelectService(lead.id)}
                  className="rounded-[28px] border border-white/10 bg-black/20 p-5 text-left transition-all hover:border-white/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white', lead.accent)}>
                        <LeadIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{copy.groupLabels[group]}</p>
                        <p className="mt-1 text-lg font-semibold text-white">{services.length} tools</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {services.slice(0, 4).map((service) => (
                      <span key={service.id} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                        {service.label[locale]}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg">
            <Bot className="h-5 w-5" />
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{copy.orchestratorsTitle}</p>
            <p className="text-base font-semibold text-white">Keep services connected</p>
            <p className="text-sm text-slate-300/70">{copy.orchestratorsHint}</p>
          </div>
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => onSelectService('agent-g')}
              className="inline-flex w-full items-center justify-between rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15"
            >
              <span>{copy.openAgent}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectService('workflow')}
              className="inline-flex w-full items-center justify-between rounded-2xl border border-orange-400/20 bg-orange-400/10 px-4 py-3 text-sm font-semibold text-orange-100 transition-colors hover:bg-orange-400/15"
            >
              <span>{copy.openWorkflow}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </PanelFrame>
  );
}

function VoiceWorkspacePanel({
  locale,
  copy,
  onComplete,
  callbacks,
}: {
  locale: SupportedLocale;
  copy: (typeof COPY)[SupportedLocale];
  onComplete: (title: string, detail: string) => void;
  callbacks: PanelRunCallbacks;
}) {
  const [script, setScript] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrbitResult | null>(null);

  const handleSubmit = async () => {
    if (!script.trim()) {
      return;
    }

    const jobId = callbacks.onJobStart('voice', copy.modeLabels.voice);

    setLoading(true);
    setError(null);
    callbacks.onJobProgress(jobId, 18);

    try {
      const response = await fetch('/api/orbit/voice-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: script.trim(),
          provider_voice_id: voiceProfile.trim() || undefined,
          language: locale,
          title: copy.voiceTitle,
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as Record<string, unknown>).error)
          : copy.submitError;
        throw new Error(message);
      }

      const normalized = normalizeOrbitResult(payload);
      setResult(normalized);
      const preview: WorkspaceResult = normalized.audioUrl
        ? {
            kind: 'audio',
            title: copy.voiceReady,
            detail: normalized.detail || copy.voiceSubtitle,
            url: normalized.audioUrl,
          }
        : {
            kind: 'text',
            title: copy.voiceReady,
            detail: normalized.detail || copy.voiceSubtitle,
            text: normalized.output || normalized.detail || copy.voiceReady,
          };
      callbacks.onJobComplete(jobId, 'voice', copy.modeLabels.voice, normalized.detail || normalized.output || copy.voiceReady, preview);
      onComplete(copy.modeLabels.voice, normalized.detail || normalized.output || copy.voiceReady);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : copy.submitError;
      setError(message);
      callbacks.onJobError(jobId, message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelFrame title={copy.voiceTitle} subtitle={copy.voiceSubtitle}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
          <WorkspaceInput
            label={copy.voiceTextLabel}
            value={script}
            onChange={setScript}
            placeholder={copy.voiceTextPlaceholder}
            rows={8}
          />
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{copy.voiceProfileLabel}</span>
            <input
              value={voiceProfile}
              onChange={(event) => setVoiceProfile(event.target.value)}
              placeholder={copy.voiceProfilePlaceholder}
              className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/40 focus:bg-cyan-400/[0.05]"
            />
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !script.trim()}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-3xl px-5 py-3 text-sm font-semibold transition-all',
              loading || !script.trim()
                ? 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-[0_0_24px_rgba(251,146,60,0.35)] hover:scale-[1.01]'
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
            {copy.voiceGenerate}
          </button>
        </div>

        <ResultCard
          title={copy.voiceReady}
          loading={loading}
          error={error}
          result={result}
          emptyLabel={copy.voiceSubtitle}
          loadingLabel={copy.processing}
        />
      </div>
    </PanelFrame>
  );
}

function CodeWorkspacePanel({
  locale,
  copy,
  onComplete,
  callbacks,
}: {
  locale: SupportedLocale;
  copy: (typeof COPY)[SupportedLocale];
  onComplete: (title: string, detail: string) => void;
  callbacks: PanelRunCallbacks;
}) {
  const [prompt, setPrompt] = useState('');
  const [analysisMode, setAnalysisMode] = useState('summary');
  const [focus, setFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrbitResult | null>(null);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      return;
    }

    const jobId = callbacks.onJobStart('code', copy.modeLabels.code);

    setLoading(true);
    setError(null);
    callbacks.onJobProgress(jobId, 16);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'content-agent',
          context: 'global',
          serviceId: 'text-intelligence',
          locale,
          language: locale,
          message: [
            `Respond in ${locale === 'ka' ? 'Georgian' : locale === 'ru' ? 'Russian' : 'English'}.`,
            'Act as a text intelligence assistant inside the MyAvatar.ge dashboard.',
            `Mode: ${analysisMode}.`,
            focus.trim() ? `Focus: ${focus.trim()}.` : null,
            'Analyze the following text and return a concise, structured response that is immediately useful.',
            prompt.trim(),
          ].filter(Boolean).join('\n\n'),
        }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as Record<string, unknown>).error)
          : copy.submitError;
        throw new Error(message);
      }

      const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
      const data = payloadRecord?.data && typeof payloadRecord.data === 'object'
        ? payloadRecord.data as Record<string, unknown>
        : null;
      const output = typeof data?.response === 'string'
        ? data.response
        : typeof data?.result === 'string'
          ? data.result
          : null;

      if (!output) {
        throw new Error(copy.submitError);
      }

      const normalized: OrbitResult = {
        output,
        detail: focus.trim() ? `${analysisMode} • ${focus.trim()}` : analysisMode,
      };
      setResult(normalized);
      const preview: WorkspaceResult = {
        kind: 'text',
        title: copy.codeResult,
        detail: normalized.detail || copy.codeSubtitle,
        text: normalized.output || normalized.detail || copy.codeResult,
      };
      callbacks.onJobComplete(jobId, 'code', copy.modeLabels.code, normalized.output || normalized.detail || copy.codeResult, preview);
      onComplete(copy.modeLabels.code, normalized.output || normalized.detail || copy.codeResult);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : copy.submitError;
      setError(message);
      callbacks.onJobError(jobId, message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelFrame title={copy.codeTitle} subtitle={copy.codeSubtitle}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
          <WorkspaceInput
            label={copy.codePromptLabel}
            value={prompt}
            onChange={setPrompt}
            placeholder={copy.codePromptPlaceholder}
            rows={8}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{copy.codeLanguageLabel}</span>
              <select
                value={analysisMode}
                onChange={(event) => setAnalysisMode(event.target.value)}
                className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-400/40 focus:bg-cyan-400/[0.05]"
              >
                {[
                  ['summary', 'Summary'],
                  ['key-points', 'Key Points'],
                  ['rewrite', 'Rewrite'],
                  ['structured-notes', 'Structured Notes'],
                ].map(([value, label]) => (
                  <option key={value} value={value} className="bg-slate-950 text-white">
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{copy.codeFrameworkLabel}</span>
              <input
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                placeholder={copy.codeFrameworkPlaceholder}
                className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-400/40 focus:bg-cyan-400/[0.05]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !prompt.trim()}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-3xl px-5 py-3 text-sm font-semibold transition-all',
              loading || !prompt.trim()
                ? 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_24px_rgba(6,182,212,0.35)] hover:scale-[1.01]'
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
            {copy.codeGenerate}
          </button>
        </div>

        <ResultCard
          title={copy.codeResult}
          loading={loading}
          error={error}
          result={result}
          emptyLabel={copy.codeSubtitle}
          loadingLabel={copy.processing}
        />
      </div>
    </PanelFrame>
  );
}

function AgentGWorkspacePanel({
  copy,
  onComplete,
  callbacks,
}: {
  copy: (typeof COPY)[SupportedLocale];
  onComplete: (title: string, detail: string) => void;
  callbacks: PanelRunCallbacks;
}) {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrbitResult | null>(null);

  const handleSubmit = async () => {
    if (!goal.trim()) {
      return;
    }

    const jobId = callbacks.onJobStart('agent-g', copy.modeLabels['agent-g']);

    setLoading(true);
    setError(null);
    callbacks.onJobProgress(jobId, 12);

    try {
      const response = await fetch('/api/orbit/agent-orchestration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim() }),
      });

      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as Record<string, unknown>).error)
          : copy.submitError;
        throw new Error(message);
      }

      const normalized = normalizeOrbitResult(payload);
      setResult(normalized);
      const preview: WorkspaceResult = {
        kind: 'text',
        title: copy.agentResult,
        detail: normalized.status || normalized.detail || copy.agentSubtitle,
        text: normalized.output || normalized.detail || normalized.status || copy.agentResult,
      };
      callbacks.onJobComplete(jobId, 'agent-g', copy.modeLabels['agent-g'], normalized.status || normalized.detail || copy.agentResult, preview);
      onComplete(copy.modeLabels['agent-g'], normalized.status || normalized.detail || copy.agentResult);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : copy.submitError;
      setError(message);
      callbacks.onJobError(jobId, message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelFrame title={copy.agentTitle} subtitle={copy.agentSubtitle}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
          <WorkspaceInput
            label={copy.agentGoalLabel}
            value={goal}
            onChange={setGoal}
            placeholder={copy.agentGoalPlaceholder}
            rows={8}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !goal.trim()}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-3xl px-5 py-3 text-sm font-semibold transition-all',
              loading || !goal.trim()
                ? 'cursor-not-allowed border border-white/10 bg-white/5 text-slate-500'
                : 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:scale-[1.01]'
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {copy.agentLaunch}
          </button>
        </div>

        <ResultCard
          title={copy.agentResult}
          loading={loading}
          error={error}
          result={result}
          emptyLabel={copy.agentSubtitle}
          loadingLabel={copy.processing}
        />
      </div>
    </PanelFrame>
  );
}

function renderWorkspacePanel(
  activeService: ServiceMode,
  locale: SupportedLocale,
  copy: (typeof COPY)[SupportedLocale],
  onComplete: (title: string, detail: string) => void,
  onSelectService: (service: ServiceMode) => void,
  callbacks: PanelRunCallbacks,
) {
  switch (activeService) {
    case 'overview':
      return <WorkspaceOverviewPanel locale={locale} copy={copy} onSelectService={onSelectService} />;
    case 'voice':
      return <VoiceWorkspacePanel locale={locale} copy={copy} onComplete={onComplete} callbacks={callbacks} />;
    case 'avatar':
      return <AvatarPanel locale={locale} callbacks={callbacks} />;
    case 'video':
      return <VideoPanel locale={locale} callbacks={callbacks} />;
    case 'image':
      return <ImagePanel locale={locale} callbacks={callbacks} />;
    case 'photo':
      return <NativeServiceWorkspacePanel serviceId="photo" locale={locale} callbacks={callbacks} />;
    case 'music':
      return <MusicPanel locale={locale} callbacks={callbacks} />;
    case 'editing':
      return <NativeServiceWorkspacePanel serviceId="editing" locale={locale} callbacks={callbacks} />;
    case 'text':
      return <CopyPanel locale={locale} callbacks={callbacks} />;
    case 'workflow':
      return <WorkflowPanel locale={locale} callbacks={callbacks} />;
    case 'code':
      return <CodeWorkspacePanel locale={locale} copy={copy} onComplete={onComplete} callbacks={callbacks} />;
    case 'agent-g':
      return <AgentGInterface locale={locale} callbacks={callbacks} />;
    case 'software':
      return <NativeServiceWorkspacePanel serviceId="software" locale={locale} callbacks={callbacks} />;
    case 'business':
      return <NativeServiceWorkspacePanel serviceId="business" locale={locale} callbacks={callbacks} />;
    case 'media':
      return (
        <GenericPanel
          slug="auto-workflows"
          locale={locale}
          embedded
          onSelectService={(service) => {
            if (isServiceMode(service)) {
              onSelectService(service);
            }
          }}
        />
      );
    default:
      return (
        <GenericPanel
          slug={activeService}
          locale={locale}
          embedded
          onSelectService={(service: string) => {
            if (isServiceMode(service)) {
              onSelectService(service);
            }
          }}
        />
      );
  }
}

export function OneWindowWorkspace({ locale }: { locale: string }) {
  const safeLocale = getLocale(locale);
  const copy = COPY[safeLocale];
  const router = useRouter();
  const [activeService, setActiveService] = useState<ServiceMode>('agent-g');
  const [activeJobs, setActiveJobs] = useState<DashboardJob[]>([]);
  const [livePreview, setLivePreview] = useState<DashboardPreview | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionItems, setSessionItems] = useState<SessionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [isPending, startTransition] = useTransition();
  const balance = useAiPipelineStore(selectBalance);
  const history = useAiPipelineStore(selectHistory);
  const resetCredits = useAiPipelineStore((state) => state.resetCredits);
  const [tokenBalance, setTokenBalance] = useState(balance);

  useEffect(() => {
    setTokenBalance(balance);
  }, [balance]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem(ACTIVE_SERVICE_KEY);
    if (storedMode && isServiceMode(storedMode)) {
      setActiveService(storedMode);
    }
    setSessionItems(readSessionItems());
  }, []);

  const filteredGroups = useMemo<DashboardServiceGroup[]>(() => {
    const query = deferredSearchTerm.trim().toLowerCase();

    return SERVICE_GROUP_ORDER.map((group) => ({
      group,
      services: DASHBOARD_SERVICES.filter((service) => {
        if (service.group !== group) {
          return false;
        }

        if (!query) {
          return true;
        }

        const haystack = [
          service.label[safeLocale],
          service.description[safeLocale],
          ...service.searchTerms,
        ].join(' ').toLowerCase();

        return haystack.includes(query);
      }),
    })).filter((entry) => entry.services.length > 0);
  }, [deferredSearchTerm, safeLocale]);

  const quickModes = useMemo(
    () => QUICK_SERVICE_ORDER
      .map((serviceId) => getServiceDefinition(serviceId))
      .filter((service, index, collection) => collection.findIndex((item) => item.id === service.id) === index),
    []
  );

  const currentMeta = useMemo<ServiceDefinition>(
    () => getServiceDefinition(activeService),
    [activeService]
  );

  const currentHistory = history.slice(0, 4);
  const relatedServices = useMemo(
    () => currentMeta.related
      .map((service) => getServiceDefinition(service))
      .filter((service) => service.id !== currentMeta.id && DASHBOARD_VISIBLE_SERVICE_SET.has(service.id)),
    [currentMeta]
  );
  const groupLabels = copy.groupLabels as Record<ServiceGroup, string>;
  const recentRuns = useMemo<DashboardRecentRun[]>(() => [
    ...sessionItems.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      timestamp: prettyDate(item.timestamp),
    })),
    ...currentHistory.map((entry) => ({
      id: entry.id,
      title: entry.agent,
      detail: entry.prompt,
      timestamp: prettyDate(entry.createdAt),
      muted: true,
    })),
  ], [currentHistory, sessionItems]);
  const footerServices = useMemo(
    () => [
      livePreview ? getServiceDefinition(livePreview.serviceId) : null,
      ...sessionItems.slice(0, 2).map((item) => getServiceDefinition(item.service)),
    ].filter((service): service is ServiceDefinition => Boolean(service)),
    [livePreview, sessionItems]
  );

  const handleServiceChange = (service: ServiceMode) => {
    window.localStorage.setItem(ACTIVE_SERVICE_KEY, service);
    startTransition(() => setActiveService(service));
  };

  const handleLocaleChange = (nextLocale: SupportedLocale) => {
    document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.push(`/${nextLocale}/dashboard`);
    router.refresh();
  };

  const removeJobLater = (jobId: string) => {
    window.setTimeout(() => {
      setActiveJobs((current) => current.filter((job) => job.id !== jobId));
    }, JOB_REMOVE_DELAY_MS);
  };

  const panelCallbacks: PanelRunCallbacks = {
    onJobStart: (service, label) => {
      const jobId = `${service}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const nextJob: DashboardJob = {
        id: jobId,
        serviceId: service,
        label,
        progress: 6,
        status: 'queued',
      };
      setActiveJobs((current) => [
        nextJob,
        ...current,
      ].slice(0, 6));
      return jobId;
    },
    onJobProgress: (jobId, progress) => {
      setActiveJobs((current) => current.map((job) => job.id === jobId
        ? {
            ...job,
            progress: Math.max(job.progress, Math.min(99, Math.round(progress))),
            status: 'running',
          }
        : job));
    },
    onJobComplete: (jobId, service, title, detail, preview) => {
      setActiveJobs((current) => current.map((job) => job.id === jobId
        ? {
            ...job,
            progress: 100,
            status: 'completed',
            detail,
          }
        : job));
      addSessionItem(service, title, detail, setSessionItems);
      if (preview) {
        setLivePreview({
          ...preview,
          serviceId: service,
          updatedAt: new Date().toISOString(),
        });
      }

      const serviceMeta = getServiceDefinition(service);
      if (serviceMeta.cost > 0) {
        setTokenBalance((current) => {
          const next = Math.max(0, current - serviceMeta.cost);
          resetCredits(next);
          return next;
        });
      }

      removeJobLater(jobId);
    },
    onJobError: (jobId, message) => {
      setActiveJobs((current) => current.map((job) => job.id === jobId
        ? {
            ...job,
            status: 'failed',
            detail: message,
          }
        : job));
      removeJobLater(jobId);
    },
  };

  const activeJobCount = activeJobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const averageProgress = activeJobCount > 0
    ? activeJobs
        .filter((job) => job.status === 'queued' || job.status === 'running')
        .reduce((sum, job) => sum + job.progress, 0) / activeJobCount
    : 0;

  const handlePreviewDownload = () => {
    if (!livePreview) {
      return;
    }

    if (livePreview.url) {
      const link = document.createElement('a');
      link.href = livePreview.url;
      link.download = getPreviewDownloadName(livePreview);
      link.click();
      return;
    }

    if (livePreview.text) {
      const blob = new Blob([livePreview.text], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = getPreviewDownloadName(livePreview);
      link.click();
      URL.revokeObjectURL(href);
    }
  };

  const handleEmergencyStop = () => {
    setActiveJobs((current) => current.map((job) => (
      job.status === 'queued' || job.status === 'running'
        ? { ...job, status: 'failed', detail: 'Stopped from dashboard' }
        : job
    )));
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(6,182,212,0.18), transparent 26%), radial-gradient(circle at top right, rgba(59,130,246,0.16), transparent 28%), linear-gradient(180deg, #050816 0%, #04050d 100%)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <TopNavbar
          eyebrow={copy.eyebrow}
          title={copy.title}
          subtitle={copy.subtitle}
          openingLabel={copy.opening}
          currentMeta={currentMeta}
          locale={safeLocale}
          quickModes={quickModes}
          activeService={activeService}
          sidebarOpen={sidebarOpen}
          onServiceChange={handleServiceChange}
          onToggleSidebar={() => setSidebarOpen((current) => !current)}
          sidebarToggleOpenLabel={copy.serviceBrowserToggleOpen}
          sidebarToggleCloseLabel={copy.serviceBrowserToggleClose}
        />

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <LeftSidebar
            isOpen={sidebarOpen}
            locale={safeLocale}
            serviceCount={DASHBOARD_VISIBLE_SERVICES.length}
            serviceBrowserLabel={copy.serviceBrowser}
            serviceCountLabel={copy.connectedTools}
            searchPlaceholder={copy.searchPlaceholder}
            emptySearchLabel={copy.emptySearch}
            groupLabels={groupLabels}
            filteredGroups={filteredGroups}
            activeService={activeService}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onServiceChange={handleServiceChange}
            formatCost={(cost) => formatCost(copy, cost)}
          />

          <div className="min-w-0 rounded-[32px] border border-white/10 bg-black/25 backdrop-blur-xl">
            <div className="border-b border-white/10 px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{currentMeta.label[safeLocale]}</p>
                  <p className="mt-1 text-sm text-slate-300/70">{currentMeta.description[safeLocale]}</p>
                </div>
                {isPending && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {copy.switching}
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeService}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18 }}
                className="min-h-[760px]"
              >
                {renderWorkspacePanel(activeService, safeLocale, copy, (title, detail) => {
                  addSessionItem(activeService, title, detail, setSessionItems);
                }, handleServiceChange, panelCallbacks)}
              </motion.div>
            </AnimatePresence>
          </div>

          <RightPanel
            locale={safeLocale}
            currentMeta={currentMeta}
            livePreview={livePreview}
            activeJobs={activeJobs}
            activeJobCount={activeJobCount}
            tokenBalance={tokenBalance}
            relatedServices={relatedServices}
            recentRuns={recentRuns}
            supportedLocales={SUPPORTED_LOCALES}
            previewTitle={copy.previewTitle}
            previewEmpty={copy.previewEmpty}
            previewDownload={copy.previewDownload}
            activeJobsTitle={copy.activeJobsTitle}
            jobTotalLabel={copy.jobTotal}
            noActiveJobs={copy.noActiveJobs}
            activeServiceTitle={copy.activeServiceTitle}
            estimatedCostLabel={copy.estimatedCost}
            currentServiceCostLabel={formatCost(copy, currentMeta.cost)}
            activeServiceHint={copy.activeServiceHint}
            tokenBalanceTitle={copy.tokenBalance}
            tokenHint={copy.tokenHint}
            relatedServicesTitle={copy.relatedServices}
            noRelatedServicesLabel={copy.noRelatedServices}
            jobStatusLabels={copy.jobStatusLabels}
            languageTitle={copy.language}
            recentRunsTitle={copy.recentRuns}
            activeContextLabel={copy.activeContext}
            noRuns={copy.noRuns}
            workspaceSettingsTitle={copy.workspaceSettings}
            workspaceSettingsDetail={copy.workspaceSettingsDetail}
            settingsHref={`/${safeLocale}/settings`}
            onPreviewDownload={handlePreviewDownload}
            onServiceChange={handleServiceChange}
            onLocaleChange={handleLocaleChange}
          />
        </div>

        <BottomBar
          activeJobCount={activeJobCount}
          averageProgress={averageProgress}
          recentServices={footerServices}
          globalStatusRunning={copy.globalStatusRunning}
          globalStatusReady={copy.globalStatusReady}
        />
      </div>

      <FloatingActions
        showVoiceToggle={false}
        isVoiceActive={isVoiceActive}
        voiceToggleOnLabel={copy.voiceToggleOn}
        voiceToggleOffLabel={copy.voiceToggleOff}
        emergencyStopLabel={copy.emergencyStop}
        onToggleVoice={() => setIsVoiceActive((current) => !current)}
        onEmergencyStop={handleEmergencyStop}
      />
    </div>
  );
}