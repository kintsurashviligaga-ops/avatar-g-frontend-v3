'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

const COPY = {
  en: {
    eyebrow: 'Project System',
    title: 'Organize everything in projects',
    sub: 'Projects store your prompts, assets, and results. Keep every creation organized and accessible.',
    templatesTitle: 'Start instantly with templates',
    templatesSub: 'Pre-built workflows for common creative tasks.',
    cta: 'Open Workspace',
  },
  ka: {
    eyebrow: 'პროექტის სისტემა',
    title: 'ააწყვეთ ყველაფერი პროექტებში',
    sub: 'პროექტები ინახავს თქვენს მოთხოვნებს, აქტივებს და შედეგებს. შეინახეთ ყველა შექმნილი ორგანიზებულად.',
    templatesTitle: 'დაიწყეთ მყისიერად შაბლონებით',
    templatesSub: 'წინასწარ აგებული პროცესები ხშირი შემოქმედებითი ამოცანებისთვის.',
    cta: 'სამუშაო სივრცის გახსნა',
  },
  ru: {
    eyebrow: 'Система проектов',
    title: 'Организуйте всё в проектах',
    sub: 'Проекты хранят ваши промпты, ассеты и результаты. Держите все создания организованными.',
    templatesTitle: 'Начните мгновенно с шаблонами',
    templatesSub: 'Готовые процессы для распространённых творческих задач.',
    cta: 'Открыть рабочее пространство',
  },
} as const

const TEMPLATES = [
  { icon: '🎨', en: 'Brand Starter Pack', ka: 'ბრენდის სტარტ პაკი', ru: 'Стартовый пакет бренда' },
  { icon: '🎵', en: 'Music Launch Pack', ka: 'მუსიკის გამოშვების პაკი', ru: 'Пакет запуска музыки' },
  { icon: '📊', en: 'Startup Plan', ka: 'სტარტაპის გეგმა', ru: 'План стартапа' },
  { icon: '🛒', en: 'Online Store Launch', ka: 'ონლაინ მაღაზიის გაშვება', ru: 'Запуск интернет-магазина' },
  { icon: '📱', en: 'Social Media Kit', ka: 'სოციალური მედიის ნაკრები', ru: 'Набор для соцсетей' },
  { icon: '🎬', en: 'Video Production', ka: 'ვიდეო პროდაქშენი', ru: 'Видеопроизводство' },
]

export function WorkspaceTemplates() {
  const { language } = useLanguage()
  const lang = language as 'en' | 'ka' | 'ru'
  const c = COPY[lang] || COPY.en
  const lh = (p: string) => '/' + language + p

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-20 sm:py-28 overflow-hidden">
      <div className="relative max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">

          {/* Left: Workspace explanation */}
          <div>
            <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>{c.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text)' }}>{c.title}</h2>
            <p className="text-base leading-[1.7] mb-8" style={{ color: 'var(--color-text-secondary)' }}>{c.sub}</p>

            {/* Mock workspace card */}
            <div className="rounded-2xl p-5 sm:p-6 space-y-3" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              {['🎭 Brand Identity Project', '🎬 Video Campaign Q1', '🎵 Album Production'].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                  <span className="text-sm">{item.split(' ')[0]}</span>
                  <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text)' }}>{item.split(' ').slice(1).join(' ')}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                    {i === 0 ? '12 assets' : i === 1 ? '8 assets' : '5 assets'}
                  </span>
                </div>
              ))}
            </div>

            <Link
              href={lh('/workspace')}
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl mt-6 transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              {c.cta}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </Link>
          </div>

          {/* Right: Templates */}
          <div>
            <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--color-text)' }}>{c.templatesTitle}</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>{c.templatesSub}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((t, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 p-4 rounded-xl transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
                >
                  <span className="text-xl flex-shrink-0">{t.icon}</span>
                  <span className="text-sm font-medium transition-colors group-hover:text-[var(--color-accent)]" style={{ color: 'var(--color-text)' }}>
                    {t[lang] || t.en}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
