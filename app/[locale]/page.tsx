'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
  Check,
  ArrowRight,
  Shield,
  Sparkles
} from 'lucide-react';
import { Hero } from '@/components/landing/Hero';

type Plan = {
  id: 'free' | 'basic' | 'premium' | 'agentg';
  icon: string;
  name: string;
  priceMonthly: number;
  tag: string;
  features: string[];
  cta: string;
  reassurance?: string;
  popular?: boolean;
};

export default function HomePage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [showAnchorOrder, setShowAnchorOrder] = useState(true);

  const pageContent = {
    en: {
      painTitle: 'Time gets wasted. Results are inconsistent.',
      painText: 'Too many manual steps, fragmented workflows, and unstable quality.',
      solutionTitle: 'Solution',
      solutionText: 'Avatar G automates and orchestrates your process so you can focus on outcomes.',
      socialProofTitle: 'Used by professionals',
      socialProofItems: ['Businesses', 'Agencies', 'Creators', 'Startups'],
      metrics: ['1000+ completed projects', '95% customer satisfaction'],
      safeStartTitle: 'Start safely',
      safeStartItems: ['Free to start', 'Easy cancellation', 'Data protection', 'Transparent pricing'],
      pricingTitle: 'Choose your plan',
      pricingSubtitle: 'Start free and scale features as needed.',
      monthly: 'Monthly',
      yearly: 'Yearly (save 20%)',
      yearlySavings: 'Yearly savings are applied compared to monthly pricing.',
      cycleMonthly: 'month',
      cycleYearly: 'year',
      anchorHint: 'Higher-tier package appears first for comparison context.',
      popular: 'Most popular',
      agentTitle: 'Agent G — your personal AI partner',
      agentText: 'Plans, creates, and manages workflows for you. Built for business growth.',
      agentCta: 'Use Agent G',
      agentSteps: ['Task planning', 'Automatic content creation', 'Result management and optimization'],
      enterpriseTitle: 'Enterprise solution for businesses',
      enterpriseText: 'Scalable AI infrastructure with multi-user support and high performance.',
      enterpriseItems: ['Multi-tenant architecture', 'White-label support', 'High-load operations', 'Security standards'],
      plans: {
        free: {
          name: 'Free', tag: 'To get started', features: ['Core features', 'Limited usage', 'Standard speed'], cta: 'Start free', reassurance: 'No card required'
        },
        basic: {
          name: 'Basic', tag: 'For daily use', features: ['Higher limits', 'Faster processing', 'More services', 'Email support'], cta: 'Choose Basic', reassurance: 'Best for small businesses'
        },
        premium: {
          name: 'Premium', tag: 'For professionals', features: ['High limits', 'Priority speed', 'Advanced capabilities', 'Priority support'], cta: 'Choose Premium'
        },
        agentg: {
          name: 'Agent G Full', tag: 'Full automation', features: ['Unlimited usage', 'Full AI agent', 'Maximum performance', 'Dedicated support'], cta: 'Choose full package'
        },
      },
    },
    ka: {
      painTitle: 'დრო იკარგება. შედეგი არ არის საკმარისი.',
      painText: 'ბევრი ნაბიჯი ხელით კეთდება, პროცესები იშლება და ხარისხი სტაბილური არ არის.',
      solutionTitle: 'გამოსავალი',
      solutionText: 'Avatar G ავტომატურად ქმნის და მართავს პროცესებს, რომ შენ კონცენტრირდე მთავარზე.',
      socialProofTitle: 'გამოიყენება პროფესიონალების მიერ',
      socialProofItems: ['ბიზნესები', 'სააგენტოები', 'კონტენტის შემქმნელები', 'სტარტაპები'],
      metrics: ['1000+ შექმნილი პროექტი', '95% კმაყოფილი მომხმარებელი'],
      safeStartTitle: 'დაიწყე უსაფრთხოდ',
      safeStartItems: ['უფასო დაწყება', 'მარტივი გაუქმება', 'მონაცემთა დაცვა', 'გამჭვირვალე ტარიფები'],
      pricingTitle: 'აირჩიე შენი ტარიფი',
      pricingSubtitle: 'დაიწყე უფასოდ და გაზარდე შესაძლებლობები საჭიროების მიხედვით.',
      monthly: 'თვეში',
      yearly: 'წლიურად (დაზოგე 20%)',
      yearlySavings: 'თვიურ გეგმასთან შედარებით წლიური დაზოგვა გათვალისწინებულია.',
      cycleMonthly: 'თვეში',
      cycleYearly: 'წელიწადში',
      anchorHint: 'საწყისი შედარებისთვის პირველ რიგში ნაჩვენებია მაღალი პაკეტი.',
      popular: 'ყველაზე პოპულარული',
      agentTitle: 'Agent G — შენი პირადი AI პარტნიორი',
      agentText: 'გეგმავს, ქმნის და მართავს პროცესებს შენს მაგივრად. შექმნილია ბიზნესის ზრდისთვის.',
      agentCta: 'Agent G-ის გამოყენება',
      agentSteps: ['დავალების დაგეგმვა', 'კონტენტის ავტომატური შექმნა', 'შედეგების მართვა და გაუმჯობესება'],
      enterpriseTitle: 'Enterprise გადაწყვეტილება ბიზნესებისთვის',
      enterpriseText: 'მასშტაბირებადი AI ინფრასტრუქტურა მრავალმომხმარებლიანი მხარდაჭერით და მაღალი წარმადობით.',
      enterpriseItems: ['Multi-tenant არქიტექტურა', 'White-label მხარდაჭერა', 'მაღალი დატვირთვის მართვა', 'უსაფრთხოების სტანდარტები'],
      plans: {
        free: {
          name: 'უფასო', tag: 'დასაწყებად', features: ['ძირითადი ფუნქციები', 'შეზღუდული გამოყენება', 'სტანდარტული სიჩქარე'], cta: 'უფასოდ დაწყება', reassurance: 'არ არის საჭირო ბარათი'
        },
        basic: {
          name: 'Basic', tag: 'ყოველდღიური გამოყენებისთვის', features: ['გაზრდილი ლიმიტები', 'სწრაფი დამუშავება', 'მეტი სერვისი', 'ელფოსტით მხარდაჭერა'], cta: 'არჩევა', reassurance: 'საუკეთესო არჩევანი მცირე ბიზნესისთვის'
        },
        premium: {
          name: 'Premium', tag: 'პროფესიონალებისთვის', features: ['მაღალი ლიმიტები', 'პრიორიტეტული სიჩქარე', 'გაფართოებული შესაძლებლობები', 'პრიორიტეტული მხარდაჭერა'], cta: 'Premium არჩევა'
        },
        agentg: {
          name: 'Agent G Full', tag: 'სრული ავტომატიზაცია', features: ['შეუზღუდავი გამოყენება', 'სრული AI აგენტი', 'მაქსიმალური წარმადობა', 'ინდივიდუალური მხარდაჭერა'], cta: 'სრული პაკეტის არჩევა'
        },
      },
    },
    ru: {
      painTitle: 'Время теряется. Результат нестабилен.',
      painText: 'Слишком много ручных шагов, процессы распадаются, качество нестабильно.',
      solutionTitle: 'Решение',
      solutionText: 'Avatar G автоматизирует и управляет процессами, чтобы вы фокусировались на главном.',
      socialProofTitle: 'Используется профессионалами',
      socialProofItems: ['Бизнесы', 'Агентства', 'Креаторы', 'Стартапы'],
      metrics: ['1000+ реализованных проектов', '95% довольных клиентов'],
      safeStartTitle: 'Начните безопасно',
      safeStartItems: ['Бесплатный старт', 'Простая отмена', 'Защита данных', 'Прозрачные тарифы'],
      pricingTitle: 'Выберите тариф',
      pricingSubtitle: 'Начните бесплатно и масштабируйте возможности по мере роста.',
      monthly: 'В месяц',
      yearly: 'В год (экономия 20%)',
      yearlySavings: 'Годовая экономия уже учтена относительно помесячного тарифа.',
      cycleMonthly: 'месяц',
      cycleYearly: 'год',
      anchorHint: 'Для сравнения сначала показан тариф более высокого уровня.',
      popular: 'Самый популярный',
      agentTitle: 'Agent G — ваш персональный AI-партнёр',
      agentText: 'Планирует, создаёт и управляет процессами вместо вас. Создан для роста бизнеса.',
      agentCta: 'Использовать Agent G',
      agentSteps: ['Планирование задач', 'Автоматическое создание контента', 'Управление и оптимизация результатов'],
      enterpriseTitle: 'Enterprise-решение для бизнеса',
      enterpriseText: 'Масштабируемая AI-инфраструктура с поддержкой командной работы и высокой производительностью.',
      enterpriseItems: ['Multi-tenant архитектура', 'Поддержка white-label', 'Работа под высокой нагрузкой', 'Стандарты безопасности'],
      plans: {
        free: {
          name: 'Бесплатный', tag: 'Для старта', features: ['Базовые функции', 'Ограниченное использование', 'Стандартная скорость'], cta: 'Начать бесплатно', reassurance: 'Карта не требуется'
        },
        basic: {
          name: 'Basic', tag: 'Для ежедневной работы', features: ['Больше лимитов', 'Быстрая обработка', 'Больше сервисов', 'Поддержка по email'], cta: 'Выбрать Basic', reassurance: 'Оптимально для малого бизнеса'
        },
        premium: {
          name: 'Premium', tag: 'Для профессионалов', features: ['Высокие лимиты', 'Приоритетная скорость', 'Расширенные возможности', 'Приоритетная поддержка'], cta: 'Выбрать Premium'
        },
        agentg: {
          name: 'Agent G Full', tag: 'Полная автоматизация', features: ['Неограниченное использование', 'Полный AI-агент', 'Максимальная производительность', 'Выделенная поддержка'], cta: 'Выбрать полный пакет'
        },
      },
    },
  };

  const copy = pageContent[locale as 'en' | 'ka' | 'ru'] ?? pageContent.ka;

  const finalPlanOrder: [Plan, Plan, Plan, Plan] = [
    {
      id: 'free',
      icon: '🟢',
      name: copy.plans.free.name,
      priceMonthly: 0,
      tag: copy.plans.free.tag,
      features: copy.plans.free.features,
      cta: copy.plans.free.cta,
      reassurance: copy.plans.free.reassurance,
    },
    {
      id: 'basic',
      icon: '🔵',
      name: copy.plans.basic.name,
      priceMonthly: 39,
      tag: copy.plans.basic.tag,
      features: copy.plans.basic.features,
      cta: copy.plans.basic.cta,
      reassurance: copy.plans.basic.reassurance,
      popular: true,
    },
    {
      id: 'premium',
      icon: '🟣',
      name: copy.plans.premium.name,
      priceMonthly: 150,
      tag: copy.plans.premium.tag,
      features: copy.plans.premium.features,
      cta: copy.plans.premium.cta,
    },
    {
      id: 'agentg',
      icon: '🟡',
      name: copy.plans.agentg.name,
      priceMonthly: 500,
      tag: copy.plans.agentg.tag,
      features: copy.plans.agentg.features,
      cta: copy.plans.agentg.cta,
    },
  ];

  const anchorPlanOrder: Plan[] = [
    finalPlanOrder.find((plan) => plan.id === 'agentg')!,
    finalPlanOrder.find((plan) => plan.id === 'premium')!,
    finalPlanOrder.find((plan) => plan.id === 'basic')!,
    finalPlanOrder.find((plan) => plan.id === 'free')!,
  ];

  useEffect(() => {
    const timer = setTimeout(() => setShowAnchorOrder(false), 850);
    return () => clearTimeout(timer);
  }, []);

  const plans = showAnchorOrder ? anchorPlanOrder : finalPlanOrder;

  const resolvePrice = (priceMonthly: number) => {
    if (interval === 'monthly') {
      return priceMonthly;
    }
    return Math.round(priceMonthly * 12 * 0.8);
  };

  const resolveCycleLabel = interval === 'monthly' ? copy.cycleMonthly : copy.cycleYearly;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-10 top-36 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="absolute left-10 top-44 h-24 w-24 rounded-full border border-cyan-300/20" />
        <div className="absolute bottom-0 left-0 h-32 w-full bg-gradient-to-t from-cyan-500/5 to-transparent" />
        <div
          className="absolute bottom-0 left-0 h-20 w-full opacity-20"
          style={{
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(148,163,184,0.35) 0 3px, transparent 3px 18px)',
            maskImage: 'linear-gradient(to top, black, transparent)',
          }}
        />
      </div>

      <Hero locale={locale} />

      <section className="px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="mx-auto grid max-w-6xl gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur md:grid-cols-2 md:p-10"
        >
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <h2 className="text-2xl font-bold text-white">{copy.painTitle}</h2>
            <p className="mt-4 text-slate-300">
              {copy.painText}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-6">
            <h3 className="text-2xl font-bold text-white">{copy.solutionTitle}</h3>
            <p className="mt-4 text-slate-200">
              {copy.solutionText}
            </p>
          </div>
        </motion.div>
      </section>

      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-white md:text-4xl">{copy.socialProofTitle}</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {copy.socialProofItems.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-slate-100 backdrop-blur">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {copy.metrics.map((metric) => (
              <div key={metric} className="rounded-2xl border border-cyan-400/30 bg-slate-900/70 p-6 text-center text-xl font-semibold text-cyan-200 shadow-lg shadow-cyan-500/10">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur md:p-10">
          <h2 className="text-3xl font-bold text-white">{copy.safeStartTitle}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {copy.safeStartItems.map((point) => (
              <div key={point} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3">
                <Shield className="h-4 w-4 text-cyan-300" />
                <span className="text-slate-200">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16" id="pricing">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white md:text-4xl">{copy.pricingTitle}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-300">
              {copy.pricingSubtitle}
            </p>
          </div>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur">
              <button
                onClick={() => setInterval('monthly')}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  interval === 'monthly' ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-300'
                }`}
              >
                {copy.monthly}
              </button>
              <button
                onClick={() => setInterval('yearly')}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  interval === 'yearly' ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-300'
                }`}
              >
                {copy.yearly}
              </button>
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-slate-400">{copy.anchorHint}</p>

          <div className="mt-8 grid gap-5 lg:grid-cols-4">
            {plans.map((plan) => {
              const price = resolvePrice(plan.priceMonthly);
              const isPopular = Boolean(plan.popular);
              return (
                <motion.div
                  key={plan.id}
                  layout
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`relative rounded-2xl border p-6 backdrop-blur ${
                    isPopular
                      ? 'scale-[1.02] border-cyan-400/50 bg-cyan-500/10 shadow-xl shadow-cyan-500/20'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-1 text-xs font-semibold text-white">
                      {copy.popular}
                    </div>
                  )}

                  <div className="mb-5">
                    <div className="text-2xl">{plan.icon}</div>
                    <h3 className="mt-2 text-2xl font-bold text-white">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-300">{plan.tag}</p>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-end gap-2">
                      <span className="text-4xl font-bold text-white">${price}</span>
                      <span className="pb-1 text-sm text-slate-400">/{resolveCycleLabel}</span>
                    </div>
                    {interval === 'yearly' && (
                      <p className="mt-1 text-xs text-cyan-200">{copy.yearlySavings}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm text-slate-200">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => router.push(`/${locale}/pricing`)}
                    className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold transition ${
                      isPopular
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:opacity-95'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {plan.cta}
                  </button>

                  {plan.reassurance && <p className="mt-2 text-xs text-slate-300">{plan.reassurance}</p>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-8 rounded-3xl border border-cyan-400/30 bg-cyan-500/10 p-6 backdrop-blur md:grid-cols-2 md:p-10">
          <div>
            <h2 className="text-3xl font-bold text-white">{copy.agentTitle}</h2>
            <p className="mt-4 text-slate-200">
              {copy.agentText}
            </p>
            <button
              onClick={() => router.push(`/${locale}/services/agent-g`)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 font-semibold text-white"
            >
              {copy.agentCta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_60%)]" />
            <div className="relative space-y-3">
              {copy.agentSteps.map((step) => (
                <div key={step} className="rounded-lg border border-white/10 bg-white/5 p-3">{step}</div>
              ))}
            </div>
            <div className="absolute -right-3 -top-3 rounded-full border border-cyan-300/40 bg-cyan-500/20 p-2 text-cyan-100">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 pt-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-black/40 p-6 md:p-10">
          <h2 className="text-3xl font-bold text-white">{copy.enterpriseTitle}</h2>
          <p className="mt-4 max-w-3xl text-slate-300">
            {copy.enterpriseText}
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {copy.enterpriseItems.map((point) => (
              <div key={point} className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-slate-200">
                {point}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
