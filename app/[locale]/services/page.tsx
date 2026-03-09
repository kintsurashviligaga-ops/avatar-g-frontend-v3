import Link from 'next/link';
import type { ComponentType } from 'react';
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
      className={[
        'group relative overflow-hidden rounded-2xl border p-5 md:p-6 transition-all duration-300',
        'bg-[linear-gradient(150deg,rgba(9,18,38,0.88),rgba(5,10,24,0.72))] backdrop-blur-xl',
        'hover:-translate-y-1 hover:border-cyan-300/55 hover:shadow-[0_18px_56px_rgba(14,165,233,0.24)]',
        'ag-neon-contour',
        isCore
          ? 'min-h-[230px] border-cyan-300/60 shadow-[0_26px_80px_rgba(14,165,233,0.34)] ring-1 ring-cyan-300/35'
          : 'min-h-[185px] border-white/[0.14]',
      ].join(' ')}
    >
      <div className='pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.16),transparent_45%),radial-gradient(circle_at_85%_85%,rgba(124,92,252,0.14),transparent_50%)]' />
      <div className='relative z-10 flex h-full flex-col'>
        {isCore && (
          <span className='mb-3 inline-flex w-fit rounded-full border border-cyan-300/40 bg-cyan-300/12 px-3 py-1 text-[10px] font-semibold tracking-[0.16em] text-cyan-100'>
            CORE ORCHESTRATOR
          </span>
        )}
        <div className='mb-4 flex items-center justify-between gap-3'>
          <div className='inline-flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.24)]'>
            <Icon className='h-5 w-5' />
          </div>
          <span className='rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-white/75'>
            {service.tag}
          </span>
        </div>
        <h3 className='mb-2 text-lg font-semibold leading-tight text-white group-hover:text-cyan-100'>{service.title}</h3>
        <p className='text-sm leading-relaxed text-white/68'>{service.description}</p>
        <div className='mt-auto pt-5 text-xs font-medium text-cyan-200/90'>{openLabel}</div>
      </div>
    </Link>
  );
}

function EcosystemNode({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={[
        'rounded-2xl border border-white/14 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))]',
        'px-4 py-3 text-center text-sm font-medium text-white/84 backdrop-blur-md',
        className,
      ].join(' ')}
    >
      {label}
    </div>
  );
}

