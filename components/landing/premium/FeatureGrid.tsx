'use client'

import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageContext'

interface Service {
  slug: string
  icon: string
  title: Record<string, string>
  desc: Record<string, string>
  category: 'create' | 'edit' | 'automate' | 'analyze' | 'scale'
}

const SERVICES: Service[] = [
  // ── Create ──
  { slug: 'avatar', icon: '✦', title: { en: 'AI Avatar', ka: 'AI ავატარი', ru: 'AI Аватар' }, desc: { en: 'Identity generation in any style', ka: 'იდენტობის გენერაცია ნებისმიერ სტილში', ru: 'Генерация в любом стиле' }, category: 'create' },
  { slug: 'video', icon: '▶', title: { en: 'Video Studio', ka: 'ვიდეო სტუდია', ru: 'Видео-студия' }, desc: { en: 'Text-to-video and motion', ka: 'ტექსტიდან ვიდეო და მოძრაობა', ru: 'Видео из текста' }, category: 'create' },
  { slug: 'image', icon: '◆', title: { en: 'Image Creator', ka: 'სურათის შემქმნელი', ru: 'Изображения' }, desc: { en: 'Premium AI image generation', ka: 'პრემიუმ AI სურათები', ru: 'Премиум AI-генерация' }, category: 'create' },
  { slug: 'music', icon: '♪', title: { en: 'Music Studio', ka: 'მუსიკის სტუდია', ru: 'Музыка' }, desc: { en: 'Beats, soundtracks, compositions', ka: 'ბითები, საუნდტრეკები', ru: 'Биты и саундтреки' }, category: 'create' },
  { slug: 'photo', icon: '◈', title: { en: 'Photo Studio', ka: 'ფოტო სტუდია', ru: 'Фото-студия' }, desc: { en: 'Enhancement, upscale, remove-bg', ka: 'გაუმჯობესება, მასშტაბი', ru: 'Улучшение и обработка' }, category: 'create' },
  // ── Edit ──
  { slug: 'editing', icon: '✂', title: { en: 'Video Editing', ka: 'ვიდეო რედაქტირება', ru: 'Видео-монтаж' }, desc: { en: 'AI-powered post-production', ka: 'AI პოსტ-პროდაქშენი', ru: 'AI пост-продакшн' }, category: 'edit' },
  { slug: 'media', icon: '⬡', title: { en: 'Media Production', ka: 'მედია პროდაქშენი', ru: 'Медиа-продакшн' }, desc: { en: 'Multi-format media packages', ka: 'მრავალფორმატის მედია', ru: 'Мультиформатные пакеты' }, category: 'edit' },
  // ── Analyze ──
  { slug: 'text', icon: '¶', title: { en: 'Text Intelligence', ka: 'ტექსტის ინტელექტი', ru: 'Текст AI' }, desc: { en: 'Copy, scripts, and content', ka: 'კოპი, სკრიპტები, კონტენტი', ru: 'Копи, скрипты, контент' }, category: 'analyze' },
  { slug: 'prompt', icon: '⚡', title: { en: 'Prompt Builder', ka: 'პრომფტ ბილდერი', ru: 'Промпт-билдер' }, desc: { en: 'Optimize your AI prompts', ka: 'AI პრომფტების ოპტიმიზაცია', ru: 'Оптимизация промптов' }, category: 'analyze' },
  { slug: 'visual-intel', icon: '◉', title: { en: 'Visual Intelligence', ka: 'ვიზუალური ინტელექტი', ru: 'Визуальный AI' }, desc: { en: 'Image analysis and QA', ka: 'სურათის ანალიზი და QA', ru: 'Анализ изображений' }, category: 'analyze' },
  // ── Automate ──
  { slug: 'workflow', icon: '⟳', title: { en: 'Workflows', ka: 'სამუშაო პროცესები', ru: 'Автоматизация' }, desc: { en: 'Chain services into pipelines', ka: 'სერვისების ჯაჭვი', ru: 'Цепочки сервисов' }, category: 'automate' },
  { slug: 'agent-g', icon: 'G', title: { en: 'Agent G', ka: 'Agent G', ru: 'Агент G' }, desc: { en: 'AI orchestration director', ka: 'AI ორკესტრაციის დირექტორი', ru: 'AI-оркестратор' }, category: 'automate' },
  // ── Scale ──
  { slug: 'business', icon: '◎', title: { en: 'Business AI', ka: 'ბიზნეს AI', ru: 'Бизнес AI' }, desc: { en: 'Marketing and strategy', ka: 'მარკეტინგი და სტრატეგია', ru: 'Маркетинг и стратегия' }, category: 'scale' },
  { slug: 'shop', icon: '⊞', title: { en: 'Online Shop', ka: 'ონლაინ მაღაზია', ru: 'Онлайн-магазин' }, desc: { en: 'Product listings and commerce', ka: 'პროდუქტები და კომერცია', ru: 'Товары и коммерция' }, category: 'scale' },
  { slug: 'software', icon: '⟨⟩', title: { en: 'Software Dev', ka: 'პროგრამირება', ru: 'Разработка' }, desc: { en: 'Apps and integrations', ka: 'აპლიკაციები და ინტეგრაციები', ru: 'Приложения и интеграции' }, category: 'scale' },
  { slug: 'tourism', icon: '✈', title: { en: 'Tourism AI', ka: 'ტურიზმი AI', ru: 'Туризм AI' }, desc: { en: 'Travel content generation', ka: 'ტურისტული კონტენტი', ru: 'Контент для туризма' }, category: 'scale' },
]

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  create:   { en: 'Create',   ka: 'შექმნა',     ru: 'Создание' },
  edit:     { en: 'Edit',     ka: 'რედაქტირება', ru: 'Редактура' },
  analyze:  { en: 'Analyze',  ka: 'ანალიზი',    ru: 'Анализ' },
  automate: { en: 'Automate', ka: 'ავტომატიზაცია', ru: 'Автоматизация' },
  scale:    { en: 'Scale',    ka: 'მასშტაბი',   ru: 'Масштаб' },
}

const CATEGORY_ORDER = ['create', 'edit', 'analyze', 'automate', 'scale'] as const

export function FeatureGrid() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-4xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {{ en: '16 AI Services', ka: '16 AI სერვისი', ru: '16 AI-сервисов' }[language] || '16 AI Services'}
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'Everything you need, one workspace', ka: 'ყველაფერი ერთ სივრცეში', ru: 'Всё в одном пространстве' }[language] || 'Everything you need, one workspace'}
          </h2>
        </div>

        {/* Services by category */}
        <div className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const services = SERVICES.filter(s => s.category === cat)
            const catLabel = CATEGORY_LABELS[cat]?.[language] || CATEGORY_LABELS[cat]?.en || cat
            return (
              <div key={cat}>
                <p className="text-[10px] tracking-[0.2em] uppercase font-medium mb-2.5 pl-1" style={{ color: 'var(--color-text-tertiary)' }}>{catLabel}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {services.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/${language}/services/${s.slug}`}
                      className="group flex flex-col gap-2 p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
                      style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>{s.icon}</span>
                        <h3 className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text-secondary)' }}>{s.title[language] || s.title.en}</h3>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>{s.desc[language] || s.desc.en}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* View all link */}
        <div className="text-center mt-6">
          <Link
            href={`/${language}/services`}
            className="inline-flex items-center gap-1.5 text-[13px] transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            {{ en: 'View all services →', ka: 'ყველა სერვისი →', ru: 'Все сервисы →' }[language] || 'View all services →'}
          </Link>
        </div>
      </div>
    </section>
  )
}
