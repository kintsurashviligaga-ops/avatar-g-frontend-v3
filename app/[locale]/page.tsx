import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/landing/Hero';
import { SERVICE_REGISTRY } from '@/lib/service-registry';
import { i18n } from '@/i18n.config';

type PageProps = {
  params: { locale: string };
};

const benefits = [
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
];

const howItWorks = [
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
];

const pricing = [
  {
    name: 'Free',
    price: '$0',
    details: 'For exploration and basic testing.',
  },
  {
    name: 'Pro',
    price: '$29/mo',
    details: 'For creators and growing teams with regular output.',
  },
  {
    name: 'Business',
    price: 'Custom',
    details: 'For organizations needing policy controls and support SLAs.',
  },
];

const faqs = [
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
];

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
  const services = SERVICE_REGISTRY.slice(0, 13);
  const homePath = `/${locale}`;
  const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'local-dev';

  return (
    <>
      <div className="mx-auto mt-6 w-full max-w-6xl px-4 sm:px-6">
        <div className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-100">
          PROD MARKER: 20260225-1530
        </div>
      </div>
      <Hero locale={locale} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">

      <section id="product" className="mt-12" aria-labelledby="benefits-heading">
        <h2 id="benefits-heading" className="text-2xl font-semibold text-white">Key Benefits</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {benefits.map((item) => (
            <article key={item.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-semibold text-white">How it works</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {howItWorks.map((step) => (
            <article key={step.title} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="services-grid" className="mt-12" aria-labelledby="services-heading">
        <h2 id="services-heading" className="text-2xl font-semibold text-white">Services</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/${locale}${service.route}`}
              className="rounded-xl border border-white/10 bg-slate-900/50 p-4 transition hover:border-slate-300/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
              aria-label={`Open ${service.name}`}
            >
              <p className="text-sm font-semibold text-slate-100">{service.name}</p>
              <p className="mt-1 text-xs text-slate-300">{service.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="security" className="mt-12" aria-labelledby="trust-heading">
        <h2 id="trust-heading" className="text-2xl font-semibold text-white">Trust</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
            <h3 className="text-base font-semibold text-slate-100">Privacy</h3>
            <p className="mt-2 text-sm text-slate-300">We apply controlled access and clear data handling boundaries.</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
            <h3 className="text-base font-semibold text-slate-100">Secure Payments</h3>
            <p className="mt-2 text-sm text-slate-300">Billing uses secure provider integrations with transparent status checks.</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
            <h3 className="text-base font-semibold text-slate-100">Transparency</h3>
            <p className="mt-2 text-sm text-slate-300">Operational states and environment checks are visible and auditable.</p>
          </article>
          <article className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
            <h3 className="text-base font-semibold text-slate-100">Support</h3>
            <p className="mt-2 text-sm text-slate-300">Dedicated escalation paths are available for production business workloads.</p>
          </article>
        </div>
      </section>

      <section id="pricing" className="mt-12" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading" className="text-2xl font-semibold text-white">Pricing</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {pricing.map((plan) => (
            <article key={plan.name} className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
              <h3 className="text-base font-semibold text-slate-100">{plan.name}</h3>
              <p className="mt-2 text-2xl font-semibold text-white">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-300">{plan.details}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="faq" className="mt-12" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-semibold text-white">FAQ</h2>
        <div className="mt-5 space-y-3">
          {faqs.map((item) => (
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
            <p className="font-semibold text-slate-100">Company</p>
            <p className="mt-2">Myavatar.ge</p>
          </div>
          <div>
            <p className="font-semibold text-slate-100">Legal</p>
            <div className="mt-2 space-y-1">
              <Link href={`/${locale}/privacy`} className="block hover:text-white">Privacy</Link>
              <Link href={`/${locale}/terms`} className="block hover:text-white">Terms</Link>
            </div>
          </div>
          <div>
            <p className="font-semibold text-slate-100">Contact</p>
            <Link href={`/${locale}/contact`} className="mt-2 block hover:text-white">Contact us</Link>
          </div>
          <div>
            <p className="font-semibold text-slate-100">Socials</p>
            <div className="mt-2 space-y-1">
              <a href="https://x.com" target="_blank" rel="noreferrer" className="block hover:text-white">X</a>
              <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" className="block hover:text-white">LinkedIn</a>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-4 text-xs text-slate-400">
          <Link href={`${homePath}#product`} className="hover:text-slate-100">Product</Link>
          <Link href={`${homePath}#services-grid`} className="hover:text-slate-100">Services</Link>
          <Link href={`${homePath}#pricing`} className="hover:text-slate-100">Pricing</Link>
          <Link href={`${homePath}#security`} className="hover:text-slate-100">Security</Link>
          <Link href={`${homePath}#faq`} className="hover:text-slate-100">FAQ</Link>
          <span className="ml-auto">Build: {buildStamp}</span>
        </div>
      </section>
      </div>
    </>
  );
}
