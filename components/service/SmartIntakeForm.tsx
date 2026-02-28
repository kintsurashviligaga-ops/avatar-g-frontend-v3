'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { SmartIntake } from '@/types/core'
import type { ServiceId } from '@/lib/services/registry'
import { useState } from 'react'

const IntakeSchema = z.object({
  goal: z.string().min(3, 'Describe your goal'),
  audience: z.string().min(2, 'Describe your audience'),
  platform: z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'website', 'other']),
  language: z.enum(['ka', 'en', 'ru']),
  stylePreset: z.enum(['Business Pro', 'Creator Viral', 'Luxury', 'Minimal', 'Noir']),
  deadline: z.string().optional(),
  budgetPlan: z.enum(['free', 'pro', 'premium', 'enterprise']),
  notes: z.string().optional(),
})

interface Props {
  serviceId: ServiceId
  userId: string
  onSubmit?: (intake: SmartIntake) => void
}

const inputClass = 'w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30'
const selectClass = `${inputClass} appearance-none cursor-pointer`
const labelClass = 'text-xs text-white/50 block mb-1'
const errorClass = 'text-xs text-red-400 mt-1'

export function SmartIntakeForm({ serviceId, userId: _userId, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<SmartIntake>({
    resolver: zodResolver(IntakeSchema),
    defaultValues: { language: 'ka', budgetPlan: 'free', platform: 'instagram', stylePreset: 'Business Pro' },
  })

  const submit = async (data: SmartIntake) => {
    if (onSubmit) {
      onSubmit(data)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/agents/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          intake: data,
          mode: 'single',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message ?? 'Execution failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
        Project Brief
      </h3>

      <div>
        <label className={labelClass}>Goal</label>
        <textarea
          {...register('goal')}
          rows={2}
          placeholder="What do you want to create?"
          className={`${inputClass} resize-none`}
        />
        {errors.goal && <p className={errorClass}>{errors.goal.message}</p>}
      </div>

      <div>
        <label className={labelClass}>Audience</label>
        <input
          {...register('audience')}
          placeholder="Who is this for?"
          className={inputClass}
        />
        {errors.audience && <p className={errorClass}>{errors.audience.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Platform</label>
          <select {...register('platform')} className={selectClass}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="facebook">Facebook</option>
            <option value="website">Website</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Language</label>
          <select {...register('language')} className={selectClass}>
            <option value="ka">ქართული</option>
            <option value="en">English</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Style</label>
          <select {...register('stylePreset')} className={selectClass}>
            <option value="Business Pro">Business Pro</option>
            <option value="Creator Viral">Creator Viral</option>
            <option value="Luxury">Luxury</option>
            <option value="Minimal">Minimal</option>
            <option value="Noir">Noir</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Plan</label>
          <select {...register('budgetPlan')} className={selectClass}>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes (optional)</label>
        <textarea
          {...register('notes')}
          rows={2}
          placeholder="Any extra details..."
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 bg-white text-[#050510] font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Executing...' : 'Execute'}
      </button>
    </form>
  )
}
