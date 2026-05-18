import Link from 'next/link';

type Lang = 'ka' | 'en' | 'ru';

const copy: Record<Lang, {
  title: string;
  subtitle: string;
  back: string;
  faq: { title: string; items: Array<{ q: string; a: string }> };
  contact: { title: string; email: string; emailLabel: string; responseTimes: string };
  status: { title: string; body: string; link: string };
  issues: { title: string; items: string[] };
}> = {
  ka: {
    title: 'მხარდაჭერა',
    subtitle: 'ხშირად დასმული კითხვები, კონტაქტი და სისტემის სტატუსი',
    back: '← მთავარზე დაბრუნება',
    faq: {
      title: 'ხშირად დასმული კითხვები',
      items: [
        {
          q: 'რამდენი ხანი სჭირდება ავატარის ვიდეოს გენერაციას?',
          a: 'მოკლე სცენარისთვის (≤30 წამი) — 2-დან 5 წუთამდე. გრძელი სცენარისთვის შესაძლოა 5 წუთამდე. გენერაცია ხდება HeyGen-ის სერვერებზე და გადახდილია მხოლოდ თქვენი დარჩენილი კრედიტებიდან.',
        },
        {
          q: 'რატომ არ ჩამოიტვირთა ვიდეო?',
          a: 'სამი მიზეზი არსებობს — HeyGen-ის სერვერი დროებით ჩავარდა, თქვენი კრედიტი ამოიწურა, ან ქსელი დახურულია. შეცდომის შემთხვევაში ჩვენ გაჩვენებთ წითელ ბანერს და პირდაპირ ლინკს ვიდეოს გასახსნელად.',
        },
        {
          q: 'შემიძლია გავაუქმო ანგარიში და მონაცემები წავშალო?',
          a: 'დიახ. გვწერეთ support@myavatar.ge და ანგარიში + ყველა მონაცემი წაიშლება 30 დღის განმავლობაში. გადახდის ჩანაწერები ინახება 5 წელიწადი — საქართველოს კანონის შესაბამისად.',
        },
        {
          q: 'რომელ ბრაუზერებში მუშაობს?',
          a: 'Safari 17+, Chrome 120+, Firefox 121+, Edge 120+. iPhone-ისთვის — iOS 17+. PWA-ის სტანდარტული "Add to Home Screen" დაყენებაც მუშაობს.',
        },
        {
          q: 'რა ენებზე საუბრობს?',
          a: 'AI ჩატი — ქართულად, ინგლისურად, რუსულად. ხმოვანი (TTS) — 30+ ენაზე. ვიდეო-ავატარი — ინგლისურად ყველაზე ხარისხიანი (ქართული ხმოვანი ჯერ ბეტაშია).',
        },
        {
          q: 'შემიძლია გავყიდო ჩემი გენერირებული კონტენტი?',
          a: 'დიახ — გენერირებული მედია მთლიანად ეკუთვნით თქვენ. გასათვალისწინებელია მესამე-მხარის სერვისების (HeyGen, Replicate და ა.შ.) საკუთარი ლიცენზიის პირობებიც.',
        },
        {
          q: 'როგორ მუშაობს გადახდა?',
          a: 'Stripe Checkout-ის მეშვეობით. ვერც ჩვენ ვერც ჩვენი სერვერი ვერ ვინახავთ საბანკო ბარათის რეკვიზიტებს. ხელმოწერა — თვიური, გაუქმება — ნებისმიერ მომენტში.',
        },
      ],
    },
    contact: {
      title: 'პირდაპირი კონტაქტი',
      email: 'support@myavatar.ge',
      emailLabel: 'ელფოსტა',
      responseTimes: 'პასუხის დრო: 24 საათამდე სამუშაო დღეებში.',
    },
    status: {
      title: 'სისტემის სტატუსი',
      body: 'რეალურ დროში სტატუსი 12 პროვაიდერისთვის (HeyGen, Replicate, LTX, Udio, ElevenLabs, Anthropic, Gemini, Stripe, Supabase, Sentry, Vercel, Upstash) ხელმისაწვდომია მთავარ ჩათში ზედა მარჯვენა ღილაკზე დაჭერით.',
      link: 'სტატუსის ნახვა →',
    },
    issues: {
      title: 'უცებ რას ვცადო, თუ რამე არ მუშაობს',
      items: [
        'გაატარეთ გვერდი (hard reload): Cmd+Shift+R (Mac), Ctrl+F5 (PC).',
        'შეცვალეთ ბრაუზერი ან გათიშეთ ad-blocker.',
        'შეამოწმეთ კრედიტი — Billing panel-ში.',
        'სცადეთ ფანჯრის გადატვირთვა და ხელახლა გაგზავნა.',
        'თუ ბაგი მუდმივია — გვწერეთ ეკრანის სურათით.',
      ],
    },
  },
  en: {
    title: 'Support',
    subtitle: 'Frequently asked questions, direct contact, and system status',
    back: '← Back home',
    faq: {
      title: 'Frequently Asked Questions',
      items: [
        {
          q: 'How long does avatar video generation take?',
          a: 'For a short script (≤30 sec) — 2 to 5 minutes. Longer scripts can take up to 5 minutes. Generation runs on HeyGen and is paid for from your remaining credits.',
        },
        {
          q: 'Why didn\'t my video load?',
          a: 'Three possible causes — HeyGen had a transient outage, your credit ran out, or your network is offline. On error we show a red banner with a direct link to open the video.',
        },
        {
          q: 'Can I delete my account and data?',
          a: 'Yes. Email support@myavatar.ge and your account plus all data will be deleted within 30 days. Purchase records are retained for 5 years per Georgian law.',
        },
        {
          q: 'Which browsers are supported?',
          a: 'Safari 17+, Chrome 120+, Firefox 121+, Edge 120+. iPhone — iOS 17+. The standard PWA "Add to Home Screen" install also works.',
        },
        {
          q: 'What languages are supported?',
          a: 'AI chat — Georgian, English, Russian. Voice (TTS) — 30+ languages. Video avatar — English is the highest quality (Georgian voice is in beta).',
        },
        {
          q: 'Can I sell my generated content?',
          a: 'Yes — generated media is yours entirely. Note that the third-party providers (HeyGen, Replicate, etc.) also have their own license terms.',
        },
        {
          q: 'How does billing work?',
          a: 'Through Stripe Checkout. Neither we nor our server store your card details. Subscription is monthly; cancel any time.',
        },
      ],
    },
    contact: {
      title: 'Direct Contact',
      email: 'support@myavatar.ge',
      emailLabel: 'Email',
      responseTimes: 'Response time: under 24 hours on business days.',
    },
    status: {
      title: 'System Status',
      body: 'Live status for all 12 providers (HeyGen, Replicate, LTX, Udio, ElevenLabs, Anthropic, Gemini, Stripe, Supabase, Sentry, Vercel, Upstash) is available from the chat top-right button.',
      link: 'View status →',
    },
    issues: {
      title: 'Quick things to try if something\'s broken',
      items: [
        'Hard reload the page: Cmd+Shift+R (Mac), Ctrl+F5 (PC).',
        'Try a different browser or disable your ad-blocker.',
        'Check your credits in the Billing panel.',
        'Reload the window and resend.',
        'If the bug persists — email us with a screenshot.',
      ],
    },
  },
  ru: {
    title: 'Поддержка',
    subtitle: 'Частые вопросы, прямой контакт и состояние сервиса',
    back: '← Назад на главную',
    faq: {
      title: 'Частые вопросы',
      items: [
        {
          q: 'Сколько занимает генерация видео-аватара?',
          a: 'Короткий сценарий (≤30 сек) — от 2 до 5 минут. Длинные — до 5 минут. Генерация выполняется на серверах HeyGen и оплачивается из ваших кредитов.',
        },
        {
          q: 'Почему видео не загрузилось?',
          a: 'Три возможные причины — HeyGen временно недоступен, кончились кредиты, или нет сети. При ошибке мы показываем красный баннер с прямой ссылкой на видео.',
        },
        {
          q: 'Можно ли удалить аккаунт и все данные?',
          a: 'Да. Напишите на support@myavatar.ge — аккаунт и все данные будут удалены в течение 30 дней. Записи об оплатах хранятся 5 лет по закону Грузии.',
        },
        {
          q: 'Какие браузеры поддерживаются?',
          a: 'Safari 17+, Chrome 120+, Firefox 121+, Edge 120+. iPhone — iOS 17+. Также работает PWA "Add to Home Screen".',
        },
        {
          q: 'Какие языки поддерживаются?',
          a: 'AI-чат — грузинский, английский, русский. Голос (TTS) — 30+ языков. Видео-аватар — лучшее качество на английском (грузинский голос в бете).',
        },
        {
          q: 'Можно ли продавать сгенерированный контент?',
          a: 'Да — сгенерированный медиа полностью принадлежит вам. Помните о лицензионных условиях провайдеров (HeyGen, Replicate и пр.).',
        },
        {
          q: 'Как работает оплата?',
          a: 'Через Stripe Checkout. Ни мы, ни наш сервер не хранят данные карты. Подписка — помесячная, отмена в любой момент.',
        },
      ],
    },
    contact: {
      title: 'Прямой контакт',
      email: 'support@myavatar.ge',
      emailLabel: 'Email',
      responseTimes: 'Время ответа: до 24 часов в рабочие дни.',
    },
    status: {
      title: 'Состояние системы',
      body: 'Статус в реальном времени для 12 провайдеров (HeyGen, Replicate, LTX, Udio, ElevenLabs, Anthropic, Gemini, Stripe, Supabase, Sentry, Vercel, Upstash) доступен по кнопке в правом верхнем углу чата.',
      link: 'Посмотреть статус →',
    },
    issues: {
      title: 'Быстрые шаги, если что-то сломалось',
      items: [
        'Принудительная перезагрузка: Cmd+Shift+R (Mac), Ctrl+F5 (PC).',
        'Попробуйте другой браузер или отключите ad-blocker.',
        'Проверьте кредиты в панели Billing.',
        'Перезагрузите окно и отправьте запрос ещё раз.',
        'Если ошибка повторяется — напишите нам со скриншотом.',
      ],
    },
  },
};

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lang: Lang = locale === 'ka' || locale === 'ru' ? locale : 'en';
  const t = copy[lang];

  return (
    <section className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-white/55">{t.subtitle}</p>
        </header>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{t.faq.title}</h2>
          <div className="space-y-2">
            {t.faq.items.map(item => (
              <details
                key={item.q}
                className="group rounded-xl border border-white/[0.08] bg-white/[0.02] open:bg-white/[0.04] transition"
              >
                <summary className="cursor-pointer list-none px-4 py-3 flex items-start justify-between gap-3">
                  <span className="text-[15px] font-medium text-white">{item.q}</span>
                  <span className="text-white/40 group-open:rotate-45 transition-transform select-none mt-0.5">+</span>
                </summary>
                <div className="px-4 pb-4 text-[14px] text-white/75 leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.contact.title}</h2>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/55">{t.contact.emailLabel}:</span>
              <a href={`mailto:${t.contact.email}`} className="text-violet-300 hover:text-violet-200 transition underline-offset-4 hover:underline">
                {t.contact.email}
              </a>
            </div>
            <p className="text-xs text-white/55">{t.contact.responseTimes}</p>
          </div>
        </section>

        {/* System status */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.status.title}</h2>
          <p className="text-white/80 leading-relaxed">{t.status.body}</p>
          <Link href={`/${locale}/dashboard`} className="inline-block text-sm text-violet-300 hover:text-violet-200 transition">
            {t.status.link}
          </Link>
        </section>

        {/* Quick troubleshooting */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t.issues.title}</h2>
          <ol className="space-y-1.5 list-decimal pl-5 text-white/85">
            {t.issues.items.map(item => <li key={item}>{item}</li>)}
          </ol>
        </section>

        <Link href={`/${locale}`} className="inline-block text-sm text-violet-300 hover:text-violet-200 transition">
          {t.back}
        </Link>
      </div>
    </section>
  );
}
