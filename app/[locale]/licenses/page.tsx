import Link from 'next/link';
import { LegalDocChrome } from '@/components/legal/LegalDocChrome';
import type { Metadata } from 'next';
import { pageMetadata, seoLang } from '@/lib/seo/metadata';

// Its own title, description, self-canonical/hreflang and share card (lib/seo/metadata.ts).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const lang = seoLang((await params).locale);
  return pageMetadata({ locale: lang, path: '/licenses', title: copy[lang].title, description: copy[lang].description });
}

const copy = {
  ka: {
    title: 'ლიცენზიები',
    description: 'MyAvatar-ზე გამოყენებული პროგრამული უზრუნველყოფისა და კონტენტის ლიცენზიები და მათი პირობები.',
    body: 'პლატფორმაზე არსებული პროგრამული და კონტენტის ლიცენზიები ვრცელდება შესაბამისი მფლობელების პირობებით.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Лицензии',
    description: 'Лицензии на программное обеспечение и контент, используемые в MyAvatar, и их условия.',
    body: 'Лицензии на программное обеспечение и контент платформы регулируются условиями соответствующих правообладателей.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Licenses',
    description: 'The software and content licenses used on MyAvatar, and the terms they come with.',
    body: 'Software and content licenses used on the platform are governed by their respective owners’ terms.',
    back: '← Back home',
  },
} as const;

export default async function LicensesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lang = locale === 'ka' || locale === 'ru' ? locale : 'en';
  const t = copy[lang];

  return (
    <section className="min-h-screen bg-transparent text-white flex items-center justify-center px-6">
      <div className="max-w-3xl space-y-6 text-center">
        {/* Sticky ✕ — AppShell strips every nav bar on these routes, so this is the only way out. */}
        <LegalDocChrome title={t.title} locale={locale} />
        <h1 className="text-3xl md:text-4xl font-bold">{t.title}</h1>
        <p className="text-white/70 leading-relaxed">{t.body}</p>
        <Link href={`/${locale}`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          {t.back}
        </Link>
      </div>
    </section>
  );
}
