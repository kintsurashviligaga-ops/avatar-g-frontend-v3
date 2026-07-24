import Link from 'next/link';
import type { Metadata } from 'next';
import { localeAlternates } from '@/lib/seo/hreflang';

// Iteration 2 — DISTINCT localized title (was inheriting the homepage title) + per-route hreflang/self-canonical.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return { title: copy[lang].title, alternates: localeAlternates(locale, '/refund') };
}

type Lang = 'ka' | 'en' | 'ru';

// PHASE 39.5 (Master Contract V2) — Refund Policy. A dedicated, bank-approval-ready page (Georgian
// e-commerce compliance): AI generation incurs direct, non-refundable compute costs, refund requests are
// evaluated individually, and credit balances are non-transferable. Mirrors the /terms page structure.
const copy: Record<Lang, {
  title: string;
  effective: string;
  intro: string;
  back: string;
  contact: string;
  sections: Array<{ title: string; body: string }>;
}> = {
  ka: {
    title: 'თანხის დაბრუნების პოლიტიკა',
    effective: 'მოქმედებს: 2026 წლის 16 ივლისიდან',
    intro: 'ეს პოლიტიკა განმარტავს, თუ როგორ განიხილება თანხის დაბრუნების მოთხოვნები MyAvatar-ზე. გთხოვთ, ყურადღებით გაეცნოთ ვიდრე შეიძენთ კრედიტს ან ხელმოწერას.',
    back: '← მთავარზე დაბრუნება',
    contact: 'დაბრუნების მოთხოვნისთვის მოგვწერეთ:',
    sections: [
      {
        title: '1. ძირითადი პრინციპი',
        body: 'AI კონტენტის გენერაცია იწვევს პირდაპირ, დაუბრუნებელ გამომთვლელ (compute) ხარჯს ჩვენს დამხმარე მესამე-მხარის სერვისებზე (Runway, Replicate, HeyGen, ElevenLabs და სხვ.). ვინაიდან ეს ხარჯი უკვე გაწეულია გენერაციის მომენტში, წარმატებით შესრულებული გენერაცია, როგორც წესი, დაბრუნებას არ ექვემდებარება.',
      },
      {
        title: '2. ინდივიდუალური განხილვა',
        body: 'თანხის დაბრუნების ყოველი მოთხოვნა განიხილება ინდივიდუალურად, კეთილსინდისიერების პრინციპით. თუ თანხა ჩამოგეჭრათ, მაგრამ სერვისი ტექნიკური ხარვეზის გამო საერთოდ არ იმუშავა, ჩვენ დაგიბრუნებთ შესაბამის კრედიტს ან თანხას.',
      },
      {
        title: '3. გენერაციის ჩავარდნა — ავტომატური დაბრუნება',
        body: 'თუ მესამე-მხარის სერვისი ჩაიშლება გენერაციის შუა გზაზე და ეს ჩვენი ბრალი არ არის, ჩამოჭრილი კრედიტი ავტომატურად დაგიბრუნდებათ ბალანსზე — დამატებითი მოთხოვნის გარეშე.',
      },
      {
        title: '4. ხელმოწერის გაუქმება',
        body: 'ხელმოწერის გაუქმება ხელმისაწვდომია ნებისმიერ მომენტში და ძალაში შედის მიმდინარე პერიოდის ბოლოს. უკვე გადახდილი პერიოდის თანხა არ ბრუნდება, თუ ცალკე წერილობით არ შევთანხმდით.',
      },
      {
        title: '5. კრედიტის ბალანსი',
        body: 'შეძენილი კრედიტი განკუთვნილია მხოლოდ სერვისით სარგებლობისთვის. კრედიტის ბალანსი არ არის გადაცემადი სხვა ანგარიშზე, არ განაღდდება ფულად და არ აქვს ვადის გასვლის შემდეგ ღირებულება.',
      },
      {
        title: '6. მოთხოვნის ვადა და პროცედურა',
        body: 'დაბრუნების მოთხოვნა უნდა გამოგზავნოთ ტრანზაქციიდან 14 კალენდარული დღის განმავლობაში, ანგარიშის ელფოსტიდან, ტრანზაქციის იდენტიფიკატორისა და მოკლე აღწერის მითითებით. პასუხს მიიღებთ 7 სამუშაო დღის განმავლობაში; დამტკიცებული დაბრუნება ჩაირიცხება იმავე ბარათზე/მეთოდზე.',
      },
      {
        title: '7. თანხის უკან გამოთხოვა (chargeback)',
        body: 'პრობლემის შემთხვევაში ჯერ დაგვიკავშირდით — ბანკში პირდაპირი დავის (chargeback) დაწყებამდე. ეს გვაძლევს საშუალებას სწრაფად მოვაგვაროთ საკითხი. დაუსაბუთებელი chargeback-ი შესაძლოა გახდეს ანგარიშის შეჩერების საფუძველი.',
      },
    ],
  },
  en: {
    title: 'Refund Policy',
    effective: 'Effective: July 16, 2026',
    intro: 'This policy explains how refund requests are handled at MyAvatar. Please read it carefully before purchasing credits or a subscription.',
    back: '← Back home',
    contact: 'To request a refund, contact us at:',
    sections: [
      {
        title: '1. Core Principle',
        body: 'AI content generation incurs a direct, non-refundable compute cost on our backing third-party providers (Runway, Replicate, HeyGen, ElevenLabs, etc.). Because that cost is already spent at the moment of generation, a successfully completed generation is generally not eligible for a refund.',
      },
      {
        title: '2. Individual Evaluation',
        body: 'Every refund request is evaluated individually and in good faith. If you were charged but the service failed entirely due to a technical fault on our side, we will refund the corresponding credits or amount.',
      },
      {
        title: '3. Generation Failure — Automatic Refund',
        body: 'If a third-party provider fails mid-generation through no fault of ours, the charged credits are refunded to your balance automatically — no separate request needed.',
      },
      {
        title: '4. Subscription Cancellation',
        body: 'You can cancel a subscription at any time; it takes effect at the end of the current period. Any already-paid period is non-refundable unless separately agreed in writing.',
      },
      {
        title: '5. Credit Balance',
        body: 'Purchased credits are for use within the service only. A credit balance is non-transferable to another account, cannot be cashed out, and has no value after expiry.',
      },
      {
        title: '6. Request Window and Procedure',
        body: 'A refund request must be sent within 14 calendar days of the transaction, from the account email, including the transaction ID and a short description. You will receive a reply within 7 business days; an approved refund is returned to the same card / method.',
      },
      {
        title: '7. Chargebacks',
        body: 'If there is a problem, please contact us first — before opening a direct bank dispute (chargeback). This lets us resolve the issue quickly. An unjustified chargeback may be grounds for account suspension.',
      },
    ],
  },
  ru: {
    title: 'Политика возврата средств',
    effective: 'Действует с 16 июля 2026 г.',
    intro: 'Эта политика объясняет, как обрабатываются запросы на возврат средств в MyAvatar. Пожалуйста, внимательно ознакомьтесь перед покупкой кредитов или подписки.',
    back: '← Назад на главную',
    contact: 'Для запроса возврата напишите нам:',
    sections: [
      {
        title: '1. Основной принцип',
        body: 'AI-генерация контента влечёт прямые невозвратные вычислительные (compute) расходы у наших сторонних провайдеров (Runway, Replicate, HeyGen, ElevenLabs и др.). Поскольку эти расходы уже понесены в момент генерации, успешно выполненная генерация, как правило, не подлежит возврату.',
      },
      {
        title: '2. Индивидуальное рассмотрение',
        body: 'Каждый запрос на возврат рассматривается индивидуально и добросовестно. Если средства были списаны, но сервис вовсе не сработал из-за технической ошибки с нашей стороны, мы вернём соответствующие кредиты или сумму.',
      },
      {
        title: '3. Сбой генерации — автоматический возврат',
        body: 'Если сторонний провайдер откажет в процессе генерации не по нашей вине, списанные кредиты возвращаются на баланс автоматически — без отдельного запроса.',
      },
      {
        title: '4. Отмена подписки',
        body: 'Подписку можно отменить в любой момент; она прекращается в конце текущего периода. Уже оплаченный период не возвращается, если отдельно не оговорено письменно.',
      },
      {
        title: '5. Баланс кредитов',
        body: 'Приобретённые кредиты предназначены только для использования внутри сервиса. Баланс кредитов не передаётся на другой аккаунт, не обналичивается и не имеет ценности после истечения срока.',
      },
      {
        title: '6. Срок и порядок запроса',
        body: 'Запрос на возврат должен быть отправлен в течение 14 календарных дней с момента транзакции, с email аккаунта, с указанием идентификатора транзакции и краткого описания. Ответ вы получите в течение 7 рабочих дней; одобренный возврат зачисляется на ту же карту / метод.',
      },
      {
        title: '7. Chargeback',
        body: 'При возникновении проблемы сначала свяжитесь с нами — до открытия прямого банковского спора (chargeback). Это позволит быстро решить вопрос. Необоснованный chargeback может стать основанием для блокировки аккаунта.',
      },
    ],
  },
};

