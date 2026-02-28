// lib/business/profitCalc.ts
// Pure profit calculation. No side effects. No DB calls.
// All values computed in GEL.

import type { ProfitInputs, ProfitOutputs } from '@/types/business'

export function calculateProfit(inputs: ProfitInputs): ProfitOutputs {
  const {
    purchase_price,
    gel_exchange_rate,
    shipping_cost,
    customs_estimate,
    platform_fee_percent,
    marketing_cost_per_unit,
    target_resale_price,
    units_planned,
  } = inputs

  // All costs normalised to GEL
  const purchase_gel = purchase_price * gel_exchange_rate
  const platform_fee = (target_resale_price * platform_fee_percent) / 100
  const landed_cost_gel = purchase_gel + shipping_cost + customs_estimate + marketing_cost_per_unit

  const net_profit_per_unit = target_resale_price - landed_cost_gel - platform_fee
  const margin_percent = landed_cost_gel > 0
    ? parseFloat(((net_profit_per_unit / target_resale_price) * 100).toFixed(2))
    : 0
  const roi_percent = landed_cost_gel > 0
    ? parseFloat(((net_profit_per_unit / landed_cost_gel) * 100).toFixed(2))
    : 0
  const break_even_units = net_profit_per_unit > 0
    ? Math.ceil(landed_cost_gel * units_planned / net_profit_per_unit)
    : 0

  const suggestPrice = (targetMargin: number) => {
    // price = landed_cost / (1 - margin - platform_fee_pct/100)
    const denom = 1 - targetMargin / 100 - platform_fee_percent / 100
    return denom > 0
      ? parseFloat((landed_cost_gel / denom).toFixed(2))
      : 0
  }

  return {
    landed_cost_gel: parseFloat(landed_cost_gel.toFixed(2)),
    net_profit_per_unit: parseFloat(net_profit_per_unit.toFixed(2)),
    margin_percent,
    roi_percent,
    break_even_units,
    suggested_price_20: suggestPrice(20),
    suggested_price_30: suggestPrice(30),
    suggested_price_40: suggestPrice(40),
    total_investment: parseFloat((landed_cost_gel * units_planned).toFixed(2)),
    total_revenue_proj: parseFloat((target_resale_price * units_planned).toFixed(2)),
    total_profit_proj: parseFloat((net_profit_per_unit * units_planned).toFixed(2)),
  }
}
