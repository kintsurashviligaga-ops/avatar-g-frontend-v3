/**
 * TBC Bank Payment Provider (Stub - Ready for Implementation)
 * 
 * Georgian Bank Integration:
 * - Merchant ID: provided by TBC
 * - API Key: secure authentication token
 * - Callback URL: webhook endpoint
 * - Signature verification: HMAC-SHA256
 *
 * Future Implementation Notes:
 * - TBC requires specific XML request/response format
 * - Callback includes transaction status
 * - Refund handling via TBC API
 * - 3D Secure support available
 */

import {
  PaymentProvider,
  PaymentIntent,
  RefundRequest,
  RefundResult,
} from '../PaymentProvider';

export class TbcPaymentProvider implements PaymentProvider {
  private merchantId: string;
  private apiKey: string;

  constructor(merchantId: string, apiKey: string) {
    this.merchantId = merchantId;
    this.apiKey = apiKey;
  }

  async createPaymentIntent(
    _amountCents: number,
    _currency: 'GEL' | 'USD',
    _metadata?: Record<string, string>,
  ): Promise<PaymentIntent> {
    // TODO: Implement TBC API call
    throw new Error('TBC Bank integration not yet implemented');
  }

  async getPaymentStatus(_paymentId: string): Promise<PaymentIntent> {
    // TODO: Implement TBC status check
    throw new Error('TBC Bank integration not yet implemented');
  }

  verifyWebhookSignature(_payload: string | Buffer, _signature: string, _secret: string): boolean {
    // TODO: Implement TBC HMAC verification
    // TBC uses SHA-256 HMAC for signature verification
    throw new Error('TBC Bank integration not yet implemented');
  }

  async processWebhookEvent(_eventType: string, _eventPayload: Record<string, unknown>): Promise<void> {
    // TODO: Process TBC webhook events
    throw new Error('TBC Bank integration not yet implemented');
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    // TODO: Implement TBC refund
    throw new Error('TBC Bank integration not yet implemented');
  }

  getProviderName(): string {
    return 'TBC Bank';
  }
}
