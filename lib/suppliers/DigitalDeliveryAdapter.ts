// Digital Delivery Adapter
// For digital products (instant delivery via download link)

import {
  SupplierAdapter,
  SupplierProduct,
  OrderPayload,
  SupplierOrderResponse,
  TrackingInfo,
  SupplierSearchResult,
} from './SupplierAdapter';

export class DigitalDeliveryAdapter extends SupplierAdapter {
  constructor(supplierId: string, supplierName: string = 'Digital Delivery') {
    super({
      supplierId,
      supplierName,
    });
  }

  async searchProducts(_query: string): Promise<SupplierSearchResult> {
    return {
      products: [],
      totalCount: 0,
    };
  }

  async getProduct(_supplierSku: string): Promise<SupplierProduct | null> {
    return null;
  }

  async createOrder(_payload: OrderPayload): Promise<SupplierOrderResponse> {
    // Digital products are delivered instantly
    // Generate secure download link or send license key
    
    const deliveryId = `DIGITAL-${Date.now()}`;
    
    return {
      success: true,
      supplierOrderId: deliveryId,
      // Status should immediately be set to 'delivered'
    };
  }

  async getTracking(supplierOrderId: string): Promise<TrackingInfo | null> {
    // Digital products don't have traditional tracking
    // Return instant delivery status
    return {
      trackingNumber: supplierOrderId,
      carrier: 'Digital Delivery',
      status: 'delivered',
      events: [
        {
          timestamp: new Date().toISOString(),
          status: 'delivered',
          description: 'Digital product delivered instantly',
        },
      ],
    };
  }

  async cancelOrder(_supplierOrderId: string): Promise<{ success: boolean; error?: string }> {
    // Digital products delivered instantly cannot be cancelled
    return {
      success: false,
      error: 'Digital products cannot be cancelled after delivery',
    };
  }

  supportsFeature(
    feature: 'auto_tracking' | 'cancellation' | 'returns' | 'webhooks'
  ): boolean {
    return feature === 'auto_tracking';
  }
}
