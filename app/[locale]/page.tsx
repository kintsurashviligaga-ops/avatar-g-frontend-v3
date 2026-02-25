import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/landing/Hero';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { i18n } from '@/i18n.config';

type PageProps = {
  params: { locale: string };
};

type SupportedLocale = (typeof i18n.locales)[number];

const landingContent: Record<SupportedLocale, {
  section: {
    benefits: string;
    how: string;
    services: string;
    trust: string;
    pricing: string;
    faq: string;
  };
  benefits: Array<{ title: string; description: string }>;
  howItWorks: Array<{ title: string; description: string }>;
  pricing: Array<{ name: string; price: string; details: string }>;
  faqs: Array<{ question: string; answer: string }>;
  trust: Array<{ title: string; description: string }>;
  footer: {
    company: string;
    legal: string;
    contact: string;
    socials: string;
    privacy: string;
    terms: string;
    contactUs: string;
    product: string;
    services: string;
    pricing: string;
    security: string;
    faq: string;
  };
}> = {
  en: {
    section: {
      benefits: 'Key Benefits',
      how: 'How it works',
      services: 'Services',
      trust: 'Trust',
      pricing: 'Pricing',
      faq: 'FAQ',
    },
    benefits: [
      {
        title: 'Enterprise-grade reliability',
        description: 'Stable workflows and predictable output quality for teams and operations.',
      },
      {
        title: 'Clear governance',
        description: 'Defined access, transparent usage, and accountable content operations.',
      },
      {
        title: 'Fast time to value',
        description: 'Start with practical defaults and scale only when your workload grows.',
      },
    ],
    howItWorks: [
      {
        title: '1. Choose your service',
        description: 'Select the right workflow for avatar, media, commerce, or automation needs.',
      },
      {
        title: '2. Configure inputs',
        description: 'Provide prompts, references, and constraints with clear approval checkpoints.',
      },
      {
        title: '3. Review and publish',
        description: 'Validate quality, export outputs, and deliver to your channels with confidence.',
      },
    ],
    pricing: [
      { name: 'Free', price: '$0', details: 'For exploration and basic testing.' },
      { name: 'Pro', price: '$29/mo', details: 'For creators and growing teams with regular output.' },
      { name: 'Business', price: 'Custom', details: 'For organizations needing policy controls and support SLAs.' },
    ],
    faqs: [
      {
        question: 'Can we start without payment setup?',
        answer: 'Yes. You can begin with Free and enable paid billing when you are ready.',
      },
      {
        question: 'Do you support multi-language teams?',
        answer: 'Yes. The platform supports English, Georgian, and Russian locales.',
      },
      {
        question: 'How are security and privacy handled?',
        answer: 'We provide access boundaries, secure payment processing, and transparent operations.',
      },
      {
        question: 'Is onboarding available for business plans?',
        answer: 'Yes. Business plans include guided onboarding and ongoing support channels.',
      },
    ],
    trust: [
      { title: 'Privacy', description: 'We apply controlled access and clear data handling boundaries.' },
      { title: 'Secure Payments', description: 'Billing uses secure provider integrations with transparent status checks.' },
      { title: 'Transparency', description: 'Operational states and environment checks are visible and auditable.' },
      { title: 'Support', description: 'Dedicated escalation paths are available for production business workloads.' },
    ],
    footer: {
      company: 'Company',
      legal: 'Legal',
      contact: 'Contact',
      socials: 'Socials',
      privacy: 'Privacy',
      terms: 'Terms',
      contactUs: 'Contact us',
      product: 'Product',
      services: 'Services',
      pricing: 'Pricing',
      security: 'Security',
      faq: 'FAQ',
    },
  },
  ka: {
    section: {
      benefits: 'ძირითადი უპირატესობები',
      how: 'როგორ მუშაობს',
      services: 'სერვისები',
      trust: 'ნდობა და უსაფრთხოება',
      pricing: 'ფასები',
      faq: 'ხშირი კითხვები',
    },
    benefits: [
      {
        title: 'სანდოობა ბიზნესისთვის',
        description: 'სტაბილური პროცესები და პროგნოზირებადი ხარისხი გუნდებისთვის.',
      },
      {
        title: 'გამჭვირვალე მართვა',
        description: 'წვდომების კონტროლი, ნათელი გამოყენება და ანგარიშვალდებული ოპერაციები.',
      },
      {
        title: 'სწრაფი შედეგი',
        description: 'დაიწყე პრაქტიკული შაბლონებით და გაზარდე სისტემა საჭიროების მიხედვით.',
      },
    ],
    howItWorks: [
      {
        title: '1. აირჩიე სერვისი',
        description: 'იპოვე სწორი workflow ავატარისთვის, მედიასა და ავტომატიზაციისთვის.',
      },
      {
        title: '2. დააყენე პარამეტრები',
        description: 'დამატე პრომპტები, რეფერენსები და მკაფიო დამტკიცების ეტაპები.',
      },
      {
        title: '3. გადაამოწმე და გამოაქვეყნე',
        description: 'შეაფასე ხარისხი, გაიტანე შედეგი და განათავსე შენს არხებზე.',
      },
    ],
    pricing: [
      { name: 'უფასო', price: '$0', details: 'გამოსაცდელად და საწყისი ტესტირებისთვის.' },
      { name: 'Pro', price: '$29/თვე', details: 'შემქმნელებისა და მზარდი გუნდებისთვის.' },
      { name: 'Business', price: 'ინდივიდუალური', details: 'ორგანიზაციებისთვის, რომლებსაც სჭირდებათ პოლიტიკები და SLA.' },
    ],
    faqs: [
      {
        question: 'შეიძლება დაწყება გადახდის გარეშე?',
        answer: 'კი. შეგიძლია დაიწყო უფასო პაკეტით და მოგვიანებით ჩართო ბილინგი.',
      },
      {
        question: 'მხარდაჭერილია მრავალენოვანი გუნდი?',
        answer: 'კი. პლატფორმა სრულად მუშაობს ქართულ, ინგლისურ და რუსულ ენებზე.',
      },
      {
        question: 'როგორ არის დაცული უსაფრთხოება და კონფიდენციალურობა?',
        answer: 'ვიყენებთ წვდომის მკაფიო საზღვრებს, უსაფრთხო გადახდებს და გამჭვირვალე ოპერაციებს.',
      },
      {
        question: 'ბიზნეს პაკეტისთვის არის ონბორდინგი?',
        answer: 'კი. Business პაკეტი მოიცავს guided onboarding-ს და მუდმივ მხარდაჭერას.',
      },
    ],
    trust: [
      { title: 'კონფიდენციალურობა', description: 'ვიცავთ მონაცემების დამუშავების მკაფიო საზღვრებს და კონტროლს.' },
      { title: 'უსაფრთხო გადახდები', description: 'ბილინგი იყენებს უსაფრთხო პროვაიდერებს და გამჭვირვალე სტატუსებს.' },
      { title: 'გამჭვირვალობა', description: 'სისტემის მდგომარეობები და გარემოს შემოწმებები ჩანს და იზომება.' },
      { title: 'მხარდაჭერა', description: 'პროდუქციული დატვირთვისთვის ხელმისაწვდომია სპეციალური ესკალაციის არხები.' },
    ],
    footer: {
      company: 'კომპანია',
      legal: 'იურიდიული',
      contact: 'კონტაქტი',
      socials: 'სოციალური ქსელები',
      privacy: 'კონფიდენციალურობა',
      terms: 'წესები',
      contactUs: 'დაგვიკავშირდი',
      product: 'პროდუქტი',
      services: 'სერვისები',
      pricing: 'ფასები',
      security: 'უსაფრთხოება',
      faq: 'ხშირი კითხვები',
    },
  },
  ru: {
    section: {
      benefits: 'Ключевые преимущества',
      how: 'Как это работает',
      services: 'Сервисы',
      trust: 'Надежность и безопасность',
      pricing: 'Тарифы',
      faq: 'FAQ',
    },
    benefits: [
      {
        title: 'Надежность для бизнеса',
        description: 'Стабильные процессы и предсказуемое качество для команд.',
      },
      {
        title: 'Прозрачное управление',
        description: 'Контроль доступа, ясные политики и отслеживаемые операции.',
      },
      {
        title: 'Быстрый результат',
        description: 'Запускайтесь с готовыми шаблонами и масштабируйтесь по мере роста.',
      },
    ],
    howItWorks: [
      {
        title: '1. Выберите сервис',
        description: 'Подберите workflow для аватаров, медиа и автоматизации.',
      },
      {
        title: '2. Настройте входные данные',
        description: 'Добавьте промпты, референсы и этапы согласования.',
      },
      {
        title: '3. Проверьте и публикуйте',
        description: 'Проверьте качество, экспортируйте и публикуйте результат.',
      },
    ],
    pricing: [
      { name: 'Бесплатно', price: '$0', details: 'Для ознакомления и базового теста.' },
      { name: 'Pro', price: '$29/мес', details: 'Для создателей и растущих команд.' },
      { name: 'Business', price: 'Индивидуально', details: 'Для компаний с требованиями к политике и SLA.' },
    ],
    faqs: [
      {
        question: 'Можно начать без настройки оплаты?',
        answer: 'Да. Начните с бесплатного плана и подключите биллинг позже.',
      },
      {
        question: 'Поддерживается ли мультиязычная команда?',
        answer: 'Да. Платформа работает на английском, грузинском и русском языках.',
      },
      {
        question: 'Как устроены безопасность и приватность?',
        answer: 'Мы используем контроль доступа, защищенные платежи и прозрачные процессы.',
      },
      {
        question: 'Есть ли онбординг для бизнес-планов?',
        answer: 'Да. Для Business доступен guided onboarding и постоянная поддержка.',
      },
    ],
    trust: [
      { title: 'Приватность', description: 'Контролируем доступ и соблюдаем четкие границы обработки данных.' },
      { title: 'Безопасные платежи', description: 'Биллинг через надежных провайдеров с прозрачной проверкой статуса.' },
      { title: 'Прозрачность', description: 'Состояние системы и проверки среды доступны и аудируемы.' },
      { title: 'Поддержка', description: 'Для production-нагрузки доступны выделенные каналы эскалации.' },
    ],
    footer: {
      company: 'Компания',
      legal: 'Право',
      contact: 'Контакт',
      socials: 'Соцсети',
      privacy: 'Конфиденциальность',
      terms: 'Условия',
      contactUs: 'Связаться с нами',
      product: 'Продукт',
      services: 'Сервисы',
      pricing: 'Тарифы',
      security: 'Безопасность',
      faq: 'FAQ',
    },
  },
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = i18n.locales.includes(params.locale as (typeof i18n.locales)[number])
    ? params.locale
    : i18n.defaultLocale;
  const canonical = `https://myavatar.ge/${locale}`;

  return {
    title: 'Myavatar.ge | Reliable AI Platform for Teams',
    description:
      'Myavatar.ge provides a stable, transparent AI platform for avatar creation, media operations, and business workflows.',
    alternates: { canonical },
    openGraph: {
      title: 'Myavatar.ge | Reliable AI Platform for Teams',
      description:
        'A conservative, enterprise-ready platform for avatar creation and AI-powered service workflows.',
      url: canonical,
      type: 'website',
      images: [
        {
          url: '/brand/logo.png',
          width: 1200,
          height: 630,
          alt: 'Myavatar.ge',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Myavatar.ge | Reliable AI Platform for Teams',
      description:
        'Conservative, high-trust AI workflows for avatars, media services, and business operations.',
      images: ['/brand/logo.png'],
    },
  };
}

export default function LocaleLandingPage({ params }: PageProps) {
  const locale = i18n.locales.includes(params.locale as (typeof i18n.locales)[number])
    ? params.locale
    : i18n.defaultLocale;
  const content = landingContent[locale as SupportedLocale] ?? landingContent.ka;
  const localeKey = (locale as SupportedLocale) in landingContent
    ? (locale as SupportedLocale)
    : i18n.defaultLocale;
  const services = SERVICE_REGISTRY.slice(0, 13);
  const homePath = `/${locale}`;
  const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'local-dev';

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
          MYAVATAR OK • BUILD: {buildStamp}
        </div>
      </div>
      <Hero locale={locale} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">

      <section id="product" className="mt-12" aria-labelledby="benefits-heading">
        <h2 id="benefits-heading" className="text-2xl font-semibold text-white">{content.section.benefits}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {content.benefits.map((item) => (
            <article key={item.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-semibold text-white">{content.section.how}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {content.howItWorks.map((step) => (
            <article key={step.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="services-grid" className="mt-12" aria-labelledby="services-heading">
        <h2 id="services-heading" className="text-2xl font-semibold text-white">{content.section.services}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            (() => {
              const localized = service.localized?.[localeKey];
              const serviceName = localized?.name ?? service.name;
              const serviceDescription = localized?.description ?? service.description;

              return (
            <Link
              key={service.id}
              href={`/${locale}${service.route}`}
              className="rounded-xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-slate-300/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              aria-label={`Open ${serviceName}`}
            >
              <p className="text-sm font-semibold text-slate-100">{serviceName}</p>
              <p className="mt-1 text-xs text-slate-300">{serviceDescription}</p>
            </Link>
              );
            })()
          ))}
        </div>
      </section>

      <section id="security" className="mt-12" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="text-2xl font-semibold text-white">{content.section.trust}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {content.trust.map((item) => (
            <article key={item.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="mt-12" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading" className="text-2xl font-semibold text-white">{content.section.pricing}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {content.pricing.map((plan) => (
            <article key={plan.name} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{plan.name}</h3>
              <p className="mt-2 text-2xl font-semibold text-white">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-300">{plan.details}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="mt-12" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold text-white">{content.section.faq}</h2>
        <div className="mt-5 space-y-3">
          {content.faqs.map((item) => (
            <details key={item.question} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100">{item.question}</summary>
              <p className="mt-2 text-sm text-slate-300">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-white/10 bg-slate-900/50 p-5" aria-label="Footer links">
        <div className="grid gap-4 text-sm text-slate-300 sm:grid-cols-4">
          <div>
            <p className="font-semibold text-slate-100">{content.footer.company}</p>
            <p className="mt-2">Myavatar.ge</p>
          </div>
          <div>
            <p className="font-semibold text-slate-100">{content.footer.legal}</p>
            <div className="mt-2 space-y-1">
              <Link href={`/${locale}/privacy`} className="block hover:text-white">{content.footer.privacy}</Link>
              <Link href={`/${locale}/terms`} className="block hover:text-white">{content.footer.terms}</Link>
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-100">{content.footer.contact}</p>
            <Link href={`/${locale}/contact`} className="mt-2 block hover:text-white">{content.footer.contactUs}</Link>
          </div>
          <div>
            <p className="font-semibold text-slate-100">{content.footer.socials}</p>
            <div className="mt-2 space-y-1">
              <a href="https://x.com" target="_blank" rel="noreferrer" className="block hover:text-white">X</a>
              <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" className="block hover:text-white">LinkedIn</a>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-xs text-slate-400">
          <Link href={`${homePath}#product`} className="hover:text-slate-100">{content.footer.product}</Link>
          <Link href={`${homePath}#services-grid`} className="hover:text-slate-100">{content.footer.services}</Link>
          <Link href={`${homePath}#pricing`} className="hover:text-slate-100">{content.footer.pricing}</Link>
          <Link href={`${homePath}#security`} className="hover:text-slate-100">{content.footer.security}</Link>
          <Link href={`${homePath}#faq`} className="hover:text-slate-100">{content.footer.faq}</Link>
          <span className="ml-auto">Build: {buildStamp}</span>
        </div>
      </section>
      </div>
    </>
  );
}
