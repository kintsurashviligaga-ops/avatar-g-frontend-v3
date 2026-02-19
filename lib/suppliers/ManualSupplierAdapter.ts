// Manual Supplier Adapter
// For sellers who handle fulfillment manually

import {
  SupplierAdapter,
  SupplierProduct,
  OrderPayload,
  SupplierOrderResponse,
  TrackingInfo,
  SupplierSearchResult,
} from './SupplierAdapter';

export class ManualSupplierAdapter extends SupplierAdapter {
  constructor(supplierId: string, supplierName: string = 'Manual Fulfillment') {
    super({
      supplierId,
      supplierName,
    });
  }

  async searchProducts(_query: string): Promise<SupplierSearchResult> {
    // Manual suppliers don't have searchable catalog
    return {
      products: [],
      totalCount: 0,
    };
  }

  async getProduct(_supplierSku: string): Promise<SupplierProduct | null> {
    // Manual suppliers require database lookup
    // This should be implemented with Supabase query
    return null;
  }

  async createOrder(_payload: OrderPayload): Promise<SupplierOrderResponse> {
    // Manual fulfillment: just create a job and notify seller
    // No external API call needed
    return {
      success: true,
      supplierOrderId: `MANUAL-${Date.now()}`,
      // Tracking and carrier will be added manually by seller
    };
  }

  async getTracking(_supplierOrderId: string): Promise<TrackingInfo | null> {
    // Manual tracking is entered by seller, fetch from database
    return null;
  }

  async cancelOrder(_supplierOrderId: string): Promise<{ success: boolean; error?: string }> {
    // Manual orders can be cancelled (just update status)
    return { success: true };
  }

  supportsFeature(
    feature: 'auto_tracking' | 'cancellation' | 'returns' | 'webhooks'
  ): boolean {
    return feature === 'cancellation';
  }
}
