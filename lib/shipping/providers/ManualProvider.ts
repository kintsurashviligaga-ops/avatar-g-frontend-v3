// Avatar G Manual Shipping Provider (MVP)
// Sellers manually input tracking numbers and update status

import {
  ShippingProvider,
  ShipmentCreateData,
  TrackingResponse,
  ShipmentResponse,
  ShippingProviderConfig,
  TrackingEvent,
} from '../ShippingProvider';

export class ManualProvider extends ShippingProvider {
  getProviderName(): string {
    return 'manual';
  }

  async createShipment(
    _data: ShipmentCreateData,
    _config: ShippingProviderConfig
  ): Promise<ShipmentResponse> {
    // Manual provider doesn't generate tracking numbers
    // Seller will provide them via the dashboard
    return {
      trackingNumber: '', // Seller enters manually
      initialStatus: 'label_created',
      eta: {
        minDays: 2,
        maxDays: 7,
      },
    };
  }

  async getTracking(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<TrackingResponse> {
    // Manual tracking just returns empty events
    // Events are managed by the seller
    return {
      status: 'in_transit',
      events: [],
      carrier: 'manual',
      eta: {
        minDays: 2,
        maxDays: 7,
      },
    };
  }

  async cancelShipment(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<{ success: boolean; message?: string }> {
    // Manual provider cannot cancel (seller must do manually)
    return {
      success: false,
      message: 'Manual shipments must be canceled by the seller',
    };
  }

  verifyWebhookSignature(
    _payload: unknown,
    _signature: string,
    _config: ShippingProviderConfig
  ): boolean {
    // Manual provider has no webhooks
    return false;
  }

  async processWebhookEvent(
    _payload: unknown,
    _config: ShippingProviderConfig
  ): Promise<TrackingEvent> {
    // Manual provider has no webhooks
    throw new Error('Manual provider does not support webhook events');
  }
}