export default async function RefundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const lang: Lang = locale === 'ka' || locale === 'ru' ? locale : 'en';
  const t = copy[lang];

  return (
    <section className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-white/55">{t.effective}</p>
          <p className="text-white/70 leading-relaxed">{t.intro}</p>
        </header>

        {t.sections.map(s => (
          <section key={s.title} className="space-y-3">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="text-white/80 leading-relaxed">{s.body}</p>
          </section>
        ))}

        <p className="text-sm text-white/60">
          {t.contact}{' '}
          <a href="mailto:support@myavatar.ge" className="text-violet-300 hover:text-violet-200 transition">support@myavatar.ge</a>
        </p>

        <div className="flex flex-wrap gap-4 pt-2 text-sm">
          <Link href={`/${locale}/terms`} className="text-white/50 hover:text-white/80 transition">{lang === 'ka' ? 'მომსახურების პირობები' : lang === 'ru' ? 'Условия использования' : 'Terms of Service'}</Link>
          <Link href={`/${locale}/privacy`} className="text-white/50 hover:text-white/80 transition">{lang === 'ka' ? 'კონფიდენციალურობა' : lang === 'ru' ? 'Конфиденциальность' : 'Privacy'}</Link>
          <Link href={`/${locale}`} className="text-violet-300 hover:text-violet-200 transition">{t.back}</Link>
        </div>
      </div>
    </section>
  );
}
