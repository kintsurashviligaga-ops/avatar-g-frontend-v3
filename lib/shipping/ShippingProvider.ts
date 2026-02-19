// Avatar G Shipping Provider Interface
// Supports: Manual, Georgian Post, DHL, UPS, Glovo, Wolt
// All implementations must return consistent tracking data

export interface ShipmentCreateData {
  orderId: string;
  sellerUserId: string;
  items: Array<{
    name: string;
    quantity: number;
  }>;
  shippingAddress: {
    country: string;
    city: string;
    street: string;
    zip: string;
    phone: string;
    name: string;
  };
  serviceLevel: 'standard' | 'express';
}

export interface TrackingEvent {
  status: string;
  location?: string;
  message?: string;
  occurredAt: Date;
}

export interface ShipmentResponse {
  trackingNumber: string;
  trackingUrl?: string;
  initialStatus: string;
  eta?: {
    minDays: number;
    maxDays: number;
  };
}

export interface TrackingResponse {
  status: string;
  events: TrackingEvent[];
  carrier: string;
  currentLocation?: string;
  eta?: {
    minDays: number;
    maxDays: number;
  };
  shippedAt?: Date;
  deliveredAt?: Date;
}

export interface ShippingProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  merchantId?: string;
  webhookSecret?: string;
  [key: string]: unknown;
}

export abstract class ShippingProvider {
  abstract getProviderName(): string;

  /**
   * Create a shipment with the carrier
   * Returns tracking details
   */
  abstract createShipment(
    data: ShipmentCreateData,
    config: ShippingProviderConfig
  ): Promise<ShipmentResponse>;

  /**
   * Get current tracking status from carrier
   */
  abstract getTracking(
    trackingNumber: string,
    config: ShippingProviderConfig
  ): Promise<TrackingResponse>;

  /**
   * Cancel a shipment with the carrier
   */
  abstract cancelShipment(
    trackingNumber: string,
    config: ShippingProviderConfig
  ): Promise<{ success: boolean; message?: string }>;

  /**
   * Verify webhook signature from carrier
   */
  abstract verifyWebhookSignature(
    payload: unknown,
    signature: string,
    config: ShippingProviderConfig
  ): boolean;

  /**
   * Process webhook event from carrier
   */
  abstract processWebhookEvent(
    payload: unknown,
    config: ShippingProviderConfig
  ): Promise<TrackingEvent>;
}
