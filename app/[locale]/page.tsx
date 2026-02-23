'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
  Check,
  ArrowRight,
  PlayCircle,
  Shield,
  Sparkles
} from 'lucide-react';
import { RocketLogo } from '@/components/ui/RocketLogo';

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

const finalPlanOrder: [Plan, Plan, Plan, Plan] = [
  {
    id: 'free',
    icon: '🟢',
    name: 'უფასო',
    priceMonthly: 0,
    tag: 'დასაწყებად',
    features: ['ძირითადი ფუნქციები', 'შეზღუდული გამოყენება', 'სტანდარტული სიჩქარე'],
    cta: 'უფასოდ დაწყება',
    reassurance: 'არ არის საჭირო ბარათი',
  },
  {
    id: 'basic',
    icon: '🔵',
    name: 'Basic',
    priceMonthly: 39,
    tag: 'ყოველდღიური გამოყენებისთვის',
    features: ['გაზრდილი ლიმიტები', 'სწრაფი დამუშავება', 'მეტი სერვისი', 'ელფოსტით მხარდაჭერა'],
    cta: 'არჩევა',
    reassurance: 'საუკეთესო არჩევანი მცირე ბიზნესისთვის',
    popular: true,
  },
  {
    id: 'premium',
    icon: '🟣',
    name: 'Premium',
    priceMonthly: 150,
    tag: 'პროფესიონალებისთვის',
    features: ['მაღალი ლიმიტები', 'პრიორიტეტული სიჩქარე', 'გაფართოებული შესაძლებლობები', 'პრიორიტეტული მხარდაჭერა'],
    cta: 'Premium არჩევა',
  },
  {
    id: 'agentg',
    icon: '🟡',
    name: 'Agent G Full',
    priceMonthly: 500,
    tag: 'სრული ავტომატიზაცია',
    features: ['შეუზღუდავი გამოყენება', 'სრული AI აგენტი', 'მაქსიმალური წარმადობა', 'ინდივიდუალური მხარდაჭერა'],
    cta: 'სრული პაკეტის არჩევა',
  },
];

const anchorPlanOrder: Plan[] = [
  finalPlanOrder.find((plan) => plan.id === 'agentg')!,
  finalPlanOrder.find((plan) => plan.id === 'premium')!,
  finalPlanOrder.find((plan) => plan.id === 'basic')!,
  finalPlanOrder.find((plan) => plan.id === 'free')!,
];

export default function HomePage() {
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const locale = params.locale;
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [showAnchorOrder, setShowAnchorOrder] = useState(true);

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

  const resolveCycleLabel = interval === 'monthly' ? 'თვეში' : 'წელიწადში';

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

      <section className="relative px-4 pb-20 pt-28">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            <RocketLogo size="md" animated glow />
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1 text-sm text-cyan-200">
              Georgian-first AI პლატფორმა
            </span>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mx-auto max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl"
          >
            AI პლატფორმა, რომელიც{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-blue-300 to-cyan-300 bg-[length:200%_200%] bg-clip-text text-transparent animate-pulse">
              მუშაობს შენთვის
            </span>
          </motion.h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-300 md:text-xl">
            შექმენი ტექსტი, სურათი, ვიდეო და ავტომატიზაცია ერთ სივრცეში — სწრაფად და პროფესიონალურად.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={() => router.push(`/${locale}/workspace`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-8 py-4 font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:scale-[1.02]"
            >
              დაწყება
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push(`/${locale}/services`)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 font-semibold text-white transition hover:bg-white/10"
            >
              როგორ მუშაობს
              <PlayCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {['სრულად ქართულად', 'უსაფრთხო სისტემა', 'ბიზნესებისთვის მზად'].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.55 }}
          className="mx-auto grid max-w-6xl gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur md:grid-cols-2 md:p-10"
        >
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <h2 className="text-2xl font-bold text-white">დრო იკარგება. შედეგი არ არის საკმარისი.</h2>
            <p className="mt-4 text-slate-300">
              ბევრი ნაბიჯი ხელით კეთდება, პროცესები იშლება და ხარისხი სტაბილური არ არის.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-6">
            <h3 className="text-2xl font-bold text-white">გამოსავალი</h3>
            <p className="mt-4 text-slate-200">
              Avatar G ავტომატურად ქმნის და მართავს პროცესებს, რომ შენ კონცენტრირდე მთავარზე.
            </p>
          </div>
        </motion.div>
      </section>

      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold text-white md:text-4xl">გამოიყენება პროფესიონალების მიერ</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {['ბიზნესები', 'სააგენტოები', 'კონტენტის შემქმნელები', 'სტარტაპები'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-slate-100 backdrop-blur">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {['1000+ შექმნილი პროექტი', '95% კმაყოფილი მომხმარებელი'].map((metric) => (
              <div key={metric} className="rounded-2xl border border-cyan-400/30 bg-slate-900/70 p-6 text-center text-xl font-semibold text-cyan-200 shadow-lg shadow-cyan-500/10">
                {metric}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur md:p-10">
          <h2 className="text-3xl font-bold text-white">დაიწყე უსაფრთხოდ</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {['უფასო დაწყება', 'მარტივი გაუქმება', 'მონაცემთა დაცვა', 'გამჭვირვალე ტარიფები'].map((point) => (
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
            <h2 className="text-3xl font-bold text-white md:text-4xl">აირჩიე შენი ტარიფი</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-300">
              დაიწყე უფასოდ და გაზარდე შესაძლებლობები საჭიროების მიხედვით.
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
                თვეში
              </button>
              <button
                onClick={() => setInterval('yearly')}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                  interval === 'yearly' ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-300'
                }`}
              >
                წლიურად (დაზოგე 20%)
              </button>
            </div>
          </div>

          <p className="mt-3 text-center text-xs text-slate-400">საწყისი შედარებისთვის პირველ რიგში ნაჩვენებია მაღალი პაკეტი.</p>

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
                      ყველაზე პოპულარული
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
                      <p className="mt-1 text-xs text-cyan-200">თვიურ გეგმასთან შედარებით წლიური დაზოგვა გათვალისწინებულია.</p>
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
            <h2 className="text-3xl font-bold text-white">Agent G — შენი პირადი AI პარტნიორი</h2>
            <p className="mt-4 text-slate-200">
              გეგმავს, ქმნის და მართავს პროცესებს შენს მაგივრად. შექმნილია ბიზნესის ზრდისთვის.
            </p>
            <button
              onClick={() => router.push(`/${locale}/services/agent-g`)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 font-semibold text-white"
            >
              Agent G-ის გამოყენება
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-slate-900/70 p-6">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_60%)]" />
            <div className="relative space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">დავალების დაგეგმვა</div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">კონტენტის ავტომატური შექმნა</div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">შედეგების მართვა და გაუმჯობესება</div>
            </div>
            <div className="absolute -right-3 -top-3 rounded-full border border-cyan-300/40 bg-cyan-500/20 p-2 text-cyan-100">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 pt-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-black/40 p-6 md:p-10">
          <h2 className="text-3xl font-bold text-white">Enterprise გადაწყვეტილება ბიზნესებისთვის</h2>
          <p className="mt-4 max-w-3xl text-slate-300">
            მასშტაბირებადი AI ინფრასტრუქტურა მრავალმომხმარებლიანი მხარდაჭერით და მაღალი წარმადობით.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {['Multi-tenant არქიტექტურა', 'White-label მხარდაჭერა', 'მაღალი დატვირთვის მართვა', 'უსაფრთხოების სტანდარტები'].map((point) => (
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
