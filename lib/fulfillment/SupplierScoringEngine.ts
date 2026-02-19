// AI Supplier Scoring Engine
// Intelligent supplier selection based on multiple factors

import { SupabaseClient } from '@supabase/supabase-js';

export interface SupplierScore {
  supplierId: string;
  supplierName: string;
  costCents: number;
  score: number;
  breakdown: {
    priceScore: number;
    shippingScore: number;
    ratingScore: number;
    riskScore: number;
  };
}

export interface ScoringWeights {
  price: number; // 0-1 (default: 0.4)
  shipping: number; // 0-1 (default: 0.3)
  rating: number; // 0-1 (default: 0.2)
  risk: number; // 0-1 (default: 0.1)
}

type SupplierDetails = {
  id: string;
  name: string;
  rating: number;
  avg_shipping_days: number;
  return_rate: number;
  is_active: boolean;
};

type SupplierProductRow = {
  id: string;
  supplier_id: string;
  cost_cents: number;
  shipping_days_min: number;
  shipping_days_max: number;
  suppliers: SupplierDetails[];
};

export class SupplierScoringEngine {
  private supabase: SupabaseClient;
  private weights: ScoringWeights;

  constructor(
    supabase: SupabaseClient,
    weights: ScoringWeights = {
      price: 0.4,
      shipping: 0.3,
      rating: 0.2,
      risk: 0.1,
    }
  ) {
    this.supabase = supabase;
    this.weights = weights;
  }

  /**
   * Select best supplier for a product using AI scoring
   */
  async selectBestSupplier(productId: string): Promise<SupplierScore | null> {
    try {
      // Get all available suppliers for this product
      const { data: supplierProducts, error } = await this.supabase
        .from('supplier_products')
        .select(
          `
          id,
          supplier_id,
          cost_cents,
          shipping_days_min,
          shipping_days_max,
          suppliers (
            id,
            name,
            rating,
            avg_shipping_days,
            return_rate,
            is_active
          )
        `
        )
        .eq('product_id', productId)
        .eq('is_available', true);

      if (error || !supplierProducts || supplierProducts.length === 0) {
        console.error('No suppliers found for product:', productId, error);
        return null;
      }

      // Score each supplier
      const rows = supplierProducts as SupplierProductRow[];
      const scored = rows
        .filter((sp) => (sp.suppliers[0]?.is_active ?? false))
        .map((sp) => {
          const supplier = sp.suppliers[0];
          if (!supplier) {
            return null;
          }
          const breakdown = this.calculateIndividualScores(
            sp.cost_cents,
            supplier.avg_shipping_days,
            supplier.rating,
            supplier.return_rate
          );

          const finalScore = this.calculateFinalScore(breakdown);

          return {
            supplierId: supplier.id,
            supplierName: supplier.name,
            costCents: sp.cost_cents,
            score: finalScore,
            breakdown,
          };
        })
        .filter((value): value is SupplierScore => value !== null);

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      return scored[0] || null;
    } catch (error) {
      console.error('Error in supplier scoring:', error);
      return null;
    }
  }

  /**
   * Get top N suppliers for a product
   */
  async getTopSuppliers(productId: string, limit: number = 3): Promise<SupplierScore[]> {
    try {
      const { data: supplierProducts, error } = await this.supabase
        .from('supplier_products')
        .select(
          `
          id,
          supplier_id,
          cost_cents,
          shipping_days_min,
          shipping_days_max,
          suppliers (
            id,
            name,
            rating,
            avg_shipping_days,
            return_rate,
            is_active
          )
        `
        )
        .eq('product_id', productId)
        .eq('is_available', true);

      if (error || !supplierProducts) {
        return [];
      }

      const rows = supplierProducts as SupplierProductRow[];
      const scored = rows
        .filter((sp) => (sp.suppliers[0]?.is_active ?? false))
        .map((sp) => {
          const supplier = sp.suppliers[0];
          if (!supplier) {
            return null;
          }
          const breakdown = this.calculateIndividualScores(
            sp.cost_cents,
            supplier.avg_shipping_days,
            supplier.rating,
            supplier.return_rate
          );

          const finalScore = this.calculateFinalScore(breakdown);

          return {
            supplierId: supplier.id,
            supplierName: supplier.name,
            costCents: sp.cost_cents,
            score: finalScore,
            breakdown,
          };
        })
        .filter((value): value is SupplierScore => value !== null);

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit);
    } catch (error) {
      console.error('Error getting top suppliers:', error);
      return [];
    }
  }

  /**
   * Calculate individual component scores (normalized 0-1)
   */
  private calculateIndividualScores(
    costCents: number,
    avgShippingDays: number,
    rating: number,
    returnRate: number
  ) {
    // Price score: Lower cost = higher score (inverse normalized)
    const priceScore = this.normalize(1 / (costCents / 1000 + 1), 0, 1);

    // Shipping score: Faster shipping = higher score (inverse)
    const shippingScore = this.normalize(1 / (avgShippingDays + 1), 0, 0.5);

    // Rating score: Higher rating = higher score (already 0-5, normalize to 0-1)
    const ratingScore = this.normalize(rating, 0, 5);

    // Risk score: Lower return rate = higher score
    const riskScore = this.normalize(1 - returnRate / 100, 0, 1);

    return {
      priceScore,
      shippingScore,
      ratingScore,
      riskScore,
    };
  }

  /**
   * Calculate weighted final score
   */
  private calculateFinalScore(breakdown: {
    priceScore: number;
    shippingScore: number;
    ratingScore: number;
    riskScore: number;
  }): number {
    const score =
      this.weights.price * breakdown.priceScore +
      this.weights.shipping * breakdown.shippingScore +
      this.weights.rating * breakdown.ratingScore +
      this.weights.risk * breakdown.riskScore;

    return Math.round(score * 10000) / 10000; // 4 decimal places
  }

  /**
   * Normalize value to 0-1 range
   */
  private normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized)); // Clamp to 0-1
  }

  /**
   * Update scoring weights dynamically
   */
  setWeights(weights: Partial<ScoringWeights>) {
    this.weights = { ...this.weights, ...weights };
    
    // Ensure weights sum to 1.0
    const sum =
      this.weights.price +
      this.weights.shipping +
      this.weights.rating +
      this.weights.risk;
    
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(`Weights sum to ${sum}, should sum to 1.0. Normalizing...`);
      this.weights.price /= sum;
      this.weights.shipping /= sum;
      this.weights.rating /= sum;
      this.weights.risk /= sum;
    }
  }
}
