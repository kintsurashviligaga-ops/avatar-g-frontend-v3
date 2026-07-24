import Link from 'next/link';
import type { Metadata } from 'next';
import { localeAlternates } from '@/lib/seo/hreflang';

// Iteration 2 — DISTINCT localized title (was inheriting the homepage title) + per-route hreflang/self-canonical.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return { title: copy[lang].title, alternates: localeAlternates(locale, '/licenses') };
}

const copy = {
  ka: {
    title: 'ლიცენზიები',
    body: 'პლატფორმაზე არსებული პროგრამული და კონტენტის ლიცენზიები ვრცელდება შესაბამისი მფლობელების პირობებით.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Лицензии',
    body: 'Лицензии на программное обеспечение и контент платформы регулируются условиями соответствующих правообладателей.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Licenses',
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
        <h1 className="text-3xl md:text-4xl font-bold">{t.title}</h1>
        <p className="text-white/70 leading-relaxed">{t.body}</p>
        <Link href={`/${locale}`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          {t.back}
        </Link>
      </div>
    </section>
  );
}
