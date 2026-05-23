import Link from 'next/link';
import Image from 'next/image';
import type { ComponentType } from 'react';
import { ServiceCardVisual } from '@/components/ui/ServiceCardVisual';
import {
  Briefcase,
  Calendar,
  Camera,
  Clapperboard,
  Code2,
  Cpu,
  VenetianMask,
  Eye,
  FileText,
  Film,
  Gamepad2,
  ImageIcon,
  Mic2,
  Music2,
  PenLine,
  Plane,
  Puzzle,
  Radio,
  Scissors,
  ShoppingCart,
  Sofa,
  UserCircle2,
  Wand2,
  Workflow,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  Zap,
} from 'lucide-react';

type ServicesPageProps = {
  params: Promise<{ locale: string }>;
};

type ServiceId =
  | 'avatar'
  | 'video'
  | 'editing'
  | 'music'
  | 'photo'
  | 'image'
  | 'media'
  | 'text'
  | 'prompt'
  | 'visual-intel'
  | 'workflow'
  | 'shop'
  | 'agent-g'
  | 'software'
  | 'business'
  | 'tourism'
  | 'game'
  | 'interior'
  | 'voice'
  | 'content-writer'
  | 'podcast'
  | 'character'
  | 'event'
  | 'prompt-builder'
  | 'terminal'
  | 'next';

type ServiceItem = {
  id: ServiceId;
  title: string;
  description: string;
  tag: string;
  icon: ComponentType<{ className?: string }>;
};

const SERVICE_ITEMS: ServiceItem[] = [
  {
    id: 'avatar',
    title: 'Build Your AI Avatar',
    description: 'Design identity-ready avatars for campaigns, channels, and branded experiences.',
    tag: 'Create',
    icon: UserCircle2,
  },
  {
    id: 'video',
    title: 'AI Video Studio',
    description: 'Generate cinematic AI video sequences with production-grade speed and control.',
    tag: 'Create',
    icon: Clapperboard,
  },
  {
    id: 'editing',
    title: 'Universal Video Editing',
    description: 'Polish raw outputs into launch-ready edits with fast, consistent pipelines.',
    tag: 'Edit',
    icon: Scissors,
  },
  {
    id: 'music',
    title: 'AI Music Studio',
    description: 'Compose adaptive soundtracks and brand-aligned audio for every format.',
    tag: 'Create',
    icon: Music2,
  },
  {
    id: 'photo',
    title: 'AI Photo Studio',
    description: 'Produce polished studio-quality photo assets from one unified workspace.',
    tag: 'Create',
    icon: Camera,
  },
  {
    id: 'image',
    title: 'AI Image Creator',
    description: 'Generate campaign visuals and creative concepts with precision and style.',
    tag: 'Create',
    icon: ImageIcon,
  },
  {
    id: 'media',
    title: 'Media Production Hub',
    description: 'Coordinate multi-format production and keep outputs consistent across channels.',
    tag: 'Optimize',
    icon: Film,
  },
  {
    id: 'text',
    title: 'Text Intelligence',
    description: 'Refine messaging, structure, and strategic copy with AI-assisted quality control.',
    tag: 'Analyze',
    icon: FileText,
  },
  {
    id: 'prompt',
    title: 'Prompt Builder',
    description: 'Standardize high-performance prompts to improve repeatability and output quality.',
    tag: 'Optimize',
    icon: Wand2,
  },
  {
    id: 'visual-intel',
    title: 'Visual Intelligence',
    description: 'Evaluate visuals, detect quality gaps, and guide smarter creative decisions.',
    tag: 'Analyze',
    icon: Eye,
  },
  {
    id: 'workflow',
    title: 'Build Automated Workflows',
    description: 'Connect modules into automated flows that reduce manual operations.',
    tag: 'Automate',
    icon: Workflow,
  },
  {
    id: 'shop',
    title: 'Online Shop',
    description: 'Publish products, assets, and offers through connected commerce operations.',
    tag: 'Sell',
    icon: ShoppingCart,
  },
  {
    id: 'agent-g',
    title: 'Agent G — Your AI Director',
    description: 'Coordinate modules, route tasks, and orchestrate your entire AI production system.',
    tag: 'Coordinate',
    icon: Cpu,
  },
  {
    id: 'software',
    title: 'Software Development',
    description: 'Build systems, product features, and integrations around your AI workflows.',
    tag: 'Build',
    icon: Code2,
  },
  {
    id: 'business',
    title: 'Business Agent',
    description: 'Drive operations, strategic execution, and day-to-day business automation.',
    tag: 'Scale',
    icon: Briefcase,
  },
  {
    id: 'tourism',
    title: 'Tourism AI',
    description: 'Deliver tourism-focused automation and localized intelligent guest experiences.',
    tag: 'Vertical',
    icon: Plane,
  },
  {
    id: 'game',
    title: 'AI Game Creator',
    description: 'Build interactive games, simulations, and playable experiences using AI.',
    tag: 'Create',
    icon: Gamepad2,
  },
  {
    id: 'interior',
    title: 'AI Interior Designer',
    description: 'Redesign rooms and spaces with professional AI-powered interior design tools.',
    tag: 'Design',
    icon: Sofa,
  },
  {
    id: 'voice',
    title: 'Voice Clone',
    description: 'Clone voices and generate professional-grade narration, dubbing, and audio content.',
    tag: 'Create',
    icon: Mic2,
  },
  {
    id: 'content-writer',
    title: 'Content Writer',
    description: 'Write SEO articles, social media copy, email campaigns, and marketing content with AI.',
    tag: 'Write',
    icon: PenLine,
  },
  {
    id: 'podcast',
    title: 'Podcast Studio',
    description: 'Generate full episode scripts with speaker cues, segments, and timestamps.',
    tag: 'Write',
    icon: Radio,
  },
  {
    id: 'character',
    title: 'Character AI',
    description: 'Design rich AI characters with backstories, personality profiles, and dialogue samples.',
    tag: 'Create',
    icon: VenetianMask,
  },
  {
    id: 'event',
    title: 'Event Studio',
    description: 'Generate AI event materials: programs, MC scripts, invitations, and promo packs.',
    tag: 'Create',
    icon: Calendar,
  },
  {
    id: 'prompt-builder',
    title: 'Prompt Builder',
    description: 'Build structured, optimized prompts for any AI model. Design, test, and export templates.',
    tag: 'Optimize',
    icon: Wand2,
  },
  {
    id: 'terminal',
    title: 'Terminal & Coding',
    description: 'AI-powered code generation, scripts, and CLI tools in any language.',
    tag: 'Build',
    icon: Code2,
  },
  {
    id: 'next',
    title: 'Expansion Slot',
    description: 'Reserve capacity for next-generation modules and enterprise extension layers.',
    tag: 'Expand',
    icon: Puzzle,
  },
];

