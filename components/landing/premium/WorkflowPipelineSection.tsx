'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface PipelineStep {
  icon: React.ReactNode
  label: Record<string, string>
  desc: Record<string, string>
}

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
      style={{
        backgroundColor: 'var(--color-accent-soft)',
        color: 'var(--color-accent)',
      }}
    >
      {children}
    </div>
  )
}

const STEPS: PipelineStep[] = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    label: { en: 'Describe', ka: 'აღწერე', ru: 'Опишите' },
    desc: { en: 'Tell Agent G what you need using natural language or upload a reference', ka: 'უთხარი Agent G-ს რა გჭირდება ბუნებრივ ენაზე', ru: 'Опишите что вам нужно на естественном языке' },
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    ),
    label: { en: 'Understand', ka: 'გაგება', ru: 'Понимание' },
    desc: { en: 'AI detects your intent, selects the right service, and configures parameters', ka: 'AI ამოიცნობს მიზანს, ირჩევს სერვისს და კონფიგურებს პარამეტრებს', ru: 'AI определяет цель, выбирает сервис и настраивает параметры' },
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    label: { en: 'Generate', ka: 'გენერაცია', ru: 'Генерация' },
    desc: { en: 'Multiple AI models process your request in parallel for optimal results', ka: 'AI მოდელები პარალელურად ამუშავებენ მოთხოვნას', ru: 'Модели AI обрабатывают запрос параллельно' },
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    label: { en: 'Deliver', ka: 'მიწოდება', ru: 'Доставка' },
    desc: { en: 'Download, share, or refine your production-ready output instantly', ka: 'გადმოწერე, გააზიარე ან დახვეწე შედეგი', ru: 'Скачайте, поделитесь или доработайте результат' },
  },
]

export function WorkflowPipelineSection() {
  const { language } = useLanguage()
  const lang = language as 'ka' | 'en' | 'ru'

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-14 sm:py-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10 sm:mb-14">
          <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {{ en: 'How it works', ka: 'როგორ მუშაობს', ru: 'Как это работает' }[lang] || 'How it works'}
          </p>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'From idea to output in four steps', ka: 'იდეიდან შედეგამდე ოთხ ნაბიჯში', ru: 'От идеи к результату за четыре шага' }[lang] || 'From idea to output in four steps'}
          </h2>
        </div>

        {/* Pipeline steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-5">
          {STEPS.map((step, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              {/* Card */}
              <div
                className="w-full p-6 rounded-2xl transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Step number */}
                <div
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold mb-3"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {i + 1}
                </div>
                {/* Icon */}
                <StepIcon>{step.icon}</StepIcon>
                {/* Label */}
                <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                  {step.label[lang] || step.label.en}
                </h3>
                {/* Description */}
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                  {step.desc[lang] || step.desc.en}
                </p>
              </div>

              {/* Connector arrow (desktop, between cards, not on last) */}
              {i < STEPS.length - 1 && (
                <div
                  className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 items-center justify-center z-10"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
