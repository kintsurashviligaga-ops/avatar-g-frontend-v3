import Link from 'next/link';

const copy = {
  ka: {
    title: 'კარიერა',
    body: 'ამ ეტაპზე ღია პოზიციები შეზღუდულია. შეგიძლიათ გამოგვიგზავნოთ CV და პორტფოლიო: careers@myavatar.ge',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Карьера',
    body: 'Сейчас количество открытых вакансий ограничено. Отправьте CV и портфолио на: careers@myavatar.ge',
    back: '← Назад на главную',
  },
  en: {
    title: 'Careers',
    body: 'Open roles are currently limited. You can send your CV and portfolio to: careers@myavatar.ge',
    back: '← Back home',
  },
} as const;

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
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
