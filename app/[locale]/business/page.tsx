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
    <div className="min-h-screen bg-transparent" style={{ color: 'var(--color-text)' }}>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">{c.title}</h1>
        <p className="text-lg max-w-2xl mx-auto mb-12" style={{ color: 'var(--color-text-secondary)' }}>{c.subtitle}</p>

        <div className="grid sm:grid-cols-2 gap-4 text-left mb-12">
          {c.features.map((f, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl p-4" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-accent)' }} className="mt-0.5">◈</span>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{f}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href={`/${locale}/pricing`}
            className="font-semibold px-8 py-3 rounded-xl hover:opacity-90 transition-all"
            style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
          >
            {c.cta}
          </Link>
          <Link
            href={`/${locale}/contact`}
            className="px-8 py-3 rounded-xl transition-all hover:opacity-80"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Contact Sales
          </Link>
        </div>
      </section>
    </div>
  );
}
