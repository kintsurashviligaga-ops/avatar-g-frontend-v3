import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, MessageSquare } from 'lucide-react';
import { StudioPageShell } from '@/components/studio/StudioPageShell';
import { JsonLd } from '@/components/seo/JsonLd';
import { serviceItemListSchema } from '@/lib/seo/schema';
import { localeAlternates } from '@/lib/seo/hreflang';
import { OG_IMAGE } from '@/lib/seo/metadata';
import { TOOL_META } from '@/lib/studio/tools';
import {
  SERVICE_CATEGORIES, LEGACY_SLUG_TO_SERVICE, countServices, getService, servicesInCategory, serviceHref,
  type ServiceDefinition,
} from '@/lib/catalog/services';
import { NAV_GROUP_LABEL } from '@/lib/catalog/nav';

/**
 * /{lang}/services — the service catalog as a page (Master Task §20). Everything on it comes from lib/catalog/services.ts:
 * the categories, the cards, the count in the headline, the links. A card opens the service in the studio
 * (`/{lang}/dashboard?tool=…`), the one working window (§17–§18) — there is no second implementation here.
 *
 * ⚠️ IT USED TO BE 26 HAND-WRITTEN ENGLISH CARDS under „24 connected modules": an online shop, a business suite, a tourism
 * agent, a workflow builder and an „Expansion Slot" among them, none of which the studio runs (docs/handoffs/service-inventory.md).
 * A service is on this page only if the catalog says a person can use it today.
 */

type ServicesPageProps = { params: Promise<{ locale: string }> };
type Lang = 'ka' | 'en' | 'ru';
const langOf = (locale: string): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

const SERVICES_META: Record<Lang, { title: string; description: string }> = {
  ka: { title: 'AI სერვისები', description: 'ვიდეო, სურათი, ავატარი, მუსიკა, ხმა, ტექსტი, დიზაინი და კოდი — ერთ სტუდიაში, Agent G-სთან ერთად.' },
  en: { title: 'AI services', description: 'Video, image, avatar, music, voice, writing, design and code — in one studio, with Agent G.' },
  ru: { title: 'AI-сервисы', description: 'Видео, изображения, аватар, музыка, голос, тексты, дизайн и код — в одной студии, вместе с Agent G.' },
};
const OG_LOCALE: Record<Lang, string> = { ka: 'ka_GE', en: 'en_US', ru: 'ru_RU' };

export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const m = SERVICES_META[langOf(locale)];
  return {
    title: m.title,
    description: m.description,
    alternates: localeAlternates(locale, '/services'),
    openGraph: {
      type: 'website', title: m.title, description: m.description, url: `/${locale}/services`, siteName: 'MyAvatar',
      locale: OG_LOCALE[langOf(locale)], images: [{ ...OG_IMAGE, alt: m.title }],
    },
    twitter: { card: 'summary_large_image', title: m.title, description: m.description, images: [OG_IMAGE.url] },
  };
}

/** „7 სერვისი" / "7 services" / «7 сервисов» — with the Russian plural. */
function servicesWord(n: number, lang: Lang): string {
  if (lang === 'ka') return `${n} სერვისი`;
  if (lang === 'en') return `${n} ${n === 1 ? 'service' : 'services'}`;
  const mod10 = n % 10, mod100 = n % 100;
  const w = mod10 === 1 && mod100 !== 11 ? 'сервис' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'сервиса' : 'сервисов';
  return `${n} ${w}`;
}

