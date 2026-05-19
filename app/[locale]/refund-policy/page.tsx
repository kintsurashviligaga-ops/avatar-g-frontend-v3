import Link from 'next/link';

type Lang = 'ka' | 'en' | 'ru';

const copy: Record<Lang, {
  title: string;
  effective: string;
  back: string;
  sections: Array<{ title: string; body: string }>;
}> = {
  ka: {
    title: 'დაბრუნების პოლიტიკა',
    effective: 'მოქმედებს: 2026 წლის 19 მაისიდან',
    back: '← მთავარზე დაბრუნება',
    sections: [
      { title: '1. ხელმოწერა',
        body: 'ხელმოწერით თვიური საფასური გადახდილია წინასწარ. გაუქმება ხელმისაწვდომია ნებისმიერ მომენტში; უკვე გადახდილი თვის თანხა არ ბრუნდება, თუ ცალკე არ შევთანხმდით.' },
      { title: '2. კრედიტის პაკეტი',
        body: 'შესყიდულ კრედიტს ვადა არ აქვს, თუ თქვენ თვითონ არ გააუქმეთ ანგარიში. გამოუყენებელი კრედიტი არ ბრუნდება — მაგრამ ანგარიშის შენარჩუნებისას ის თქვენთან რჩება.' },
      { title: '3. გენერაციის ჩავარდნა',
        body: 'თუ მესამე-მხარის სერვისი (HeyGen, Replicate, LTX, Udio, ElevenLabs) ჩაიშლება გენერაციის შუა გზაზე და ეს ჩვენი ბრალი არ არის — კრედიტი ავტომატურად დაგიბრუნდებათ ანგარიშზე 24 საათში. შეცდომის შემთხვევაში ჩვენ ვაჩვენებთ წითელ ბანერს ჩატში.' },
      { title: '4. დაბრუნების მოთხოვნა',
        body: 'არჩვევითი დაბრუნებისთვის (მაგ. შეცდომით გადახდა, ხელმოწერის შემთხვევით ხელახლა გააქტიურება) დაგვიკავშირდით 14 დღის განმავლობაში: support@myavatar.ge. ანაზღაურდება იმავე გადახდის მეთოდით, რომელიც გამოიყენე.' },
      { title: '5. დროები',
        body: 'პასუხი დაბრუნების მოთხოვნაზე — 3 სამუშაო დღე. დამტკიცებული თანხა ანგარიშზე ჩაირიცხება 5-10 სამუშაო დღეში (ბანკიდან გამომდინარე).' },
      { title: '6. გამონაკლისები',
        body: 'არ ბრუნდება: უკვე ჩამოტვირთული გენერირებული მედია, აქტიური Pro Subscription-ის გადახდილი თვე, წესების დარღვევით გაუქმებული ანგარიში (იხილე ხელშეკრულების მე-6 პუნქტი).' },
      { title: '7. კონტაქტი',
        body: 'ნებისმიერ კითხვაზე: support@myavatar.ge' },
    ],
  },
  en: {
    title: 'Refund Policy',
    effective: 'Effective: May 19, 2026',
    back: '← Back home',
    sections: [
      { title: '1. Subscription',
        body: 'Subscription is paid monthly in advance. You can cancel anytime; any already-paid month is non-refundable unless otherwise agreed.' },
      { title: '2. Credit Packs',
        body: 'Purchased credits do not expire as long as your account is active. Unused credits are non-refundable — but stay with your account.' },
      { title: '3. Generation Failures',
        body: 'If a third-party provider (HeyGen, Replicate, LTX, Udio, ElevenLabs) fails mid-generation through no fault of ours, the credit is refunded automatically within 24 hours. We surface a red banner inside the chat on failure.' },
      { title: '4. Discretionary Refund Request',
        body: 'For discretionary refunds (e.g. accidental charge, accidental subscription reactivation), email us within 14 days at support@myavatar.ge. Refund issues to the same payment method used.' },
      { title: '5. Timelines',
        body: 'Reply to a refund request — 3 business days. Approved amount lands in your account within 5-10 business days depending on your bank.' },
      { title: '6. Exceptions',
        body: 'Not refundable: media already downloaded, the paid month of an active Pro subscription, account closed for terms violation (see Terms § 6).' },
      { title: '7. Contact',
        body: 'Any question: support@myavatar.ge' },
    ],
  },
  ru: {
    title: 'Политика возврата',
    effective: 'Действует с 19 мая 2026 г.',
    back: '← Назад на главную',
    sections: [
      { title: '1. Подписка',
        body: 'Подписка оплачивается помесячно вперёд. Можно отменить в любой момент; уже оплаченный месяц не возвращается, если не оговорено иначе.' },
      { title: '2. Пакеты кредитов',
        body: 'Купленные кредиты не имеют срока действия, пока ваш аккаунт активен. Неиспользованные кредиты не возвращаются — но остаются на счёте.' },
      { title: '3. Сбои генерации',
        body: 'Если сторонний провайдер (HeyGen, Replicate, LTX, Udio, ElevenLabs) откажет в процессе не по нашей вине — кредит возвращается автоматически в течение 24 часов. При ошибке мы показываем красный баннер в чате.' },
      { title: '4. Дискреционный запрос на возврат',
        body: 'Для дискреционных возвратов (например, случайное списание, случайная реактивация подписки) напишите нам в течение 14 дней: support@myavatar.ge. Возврат идёт тем же способом оплаты, что использовался изначально.' },
      { title: '5. Сроки',
        body: 'Ответ на запрос — 3 рабочих дня. Одобренная сумма поступит в течение 5-10 рабочих дней (зависит от банка).' },
      { title: '6. Исключения',
        body: 'Не возвращается: уже скачанный сгенерированный медиа, оплаченный месяц активной Pro-подписки, аккаунт закрыт за нарушение правил (см. Условия § 6).' },
      { title: '7. Контакты',
        body: 'Любой вопрос: support@myavatar.ge' },
    ],
  },
};

export default async function RefundPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lang: Lang = locale === 'ka' || locale === 'ru' ? locale : 'en';
  const t = copy[lang];

  return (
    <section className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-white/55">{t.effective}</p>
        </header>

        {t.sections.map(s => (
          <section key={s.title} className="space-y-3">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="text-white/80 leading-relaxed">{s.body}</p>
          </section>
        ))}

        <Link href={`/${locale}`} className="inline-block text-sm text-violet-300 hover:text-violet-200 transition">
          {t.back}
        </Link>
      </div>
    </section>
  );
}
