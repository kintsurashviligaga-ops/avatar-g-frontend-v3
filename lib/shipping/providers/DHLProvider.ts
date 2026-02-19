// Avatar G DHL Provider (Stub)
// Global tracking provider with API in many countries
// TODO: Implement DHL Express integration
//
// Integration specs:
// - API: https://developer.dhl.com/api-reference/shipment-tracking-apis
// - Auth: OAuth 2.0 + API Key
// - Format: RESTful JSON
// - Webhook: Webhook subscription for tracking updates
// - Docs: https://developer.dhl.com/
//
// Implementation checklist:
// - [ ] Register app on DHL Developer Portal
// - [ ] Get OAuth credentials and API key
// - [ ] Implement createShipment: POST /shipment/create_shipment_request
// - [ ] Implement getTracking: GET /track/shipments/{trackingNumber}
// - [ ] Parse JSON responses into TrackingEvent format
// - [ ] Implement webhook handler: POST /api/webhooks/dhl
// - [ ] Test with DHL sandbox/test account
// - [ ] Document tracking status mappings (DHL statuses -> our status enum)
// - [ ] Support multi-country routing
// - [ ] Handle DHL service codes (EXPRESS, ECONOMIC, etc.)

import {
  ShippingProvider,
  ShipmentCreateData,
  TrackingResponse,
  ShipmentResponse,
  ShippingProviderConfig,
  TrackingEvent,
} from '../ShippingProvider';

export class DHLProvider extends ShippingProvider {
  getProviderName(): string {
    return 'dhl';
  }

  async createShipment(
    _data: ShipmentCreateData,
    _config: ShippingProviderConfig
  ): Promise<ShipmentResponse> {
    throw new Error('DHL provider not yet implemented. Expected Q3 2026.');
    // TODO: Replace above with implementation
    // Expected implementation:
    // 1. Authenticate with DHL OAuth
    // 2. Build shipment request with order & address details
    // 3. POST to DHL Shipment API
    // 4. Parse response to extract tracking number and label
    // 5. Return ShipmentResponse with DHL tracking details
  }

  async getTracking(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<TrackingResponse> {
    throw new Error('DHL provider not yet implemented. Expected Q3 2026.');
    // TODO: Implement DHL tracking lookup
  }

  async cancelShipment(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<{ success: boolean; message?: string }> {
    throw new Error('DHL provider not yet implemented. Expected Q3 2026.');
  }

  verifyWebhookSignature(
    _payload: unknown,
    _signature: string,
    _config: ShippingProviderConfig
  ): boolean {
    // TODO: Implement DHL webhook signature verification
    throw new Error('DHL provider not yet implemented. Expected Q3 2026.');
  }

  async processWebhookEvent(
    _payload: unknown,
    _config: ShippingProviderConfig
  ): Promise<TrackingEvent> {
    // TODO: Parse DHL webhook payload and convert to TrackingEvent
    throw new Error('DHL provider not yet implemented. Expected Q3 2026.');
  }
}
