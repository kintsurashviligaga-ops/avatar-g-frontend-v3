export type ShopId = string;
export type SupplierId = string;
export type ProductId = string;
export type ImportId = string;
export type OrderId = string;
export type FulfillmentJobId = string;

export type FulfillmentStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type OrderStatus = 'new' | 'paid' | 'fulfilled' | 'cancelled';

export interface Shop {
  id: ShopId;
  userId: string;
  name: string;
  currency: 'USD' | 'EUR' | 'GEL';
  createdAt: string;
}

export interface Supplier {
  id: SupplierId;
  name: string;
  country: string;
  rating: number;
  apiMode: 'mock' | 'live';
  createdAt: string;
}

export interface Product {
  id: ProductId;
  shopId: ShopId;
  title: string;
  description: string;
  supplierId: SupplierId;
  costCents: number;
  priceCents: number;
  currency: 'USD' | 'EUR' | 'GEL';
  inventory: number;
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface ImportRecord {
  id: ImportId;
  shopId: ShopId;
  supplierId: SupplierId;
  sourceUrl: string;
  status: 'queued' | 'completed' | 'failed';
  productIds: ProductId[];
  notes?: string;
  createdAt: string;
}

export interface Order {
  id: OrderId;
  shopId: ShopId;
  productId: ProductId;
  quantity: number;
  totalCents: number;
  currency: 'USD' | 'EUR' | 'GEL';
  status: OrderStatus;
  createdAt: string;
}

export interface FulfillmentJob {
  id: FulfillmentJobId;
  orderId: OrderId;
  status: FulfillmentStatus;
  supplierPayload: Record<string, string | number | boolean | null>;
  trackingCode?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyzeProductInput {
  title: string;
  description: string;
  supplierRating: number;
  costCents: number;
}

export interface AnalyzeProductResult {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

export interface PricingRules {
  minMarginPercent: number;
  maxMarginPercent: number;
  roundToNearest: number;
}

export interface PricingRecommendation {
  recommendedPriceCents: number;
  marginPercent: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
}
