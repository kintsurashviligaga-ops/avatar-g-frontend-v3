import Link from 'next/link';

const copy = {
  ka: {
    title: 'ბლოგი',
    body: 'უახლესი სტატიები და განახლებები მალე გამოქვეყნდება.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Блог',
    body: 'Новые статьи и обновления будут опубликованы в ближайшее время.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Blog',
    body: 'New articles and updates will be published soon.',
    back: '← Back home',
  },
} as const;

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
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
