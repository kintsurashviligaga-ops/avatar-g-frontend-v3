import Link from 'next/link';

const copy = {
  ka: {
    title: 'მომსახურების პირობები',
    body: 'სერვისის გამოყენებით ეთანხმებით პლატფორმის წესებს, პასუხისმგებლობის საზღვრებს და სამართლიან გამოყენების პოლიტიკას.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Условия использования',
    body: 'Используя сервис, вы соглашаетесь с правилами платформы, ограничениями ответственности и политикой добросовестного использования.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Terms of Service',
    body: 'By using the service, you agree to platform rules, liability limitations, and the fair-use policy.',
    back: '← Back home',
  },
} as const;

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lang = locale === 'ka' || locale === 'ru' ? locale : 'en';
  const t = copy[lang];

  return (
    <section className="min-h-screen bg-transparent flex items-center justify-center px-6" style={{ color: 'var(--color-text)' }}>
      <div className="max-w-3xl space-y-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold">{t.title}</h1>
        <p className="leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{t.body}</p>
        <Link href={`/${locale}`} className="inline-block text-sm transition-colors" style={{ color: 'var(--color-accent)' }}>
          {t.back}
        </Link>
      </div>
    </section>
  );
}
