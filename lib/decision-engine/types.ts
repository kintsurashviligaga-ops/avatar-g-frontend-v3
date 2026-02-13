/**
 * Decision Engine Types - Product profitability evaluation
 */

export type ProductType = 'standard' | 'dropshipping' | 'digital';
export type Decision = 'publish' | 'reject';

export interface ProductCandidate {
  productType: ProductType;
  retailPriceCents: number;
  supplierCostCents: number;
  shippingCostCents: number;
  vatEnabled: boolean;
  buyerCountryCode?: string;
  platformFeeBps?: number;
  affiliateBps?: number;
  refundReserveBps?: number;
  shippingDaysMax?: number;
  vatRateBps?: number;
}

export interface DecisionResult {
  decision: Decision;
  reasons: string[];
  warnings: string[];
  computed: {
    netPerOrderCents: number;
    marginBps: number;
    marginPercent: number;
    vatAmountCents: number;
    totalCostsCents: number;
  };
  recommendedPriceCents?: number;
}

export interface MarginThresholds {
  standard: number; // bps, default 1500 = 15%
  dropshipping: number; // bps, default 2500 = 25%
  digital: number; // bps, default 7000 = 70%
}
