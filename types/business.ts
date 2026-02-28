// types/business.ts
// All Business Hub domain types.
// No imports from types that don't exist yet.

import type { ArtifactRef, LocaleCode } from './core'

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export type BusinessProjectStatus =
  | 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export type BusinessItemStatus =
  | 'planned'
  | 'sourced'
  | 'payment_pending'
  | 'shipped'
  | 'in_transit'
  | 'customs'
  | 'arrived'
  | 'listed'
  | 'sold'
  | 'payout_pending'
  | 'payout_received'
  | 'cancelled'
  | 'returned'

export type SourcePlatform =
  | 'amazon'
  | 'alibaba'
  | 'aliexpress'
  | 'temu'
  | 'ebay'
  | 'etsy'
  | 'facebook_marketplace'
  | 'manual'
  | 'other'

export type TargetPlatform =
  | 'mymarket_ge'
  | 'ssx_ge'
  | 'zoommer_ge'
  | 'vendoo_ge'
  | 'manual'
  | 'own_site'

export type ShippingPartner =
  | 'georgian_post'
  | 'dhl'
  | 'fedex'
  | 'ups'
  | 'aramex'
  | 'local_courier'
  | 'manual'

export type ConnectorType = 'source' | 'target' | 'shipping' | 'payment'
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CNY' | 'GEL' | 'RUB'

// ─── PROFIT CALCULATOR ───────────────────────────────────────────────────────

export interface ProfitInputs {
  purchase_price: number
  purchase_currency: Currency
  gel_exchange_rate: number // always compute in GEL
  shipping_cost: number
  customs_estimate: number // 0 if unknown
  platform_fee_percent: number // e.g. 10 for 10%
  marketing_cost_per_unit: number
  target_resale_price: number
  units_planned: number // for break-even
}

export interface ProfitOutputs {
  landed_cost_gel: number
  net_profit_per_unit: number
  margin_percent: number
  roi_percent: number
  break_even_units: number
  suggested_price_20: number // price for 20% margin
  suggested_price_30: number // price for 30% margin
  suggested_price_40: number // price for 40% margin
  total_investment: number // landed_cost × units_planned
  total_revenue_proj: number // resale × units_planned
  total_profit_proj: number
}

// ─── CONNECTOR CONFIG ────────────────────────────────────────────────────────

export interface ConnectorConfig {
  id: string
  user_id: string
  connector_type: ConnectorType
  platform_key: string // e.g. 'amazon', 'dhl', 'mymarket_ge'
  display_name: string
  is_active: boolean
  // Store only non-secret config. Secrets go in env vars.
  config: ConnectorConfigData
  created_at: string
  updated_at: string
}

export interface ConnectorConfigData {
  mode: 'manual' | 'api' // 'api' requires env var key
  webhook_url?: string
  store_url?: string
  notes?: string
}

// ─── BUSINESS PROJECT ────────────────────────────────────────────────────────

export interface BusinessProject {
  id: string
  user_id: string
  title: string
  description: string | null
  status: BusinessProjectStatus
  niche: string | null
  target_market: string | null
  language: LocaleCode
  brand_name: string | null
  brand_kit_url: string | null // artifact from image-agent
  root_job_id: string | null
  artifacts: ArtifactRef[]
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── BUSINESS ITEM ───────────────────────────────────────────────────────────

export interface BusinessItem {
  id: string
  project_id: string
  user_id: string
  title: string
  source_platform: SourcePlatform
  source_url: string | null // pasted URL — not scraped
  source_notes: string | null
  target_platform: TargetPlatform
  shipping_partner: ShippingPartner
  tracking_number: string | null
  status: BusinessItemStatus
  units: number
  profit_snapshot_id: string | null
  listing_url: string | null
  artifacts: ArtifactRef[]
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ─── BUSINESS ITEM EVENT ─────────────────────────────────────────────────────

export interface BusinessItemEvent {
  id: string
  item_id: string
  status: BusinessItemStatus
  note: string | null
  actor: 'user' | 'system'
  data: Record<string, unknown>
  created_at: string
}

// ─── PROFIT SNAPSHOT ─────────────────────────────────────────────────────────

export interface ProfitSnapshot {
  id: string
  item_id: string | null
  project_id: string
  user_id: string
  inputs: ProfitInputs
  outputs: ProfitOutputs
  version: number
  label: string | null
  created_at: string
}

// ─── PRODUCT IMPORT ──────────────────────────────────────────────────────────

export interface ProductImportRequest {
  mode: 'url' | 'manual'
  url?: string // user-pasted URL, not scraped by system
  title?: string
  purchase_price?: number
  currency?: Currency
  source_platform: SourcePlatform
  notes?: string
}

// ─── API SHAPES ──────────────────────────────────────────────────────────────

export interface CreateBusinessProjectBody {
  title: string
  description?: string
  niche?: string
  target_market?: string
  language?: LocaleCode
  brand_name?: string
}

export interface CreateBusinessItemBody {
  project_id: string
  title: string
  source_platform: SourcePlatform
  source_url?: string
  source_notes?: string
  target_platform: TargetPlatform
  shipping_partner: ShippingPartner
  units: number
}

export interface UpdateBusinessItemBody {
  status?: BusinessItemStatus
  tracking_number?: string
  listing_url?: string
  title?: string
  meta?: Record<string, unknown>
}

export interface CalcProfitBody extends ProfitInputs {
  item_id?: string
  project_id: string
  label?: string
}
