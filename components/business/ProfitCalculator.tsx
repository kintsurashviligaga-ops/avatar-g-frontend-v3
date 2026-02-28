'use client'
import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalcProfitSchema } from '@/lib/business/schemas'
import type { ProfitOutputs } from '@/types/business'
import { z } from 'zod'

type FormData = z.infer<typeof CalcProfitSchema>

interface Props { projectId: string }

export function ProfitCalculator({ projectId }: Props) {
  const [outputs, setOutputs] = useState<ProfitOutputs | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(CalcProfitSchema),
    defaultValues: {
      project_id: projectId,
      purchase_currency: 'USD' as const,
      gel_exchange_rate: 2.65,
      customs_estimate: 0,
      units_planned: 1,
      purchase_price: 0,
      shipping_cost: 0,
      platform_fee_percent: 0,
      marketing_cost_per_unit: 0,
      target_resale_price: 0,
    },
  })

  const submit: SubmitHandler<FormData> = async (data) => {
    setLoading(true)
    try {
      const res = await fetch('/api/business/calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json.outputs) setOutputs(json.outputs)
    } finally {
      setLoading(false)
    }
  }

  const Field = ({ name, label, type = 'number', step }: {
    name: string; label: string; type?: string; step?: string
  }) => (
    <div>
      <label className="text-xs text-white/40 block mb-1">{label}</label>
      <input
        {...register(name as keyof FormData, { valueAsNumber: type === 'number' })}
        type={type}
        step={step ?? '0.01'}
        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
      />
      {errors[name as keyof FormData] && (
        <p className="text-xs text-red-400 mt-0.5">{(errors[name as keyof FormData] as { message?: string })?.message}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Profit Calculator</h3>

      <form onSubmit={handleSubmit(submit)} className="grid grid-cols-2 gap-3">
        <Field name="purchase_price" label="Purchase Price" />
        <Field name="gel_exchange_rate" label="GEL Rate (1 USD = ?)" />
        <Field name="shipping_cost" label="Shipping Cost (GEL)" />
        <Field name="customs_estimate" label="Customs Estimate (GEL)" />
        <Field name="platform_fee_percent" label="Platform Fee %" />
        <Field name="marketing_cost_per_unit" label="Marketing Cost/Unit" />
        <Field name="target_resale_price" label="Target Resale Price (GEL)" />
        <Field name="units_planned" label="Units Planned" step="1" />

        <button
          type="submit"
          disabled={loading}
          className="col-span-2 bg-white text-[#050510] font-semibold text-sm py-2.5 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-40"
        >
          {loading ? 'Calculating...' : 'Calculate Profit'}
        </button>
      </form>

      {outputs && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
          <h4 className="text-xs text-white/40 uppercase tracking-wider">Results</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Landed Cost', value: `${outputs.landed_cost_gel} ₾` },
              { label: 'Net Profit/Unit', value: `${outputs.net_profit_per_unit} ₾`,
                color: outputs.net_profit_per_unit > 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'Margin', value: `${outputs.margin_percent}%` },
              { label: 'ROI', value: `${outputs.roi_percent}%` },
              { label: 'Break-even Units', value: String(outputs.break_even_units) },
              { label: 'Total Profit Proj', value: `${outputs.total_profit_proj} ₾` },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/[0.03] rounded-xl p-3">
                <p className="text-white/40 text-xs">{label}</p>
                <p className={`font-bold mt-0.5 ${color ?? 'text-white'}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="border-t border-white/[0.06] pt-3">
            <p className="text-xs text-white/40 mb-2">Price Suggestions</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: '20% margin', val: outputs.suggested_price_20 },
                { label: '30% margin', val: outputs.suggested_price_30 },
                { label: '40% margin', val: outputs.suggested_price_40 },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/[0.03] rounded-lg p-2 text-center">
                  <p className="text-white/40">{label}</p>
                  <p className="text-white font-semibold">{val} ₾</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
