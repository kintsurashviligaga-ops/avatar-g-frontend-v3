'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { SmartIntake } from '@/types/core'
import type { ServiceId } from '@/lib/services/registry'
import { useMemo, useState } from 'react'

type IntakeLocale = 'ka' | 'en' | 'ru'

interface SmartIntakeLabels {
  projectBrief: string
  goal: string
  goalPlaceholder: string
  goalValidation: string
  audience: string
  audiencePlaceholder: string
  audienceValidation: string
  platform: string
  language: string
  style: string
  plan: string
  notes: string
  notesPlaceholder: string
  execute: string
  executing: string
  submitFailed: string
}

interface Props {
  serviceId?: ServiceId
  userId?: string
  locale?: IntakeLocale
  endpoint?: string
  labels?: Partial<SmartIntakeLabels>
  onSubmit?: (intake: SmartIntake) => void
}

const COPY_BY_LOCALE: Record<IntakeLocale, SmartIntakeLabels> = {
  ka: {
    projectBrief: 'პროექტის ბრიფი',
    goal: 'მიზანი',
    goalPlaceholder: 'რა გინდა შექმნა?',
    goalValidation: 'აღწერე მიზანი',
    audience: 'აუდიტორია',
    audiencePlaceholder: 'ვისთვის არის ეს?',
    audienceValidation: 'აღწერე აუდიტორია',
    platform: 'პლატფორმა',
    language: 'ენა',
    style: 'სტილი',
    plan: 'პლანი',
    notes: 'შენიშვნები (სურვილისამებრ)',
    notesPlaceholder: 'დამატებითი დეტალები...',
    execute: 'გაშვება',
    executing: 'მიმდინარეობს...',
    submitFailed: 'გაშვება ვერ მოხერხდა. სცადე ხელახლა.',
  },
  en: {
    projectBrief: 'Project Brief',
    goal: 'Goal',
    goalPlaceholder: 'What do you want to create?',
    goalValidation: 'Describe your goal',
    audience: 'Audience',
    audiencePlaceholder: 'Who is this for?',
    audienceValidation: 'Describe your audience',
    platform: 'Platform',
    language: 'Language',
    style: 'Style',
    plan: 'Plan',
    notes: 'Notes (optional)',
    notesPlaceholder: 'Any extra details...',
    execute: 'Execute',
    executing: 'Executing...',
    submitFailed: 'Execution failed. Please try again.',
  },
  ru: {
    projectBrief: 'Бриф проекта',
    goal: 'Цель',
    goalPlaceholder: 'Что вы хотите создать?',
    goalValidation: 'Опишите цель',
    audience: 'Аудитория',
    audiencePlaceholder: 'Для кого это?',
    audienceValidation: 'Опишите аудиторию',
    platform: 'Платформа',
    language: 'Язык',
    style: 'Стиль',
    plan: 'План',
    notes: 'Заметки (необязательно)',
    notesPlaceholder: 'Дополнительные детали...',
    execute: 'Запустить',
    executing: 'Выполнение...',
    submitFailed: 'Не удалось запустить. Попробуйте снова.',
  },
}

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: { ka: 'Instagram', en: 'Instagram', ru: 'Instagram' } },
  { value: 'tiktok', label: { ka: 'TikTok', en: 'TikTok', ru: 'TikTok' } },
  { value: 'youtube', label: { ka: 'YouTube', en: 'YouTube', ru: 'YouTube' } },
  { value: 'facebook', label: { ka: 'Facebook', en: 'Facebook', ru: 'Facebook' } },
  { value: 'website', label: { ka: 'ვებსაიტი', en: 'Website', ru: 'Сайт' } },
  { value: 'other', label: { ka: 'სხვა', en: 'Other', ru: 'Другое' } },
] as const

const STYLE_OPTIONS = [
  { value: 'Business Pro', label: { ka: 'Business Pro', en: 'Business Pro', ru: 'Business Pro' } },
  { value: 'Creator Viral', label: { ka: 'Creator Viral', en: 'Creator Viral', ru: 'Creator Viral' } },
  { value: 'Luxury', label: { ka: 'Luxury', en: 'Luxury', ru: 'Luxury' } },
  { value: 'Minimal', label: { ka: 'Minimal', en: 'Minimal', ru: 'Minimal' } },
  { value: 'Noir', label: { ka: 'Noir', en: 'Noir', ru: 'Noir' } },
] as const