const SERVICE_BY_ID = new Map<ServiceId, ServiceItem>(SERVICE_ITEMS.map((item) => [item.id, item]));

type Category = {
  id: string;
  title: string;
  summary: string;
  serviceIds: ServiceId[];
};

const CATEGORIES: Category[] = [
  {
    id: 'creative-generation',
    title: 'Avatar & Creative Generation',
    summary: 'Create, render, edit, and export visual, audio, and avatar-driven assets.',
    serviceIds: ['avatar', 'video', 'editing', 'music', 'photo', 'image', 'voice', 'game', 'interior'],
  },
  {
    id: 'creative-intelligence',
    title: 'Content & Writing',
    summary: 'Generate, evaluate, and standardize all written and scripted content.',
    serviceIds: ['content-writer', 'podcast', 'character', 'event', 'media', 'text', 'prompt-builder', 'visual-intel'],
  },
  {
    id: 'automation-orchestration',
    title: 'Automation & Orchestration',
    summary: 'Connect modules into workflows and let Agent G coordinate execution.',
    serviceIds: ['workflow', 'agent-g', 'terminal'],
  },
  {
    id: 'commerce-business-development',
    title: 'Commerce, Business & Development',
    summary: 'Turn AI output into stores, products, code, and business systems.',
    serviceIds: ['shop', 'software', 'business'],
  },
  {
    id: 'vertical-future',
    title: 'Vertical & Industry Modules',
    summary: 'Specialized AI for tourism, travel planning, and enterprise expansion.',
    serviceIds: ['tourism'],
  },
];

