// Avatar G Georgian Post Provider (Stub)
// TODO: Implement Georgian Post API integration
// 
// Integration specs:
// - API: https://www.georgianpost.ge/api/
// - Auth: Merchant ID + API Key
// - Format: XML request/response
// - Webhook: POST callback on status updates
// - Docs: https://www.georgianpost.ge/en/business/api
//
// Implementation checklist:
// - [ ] Register merchant account with Georgian Post
// - [ ] Get API credentials
// - [ ] Implement createShipment: POST /api/shipments with order details
// - [ ] Implement getTracking: GET /api/tracking?number=XYZ
// - [ ] Parse XML responses into TrackingEvent format
// - [ ] Implement webhook handler: POST /api/webhooks/georgian-post
// - [ ] Test with Georgian Post sandbox environment
// - [ ] Document tracking status mappings (their statuses -> our status enum)

import {
  ShippingProvider,
  ShipmentCreateData,
  TrackingResponse,
  ShipmentResponse,
  ShippingProviderConfig,
  TrackingEvent,
} from '../ShippingProvider';

export class GeorgianPostProvider extends ShippingProvider {
  getProviderName(): string {
    return 'georgian_post';
  }

  async createShipment(
    _data: ShipmentCreateData,
    _config: ShippingProviderConfig
  ): Promise<ShipmentResponse> {
    throw new Error(
      'Georgian Post provider not yet implemented. Expected Q2 2026.'
    );
    // TODO: Replace above with implementation
    // Expected implementation:
    // 1. Build XML request with order details
    // 2. POST to Georgian Post API
    // 3. Parse XML response to extract tracking number
    // 4. Return ShipmentResponse with tracking details
  }

  async getTracking(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<TrackingResponse> {
    throw new Error(
      'Georgian Post provider not yet implemented. Expected Q2 2026.'
    );
    // TODO: Implement Georgian Post tracking lookup
  }

  async cancelShipment(
    _trackingNumber: string,
    _config: ShippingProviderConfig
  ): Promise<{ success: boolean; message?: string }> {
    throw new Error(
      'Georgian Post provider not yet implemented. Expected Q2 2026.'
    );
  }

  verifyWebhookSignature(
    _payload: unknown,
    _signature: string,
    _config: ShippingProviderConfig
  ): boolean {
    // TODO: Implement HMAC verification using Georgian Post webhook secret
    throw new Error(
      'Georgian Post provider not yet implemented. Expected Q2 2026.'
    );
  }

  async processWebhookEvent(
    _payload: unknown,
    _config: ShippingProviderConfig
  ): Promise<TrackingEvent> {
    // TODO: Parse webhook payload and convert to TrackingEvent
    throw new Error(
      'Georgian Post provider not yet implemented. Expected Q2 2026.'
    );
  }
}
