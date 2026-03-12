'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface PipelineStep {
  icon: React.ReactNode
  label: Record<string, string>
}

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    label: { en: 'Describe', ka: 'აღწერე', ru: 'Опишите' },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    ),
    label: { en: 'Understand', ka: 'გაგება', ru: 'Понимание' },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    label: { en: 'Generate', ka: 'გენერაცია', ru: 'Генерация' },
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    label: { en: 'Deliver', ka: 'მიწოდება', ru: 'Доставка' },
  },
]

export function WorkflowPipelineSection() {
  const { language } = useLanguage()
  const lang = language as 'ka' | 'en' | 'ru'

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {{ en: 'How it works', ka: 'როგორ მუშაობს', ru: 'Как это работает' }[lang] || 'How it works'}
          </p>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'Idea → Result in four steps', ka: 'იდეა → შედეგი ოთხ ნაბიჯში', ru: 'Идея → Результат за 4 шага' }[lang] || 'Idea → Result in four steps'}
          </h2>
        </div>

        {/* Pipeline steps — compact horizontal row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
          {STEPS.map((step, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              <div
                className="w-full p-5 rounded-xl transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {/* Step number */}
                <div
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold mb-2.5"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {i + 1}
                </div>
                <StepIcon>{step.icon}</StepIcon>
                <h3 className="text-[13px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  {step.label[lang] || step.label.en}
                </h3>
              </div>

              {/* Connector arrow (desktop) */}
              {i < STEPS.length - 1 && (
                <div
                  className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 items-center justify-center z-10"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
