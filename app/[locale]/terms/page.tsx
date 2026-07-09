import Link from 'next/link';

type Lang = 'ka' | 'en' | 'ru';

const copy: Record<Lang, {
  title: string;
  effective: string;
  back: string;
  sections: Array<{ title: string; body: string }>;
}> = {
  ka: {
    title: 'მომსახურების პირობები',
    effective: 'მოქმედებს: 2026 წლის 18 მაისიდან',
    back: '← მთავარზე დაბრუნება',
    sections: [
      {
        title: '1. ხელშეკრულების მონაწილეები',
        body: 'წინამდებარე პირობები რეგულირებს თქვენი (შემდგომში — "მომხმარებელი") და MyAvatar-ის (შემდგომში — "ჩვენ") ურთიერთობას. სერვისით სარგებლობით, თქვენ ეთანხმებით ამ პირობებს მთლიანად.',
      },
      {
        title: '2. სერვისის აღწერა',
        body: 'MyAvatar არის AI-ით კონტენტის გენერაციის პლატფორმა, რომელიც აერთიანებს ჩატს, სურათის/ვიდეოს/მუსიკის/ხმის გენერაციას, ციფრულ ავატარს, ინტერიერის ვიზუალიზაციას და კოდის გენერაციას ერთ ფანჯარაში. ფუნქციონალი შესაძლოა შეიცვალოს დროთა განმავლობაში.',
      },
      {
        title: '3. ანგარიში',
        body: 'სარგებლობისთვის საჭიროა ანგარიშის შექმნა. პასუხისმგებლობას შემოვინახავთ ანგარიშის უსაფრთხოებაზე და მისი ნებისმიერი მოქმედებისთვის. ერთ პიროვნებას/იურიდიულ პირს — ერთი ანგარიში.',
      },
      {
        title: '4. გადახდები და კრედიტი',
        body: 'სერვისი იყიდება ხელმოწერის ან კრედიტის სქემით. გადახდა მუშავდება Stripe-ის მეშვეობით — ჩვენ ბარათის რეკვიზიტებს არ ვინახავთ. გაუქმება ხელმისაწვდომია ნებისმიერ მომენტში; უკვე გადახდილი თვის თანხა არ ბრუნდება, თუ ცალკე არ შევთანხმდით.',
      },
      {
        title: '5. გენერაციის ჩავარდნა',
        body: 'AI გენერაცია გადახდილია ფიქსირებული კრედიტებიდან. თუ მესამე-მხარის სერვისი (HeyGen, Replicate და ა.შ.) ჩაიშლება გენერაციის შუა გზაზე და ეს ჩვენი ბრალი არ არის — კრედიტი ავტომატურად დაგიბრუნდებათ.',
      },
      {
        title: '6. დაშვებული გამოყენება',
        body: 'არ შეიძლება: სხვისი იდენტობით თაღლითობა, ბავშვების ექსპლუატაცია, ძალადობრივი, რასისტული, ექსტრემისტული ან გაყალბებული პოლიტიკური კონტენტი, საავტორო უფლების დარღვევა, თაღლითური ან მავნე ფინანსური სქემები. ამ წესების დარღვევა იწვევს ანგარიშის შეჩერებას.',
      },
      {
        title: '7. ინტელექტუალური საკუთრება',
        body: 'სერვისის კოდი, დიზაინი, ბრენდი — ჩვენი საკუთრებაა. სერვისით გენერირებული მედია — თქვენი საკუთრებაა, თუ მესამე მხარის ლიცენზია სხვაგვარად არ ადგენს.',
      },
      {
        title: '8. პასუხისმგებლობის ლიმიტი',
        body: 'სერვისი მოწოდებულია "როგორც არის". ჩვენ ვცდილობთ უწყვეტ მუშაობას, მაგრამ ვერ გავწევთ აბსოლუტურ გარანტიას ხელმისაწვდომობაზე, AI გენერაციის ხარისხზე, ან მესამე მხარის სერვისების ხელმისაწვდომობაზე. ჩვენი მაქსიმალური პასუხისმგებლობა შემოიფარგლება თქვენი ბოლო 3 თვის გადახდით.',
      },
      {
        title: '9. ცვლილებები',
        body: 'პირობების არსებითი ცვლილების შემთხვევაში გაცნობებთ ელფოსტით ცვლილების ძალაში შესვლის სულ ცოტა 14 დღით ადრე.',
      },
      {
        title: '10. გამოყენებული კანონი და დავა',
        body: 'წინამდებარე პირობებზე გავრცელდება საქართველოს კანონმდებლობა. ნებისმიერი დავა გადაწყდება საქართველოს სასამართლოს მეშვეობით.',
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    effective: 'Effective: May 18, 2026',
    back: '← Back home',
    sections: [
      {
        title: '1. Parties',
        body: 'These terms govern the relationship between you (the "User") and MyAvatar ("we", "us"). By using the service, you agree to these terms in full.',
      },
      {
        title: '2. Service Description',
        body: 'MyAvatar is an AI content creation platform combining chat, image/video/music/voice generation, digital avatars, interior visualization, and code generation in one window. Features may change over time.',
      },
      {
        title: '3. Account',
        body: 'You must create an account to use the service. You are responsible for your account\'s security and all actions taken with it. One account per person/legal entity.',
      },
      {
        title: '4. Payments and Credits',
        body: 'The service is sold via subscription or credit packs. Payments are processed by Stripe — we never store card details. You can cancel at any time; any already-paid month is non-refundable unless otherwise agreed.',
      },
      {
        title: '5. Generation Failures',
        body: 'AI generation is billed in fixed credits. If a third-party provider (HeyGen, Replicate, etc.) fails mid-generation through no fault of ours, the credit is refunded automatically.',
      },
      {
        title: '6. Acceptable Use',
        body: 'You may not: impersonate others, exploit minors, produce violent / racist / extremist / fabricated political content, infringe copyright, or run fraudulent or malicious financial schemes. Violation results in account suspension.',
      },
      {
        title: '7. Intellectual Property',
        body: 'The service code, design, and brand are our property. Content generated via the service belongs to you, unless a third-party provider\'s license states otherwise.',
      },
      {
        title: '8. Liability Limitation',
        body: 'The service is provided "as is". We strive for continuous uptime but cannot guarantee absolute availability, AI generation quality, or third-party provider availability. Our maximum liability is limited to the amount you paid us in the last 3 months.',
      },
      {
        title: '9. Changes',
        body: 'For material changes, we will notify you by email at least 14 days before the change takes effect.',
      },
      {
        title: '10. Governing Law and Disputes',
        body: 'These terms are governed by Georgian law. Any dispute will be resolved by the courts of Georgia.',
      },
    ],
  },
  ru: {
    title: 'Условия использования',
    effective: 'Действует с 18 мая 2026 г.',
    back: '← Назад на главную',
    sections: [
      {
        title: '1. Стороны',
        body: 'Настоящие условия регулируют отношения между вами ("Пользователь") и MyAvatar ("мы"). Используя сервис, вы полностью соглашаетесь с этими условиями.',
      },
      {
        title: '2. Описание сервиса',
        body: 'MyAvatar — это AI-платформа, объединяющая чат, генерацию изображений/видео/музыки/голоса, цифровых аватаров, интерьеров и кода в одном окне. Функционал может изменяться со временем.',
      },
      {
        title: '3. Аккаунт',
        body: 'Для пользования нужен аккаунт. Вы отвечаете за его безопасность и все действия с ним. Один аккаунт на физическое/юридическое лицо.',
      },
      {
        title: '4. Платежи и кредиты',
        body: 'Сервис продаётся по подписке или пакетами кредитов. Платежи обрабатывает Stripe — реквизиты карты у нас не хранятся. Можно отменить в любой момент; уже оплаченный месяц не возвращается, если не оговорено иначе.',
      },
      {
        title: '5. Сбои генерации',
        body: 'AI-генерация оплачивается фиксированными кредитами. Если сторонний сервис (HeyGen, Replicate и пр.) откажет в процессе не по нашей вине — кредит возвращается автоматически.',
      },
      {
        title: '6. Допустимое использование',
        body: 'Запрещено: выдавать себя за других, эксплуатировать несовершеннолетних, создавать насильственный / расистский / экстремистский / сфабрикованный политический контент, нарушать авторские права, мошеннические или вредоносные финансовые схемы. Нарушение ведёт к блокировке аккаунта.',
      },
      {
        title: '7. Интеллектуальная собственность',
        body: 'Код, дизайн и бренд сервиса — наша собственность. Сгенерированный медиа принадлежит вам, если лицензия стороннего провайдера не предусматривает иное.',
      },
      {
        title: '8. Ограничение ответственности',
        body: 'Сервис предоставляется "как есть". Мы стремимся к непрерывной работе, но не гарантируем абсолютной доступности, качества AI-генерации или доступности сторонних провайдеров. Наша максимальная ответственность ограничена суммой, которую вы заплатили нам за последние 3 месяца.',
      },
      {
        title: '9. Изменения',
        body: 'О существенных изменениях вы будете уведомлены по email минимум за 14 дней до их вступления в силу.',
      },
      {
        title: '10. Применимое право и споры',
        body: 'Настоящие условия регулируются законодательством Грузии. Все споры разрешаются судами Грузии.',
      },
    ],
  },
};

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
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
