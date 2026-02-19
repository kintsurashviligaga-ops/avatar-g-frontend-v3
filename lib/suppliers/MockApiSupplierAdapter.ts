// Mock API Supplier Adapter
// Example implementation for API-based dropshipping
// Can be extended for real suppliers (Alibaba, CJ Dropshipping, etc.)

import {
  SupplierAdapter,
  SupplierProduct,
  OrderPayload,
  SupplierOrderResponse,
  TrackingInfo,
  SupplierSearchResult,
} from './SupplierAdapter';

export class MockApiSupplierAdapter extends SupplierAdapter {
  private readonly timeout: number = 30000; // 30 second timeout

  constructor(config: {
    supplierId: string;
    supplierName: string;
    apiEndpoint: string;
    apiKey: string;
  }) {
    super(config);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  async searchProducts(query: string): Promise<SupplierSearchResult> {
    try {
      const response = await this.makeRequest('/products/search', {
        method: 'POST',
        body: JSON.stringify({ query }),
      });

      const productsRaw = response.products;
      const products = Array.isArray(productsRaw) ? (productsRaw as SupplierProduct[]) : [];
      const totalCount = typeof response.totalCount === 'number' ? response.totalCount : 0;

      return {
        products,
        totalCount,
      };
    } catch (error) {
      console.error('Error searching products:', error);
      return { products: [], totalCount: 0 };
    }
  }

  async getProduct(supplierSku: string): Promise<SupplierProduct | null> {
    try {
      const response = await this.makeRequest(`/products/${supplierSku}`, {
        method: 'GET',
      });

      const product = this.isRecord(response.product) ? response.product : null;

      if (!product) return null;

      const sku = typeof product.sku === 'string' ? product.sku : supplierSku;
      const name = typeof product.name === 'string' ? product.name : 'Unknown product';
      const priceCents = typeof product.price_cents === 'number' ? product.price_cents : 0;
      const currency = typeof product.currency === 'string' ? product.currency : 'USD';
      const shippingDaysMin = typeof product.shipping_days_min === 'number' ? product.shipping_days_min : 7;
      const shippingDaysMax = typeof product.shipping_days_max === 'number' ? product.shipping_days_max : 14;
      const stockQuantity = typeof product.stock_quantity === 'number' ? product.stock_quantity : undefined;
      const isAvailable = product.is_available !== false;

      return {
        supplierSku: sku,
        name,
        costCents: priceCents,
        currency,
        shippingDaysMin,
        shippingDaysMax,
        stockQuantity,
        isAvailable,
      };
    } catch (error) {
      console.error('Error fetching product:', error);
      return null;
    }
  }

  async createOrder(payload: OrderPayload): Promise<SupplierOrderResponse> {
    try {
      const response = await this.makeRequest('/orders/create', {
        method: 'POST',
        body: JSON.stringify({
          reference: payload.orderReference,
          customer: {
            name: payload.customerName,
            address: payload.shippingAddress,
          },
          items: payload.items.map((item) => ({
            sku: item.supplierSku,
            quantity: item.quantity,
          })),
          metadata: payload.metadata,
        }),
      });

      const success = response.success === true;

      if (!success) {
        return {
          success: false,
          error: typeof response.error === 'string' ? response.error : 'Order creation failed',
          errorCode: typeof response.error_code === 'string' ? response.error_code : undefined,
        };
      }

      return {
        success: true,
        supplierOrderId: typeof response.order_id === 'string' ? response.order_id : undefined,
        trackingNumber: typeof response.tracking_number === 'string' ? response.tracking_number : undefined,
        carrier: typeof response.carrier === 'string' ? response.carrier : undefined,
        estimatedDeliveryDate: typeof response.estimated_delivery === 'string' ? response.estimated_delivery : undefined,
      };
    } catch (error: unknown) {
      console.error('Error creating order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API request failed',
        errorCode: 'API_ERROR',
      };
    }
  }

  async getTracking(supplierOrderId: string): Promise<TrackingInfo | null> {
    try {
      const response = await this.makeRequest(`/orders/${supplierOrderId}/tracking`, {
        method: 'GET',
      });

      const tracking = this.isRecord(response.tracking) ? response.tracking : null;

      if (!tracking) return null;

      const events = Array.isArray(tracking.events) ? tracking.events : [];
      const trackingNumber = typeof tracking.number === 'string' ? tracking.number : '';
      const carrier = typeof tracking.carrier === 'string' ? tracking.carrier : 'Unknown';
      const statusRaw = typeof tracking.status === 'string' ? tracking.status : 'pending';

      return {
        trackingNumber,
        carrier,
        status: this.normalizeStatus(statusRaw),
        events: events
          .filter((event): event is Record<string, unknown> => this.isRecord(event))
          .map((event) => ({
            timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
            status: typeof event.status === 'string' ? event.status : 'pending',
            location: typeof event.location === 'string' ? event.location : undefined,
            description: typeof event.description === 'string' ? event.description : 'Tracking update',
          })),
        estimatedDeliveryDate:
          typeof tracking.estimated_delivery === 'string' ? tracking.estimated_delivery : undefined,
      };
    } catch (error) {
      console.error('Error fetching tracking:', error);
      return null;
    }
  }

  async cancelOrder(supplierOrderId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.makeRequest(`/orders/${supplierOrderId}/cancel`, {
        method: 'POST',
      });

      return {
        success: response.success === true,
        error: typeof response.error === 'string' ? response.error : undefined,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancellation failed',
      };
    }
  }

  supportsFeature(
    feature: 'auto_tracking' | 'cancellation' | 'returns' | 'webhooks'
  ): boolean {
    return ['auto_tracking', 'cancellation', 'webhooks'].includes(feature);
  }

  /**
   * Make HTTP request to supplier API
   */
  private async makeRequest(
    endpoint: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: string;
      headers?: Record<string, string>;
    }
  ): Promise<Record<string, unknown>> {
    const url = `${this.apiEndpoint}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const json: unknown = await response.json();
      if (!this.isRecord(json)) {
        throw new Error('Invalid supplier API response format');
      }
      return json;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Normalize supplier-specific status to standard format
   */
  private normalizeStatus(
    status: string
  ): 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' {
    const normalized = status.toLowerCase();

    if (normalized.includes('delivered')) return 'delivered';
    if (normalized.includes('out for delivery')) return 'out_for_delivery';
    if (normalized.includes('transit') || normalized.includes('shipping'))
      return 'in_transit';
    if (normalized.includes('failed') || normalized.includes('returned')) return 'failed';

    return 'pending';
  }
}
