import Link from 'next/link';

type Lang = 'ka' | 'en' | 'ru';

const copy: Record<Lang, {
  title: string;
  effective: string;
  back: string;
  controller: { title: string; body: string };
  data: { title: string; body: string; rows: Array<{ what: string; why: string; basis: string }>; cols: { what: string; why: string; basis: string } };
  share: { title: string; body: string; rows: Array<{ who: string; what: string }>; cols: { who: string; what: string } };
  retention: { title: string; body: string };
  rights: { title: string; items: string[] };
  security: { title: string; body: string };
  children: { title: string; body: string };
  changes: { title: string; body: string };
  contact: { title: string; body: string };
}> = {
  ka: {
    title: 'კონფიდენციალურობის პოლიტიკა',
    effective: 'მოქმედებს: 2026 წლის 18 მაისიდან',
    back: '← მთავარზე დაბრუნება',
    controller: {
      title: '1. მონაცემთა გამკონტროლებელი',
      body: 'MyAvatar ოპერირდება საქართველოს ტერიტორიაზე და კონფიდენციალურობასთან დაკავშირებული ნებისმიერი საკითხისთვის შესაძლებელია დაგვიკავშირდეთ: support@myavatar.ge',
    },
    data: {
      title: '2. რა მონაცემებს ვაგროვებთ და რატომ',
      body: 'სერვისის გამოყენებისას ვაგროვებთ მხოლოდ იმ მონაცემებს, რომელიც აუცილებელია მისი მუშაობისთვის.',
      cols: { what: 'მონაცემი', why: 'მიზანი', basis: 'საფუძველი' },
      rows: [
        { what: 'ელ.ფოსტა',                  why: 'ანგარიშის შექმნა და ავთენთიფიკაცია', basis: 'ხელშეკრულების შესრულება' },
        { what: 'სახელი (არჩევითი)',          why: 'პერსონალიზაცია',                     basis: 'თანხმობა' },
        { what: 'ტელეფონის ნომერი (არჩევითი)',why: 'უსაფრთხოების შეტყობინება',           basis: 'თანხმობა' },
        { what: 'მომხმარებლის პრომპტები',      why: 'AI კონტენტის გენერაცია',             basis: 'ხელშეკრულების შესრულება' },
        { what: 'გენერირებული მედია',          why: 'ხელახლა ნახვა, შენახვა, გაზიარება', basis: 'ხელშეკრულების შესრულება' },
        { what: 'ფოტო / ხმოვანი ნიმუში',       why: 'ავატარის ან ხმის კლონის შექმნა',     basis: 'მკაფიო თანხმობა' },
        { what: 'გადახდის ისტორია',            why: 'საფასურის გადახდა, თაღლითობის თავიდან აცილება', basis: 'სამართლებრივი ვალდებულება' },
        { what: 'მოწყობილობის ID, IP, ლოგები', why: 'უსაფრთხოება, შეცდომების მონიტორი',    basis: 'კანონიერი ინტერესი' },
      ],
    },
    share: {
      title: '3. ვისთან ვიზიარებთ მონაცემებს',
      body: 'მონაცემები გადაეცემა მხოლოდ მესამე-მხარის სერვისებს, რომელიც აუცილებელია ფუნქციონირებისთვის. ჩვენ მონაცემებს არ ვყიდით.',
      cols: { who: 'მიმღები', what: 'რა გადაიცემა' },
      rows: [
        { who: 'Supabase (EU)',                    what: 'ანგარიში, პრომპტი, გენერირებული მედია' },
        { who: 'Stripe (EU/US)',                   what: 'სახელი, ფოსტა, გადახდის მეთოდი' },
        { who: 'Anthropic Claude',                  what: 'მხოლოდ პრომპტი' },
        { who: 'Google Gemini',                     what: 'მხოლოდ პრომპტი' },
        { who: 'Replicate / HeyGen / LTX / Udio',   what: 'პრომპტი + (არჩევით) წყარო ფოტო/ხმა' },
        { who: 'ElevenLabs',                        what: 'ტექსტი + (არჩევით) ხმოვანი ნიმუში' },
        { who: 'Vapi.ai',                           what: 'პირდაპირი ხმოვანი ნაკადი ზარის დროს' },
        { who: 'Sentry, PostHog, Vercel Analytics', what: 'შეცდომის სტეკი, ანონიმური მოვლენები, შესრულების მეტრიკები' },
      ],
    },
    retention: {
      title: '4. რამდენ ხანს ვინახავთ მონაცემებს',
      body: 'ანგარიშის მონაცემები ინახება ანგარიშის გაუქმებამდე. გადახდის ჩანაწერები — 5 წელი (კანონის მოთხოვნა). გენერირებული მედია — სანამ თქვენ თვითონ არ წაშლით.',
    },
    rights: {
      title: '5. თქვენი უფლებები',
      items: [
        'წვდომა თქვენს მონაცემებზე',
        'არასწორი მონაცემების შესწორება',
        'მონაცემთა წაშლა ("დავიწყების უფლება")',
        'მონაცემთა გადატანა სხვა სერვისზე',
        'მონაცემთა დამუშავების შეჩერების მოთხოვნა',
        'ნებისმიერი თანხმობის გაუქმება',
        'საქართველოს პერსონალურ მონაცემთა დაცვის სამსახურში საჩივარი',
      ],
    },
    security: {
      title: '6. უსაფრთხოება',
      body: 'მონაცემები გადაიცემა TLS დაშიფვრით. პაროლები არასოდეს ინახება ღია სახით. სერვისს აქვს Sentry-ით შეცდომების მონიტორი და Upstash Redis-ით სიჩქარის შეზღუდვა მართვადი წვდომის შეტევებისგან.',
    },
    children: {
      title: '7. ბავშვები',
      body: 'სერვისი არ არის განკუთვნილი 13 წლამდე ბავშვებისთვის. 13 წლის ქვემოთ მომხმარებლის ანგარიში დადასტურების შემთხვევაში დაუყოვნებლივ წაიშლება.',
    },
    changes: {
      title: '8. ცვლილებები პოლიტიკაში',
      body: 'არსებითი ცვლილების შემთხვევაში გაცნობებთ ელფოსტით ცვლილების ძალაში შესვლის სულ ცოტა 14 დღით ადრე.',
    },
    contact: {
      title: '9. კონტაქტი',
      body: 'ნებისმიერ კითხვაზე: support@myavatar.ge',
    },
  },
  en: {
    title: 'Privacy Policy',
    effective: 'Effective: May 18, 2026',
    back: '← Back home',
    controller: {
      title: '1. Data Controller',
      body: 'MyAvatar operates from Georgia. For any privacy-related question, contact: support@myavatar.ge',
    },
    data: {
      title: '2. What We Collect, and Why',
      body: 'We collect only the data needed for the service to function.',
      cols: { what: 'Data', why: 'Purpose', basis: 'Lawful basis' },
      rows: [
        { what: 'Email address',         why: 'Account creation, authentication', basis: 'Contract performance' },
        { what: 'Name (optional)',       why: 'Personalisation',                  basis: 'Consent' },
        { what: 'Phone (optional)',      why: 'Security notifications',           basis: 'Consent' },
        { what: 'User prompts',           why: 'AI content generation',            basis: 'Contract performance' },
        { what: 'Generated media',        why: 'Revisit, download, share',         basis: 'Contract performance' },
        { what: 'Photo / voice sample',   why: 'Build avatar or voice clone',      basis: 'Explicit consent' },
        { what: 'Purchase history',       why: 'Billing, fraud prevention',         basis: 'Legal obligation' },
        { what: 'Device ID, IP, logs',    why: 'Security, error monitoring',        basis: 'Legitimate interest' },
      ],
    },
    share: {
      title: '3. Who We Share Data With',
      body: 'We share data only with third-party services strictly required for the service to function. We never sell data.',
      cols: { who: 'Recipient', what: 'Data sent' },
      rows: [
        { who: 'Supabase (EU)',                    what: 'Account, prompts, generated media' },
        { who: 'Stripe (EU/US)',                   what: 'Name, email, payment method' },
        { who: 'Anthropic Claude',                  what: 'Prompts only' },
        { who: 'Google Gemini',                     what: 'Prompts only' },
        { who: 'Replicate / HeyGen / LTX / Udio',   what: 'Prompt + (optional) source photo/audio' },
        { who: 'ElevenLabs',                        what: 'Text + (optional) voice sample' },
        { who: 'Vapi.ai',                           what: 'Live audio stream during a call' },
        { who: 'Sentry, PostHog, Vercel Analytics', what: 'Error stacks, anonymous events, performance metrics' },
      ],
    },
    retention: {
      title: '4. How Long We Keep Data',
      body: 'Account data is retained until account deletion. Purchase records — 5 years (legal requirement). Generated media — until you delete it.',
    },
    rights: {
      title: '5. Your Rights',
      items: [
        'Access to your data',
        'Correction of inaccurate data',
        'Erasure ("right to be forgotten")',
        'Portability to another service',
        'Restriction of processing',
        'Withdrawal of any consent',
        'Complaint with the Georgian Personal Data Protection Service',
      ],
    },
    security: {
      title: '6. Security',
      body: 'Data is transmitted over TLS. Passwords are never stored in plain text. The service uses Sentry for error monitoring and Upstash Redis-based rate limiting against abuse.',
    },
    children: {
      title: '7. Children',
      body: 'The service is not intended for children under 13. Accounts confirmed under 13 will be deleted immediately.',
    },
    changes: {
      title: '8. Changes to This Policy',
      body: 'For material changes, we will notify you by email at least 14 days before the change takes effect.',
    },
    contact: {
      title: '9. Contact',
      body: 'Any question: support@myavatar.ge',
    },
  },
  ru: {
    title: 'Политика конфиденциальности',
    effective: 'Действует с 18 мая 2026 г.',
    back: '← Назад на главную',
    controller: {
      title: '1. Контролёр данных',
      body: 'MyAvatar работает с территории Грузии. По любым вопросам конфиденциальности: support@myavatar.ge',
    },
    data: {
      title: '2. Какие данные мы собираем и зачем',
      body: 'Мы собираем только те данные, которые необходимы для работы сервиса.',
      cols: { what: 'Данные', why: 'Цель', basis: 'Основание' },
      rows: [
        { what: 'Адрес электронной почты', why: 'Создание аккаунта, аутентификация', basis: 'Исполнение договора' },
        { what: 'Имя (опц.)',              why: 'Персонализация',                  basis: 'Согласие' },
        { what: 'Телефон (опц.)',          why: 'Уведомления безопасности',         basis: 'Согласие' },
        { what: 'Запросы пользователя',     why: 'Генерация AI контента',           basis: 'Исполнение договора' },
        { what: 'Сгенерированный медиа',    why: 'Просмотр, скачивание, шеринг',     basis: 'Исполнение договора' },
        { what: 'Фото / голос. сэмпл',      why: 'Создание аватара или клона голоса', basis: 'Явное согласие' },
        { what: 'История покупок',          why: 'Расчёты, защита от мошенничества', basis: 'Юр. обязательство' },
        { what: 'ID устройства, IP, логи',  why: 'Безопасность, мониторинг ошибок',  basis: 'Законный интерес' },
      ],
    },
    share: {
      title: '3. С кем мы делимся данными',
      body: 'Данные передаются только третьим сторонам, необходимым для работы сервиса. Мы никогда не продаём данные.',
      cols: { who: 'Получатель', what: 'Что передаётся' },
      rows: [
        { who: 'Supabase (ЕС)',                    what: 'Аккаунт, запросы, сгенерированный медиа' },
        { who: 'Stripe (ЕС/США)',                  what: 'Имя, email, способ оплаты' },
        { who: 'Anthropic Claude',                  what: 'Только запросы' },
        { who: 'Google Gemini',                     what: 'Только запросы' },
        { who: 'Replicate / HeyGen / LTX / Udio',   what: 'Запрос + (опц.) фото/аудио' },
        { who: 'ElevenLabs',                        what: 'Текст + (опц.) образец голоса' },
        { who: 'Vapi.ai',                           what: 'Аудио-поток во время звонка' },
        { who: 'Sentry, PostHog, Vercel Analytics', what: 'Стек ошибок, анонимные события, метрики производительности' },
      ],
    },
    retention: {
      title: '4. Сроки хранения',
      body: 'Данные аккаунта хранятся до его удаления. Записи о платежах — 5 лет (требование закона). Сгенерированный медиа — до удаления вами.',
    },
    rights: {
      title: '5. Ваши права',
      items: [
        'Доступ к вашим данным',
        'Исправление неточных данных',
        'Удаление ("право быть забытым")',
        'Перенос в другой сервис',
        'Ограничение обработки',
        'Отзыв любого согласия',
        'Жалоба в Службу защиты персональных данных Грузии',
      ],
    },
    security: {
      title: '6. Безопасность',
      body: 'Данные передаются по TLS. Пароли никогда не хранятся открыто. Сервис использует Sentry для мониторинга ошибок и Upstash Redis для rate-limiting.',
    },
    children: {
      title: '7. Дети',
      body: 'Сервис не предназначен для детей до 13 лет. Подтверждённые аккаунты младше 13 лет будут немедленно удалены.',
    },
    changes: {
      title: '8. Изменения политики',
      body: 'О существенных изменениях вы будете уведомлены по email не позднее, чем за 14 дней до вступления в силу.',
    },
    contact: {
      title: '9. Контакты',
      body: 'Любой вопрос: support@myavatar.ge',
    },
  },
};

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
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

        <Section title={t.controller.title}>{t.controller.body}</Section>

        <Section title={t.data.title}>
          <p className="mb-4">{t.data.body}</p>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-white/70">
                <tr>
                  <th className="text-left px-3 py-2">{t.data.cols.what}</th>
                  <th className="text-left px-3 py-2">{t.data.cols.why}</th>
                  <th className="text-left px-3 py-2">{t.data.cols.basis}</th>
                </tr>
              </thead>
              <tbody>
                {t.data.rows.map(r => (
                  <tr key={r.what} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 text-white">{r.what}</td>
                    <td className="px-3 py-2 text-white/80">{r.why}</td>
                    <td className="px-3 py-2 text-white/65">{r.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t.share.title}>
          <p className="mb-4">{t.share.body}</p>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-white/70">
                <tr>
                  <th className="text-left px-3 py-2">{t.share.cols.who}</th>
                  <th className="text-left px-3 py-2">{t.share.cols.what}</th>
                </tr>
              </thead>
              <tbody>
                {t.share.rows.map(r => (
                  <tr key={r.who} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 text-white">{r.who}</td>
                    <td className="px-3 py-2 text-white/80">{r.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t.retention.title}>{t.retention.body}</Section>

        <Section title={t.rights.title}>
          <ul className="space-y-1.5 list-disc pl-5 text-white/85">
            {t.rights.items.map(item => <li key={item}>{item}</li>)}
          </ul>
        </Section>

        <Section title={t.security.title}>{t.security.body}</Section>
        <Section title={t.children.title}>{t.children.body}</Section>
        <Section title={t.changes.title}>{t.changes.body}</Section>
        <Section title={t.contact.title}>{t.contact.body}</Section>

        <Link href={`/${locale}`} className="inline-block text-sm text-violet-300 hover:text-violet-200 transition">
          {t.back}
        </Link>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="text-white/80 leading-relaxed">{children}</div>
    </section>
  );
}
