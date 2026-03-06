import Link from 'next/link';

const copy = {
  ka: {
    title: 'კონფიდენციალურობის პოლიტიკა',
    body: 'ჩვენ ვამუშავებთ მხოლოდ სერვისის მუშაობისთვის აუცილებელ მონაცემებს. დეტალური ვერსია მალე დაემატება.',
    back: '← მთავარზე დაბრუნება',
  },
  ru: {
    title: 'Политика конфиденциальности',
    body: 'Мы обрабатываем только данные, необходимые для работы сервиса. Расширенная версия будет опубликована скоро.',
    back: '← Назад на главную',
  },
  en: {
    title: 'Privacy Policy',
    body: 'We process only the data required to operate the service. A full detailed version will be published soon.',
    back: '← Back home',
  },
} as const;

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
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
