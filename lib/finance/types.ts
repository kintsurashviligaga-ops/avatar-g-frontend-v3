/**
 * Finance types for simulation engine
 * All money values are integer cents.
 */

export type CurrencyCode = 'GEL' | 'USD';

export interface SimulationInputs {
  retail_price_amount_cents: number;
  supplier_cost_amount_cents: number;
  shipping_cost_amount_cents: number;
  vat_enabled: boolean;
  vat_rate_bps: number; // 1800 = 18%
  platform_fee_bps: number; // 500 = 5%
  affiliate_bps?: number; // 1000 = 10%
  refund_reserve_bps?: number; // 200 = 2%
  product_type?: 'physical' | 'digital' | 'dropshipping' | 'service';
  target_margin_bps?: number;
  expected_orders_per_day: number;
  expected_conversion_rate: number; // 0..1
  ad_spend_per_day_cents?: number;
  currency: CurrencyCode;
  fx_rate?: number; // manual input
  fx_base_currency?: CurrencyCode;
  fx_quote_currency?: CurrencyCode;
}

export interface SimulationFeesBreakdown {
  vat_amount_cents: number;
  platform_fee_cents: number;
  affiliate_fee_cents: number;
  refund_reserve_cents: number;
  ad_cost_per_order_cents: number;
}

export interface SimulationOutputs {
  net_profit_per_order_cents: number;
  margin_percent: number;
  net_profit_per_day_cents: number;
  net_profit_per_week_cents: number;
  net_profit_per_month_cents: number;
  break_even_orders_per_day: number | null;
  fees: SimulationFeesBreakdown;
  recommended_price_cents: number | null;
  warnings: string[];
  currency: CurrencyCode;
  converted?: {
    currency: CurrencyCode;
    fx_rate: number;
    net_profit_per_day_cents: number;
    net_profit_per_week_cents: number;
    net_profit_per_month_cents: number;
  };
}

export interface SimulationScenarioRow {
  id: string;
  store_id: string;
  user_id: string;
  name: string;
  currency: CurrencyCode;
  inputs_json: SimulationInputs;
  outputs_json: SimulationOutputs;
  created_at: string;
}

export interface FxRateRow {
  id: string;
  base_currency: CurrencyCode;
  quote_currency: CurrencyCode;
  rate: number;
  source: string;
  created_at: string;
}