const COPY: Record<Lang, {
  eyebrow: string; title: string; lead: (services: number, categories: number) => string;
  agentTitle: string; agentText: string; agentCta: string; open: string; beta: string;
  /** On a shortcut card: the category that owns the service (§24 — the card opens that one service). */
  alsoIn: string;
  closingTitle: string; closingText: string; closingCta: string;
}> = {
  ka: {
    eyebrow: 'სერვისები',
    title: 'ერთი სტუდია. ყველაფერი, რასაც ქმნი.',
    lead: (s, c) => `${servicesWord(s, 'ka')} ${c} კატეგორიაში. თითოეული იხსნება იმავე სტუდიაში, სადაც Agent G გელოდება.`,
    agentTitle: 'Agent G',
    agentText: 'უთხარი, რა გინდა — ტექსტით ან ხმით. Agent G თავად შეარჩევს სერვისს, გეტყვის ფასს და შექმნის შედეგს.',
    agentCta: 'ჩატის გახსნა',
    open: 'სტუდიაში გახსნა',
    beta: 'ბეტა',
    alsoIn: 'კატეგორია',
    closingTitle: 'დაიწყე ერთი იდეით',
    closingText: 'ფასი ღილაკზე წერია, სანამ დაადასტურებ.',
    closingCta: 'სტუდიის გახსნა',
  },
  en: {
    eyebrow: 'Services',
    title: 'One studio. Everything you make.',
    lead: (s, c) => `${servicesWord(s, 'en')} in ${c} categories. Each one opens in the same studio, where Agent G is waiting.`,
    agentTitle: 'Agent G',
    agentText: 'Say what you want, by text or voice. Agent G picks the service, tells you the price and makes the result.',
    agentCta: 'Open the chat',
    open: 'Open in the studio',
    beta: 'Beta',
    alsoIn: 'Category',
    closingTitle: 'Start from one idea',
    closingText: 'The price is on the button before you confirm.',
    closingCta: 'Open the studio',
  },
  ru: {
    eyebrow: 'Сервисы',
    title: 'Одна студия. Всё, что вы создаёте.',
    lead: (s, c) => `${servicesWord(s, 'ru')} в ${c} категориях. Каждый открывается в той же студии, где вас ждёт Agent G.`,
    agentTitle: 'Agent G',
    agentText: 'Скажите, что нужно, текстом или голосом. Agent G сам выберет сервис, назовёт цену и создаст результат.',
    agentCta: 'Открыть чат',
    open: 'Открыть в студии',
    beta: 'Бета',
    alsoIn: 'Раздел',
    closingTitle: 'Начните с одной идеи',
    closingText: 'Цена указана на кнопке до подтверждения.',
    closingCta: 'Открыть студию',
  },
};

/** The SEO landing pages that belong to a catalog service — the ItemList points at them, never at a page with no runtime. */
const SEO_PAGES: readonly string[] = ['video', 'image', 'avatar', 'music', 'voice', 'interior', 'content-writer', 'podcast', 'prompt', 'terminal'];

