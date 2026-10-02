import Link from 'next/link';
import { LegalDocChrome } from '@/components/legal/LegalDocChrome';
import type { Metadata } from 'next';
import { pageMetadata, seoLang } from '@/lib/seo/metadata';

// Its own title, description, self-canonical/hreflang and share card (lib/seo/metadata.ts).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const lang = seoLang((await params).locale);
  return pageMetadata({ locale: lang, path: '/cookies', title: copy[lang].title, description: copy[lang].description });
}

const copy = {
  ka: {
    title: 'ქუქი-ფაილების პოლიტიკა',
    description: 'რა ქუქი-ფაილებს იყენებს MyAvatar: აუცილებელს — სესიის, ენისა და უსაფრთხოებისთვის; ანალიტიკურს — მხოლოდ საჭიროებისას.',
    body: 'ვიყენებთ აუცილებელ ქუქი-ფაილებს სესიის, ენის და უსაფრთხოების ფუნქციებისთვის. ანალიტიკური ქუქი-ფაილები გამოიყენება მხოლოდ საჭიროების შემთხვევაში.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Политика cookie',
    description: 'Какие cookie использует MyAvatar: необходимые — для сессии, языка и безопасности; аналитические — только при необходимости.',
    body: 'Мы используем необходимые cookie для сессии, языка и безопасности. Аналитические cookie применяются только при необходимости.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Cookie Policy',
    description: 'The cookies MyAvatar uses: essential ones for your session, language and security; analytics cookies only when necessary.',
    body: 'We use essential cookies for session, language, and security features. Analytics cookies are used only when necessary.',
    back: '← Back home',
  },
} as const;

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
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
