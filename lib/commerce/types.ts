/**
 * Avatar G Commerce - TypeScript Types
 * Single source of truth for commerce data structures
 */

// ============================================
// WALLET TYPES
// ============================================

export interface ShopWallet {
  id: string;
  user_id: string;
  balance_amount: number;
  currency: 'USD' | 'EUR' | 'GEL';
  lifetime_deposits: number;
  aml_risk_score: number;
  aml_flagged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: 'deposit' | 'ai_spend' | 'withdraw' | 'adjustment' | 'commission' | 'payout';
  amount: number;
  balance_after: number;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  order_id: string | null;
  job_id: string | null;
  agent_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// ORDER TYPES
// ============================================

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'disputed';

export type FulfillmentStatus = 'pending' | 'shipped' | 'delivered' | 'returned';

export type ShippingStatus = 'pending' | 'processing' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned';

export interface Order {
  id: string;
  user_id: string;
  store_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_metadata: Record<string, unknown> | null;
  status: OrderStatus;
  subtotal_amount: number;
  vat_amount: number;
  vat_rate: number;
  vat_enabled: boolean;
  vat_status: 'vat_payer' | 'non_vat_payer'; // Snapshot of tax status at order time
  platform_fee_amount: number;
  affiliate_fee_amount: number;
  total_amount: number;
  shipping_cost: number;
  shipping_profile_id: string | null;
  shipping_status: ShippingStatus;
  tracking_code: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  weight_grams: number | null;
  buyer_country_code: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  fulfillment_status: FulfillmentStatus;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_digital: boolean;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

// ============================================
// SHIPPING TYPES
// ============================================

export interface ShippingProfile {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  base_cost: number;
  per_kg_cost: number;
  estimated_days_min: number;
  estimated_days_max: number;
  is_active: boolean;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ShippingEvent {
  id: string;
  order_id: string;
  status: ShippingStatus;
  location: string | null;
  tracking_code: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface ShippingTracking {
  orderId: string;
  shippingStatus: ShippingStatus;
  trackingCode: string | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  events: ShippingEvent[];
  currentLocation: string | null;
  lastUpdated: string;
}

// ============================================
// AFFILIATE TYPES
// ============================================

export interface AffiliateTracking {
  id: string;
  user_id: string;
  session_id: string;
  referral_code: string | null;
  status: 'active' | 'suspended' | 'inactive';
  minimum_payout_threshold: number;
  pending_earnings: number;
  paid_earnings: number;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateClick {
  id: string;
  affiliate_id: string;
  referral_code: string;
  visitor_ip: string | null;
  visitor_country: string | null;
  referrer_url: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AffiliateConversion {
  id: string;
  affiliate_id: string;
  order_id: string | null;
  referral_code: string;
  conversion_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'failed';
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// DIGITAL LICENSE TYPES
// ============================================

export interface DigitalLicense {
  id: string;
  order_item_id: string;
  owner_user_id: string;
  license_key: string;
  transfer_limit: number;
  transfers_used: number;
  download_count: number;
  max_downloads: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface DigitalLicenseTransfer {
  id: string;
  license_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'completed' | 'rejected' | 'revoked';
  reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// SUPPLIER & PRODUCT TYPES
// ============================================

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  external_product_id: string;
  name: string;
  description: string | null;
  cost_price: number;
  currency: 'USD' | 'EUR' | 'GEL';
  attributes: Record<string, unknown> | null;
  categories: string[] | null;
  supplier_metadata: Record<string, unknown> | null;
  is_available: boolean;
  availability_updated_at: string | null;
  last_margin_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopStore {
  id: string;
  user_id: string;
  shop_name: string;
  shop_slug: string;
  description: string | null;
  logo_url: string | null;
  shop_type: 'classic' | 'dropshipping' | 'digital' | 'hybrid';
  is_active: boolean;
  vat_enabled: boolean;
  vat_number: string | null;
  // Tax Status Fields (Phase: Tax Status)
  tax_status: 'vat_payer' | 'non_vat_payer';
  vat_rate_bps: number;
  vat_registration_no: string | null;
  prices_include_vat: boolean;
  tax_residency_country: string;
  legal_entity_type: 'individual' | 'llc' | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  user_id: string;
  title: string;
  description: string | null;
  sku: string | null;
  cost_price: number | null;
  retail_price: number;
  margin_percent: number | null;
  product_type: 'physical' | 'digital' | 'service';
  is_digital: boolean;
  status: 'draft' | 'published' | 'archived';
  images: string[];
  video_url: string | null;
  metadata_json: Record<string, unknown> | null;
  ai_generated_at: string | null;
  ai_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// COMPLIANCE TYPES
// ============================================

export interface UserConsent {
  id: string;
  user_id: string;
  marketing_emails: boolean;
  data_processing: boolean;
  terms_accepted: boolean;
  privacy_policy_accepted: boolean;
  georgian_terms_accepted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  is_critical: boolean;
  risk_flags: string[] | null;
  created_at: string;
}

// ============================================
// COMPUTATION RESULT TYPES
// ============================================

export interface OrderSplit {
  subtotalAmount: number;
  vatAmount: number;
  vatRate: number;
  platformFeeAmount: number;
  affiliateFeeAmount: number;
  sellerNet: number;
  totalAmount: number;
}

export interface ProductMargin {
  retailPrice: number;
  costPrice: number;
  shippingCost: number;
  platformFeeAmount: number;
  affiliateFeeAmount: number;
  refundReserveCents: number;
  vatAmount: number;
  netProfitCents: number;
  marginPercent: number;
  isPositiveMargin: boolean;
  meetsThreshold: boolean;
  minThresholdPercent: number;
  rejection?: {
    reason: string;
    message: string;
  };
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