type PageText = {
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  workflowLabel: string;
  workflowSub: string;
  ctaEyebrow: string;
  ctaTitle: string;
  ctaDescription: string;
  exploreCta: string;
  startCta: string;
};

const PAGE_TEXT: Record<string, PageText> = {
  en: {
    eyebrow: 'AI ECOSYSTEM',
    title: 'Your AI Factory',
    subtitle: '24 connected AI-powered modules working together in one ecosystem.',
    description:
      'From avatar creation to content production, automation, software, commerce, and business execution — MyAvatar.ge connects every service into one intelligent workflow.',
    workflowLabel: 'Create → Optimize → Automate → Sell → Scale',
    workflowSub:
      'From avatar and media generation to orchestration, business operations, and vertical expansion.',
    ctaEyebrow: 'START YOUR WORKFLOW',
    ctaTitle: 'Build, automate, and scale with MyAvatar.ge',
    ctaDescription:
      'Choose one service or combine multiple modules into a full AI-powered production pipeline.',
    exploreCta: 'Explore Services',
    startCta: 'Get Started Free',
  },
  ka: {
    eyebrow: 'AI ეკოსისტემა',
    title: 'შენი AI ქარხანა',
    subtitle: '24 ურთიერთდაკავშირებული AI-ით მართული მოდული — ერთ ეკოსისტემაში.',
    description:
      'ავატარის შექმნიდან კონტენტ-წარმოებამდე, ავტომატიზაცია, პროგრამული უზრუნველყოფა, კომერცია და ბიზნეს-ოპერაციები — MyAvatar.ge-ი ყველა სერვისს ერთ ინტელექტუალურ workflow-ში აერთიანებს.',
    workflowLabel: 'შექმნა → ოპტიმიზაცია → ავტომატიზაცია → გაყიდვა → მასშტაბი',
    workflowSub:
      'ავატარისა და მედიის გენერაციიდან ორკესტრაციამდე, ბიზნეს-ოპერაციებამდე და ვერტიკალურ გაფართოებამდე.',
    ctaEyebrow: 'WORKFLOW-ის გაშვება',
    ctaTitle: 'შექმენი, ავტომატიზაციე და გახარე MyAvatar.ge-ით',
    ctaDescription:
      'აირჩიე ერთი სერვისი ან გააერთიანე მრავალი მოდული სრულ AI-ით მართულ პაიპლაინად.',
    exploreCta: 'სერვისების ნახვა',
    startCta: 'უფასოდ დაწყება',
  },
  ru: {
    eyebrow: 'AI ЭКОСИСТЕМА',
    title: 'Ваша AI Фабрика',
    subtitle: '24 взаимосвязанных AI-модулей, работающих вместе в единой экосистеме.',
    description:
      'От создания аватаров до производства контента, автоматизации, разработки ПО, коммерции и бизнес-операций — MyAvatar.ge объединяет все сервисы в один интеллектуальный workflow.',
    workflowLabel: 'Создать → Оптимизировать → Автоматизировать → Продать → Масштабировать',
    workflowSub:
      'От генерации аватаров и медиа до оркестрации, бизнес-операций и вертикального расширения.',
    ctaEyebrow: 'ЗАПУСТИТЬ WORKFLOW',
    ctaTitle: 'Создавайте, автоматизируйте и масштабируйте с MyAvatar.ge',
    ctaDescription:
      'Выберите один сервис или объедините несколько модулей в полноценный AI-пайплайн.',
    exploreCta: 'Все сервисы',
    startCta: 'Начать бесплатно',
  },
};

