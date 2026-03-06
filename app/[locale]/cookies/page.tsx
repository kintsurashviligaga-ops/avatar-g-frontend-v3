import Link from 'next/link';

const copy = {
  ka: {
    title: 'ქუქი-ფაილების პოლიტიკა',
    body: 'ვიყენებთ აუცილებელ ქუქი-ფაილებს სესიის, ენის და უსაფრთხოების ფუნქციებისთვის. ანალიტიკური ქუქი-ფაილები გამოიყენება მხოლოდ საჭიროების შემთხვევაში.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Политика cookie',
    body: 'Мы используем необходимые cookie для сессии, языка и безопасности. Аналитические cookie применяются только при необходимости.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Cookie Policy',
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
        <h1 className="text-3xl md:text-4xl font-bold">{t.title}</h1>
        <p className="text-white/70 leading-relaxed">{t.body}</p>
        <Link href={`/${locale}`} className="inline-block text-cyan-300 hover:text-cyan-200 text-sm">
          {t.back}
        </Link>
      </div>
    </section>
  );
}
