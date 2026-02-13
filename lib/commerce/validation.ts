/**
 * Avatar G Commerce - Zod Validation Schemas
 * Single source of truth for commerce entity validation
 */

import { z } from 'zod';

// ============================================
// WALLET SCHEMAS
// ============================================

export const CreateWalletSchema = z.object({
  userId: z.string().uuid(),
  currency: z.enum(['USD', 'EUR', 'GEL']).default('USD'),
});

export const DepositToWalletSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive('Amount must be > 0').max(1000000),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const WithdrawFromWalletSchema = z.object({
  walletId: z.string().uuid(),
  amount: z.number().positive().max(1000000),
  description: z.string().optional(),
});

export const WalletTransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['deposit', 'ai_spend', 'withdraw', 'adjustment', 'commission', 'payout']),
  amount: z.number(),
  balanceAfter: z.number(),
  description: z.string().nullable(),
  metadataJson: z.record(z.any()).nullable(),
  orderId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  agentId: z.string().nullable(),
  createdAt: z.date(),
});

// ============================================
// ORDER SCHEMAS
// ============================================

export const CreateOrderSchema = z.object({
  userId: z.string().uuid(),
  stripePaymentIntentId: z.string().optional(),
  subtotalAmount: z.number().nonnegative(),
  vatRate: z.number().min(0).max(100).optional(),
  vatEnabled: z.boolean().default(false),
  platformFeeAmount: z.number().nonnegative().default(0),
  affiliateFeeAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().positive(),
  buyerCountryCode: z.string().length(2).optional(),
  buyerEmail: z.string().email().optional(),
  buyerName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateOrderSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'refunded', 'disputed']).optional(),
  fulfillmentStatus: z.enum(['pending', 'shipped', 'delivered', 'returned']).optional(),
  stripeMetadata: z.record(z.any()).optional(),
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  stripePaymentIntentId: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'refunded', 'disputed']),
  subtotalAmount: z.number(),
  vatAmount: z.number(),
  vatRate: z.number(),
  vatEnabled: z.boolean(),
  platformFeeAmount: z.number(),
  affiliateFeeAmount: z.number(),
  totalAmount: z.number(),
  buyerCountryCode: z.string().nullable(),
  buyerEmail: z.string().nullable(),
  buyerName: z.string().nullable(),
  fulfillmentStatus: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateOrderItemSchema = z.object({
  orderId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  productName: z.string(),
  productSku: z.string().optional(),
  quantity: z.number().positive().int(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  isDigital: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

// ============================================
// AFFILIATE SCHEMAS
// ============================================

export const CreateAffiliateSchema = z.object({
  userId: z.string().uuid(),
});

export const AffiliateTrackingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string(), // Must be unique in database
  referralCode: z.string().optional(),
  status: z.enum(['active', 'suspended', 'inactive']),
  minimumPayoutThreshold: z.number().nonnegative(),
  pendingEarnings: z.number().nonnegative(),
  paidEarnings: z.number().nonnegative(),
  createdAt: z.date(),
});

export const TrackAffiliateClickSchema = z.object({
  affiliateId: z.string().uuid(),
  referralCode: z.string(),
  visitorIp: z.string().ip().optional(),
  visitorCountry: z.string().length(2).optional(),
  referrerUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

export const CreateAffiliateConversionSchema = z.object({
  affiliateId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  referralCode: z.string(),
  conversionAmount: z.number().positive(),
  commissionRate: z.number().min(0).max(100).default(5),
});

// ============================================
// DIGITAL LICENSE SCHEMAS
// ============================================

export const CreateDigitalLicenseSchema = z.object({
  orderItemId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  licenseKey: z.string().min(16),
  transferLimit: z.number().nonnegative().default(1),
  maxDownloads: z.number().nonnegative().optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export const DigitalLicenseSchema = z.object({
  id: z.string().uuid(),
  orderItemId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  licenseKey: z.string(),
  transferLimit: z.number(),
  transfersUsed: z.number(),
  downloadCount: z.number(),
  maxDownloads: z.number().nullable(),
  expiresAt: z.date().nullable(),
  revokedAt: z.date().nullable(),
  createdAt: z.date(),
});

export const TransferDigitalLicenseSchema = z.object({
  licenseId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  reason: z.string().optional(),
});

// ============================================
// SUPPLIER/PRODUCT SCHEMAS
// ============================================

export const CreateSupplierProductSchema = z.object({
  supplierId: z.string(),
  externalProductId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  costPrice: z.number().positive(),
  currency: z.enum(['USD', 'EUR', 'GEL']).default('USD'),
  attributes: z.record(z.any()).optional(),
  categories: z.array(z.string()).optional(),
  supplierMetadata: z.record(z.any()).optional(),
});

export const SearchSupplierProductsSchema = z.object({
  query: z.string(),
  supplierId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

// ============================================
// SHOP STORE SCHEMAS
// ============================================

export const CreateShopStoreSchema = z.object({
  userId: z.string().uuid(),
  shopName: z.string().min(3).max(100),
  shopSlug: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  shopType: z.enum(['classic', 'dropshipping', 'digital', 'hybrid']),
  vatEnabled: z.boolean().default(false),
  vatNumber: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const ShopStoreSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  shopName: z.string(),
  shopSlug: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  shopType: z.string(),
  isActive: z.boolean(),
  vatEnabled: z.boolean(),
  vatNumber: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ============================================
// PRODUCT SCHEMAS
// ============================================

export const CreateProductSchema = z.object({
  storeId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  sku: z.string().optional(),
  costPrice: z.number().nonnegative().optional(),
  retailPrice: z.number().positive(),
  productType: z.enum(['physical', 'digital', 'service']).default('physical'),
  isDigital: z.boolean().default(false),
  images: z.array(z.string().url()).optional(),
  videoUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateProductSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  retailPrice: z.number().positive().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  images: z.array(z.string().url()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  costPrice: z.number().nullable(),
  retailPrice: z.number(),
  marginPercent: z.number().nullable(),
  productType: z.string(),
  isDigital: z.boolean(),
  status: z.string(),
  images: z.array(z.string()),
  videoUrl: z.string().nullable(),
  aiGeneratedAt: z.date().nullable(),
  aiAgentId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ============================================
// COMPLIANCE SCHEMAS
// ============================================

export const UserConsentSchema = z.object({
  userId: z.string().uuid(),
  marketingEmails: z.boolean().default(false),
  dataProcessing: z.boolean().default(false),
  termsAccepted: z.boolean().default(false),
  privacyPolicyAccepted: z.boolean().default(false),
  georgianTermsAccepted: z.boolean().default(false),
});

export const RequestDataExportSchema = z.object({
  userId: z.string().uuid(),
  format: z.enum(['json', 'csv']).default('json'),
});

export const DeleteAccountSchema = z.object({
  userId: z.string().uuid(),
  password: z.string(),
  confirmDelete: z.boolean(),
});

// ============================================
// SHIPPING SCHEMAS
// ============================================

export const ShippingProfileSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  baseCost: z.number().nonnegative(), // cents
  perKgCost: z.number().nonnegative(), // cents per kg
  estimatedDaysMin: z.number().positive().int(),
  estimatedDaysMax: z.number().positive().int(),
  isActive: z.boolean(),
  metadataJson: z.record(z.any()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateShippingProfileSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  baseCost: z.number().nonnegative('Base cost must be >= 0'),
  perKgCost: z.number().nonnegative('Per-kg cost must be >= 0'),
  estimatedDaysMin: z.number().positive().int(),
  estimatedDaysMax: z.number().positive().int(),
  description: z.string().optional(),
});

export const ShippingEventSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned']),
  location: z.string().nullable(),
  trackingCode: z.string().nullable(),
  metadataJson: z.record(z.any()).nullable(),
  createdAt: z.date(),
});

export const AddShippingEventSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(['pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned']),
  location: z.string().optional(),
  trackingCode: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const SelectShippingProfileSchema = z.object({
  orderId: z.string().uuid(),
  shippingProfileId: z.string().uuid(),
  weightGrams: z.number().nonnegative().int().optional(),
});

export const ShippingTrackingSchema = z.object({
  orderId: z.string().uuid(),
  shippingStatus: z.enum(['pending', 'processing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned']),
  trackingCode: z.string().nullable(),
  estimatedDaysMin: z.number(),
  estimatedDaysMax: z.number(),
  events: z.array(ShippingEventSchema),
  currentLocation: z.string().nullable(),
  lastUpdated: z.string(),
});

// ============================================
// MARGIN VALIDATION SCHEMAS
// ============================================

export const ComputeMarginSchema = z.object({
  retailPriceCents: z.number().nonnegative(),
  costPriceCents: z.number().nonnegative(),
  shippingCostCents: z.number().nonnegative().default(0),
  vatAmountCents: z.number().nonnegative().optional(),
  vatRate: z.number().min(0).max(10000).default(1800), // 1800 = 18%
  platformFeeBps: z.number().min(0).max(10000).optional(),
  affiliateFeeBps: z.number().min(0).max(10000).optional(),
  productType: z.enum(['physical', 'digital', 'dropshipping', 'service']).optional(),
});

export const ValidateProductForPublishingSchema = z.object({
  retailPriceCents: z.number().positive('Retail price must be > 0'),
  costPriceCents: z.number().nonnegative(),
  shippingCostCents: z.number().nonnegative(),
  productType: z.enum(['physical', 'digital', 'dropshipping', 'service']),
  vatRate: z.number().min(0).max(10000).optional(),
});

export const BulkMarginCheckSchema = z.object({
  products: z.array(
    z.object({
      id: z.string(),
      retailPriceCents: z.number().positive(),
      costPriceCents: z.number().nonnegative(),
      shippingCostCents: z.number().nonnegative(),
      productType: z.enum(['physical', 'digital', 'dropshipping']),
    })
  ),
});

// ============================================
// COMPUTATION SCHEMAS
// ============================================

export const ComputeOrderSplitSchema = z.object({
  grossAmount: z.number().positive(),
  vatRate: z.number().min(0).max(100).default(18),
  platformFeePercent: z.number().min(0).max(100).default(5),
  affiliateFeePercent: z.number().min(0).max(100).default(5),
});

export const ComputeProductMarginSchema = z.object({
  retailPrice: z.number().positive(),
  costPrice: z.number().nonnegative(),
  platformFeePercent: z.number().min(0).max(100).default(5),
  affiliateFeePercent: z.number().min(0).max(100).default(5),
  vatRate: z.number().min(0).max(100).default(18),
});

export type CreateWallet = z.infer<typeof CreateWalletSchema>;
export type DepositToWallet = z.infer<typeof DepositToWalletSchema>;
export type WithdrawFromWallet = z.infer<typeof WithdrawFromWalletSchema>;
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

export type CreateOrder = z.infer<typeof CreateOrderSchema>;
export type UpdateOrder = z.infer<typeof UpdateOrderSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type CreateOrderItem = z.infer<typeof CreateOrderItemSchema>;

export type CreateAffiliate = z.infer<typeof CreateAffiliateSchema>;
export type AffiliateTracking = z.infer<typeof AffiliateTrackingSchema>;
export type TrackAffiliateClick = z.infer<typeof TrackAffiliateClickSchema>;
export type CreateAffiliateConversion = z.infer<typeof CreateAffiliateConversionSchema>;

export type CreateDigitalLicense = z.infer<typeof CreateDigitalLicenseSchema>;
export type DigitalLicense = z.infer<typeof DigitalLicenseSchema>;
export type TransferDigitalLicense = z.infer<typeof TransferDigitalLicenseSchema>;

export type CreateSupplierProduct = z.infer<typeof CreateSupplierProductSchema>;
export type SearchSupplierProducts = z.infer<typeof SearchSupplierProductsSchema>;

export type CreateShopStore = z.infer<typeof CreateShopStoreSchema>;
export type ShopStore = z.infer<typeof ShopStoreSchema>;

export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
export type Product = z.infer<typeof ProductSchema>;

export type UserConsent = z.infer<typeof UserConsentSchema>;
export type RequestDataExport = z.infer<typeof RequestDataExportSchema>;
export type DeleteAccount = z.infer<typeof DeleteAccountSchema>;

export type ShippingProfile = z.infer<typeof ShippingProfileSchema>;
export type CreateShippingProfile = z.infer<typeof CreateShippingProfileSchema>;
export type ShippingEvent = z.infer<typeof ShippingEventSchema>;
export type AddShippingEvent = z.infer<typeof AddShippingEventSchema>;
export type SelectShippingProfile = z.infer<typeof SelectShippingProfileSchema>;
export type ShippingTracking = z.infer<typeof ShippingTrackingSchema>;

export type ComputeMargin = z.infer<typeof ComputeMarginSchema>;
export type ValidateProductForPublishing = z.infer<typeof ValidateProductForPublishingSchema>;
export type BulkMarginCheck = z.infer<typeof BulkMarginCheckSchema>;

export type ComputeOrderSplit = z.infer<typeof ComputeOrderSplitSchema>;
export type ComputeProductMargin = z.infer<typeof ComputeProductMarginSchema>;