const PLAN_OPTIONS = [
  { value: 'free', label: { ka: 'Free', en: 'Free', ru: 'Free' } },
  { value: 'pro', label: { ka: 'Pro', en: 'Pro', ru: 'Pro' } },
  { value: 'premium', label: { ka: 'Premium', en: 'Premium', ru: 'Premium' } },
  { value: 'enterprise', label: { ka: 'Enterprise', en: 'Enterprise', ru: 'Enterprise' } },
] as const

function createIntakeSchema(goalValidation: string, audienceValidation: string) {
  return z.object({
    goal: z.string().min(3, goalValidation),
    audience: z.string().min(2, audienceValidation),
    platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'website', 'other']),
    language: z.enum(['ka', 'en', 'ru']),
    stylePreset: z.enum(['Business Pro', 'Creator Viral', 'Luxury', 'Minimal', 'Noir']),
    deadline: z.string().optional(),
    budgetPlan: z.enum(['free', 'pro', 'premium', 'enterprise']),
    notes: z.string().optional(),
  })
}

const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30'
const selectClass = `${inputClass} appearance-none cursor-pointer`
const labelClass = 'text-xs text-white/50 block mb-1'
const errorClass = 'text-xs text-red-400 mt-1'

export function SmartIntakeForm({
  serviceId = 'avatar',
  userId: _userId = 'guest',
  locale = 'ka',
  endpoint = '/api/agents/execute',
  labels,
  onSubmit,
}: Props) {
  const activeLocale: IntakeLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }

  const intakeSchema = useMemo(
    () => createIntakeSchema(t.goalValidation, t.audienceValidation),
    [t.goalValidation, t.audienceValidation],
  )

  const l10n = useMemo(() => {
    return {
      optionLabel: (value: { ka: string; en: string; ru: string }) => value[activeLocale] ?? value.en,
    }
  }, [activeLocale])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<SmartIntake>({
    resolver: zodResolver(intakeSchema),
    defaultValues: { language: 'ka', budgetPlan: 'free', platform: 'instagram', stylePreset: 'Business Pro' },
  })

  const submit = async (data: SmartIntake) => {
    setSubmitError(null)

    if (onSubmit) {
      await Promise.resolve(onSubmit(data))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          intake: data,
          mode: 'single',
        }),
      })

      if (!res.ok) {
        let message = t.submitFailed
        try {
          const err = await res.json()
          message = err.error?.message ?? err.message ?? message
        } catch {
          // Keep default localized fallback.
        }
        throw new Error(message)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t.submitFailed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
        {t.projectBrief}
      </h3>

      <div>
        <label className={labelClass}>{t.goal}</label>
        <textarea
          {...register('goal')}
          rows={2}
          placeholder={t.goalPlaceholder}
          className={`${inputClass} resize-none`}
        />
        {errors.goal && <p className={errorClass}>{errors.goal.message}</p>}
      </div>

      <div>
        <label className={labelClass}>{t.audience}</label>
        <input
          {...register('audience')}
          placeholder={t.audiencePlaceholder}
          className={inputClass}
        />
        {errors.audience && <p className={errorClass}>{errors.audience.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t.platform}</label>
          <select {...register('platform')} className={selectClass}>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {l10n.optionLabel(option.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t.language}</label>
          <select {...register('language')} className={selectClass}>
            <option value="ka">ქართული</option>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t.style}</label>
          <select {...register('stylePreset')} className={selectClass}>
            {STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {l10n.optionLabel(option.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t.plan}</label>
          <select {...register('budgetPlan')} className={selectClass}>
            {PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {l10n.optionLabel(option.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>{t.notes}</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder={t.notesPlaceholder}
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 bg-white text-[#050510] font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {submitting ? t.executing : t.execute}
      </button>

      {submitError && <p className={errorClass}>{submitError}</p>}
    </form>
  )
}
