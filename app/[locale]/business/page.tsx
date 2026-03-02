'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/LanguageContext';

const CONTENT: Record<string, { title: string; subtitle: string; cta: string; features: string[] }> = {
  en: {
    title: 'Business Solutions',
    subtitle: 'Enterprise-grade AI tools for your team. Automate content creation, manage brand assets, and scale production.',
    cta: 'Get Started',
    features: [
      'Unlimited AI generations for your team',
      'Brand consistency & asset management',
      'API access for custom integrations',
      'Priority support & SLA guarantee',
      'Custom model training',
      'Team collaboration workspace',
    ],
  },
  ka: {
    title: 'ბიზნეს გადაწყვეტილებები',
    subtitle: 'ენტერპრაიზ დონის AI ინსტრუმენტები თქვენი გუნდისთვის. ავტომატიზირეთ კონტენტის შექმნა, მართეთ ბრენდის აქტივები.',
    cta: 'დაწყება',
    features: [
      'შეუზღუდავი AI გენერაციები გუნდისთვის',
      'ბრენდის თანმიმდევრულობა და აქტივების მართვა',
      'API წვდომა ინტეგრაციებისთვის',
      'პრიორიტეტული მხარდაჭერა & SLA',
      'მოდელის ინდივიდუალური ტრეინინგი',
      'გუნდური თანამშრომლობის სივრცე',
    ],
  },
  ru: {
    title: 'Бизнес решения',
    subtitle: 'AI инструменты корпоративного уровня для вашей команды. Автоматизация контента, управление активами бренда.',
    cta: 'Начать',
    features: [
      'Безлимитные AI генерации для команды',
      'Консистентность бренда и управление активами',
      'API доступ для интеграций',
      'Приоритетная поддержка & SLA',
      'Кастомное обучение моделей',
      'Командное рабочее пространство',
    ],
  },
};

export default function BusinessPage() {
  const { language: locale } = useLanguage();
  const c = CONTENT[locale] ?? CONTENT['en']!;

  return (
    <div className="min-h-screen bg-transparent text-white">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">{c.title}</h1>
        <p className="text-lg text-white/50 max-w-2xl mx-auto mb-12">{c.subtitle}</p>

        <div className="grid sm:grid-cols-2 gap-4 text-left mb-12">
          {c.features.map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <span className="text-cyan-400 mt-0.5">◈</span>
              <span className="text-sm text-white/70">{f}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href={`/${locale}/pricing`}
            className="bg-white text-[#050510] font-semibold px-8 py-3 rounded-xl hover:bg-white/90 transition-all"
          >
            {c.cta}
          </Link>
          <Link
            href={`/${locale}/contact`}
            className="border border-white/10 text-white/60 px-8 py-3 rounded-xl hover:bg-white/[0.05] transition-all"
          >
            Contact Sales
          </Link>
        </div>
      </section>
    </div>
  );
}