function ServiceCard({ service, locale, lang, shortcutOf }: { service: ServiceDefinition; locale: string; lang: Lang; shortcutOf?: string }) {
  const c = COPY[lang];
  const href = serviceHref(service.id, locale);
  if (!href || !service.tool) return null;
  const { Icon } = TOOL_META[service.tool];
  return (
    <li>
      <Link href={href} data-service-id={service.id}
        className="group flex h-full min-h-[44px] flex-col rounded-2xl border border-white/10 bg-app-surface p-5 transition-colors hover:bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent">
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-app-elevated text-app-accent"><Icon className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 text-[16px] font-semibold leading-tight text-app-text">{service.label[lang]}</span>
          {service.status === 'beta' && <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-app-muted">{c.beta}</span>}
        </span>
        <span className="mt-3 text-[14px] leading-relaxed text-app-muted">{service.description[lang]}</span>
        {shortcutOf && <span className="mt-2 text-[12px] text-app-muted">{c.alsoIn}: {shortcutOf}</span>}
        <span className="mt-auto flex items-center gap-1.5 pt-4 text-[13px] font-medium text-app-accent">
          {c.open}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export default async function LocalizedServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const lang = langOf(locale);
  const c = COPY[lang];

  const sections = SERVICE_CATEGORIES
    .map((cat) => ({ cat, items: servicesInCategory(cat.id).filter(({ service }) => service.visibleInServices && service.tool) }))
    .filter((s) => s.items.length > 0);
  const total = countServices();
  const categoryLabel = (id: string) => SERVICE_CATEGORIES.find((x) => x.id === id)?.label[lang] ?? id;

  const itemList = serviceItemListSchema({
    locale,
    name: 'MyAvatar AI Services',
    services: SEO_PAGES
      .map((slug) => ({ slug, s: getService(LEGACY_SLUG_TO_SERVICE[slug] ?? '') }))
      .filter((x): x is { slug: string; s: ServiceDefinition } => !!x.s)
      .map(({ slug, s }) => ({ slug, name: s.label[lang] })),
  });

  return (
    <StudioPageShell locale={locale}>
      <JsonLd data={itemList} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 md:gap-16 md:py-16">
        <header className="max-w-3xl">
          <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-app-accent">{c.eyebrow}</p>
          <h1 className="mt-3 text-[34px] font-bold leading-[1.1] tracking-tight text-app-text sm:text-[48px]">{c.title}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-app-muted" data-testid="services-count">{c.lead(total, sections.length)}</p>
          <nav aria-label={c.eyebrow} className="mt-6 flex flex-wrap gap-2">
            {sections.map(({ cat }) => (
              <a key={cat.id} href={`#${cat.id}`}
                className="inline-flex min-h-[44px] items-center rounded-full border border-white/10 px-4 text-[14px] text-app-text transition-colors hover:bg-app-elevated">
                {cat.label[lang]}
              </a>
            ))}
          </nav>
        </header>

        {/* Agent G is the layer every service is reached through (§16) — not one card among the others. */}
        <section aria-labelledby="agent-g-title" className="rounded-3xl border border-white/10 bg-app-surface p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 id="agent-g-title" className="flex items-center gap-3 text-[24px] font-bold text-app-text">
                <MessageSquare className="h-6 w-6 text-app-accent" aria-hidden="true" />{c.agentTitle}
              </h2>
              <p className="mt-3 text-[16px] leading-relaxed text-app-muted">{c.agentText}</p>
            </div>
            <Link href={`/${locale}/dashboard?tool=chat`}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start rounded-full bg-app-accent px-6 text-[15px] font-semibold text-app-bg transition-opacity hover:opacity-90 md:self-auto">
              {c.agentCta}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {(['create', 'work'] as const).map((grp) => {
          const inGroup = sections.filter(({ cat }) => (cat.group === 'agent' ? 'work' : cat.group) === grp);
          if (inGroup.length === 0) return null;
          return (
            <div key={grp} className="flex flex-col gap-10">
              <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-app-muted">{NAV_GROUP_LABEL[grp][lang]}</p>
              {inGroup.map(({ cat, items }) => (
                <section key={cat.id} id={cat.id} aria-labelledby={`${cat.id}-title`} className="scroll-mt-20" data-category={cat.id}>
                  <div className="mb-4 flex items-baseline justify-between gap-4">
                    <h2 id={`${cat.id}-title`} className="text-[24px] font-bold tracking-tight text-app-text md:text-[28px]">{cat.label[lang]}</h2>
                    <span className="shrink-0 text-[13px] tabular-nums text-app-muted">{servicesWord(items.length, lang)}</span>
                  </div>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(({ service, shortcut }) => (
                      <ServiceCard key={service.id} service={service} locale={locale} lang={lang}
                        shortcutOf={shortcut ? categoryLabel(service.category) : undefined} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        })}

        <section className="rounded-3xl border border-white/10 p-6 text-center md:p-10">
          <h2 className="text-[24px] font-bold text-app-text md:text-[32px]">{c.closingTitle}</h2>
          <p className="mt-3 text-[16px] text-app-muted">{c.closingText}</p>
          <Link href={`/${locale}/dashboard`}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-accent px-6 text-[15px] font-semibold text-app-bg transition-opacity hover:opacity-90">
            {c.closingCta}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </StudioPageShell>
  );
}
