import { z } from 'zod'

export const CreateProjectSchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  niche: z.string().max(100).optional(),
  target_market: z.string().max(100).optional(),
  language: z.enum(['ka', 'en', 'ru']).default('ka'),
  brand_name: z.string().max(100).optional(),
})

export const CreateItemSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  source_platform: z.enum(['amazon', 'alibaba', 'aliexpress', 'temu', 'ebay', 'etsy', 'facebook_marketplace', 'manual', 'other']),
  source_url: z.string().url().optional().or(z.literal('')),
  source_notes: z.string().max(500).optional(),
  target_platform: z.enum(['mymarket_ge', 'ssx_ge', 'zoommer_ge', 'vendoo_ge', 'manual', 'own_site']),
  shipping_partner: z.enum(['georgian_post', 'dhl', 'fedex', 'ups', 'aramex', 'local_courier', 'manual']),
  units: z.number().int().min(1).max(10000),
})

export const UpdateItemSchema = z.object({
  status: z.enum([
    'planned', 'sourced', 'payment_pending', 'shipped', 'in_transit',
    'customs', 'arrived', 'listed', 'sold', 'payout_pending',
    'payout_received', 'cancelled', 'returned'
  ]).optional(),
  tracking_number: z.string().max(100).optional(),
  listing_url: z.string().url().optional(),
  title: z.string().max(200).optional(),
  meta: z.record(z.unknown()).optional(),
})

export const AddEventSchema = z.object({
  status: z.string().min(1),
  note: z.string().max(500).optional(),
  data: z.record(z.unknown()).optional(),
})

export const CalcProfitSchema = z.object({
  project_id: z.string().uuid(),
  item_id: z.string().uuid().optional(),
  label: z.string().max(100).optional(),
  purchase_price: z.number().min(0),
  purchase_currency: z.enum(['USD', 'EUR', 'GBP', 'CNY', 'GEL', 'RUB']),
  gel_exchange_rate: z.number().min(0.01),
  shipping_cost: z.number().min(0),
  customs_estimate: z.number().min(0),
  platform_fee_percent: z.number().min(0).max(100),
  marketing_cost_per_unit: z.number().min(0),
  target_resale_price: z.number().min(0),
  units_planned: z.number().int().min(1),
})
