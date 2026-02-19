// Supplier Adapter Interface
// Abstraction layer for multi-supplier fulfillment

export interface SupplierProduct {
  supplierSku: string;
  name: string;
  costCents: number;
  currency: string;
  shippingDaysMin: number;
  shippingDaysMax: number;
  stockQuantity?: number; // null = unlimited
  isAvailable: boolean;
}

export interface OrderPayload {
  orderReference: string; // Internal order ID
  customerName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  items: Array<{
    supplierSku: string;
    quantity: number;
    unitPriceCents: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface SupplierOrderResponse {
  success: boolean;
  supplierOrderId?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
  error?: string;
  errorCode?: string;
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed';
  events: Array<{
    timestamp: string;
    status: string;
    location?: string;
    description: string;
  }>;
  estimatedDeliveryDate?: string;
}

export interface SupplierSearchResult {
  products: SupplierProduct[];
  totalCount: number;
}

/**
 * Abstract base class for supplier integrations
 * All supplier adapters must implement these methods
 */
export abstract class SupplierAdapter {
  protected supplierId: string;
  protected supplierName: string;
  protected apiEndpoint?: string;
  protected apiKey?: string;

  constructor(config: {
    supplierId: string;
    supplierName: string;
    apiEndpoint?: string;
    apiKey?: string;
  }) {
    this.supplierId = config.supplierId;
    this.supplierName = config.supplierName;
    this.apiEndpoint = config.apiEndpoint;
    this.apiKey = config.apiKey;
  }

  /**
   * Search for products in supplier catalog
   */
  abstract searchProducts(query: string): Promise<SupplierSearchResult>;

  /**
   * Get detailed product info by supplier SKU
   */
  abstract getProduct(supplierSku: string): Promise<SupplierProduct | null>;

  /**
   * Create order with supplier (dropship)
   */
  abstract createOrder(payload: OrderPayload): Promise<SupplierOrderResponse>;

  /**
   * Get tracking information for order
   */
  abstract getTracking(supplierOrderId: string): Promise<TrackingInfo | null>;

  /**
   * Cancel order (if supported)
   */
  abstract cancelOrder(supplierOrderId: string): Promise<{ success: boolean; error?: string }>;

  /**
   * Check if supplier supports a specific feature
   */
  supportsFeature(_feature: 'auto_tracking' | 'cancellation' | 'returns' | 'webhooks'): boolean {
    return false; // Override in subclasses
  }

  /**
   * Get supplier metadata
   */
  getSupplierInfo() {
    return {
      id: this.supplierId,
      name: this.supplierName,
      endpoint: this.apiEndpoint,
    };
  }
}