function ServiceCard({ service, locale, isCore = false }: { service: ServiceItem; locale: string; isCore?: boolean }) {
  const Icon = service.icon;
  const openLabel = locale === 'ka' ? 'გახსნა' : locale === 'ru' ? 'Открыть' : 'Open Module';
  return (
    <Link
      href={`/${locale}/services/${service.id}`}
      className='group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/5'
      style={{ backgroundColor: 'var(--card-bg)', border: isCore ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}
    >
      <ServiceCardVisual serviceId={service.id} variant="card" className="rounded-t-2xl" />
      <div className='relative z-10 flex flex-1 flex-col p-5 md:p-6'>
        {isCore && (
          <span className='mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.16em]' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
            CORE ORCHESTRATOR
          </span>
        )}
        <div className='mb-4 flex items-center justify-between gap-3'>
          <div className='inline-flex h-11 w-11 items-center justify-center rounded-xl transition-all group-hover:scale-110' style={{ background: isCore ? 'linear-gradient(135deg, var(--color-accent), rgba(34,211,238,0.8))' : 'var(--color-accent-soft)', color: isCore ? '#fff' : 'var(--color-accent)' }}>
            <Icon className='h-5 w-5' />
          </div>
          <span className='rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em]' style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            {service.tag}
          </span>
        </div>
        <h3 className='mb-2 text-lg font-semibold leading-tight' style={{ color: 'var(--color-text)' }}>{service.title}</h3>
        <p className='text-sm leading-relaxed' style={{ color: 'var(--color-text-secondary)' }}>{service.description}</p>
        <div className='mt-auto pt-5 flex items-center gap-1.5 text-xs font-medium transition-transform group-hover:translate-x-1' style={{ color: 'var(--color-accent)' }}>
          {openLabel}
          <ArrowRight className='h-3 w-3' />
        </div>
      </div>
    </Link>
  );
}

function AgentGFeaturedCard({ service, locale }: { service: ServiceItem; locale: string }) {
  const Icon = service.icon;
  const openLabel = locale === 'ka' ? 'მოდულის გახსნა' : locale === 'ru' ? 'Открыть модуль' : 'Open Module';
  return (
    <Link
      href={`/${locale}/services/${service.id}`}
      className='group relative block overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10'
      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-accent)' }}
    >
      <div className='grid grid-cols-1 md:grid-cols-[1fr_1.4fr]'>
        <ServiceCardVisual serviceId="agent-g" variant="banner" className="rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none min-h-[180px]" />
        <div className='relative z-10 flex flex-col justify-center p-6 md:p-8'>
          <span className='mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em]' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
            CORE ORCHESTRATOR
          </span>
          <div className='flex items-center gap-3 mb-2'>
            <div className='inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110' style={{ background: 'linear-gradient(135deg, var(--color-accent), rgba(34,211,238,0.8))', color: '#fff' }}>
              <Icon className='h-6 w-6' />
            </div>
            <h3 className='text-xl md:text-2xl font-semibold leading-tight' style={{ color: 'var(--color-text)' }}>{service.title}</h3>
          </div>
          <p className='mt-2 text-sm leading-relaxed max-w-lg' style={{ color: 'var(--color-text-secondary)' }}>{service.description}</p>
          <div className='mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold w-fit transition-all group-hover:translate-x-1 group-hover:shadow-lg group-hover:shadow-cyan-500/20' style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
            {openLabel}
            <ArrowRight className='h-3.5 w-3.5' />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const text: PageText = PAGE_TEXT[locale] ?? PAGE_TEXT.en!;
  const agentG = SERVICE_BY_ID.get('agent-g');

  if (!agentG) {
    return null;
  }

  const studioCta = locale === 'ka' ? 'AI სტუდიის გახსნა' : locale === 'ru' ? 'Открыть AI Студию' : 'Open AI Studio';
  const studioDesc = locale === 'ka'
    ? 'ყველა სერვისი ერთ სტუდიაში — დეშბორდი, პაიპლაინები, რეალტაიმ გენერაცია'
    : locale === 'ru'
      ? 'Все сервисы в одной студии — дашборд, пайплайны, генерация в реальном времени'
      : 'All services in one studio — dashboard, pipelines, real-time generation';
  const hubLabel = locale === 'ka' ? 'AI ᲡᲢᲣᲓᲘᲐ' : locale === 'ru' ? 'AI СТУДИЯ' : 'AI STUDIO';

  return (
    <section className='relative overflow-hidden px-4 py-16 sm:px-6 md:py-20 lg:px-10 lg:py-24 bg-transparent' style={{ color: 'var(--color-text)' }}>
      <div className='relative mx-auto flex w-full max-w-7xl flex-col gap-12 md:gap-16'>
        <header className='mx-auto max-w-4xl text-center'>
          <div className='mx-auto mb-5 relative w-[83px] h-[83px] sm:w-[104px] sm:h-[104px]'>
            <div className='absolute inset-[10%] rounded-full' style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)', filter: 'blur(8px)' }} />
            <Image
              src="/brand/gemini-rocket-clean.png"
              alt="MyAvatar.ge"
              fill
              sizes="104px"
              priority
              className='object-contain drop-shadow-[0_4px_16px_rgba(14,165,233,0.22)]'
            />
          </div>
          <p className='mb-3 inline-flex rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.2em]' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
            {text.eyebrow}
          </p>
          <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl' style={{ color: 'var(--color-text)' }}>{text.title}</h1>
          <p className='mx-auto mt-4 max-w-3xl text-lg sm:text-xl' style={{ color: 'var(--color-text-secondary)' }}>{text.subtitle}</p>
          <p className='mx-auto mt-5 max-w-3xl text-sm leading-relaxed sm:text-base' style={{ color: 'var(--color-text-tertiary)' }}>{text.description}</p>
        </header>

        {/* ═══ AI STUDIO CTA BANNER ═══ */}
        <Link
          href={`/${locale}/hub`}
          className='group relative block overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10'
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.06), rgba(14,165,233,0.06))',
            border: '1px solid rgba(34,211,238,0.2)',
          }}
        >
          <div className='absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity' style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 60%)' }} />
          <div className='relative flex items-center gap-4 px-6 py-5 sm:px-8 sm:py-6'>
            <div className='flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center' style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(14,165,233,0.15))', border: '1px solid rgba(34,211,238,0.2)' }}>
              <LayoutGrid className='w-6 h-6 sm:w-7 sm:h-7' style={{ color: '#22d3ee' }} />
            </div>
            <div className='flex-1 min-w-0'>
              <div className='flex items-center gap-2 mb-1'>
                <span className='text-[10px] font-bold tracking-[0.25em]' style={{ color: '#22d3ee' }}>{hubLabel}</span>
                <Sparkles className='w-3 h-3' style={{ color: '#22d3ee' }} />
              </div>
              <p className='text-sm sm:text-base font-medium' style={{ color: 'var(--color-text)' }}>{studioDesc}</p>
            </div>
            <div className='flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all group-hover:translate-x-1' style={{ background: 'linear-gradient(135deg, #22d3ee, #06b6d4)', color: '#fff' }}>
              {studioCta}
              <ArrowRight className='w-4 h-4' />
            </div>
          </div>
        </Link>

        {/* ═══ QUICK SERVICE ACCESS ROW ═══ */}
        <div className='flex flex-wrap items-center justify-center gap-2.5'>
          {SERVICE_ITEMS.slice(0, 10).map((service) => {
            const Icon = service.icon;
            return (
              <Link
                key={service.id}
                href={`/${locale}/services/${service.id}`}
                className='group flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all hover:-translate-y-0.5 hover:shadow-md'
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <Icon className='w-3.5 h-3.5 transition-colors group-hover:text-cyan-400' />
                <span className='truncate'>{service.title.replace(/^(AI |Build |Universal )/i, '')}</span>
              </Link>
            );
          })}
        </div>

        {/* Agent G — Featured orchestrator card */}
        <section>
          <AgentGFeaturedCard service={agentG} locale={locale} />
        </section>

        <section className='space-y-8 md:space-y-10'>
          {CATEGORIES.map((category) => {
            const count = category.serviceIds.length;
            return (
            <article key={category.id} className='rounded-3xl p-5 sm:p-6 md:p-8' style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className='mb-5 md:mb-6 flex items-start justify-between gap-4'>
                <div>
                  <h2 className='text-2xl font-semibold tracking-tight md:text-3xl' style={{ color: 'var(--color-text)' }}>{category.title}</h2>
                  <p className='mt-2 max-w-3xl text-sm leading-relaxed md:text-base' style={{ color: 'var(--color-text-secondary)' }}>{category.summary}</p>
                </div>
                <span className='flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold' style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
                  <Zap className='w-3 h-3' />
                  {count} {locale === 'ka' ? 'მოდული' : locale === 'ru' ? 'модулей' : 'modules'}
                </span>
              </div>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'>
                {category.serviceIds.map((serviceId) => {
                  const service = SERVICE_BY_ID.get(serviceId);
                  if (!service) return null;
                  const isCore = serviceId === 'agent-g';
                  return <ServiceCard key={serviceId} service={service} locale={locale} isCore={isCore} />;
                })}
              </div>
            </article>
            );
          })}
        </section>

        {/* ═══ CINEMATIC POSTER ═══ */}
        <section
          className='relative overflow-hidden rounded-3xl'
          style={{
            background: 'linear-gradient(170deg, #080e18 0%, #0a0f1a 30%, #06111d 60%, #030a14 100%)',
            border: '1px solid rgba(34,211,238,0.15)',
            boxShadow: '0 0 80px rgba(34,211,238,0.06), 0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Ambient glow layers */}
          <div className='absolute inset-0 pointer-events-none' aria-hidden='true'>
            <div className='absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px]' style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
            <div className='absolute bottom-0 right-0 w-[500px] h-[300px]' style={{ background: 'radial-gradient(ellipse at 80% 100%, rgba(14,165,233,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }} />
            <div className='absolute top-1/2 left-0 w-[400px] h-[400px] -translate-y-1/2' style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(14,165,233,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }} />
            {/* Grid overlay */}
            <div className='absolute inset-0 opacity-[0.03]' style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
            {/* Scan line */}
            <div className='absolute left-0 right-0 h-px opacity-20' style={{ top: '40%', background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)' }} />
          </div>

          <div className='relative z-10 flex flex-col items-center text-center px-6 sm:px-10 py-16 sm:py-20 lg:py-28'>
            {/* Brand mark */}
            <div className='relative w-[72px] h-[72px] sm:w-[96px] sm:h-[96px] mb-8'>
              <div className='absolute inset-[-20%] rounded-full' style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)', filter: 'blur(16px)' }} />
              <Image src="/brand/gemini-rocket-clean.png" alt="MyAvatar.ge" fill sizes="96px" className='object-contain drop-shadow-[0_4px_24px_rgba(34,211,238,0.3)]' />
            </div>

            {/* Eyebrow */}
            <p className='mb-4 text-[10px] sm:text-xs font-black tracking-[0.35em] uppercase' style={{ color: 'rgba(34,211,238,0.7)' }}>AI-POWERED CREATIVE ECOSYSTEM</p>

            {/* Headline */}
            <h2 className='max-w-3xl text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]'>
              <span style={{ color: '#fff' }}>The Future of </span>
              <span style={{ background: 'linear-gradient(135deg, #22d3ee, #38bdf8, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI Creation</span>
            </h2>

            {/* Sub */}
            <p className='mt-5 max-w-xl text-sm sm:text-base leading-relaxed' style={{ color: 'rgba(255,255,255,0.45)' }}>
              {text.ctaDescription}
            </p>

            {/* Service orbit — floating icons */}
            <div className='mt-10 flex flex-wrap items-center justify-center gap-3 max-w-lg'>
              {['🎭', '🎬', '🎵', '📸', '🖼️', '✍️', '🔍', '⚡', '🛒', '🤖', '💻', '💼', '✈️', '🎮', '🛋️'].map((emoji, i) => (
                <div
                  key={i}
                  className='flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl text-lg sm:text-xl transition-transform hover:scale-125'
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {emoji}
                </div>
              ))}
            </div>

            {/* CTA row */}
            <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
              <Link
                href={`/${locale}/signup`}
                className='inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-cyan-500/20'
                style={{ background: 'linear-gradient(135deg, #22d3ee, #06b6d4)', color: '#fff' }}
              >
                {text.startCta}
                <ArrowRight className='h-4 w-4' />
              </Link>
              <Link
                href={`/${locale}/services`}
                className='inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-semibold transition-all hover:-translate-y-0.5'
                style={{ background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {text.exploreCta}
              </Link>
            </div>

            {/* Bottom tagline */}
            <p className='mt-12 text-[11px] tracking-[0.15em] font-medium' style={{ color: 'rgba(255,255,255,0.2)' }}>
              {text.workflowLabel}
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
