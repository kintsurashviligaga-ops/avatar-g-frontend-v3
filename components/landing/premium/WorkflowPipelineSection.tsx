'use client'

import { useLanguage } from '@/lib/i18n/LanguageContext'

interface PipelineStep {
  icon: string
  label: Record<string, string>
  desc: Record<string, string>
}

const STEPS: PipelineStep[] = [
  {
    icon: '💬',
    label: { en: 'Describe', ka: 'აღწერე', ru: 'Опишите' },
    desc: { en: 'Tell Agent G what you need in natural language', ka: 'უთხარი Agent G-ს რა გჭირდება', ru: 'Скажите Agent G что вам нужно' },
  },
  {
    icon: '🧠',
    label: { en: 'Understand', ka: 'გაგება', ru: 'Понимание' },
    desc: { en: 'AI detects your intent and selects the right service', ka: 'AI ამოიცნობს მიზანს და ირჩევს სერვისს', ru: 'AI определяет цель и выбирает сервис' },
  },
  {
    icon: '⚡',
    label: { en: 'Generate', ka: 'გენერაცია', ru: 'Генерация' },
    desc: { en: 'Multiple AI models work in parallel on your request', ka: 'AI მოდელები პარალელურად ამუშავებენ მოთხოვნას', ru: 'Модели AI работают параллельно' },
  },
  {
    icon: '✨',
    label: { en: 'Deliver', ka: 'მიწოდება', ru: 'Доставка' },
    desc: { en: 'Download, share, or refine your production-ready output', ka: 'გადმოწერე, გააზიარე ან დახვეწე შედეგი', ru: 'Скачайте, поделитесь или доработайте' },
  },
]

export function WorkflowPipelineSection() {
  const { language } = useLanguage()

  return (
    <section className="px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[11px] tracking-[0.2em] uppercase font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            {{ en: 'How it works', ka: 'როგორ მუშაობს', ru: 'Как это работает' }[language] || 'How it works'}
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {{ en: 'Idea to output in four steps', ka: 'იდეიდან შედეგამდე ოთხ ნაბიჯში', ru: 'От идеи к результату за четыре шага' }[language] || 'Idea to output in four steps'}
          </h2>
        </div>

        {/* Pipeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((step, i) => (
            <div key={i} className="relative flex flex-col items-center text-center p-5 rounded-xl" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--color-border)' }}>
              {/* Step number */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold mb-3"
                style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                {i + 1}
              </div>
              {/* Icon */}
              <span className="text-2xl mb-2">{step.icon}</span>
              {/* Label */}
              <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                {step.label[language] || step.label.en}
              </h3>
              {/* Description */}
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
                {step.desc[language] || step.desc.en}
              </p>
              {/* Connector arrow (desktop, not on last) */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: 'var(--color-text-tertiary)' }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