function AgentGCoreCard({ service, locale }: { service: ServiceItem; locale: string }) {
  const Icon = service.icon;
  const openLabel = locale === 'ka' ? 'მოდულის გახსნა' : locale === 'ru' ? 'Открыть модуль' : 'Open Module';
  return (
    <Link
      href={`/${locale}/services/${service.id}`}
      className='group relative block overflow-hidden rounded-2xl border border-cyan-300/56 bg-[linear-gradient(150deg,rgba(8,21,40,0.96),rgba(5,12,26,0.9))] p-6 shadow-[0_26px_90px_rgba(14,165,233,0.36)] ring-1 ring-cyan-300/36 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-200/75 hover:shadow-[0_30px_110px_rgba(14,165,233,0.44)]'
    >
      <div className='pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.24),transparent_52%)]' />
      <div className='relative z-10'>
        <span className='mb-3 inline-flex rounded-full border border-cyan-200/45 bg-cyan-300/14 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-cyan-100'>
          CORE ORCHESTRATOR
        </span>
        <div className='mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-300/45 bg-cyan-300/14 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.28)]'>
          <Icon className='h-5 w-5' />
        </div>
        <p className='mb-1 text-[11px] uppercase tracking-[0.12em] text-cyan-100/85'>Coordinate</p>
        <h3 className='text-xl font-semibold leading-tight text-white'>{service.title}</h3>
        <p className='mt-3 text-sm leading-relaxed text-white/76'>{service.description}</p>
        <div className='mt-5 inline-flex items-center rounded-lg border border-cyan-300/40 bg-cyan-300/12 px-3 py-1.5 text-xs font-semibold text-cyan-100'>
          {openLabel}
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
    <section className='relative overflow-hidden px-4 py-16 text-white sm:px-6 md:py-20 lg:px-10 lg:py-24'>
      <div className='pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_12%_14%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_84%_82%,rgba(124,92,252,0.16),transparent_34%)]' />
      <div className='pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:56px_56px]' />
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.6),rgba(2,6,23,0.2)_26%,rgba(2,6,23,0.68)_100%)]' />

      <div className='relative mx-auto flex w-full max-w-7xl flex-col gap-12 md:gap-16'>
        <header className='mx-auto max-w-4xl text-center'>
          <p className='mb-3 inline-flex rounded-full border border-cyan-300/35 bg-cyan-300/10 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-cyan-100'>
            {text.eyebrow}
          </p>
          <h1 className='text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl'>{text.title}</h1>
          <p className='mx-auto mt-4 max-w-3xl text-lg text-white/82 sm:text-xl'>{text.subtitle}</p>
          <p className='mx-auto mt-5 max-w-3xl text-sm leading-relaxed text-white/68 sm:text-base'>{text.description}</p>
        </header>

        <section className='relative overflow-hidden rounded-3xl border border-white/12 bg-[linear-gradient(165deg,rgba(7,14,30,0.92),rgba(5,10,24,0.84))] p-5 sm:p-6 lg:p-10 ag-neon-window'>
          <div className='pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.14),transparent_38%)]' />
          <div className='relative grid gap-4 md:grid-cols-3 md:grid-rows-5 md:gap-5'>
            <EcosystemNode label='Avatar & Creative Generation' className='md:col-start-2 md:row-start-1' />
            <EcosystemNode label='Creative Intelligence Layer' className='md:col-start-1 md:row-start-2' />
            <div className='order-first md:order-none md:col-start-2 md:row-start-2 md:row-span-2'>
              <AgentGCoreCard service={agentG} locale={locale} />
            </div>
            <EcosystemNode label='Automation & Orchestration' className='md:col-start-3 md:row-start-2' />
            <EcosystemNode label='Commerce, Business & Development' className='md:col-start-2 md:row-start-4' />
            <EcosystemNode label='Vertical & Future Modules' className='md:col-start-2 md:row-start-5' />

            <div className='pointer-events-none absolute left-1/2 top-[12%] hidden h-[76%] w-px -translate-x-1/2 bg-gradient-to-b from-cyan-300/0 via-cyan-300/34 to-cyan-300/0 md:block' />
            <div className='pointer-events-none absolute left-[16%] top-[34%] hidden h-px w-[68%] bg-gradient-to-r from-cyan-300/0 via-cyan-300/34 to-cyan-300/0 md:block' />
          </div>
        </section>

        <section className='space-y-8 md:space-y-10'>
          {CATEGORIES.map((category) => (
            <article key={category.id} className='rounded-3xl border border-white/12 bg-[linear-gradient(160deg,rgba(8,14,30,0.86),rgba(5,10,24,0.72))] p-5 sm:p-6 md:p-8'>
              <div className='mb-5 md:mb-6'>
                <h2 className='text-2xl font-semibold tracking-tight text-white md:text-3xl'>{category.title}</h2>
                <p className='mt-2 max-w-3xl text-sm leading-relaxed text-white/68 md:text-base'>{category.summary}</p>
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

        <section className='rounded-3xl border border-white/12 bg-[linear-gradient(160deg,rgba(7,13,29,0.86),rgba(5,9,22,0.72))] p-5 sm:p-6 md:p-8'>
          <p className='text-center text-base font-semibold tracking-[0.06em] text-cyan-100 md:text-lg'>{text.workflowLabel}</p>
          <p className='mx-auto mt-3 max-w-3xl text-center text-sm leading-relaxed text-white/70 md:text-base'>{text.workflowSub}</p>
          <div className='mt-6 grid grid-cols-1 gap-3 text-sm text-white/80 sm:grid-cols-2 lg:grid-cols-5'>
            {['Avatar / Media', 'Intelligence', 'Workflows', 'Business', 'Expansion'].map((step) => (
              <div key={step} className='rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-center'>
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className='rounded-3xl border border-cyan-300/26 bg-[linear-gradient(145deg,rgba(8,17,36,0.9),rgba(5,11,25,0.84))] p-6 sm:p-7 md:p-10 ag-neon-window'>
          <p className='mb-3 text-xs font-semibold tracking-[0.2em] text-cyan-100'>{text.ctaEyebrow}</p>
          <h2 className='max-w-3xl text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl'>{text.ctaTitle}</h2>
          <p className='mt-3 max-w-3xl text-sm leading-relaxed text-white/72 md:text-base'>{text.ctaDescription}</p>
          <div className='mt-6 flex flex-wrap items-center gap-3'>
            <Link
              href={`/${locale}/services`}
              className='inline-flex items-center gap-2 rounded-xl border border-cyan-300/45 bg-cyan-300/14 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-300/22'
            >
              {text.exploreCta}
              <ArrowRight className='h-4 w-4' />
            </Link>
            <Link
              href={`/${locale}/signup`}
              className='inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:text-cyan-100'
            >
              {text.startCta}
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
