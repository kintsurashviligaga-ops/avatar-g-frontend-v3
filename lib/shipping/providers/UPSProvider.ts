// Avatar G UPS Provider (Stub)
// Global shipping carrier similar to DHL
// TODO: Implement UPS Shipping API integration
//
// Integration specs:
// - API: https://www.ups.com/upsdeveloperkit
// - Auth: License Number + API Key + User ID
// - Format: XML or JSON (XML legacy, JSON newer)
// - Webhook: No webhooks; polling recommended
// - Docs: https://developer.ups.com/
//
// Implementation checklist:
// - [ ] Register UPS Developer account
// - [ ] Get API credentials
// - [ ] Implement createShipment: POST to UPS Ship API
// - [ ] Implement getTracking: POST to UPS Track API (XML request/response)
// - [ ] Parse XML responses into TrackingEvent format
// - [ ] Set up polling or webhook alternative for status updates
// - [ ] Test with UPS test environment
// - [ ] Document tracking status mappings (UPS statuses -> our status enum)
// - [ ] Support rate quoting API for accurate pricing
// - [ ] Handle service types (Ground, Express, SurePost, etc.)

import {
  ShippingProvider,
  ShipmentCreateData,
  TrackingResponse,
  ShipmentResponse,
  ShippingProviderConfig,
  TrackingEvent,
} from '../ShippingProvider';

export class UPSProvider extends ShippingProvider {
  getProviderName(): string {
    return 'ups';
  }

  async createShipment(
    _data: ShipmentCreateData,
    _config: ShippingProviderConfig
  ): Promise<ShipmentResponse> {
    throw new Error('UPS provider not yet implemented. Expected Q3 2026.');
    // TODO: Replace above with implementation
    // Expected implementation:
    // 1. Authenticate with UPS API
    // 2. Build shipment XML/JSON with order details
    // 3. POST to UPS Ship API endpoint
    // 4. Parse response to extract tracking number
    // 5. Return ShipmentResponse with UPS tracking details
  }

  async getTracking(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<TrackingResponse> {
    throw new Error('UPS provider not yet implemented. Expected Q3 2026.');
    // TODO: Implement UPS tracking lookup
  }

  async cancelShipment(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<{ success: boolean; message?: string }> {
    throw new Error('UPS provider not yet implemented. Expected Q3 2026.');
  }

  verifyWebhookSignature(
    _payload: unknown,
    _signature: string,
    _config: ShippingProviderConfig
  ): boolean {
    // UPS doesn't support webhooks; uses polling model
    throw new Error('UPS provider not yet implemented. Expected Q3 2026.');
  }

  async processWebhookEvent(
    _payload: unknown,
    _config: ShippingProviderConfig
  ): Promise<TrackingEvent> {
    // UPS uses polling, not webhooks
    throw new Error('UPS provider not yet implemented. Expected Q3 2026.');
  }
}
