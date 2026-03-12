import Link from 'next/link';
import Image from 'next/image';
import type { ComponentType } from 'react';
import { ServiceCardVisual } from '@/components/ui/ServiceCardVisual';
import {
  Briefcase,
  Camera,
  Clapperboard,
  Code2,
  Cpu,
  Eye,
  FileText,
  Film,
  ImageIcon,
  Music2,
  Plane,
  Puzzle,
  Scissors,
  ShoppingCart,
  UserCircle2,
  Wand2,
  Workflow,
  ArrowRight,
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
    serviceIds: ['avatar', 'video', 'editing', 'music', 'photo', 'image'],
  },
  {
    id: 'creative-intelligence',
    title: 'Creative Intelligence Layer',
    summary: 'Plan, evaluate, improve, and standardize all content outputs.',
    serviceIds: ['media', 'text', 'prompt', 'visual-intel'],
  },
  {
    id: 'automation-orchestration',
    title: 'Automation & Orchestration',
    summary: 'Connect modules into workflows and let Agent G coordinate execution.',
    serviceIds: ['workflow', 'agent-g'],
  },
  {
    id: 'commerce-business-development',
    title: 'Commerce, Business & Development',
    summary: 'Turn AI output into stores, products, code, and business systems.',
    serviceIds: ['shop', 'software', 'business'],
  },
  {
    id: 'vertical-future',
    title: 'Vertical & Future Modules',
    summary: 'Support tourism-focused services and future enterprise expansion.',
    serviceIds: ['tourism', 'next'],
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
    subtitle: '17 connected AI-powered modules working together in one ecosystem.',
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
    subtitle: '17 ურთიერთდაკავშირებული AI-ით მართული მოდული — ერთ ეკოსისტემაში.',
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
    subtitle: '17 взаимосвязанных AI-модулей, работающих вместе в единой экосистеме.',
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
      className='group relative flex flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5'
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
          <div className='inline-flex h-11 w-11 items-center justify-center rounded-xl' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            <Icon className='h-5 w-5' />
          </div>
          <span className='rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em]' style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
            {service.tag}
          </span>
        </div>
        <h3 className='mb-2 text-lg font-semibold leading-tight' style={{ color: 'var(--color-text)' }}>{service.title}</h3>
        <p className='text-sm leading-relaxed' style={{ color: 'var(--color-text-secondary)' }}>{service.description}</p>
        <div className='mt-auto pt-5 flex items-center gap-1.5 text-xs font-medium' style={{ color: 'var(--color-accent)' }}>
          {openLabel}
          <ArrowRight className='h-3 w-3 transition-transform group-hover:translate-x-0.5' />
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
      className='group relative block overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5'
      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-accent)' }}
    >
      <div className='grid grid-cols-1 md:grid-cols-[1fr_1.4fr]'>
        <ServiceCardVisual serviceId="agent-g" variant="banner" className="rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none min-h-[180px]" />
        <div className='relative z-10 flex flex-col justify-center p-6 md:p-8'>
          <span className='mb-3 inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em]' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
            CORE ORCHESTRATOR
          </span>
          <div className='flex items-center gap-3 mb-2'>
            <div className='inline-flex h-10 w-10 items-center justify-center rounded-xl' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
              <Icon className='h-5 w-5' />
            </div>
            <h3 className='text-xl md:text-2xl font-semibold leading-tight' style={{ color: 'var(--color-text)' }}>{service.title}</h3>
          </div>
          <p className='mt-2 text-sm leading-relaxed max-w-lg' style={{ color: 'var(--color-text-secondary)' }}>{service.description}</p>
          <div className='mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold w-fit transition-transform group-hover:translate-x-0.5' style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}>
            {openLabel}
            <ArrowRight className='h-3 w-3' />
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

  return (
    <section className='relative overflow-hidden px-4 py-16 sm:px-6 md:py-20 lg:px-10 lg:py-24' style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <div className='relative mx-auto flex w-full max-w-7xl flex-col gap-12 md:gap-16'>
        <header className='mx-auto max-w-4xl text-center'>
          <div className='mx-auto mb-5 relative w-16 h-16 sm:w-20 sm:h-20'>
            <div className='absolute inset-[10%] rounded-full' style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', filter: 'blur(8px)' }} />
            <Image
              src="/brand/rocket-3d-hq.svg"
              alt="MyAvatar.ge"
              fill
              sizes="80px"
              priority
              className='object-contain drop-shadow-[0_4px_16px_rgba(99,102,241,0.22)]'
            />
          </div>
          <p className='mb-3 inline-flex rounded-full px-4 py-1.5 text-xs font-semibold tracking-[0.2em]' style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>
            {text.eyebrow}
          </p>
          <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl' style={{ color: 'var(--color-text)' }}>{text.title}</h1>
          <p className='mx-auto mt-4 max-w-3xl text-lg sm:text-xl' style={{ color: 'var(--color-text-secondary)' }}>{text.subtitle}</p>
          <p className='mx-auto mt-5 max-w-3xl text-sm leading-relaxed sm:text-base' style={{ color: 'var(--color-text-tertiary)' }}>{text.description}</p>
        </header>

        {/* Agent G — Featured orchestrator card */}
        <section>
          <AgentGFeaturedCard service={agentG} locale={locale} />
        </section>

        <section className='space-y-8 md:space-y-10'>
          {CATEGORIES.map((category) => (
            <article key={category.id} className='rounded-3xl p-5 sm:p-6 md:p-8' style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className='mb-5 md:mb-6'>
                <h2 className='text-2xl font-semibold tracking-tight md:text-3xl' style={{ color: 'var(--color-text)' }}>{category.title}</h2>
                <p className='mt-2 max-w-3xl text-sm leading-relaxed md:text-base' style={{ color: 'var(--color-text-secondary)' }}>{category.summary}</p>
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
          ))}
        </section>

        <section className='rounded-3xl p-5 sm:p-6 md:p-8' style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className='text-center text-base font-semibold tracking-[0.06em] md:text-lg' style={{ color: 'var(--color-accent)' }}>{text.workflowLabel}</p>
          <p className='mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed md:text-base' style={{ color: 'var(--color-text-secondary)' }}>{text.workflowSub}</p>
          <div className='mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5' style={{ color: 'var(--color-text-secondary)' }}>
            {['Avatar / Media', 'Intelligence', 'Workflows', 'Business', 'Expansion'].map((step) => (
              <div key={step} className='rounded-xl px-4 py-3 text-center' style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className='rounded-3xl p-6 sm:p-7 md:p-10' style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-accent)' }}>
          <p className='mb-3 text-xs font-semibold tracking-[0.2em]' style={{ color: 'var(--color-accent)' }}>{text.ctaEyebrow}</p>
          <h2 className='max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl' style={{ color: 'var(--color-text)' }}>{text.ctaTitle}</h2>
          <p className='mt-3 max-w-3xl text-sm leading-relaxed md:text-base' style={{ color: 'var(--color-text-secondary)' }}>{text.ctaDescription}</p>
          <div className='mt-6 flex flex-wrap items-center gap-3'>
            <Link
              href={`/${locale}/services`}
              className='inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5'
              style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
              {text.exploreCta}
              <ArrowRight className='h-4 w-4' />
            </Link>
            <Link
              href={`/${locale}/signup`}
              className='inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5'
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              {text.startCta}
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
