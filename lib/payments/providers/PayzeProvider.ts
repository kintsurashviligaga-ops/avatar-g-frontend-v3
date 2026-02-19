/**
 * Payze Payment Provider (Stub - Ready for Implementation)
 *
 * Georgian Payment Gateway:
 * - API credentials: merchant_id, api_key
 * - Webhook verification: signature-based
 * - Supports local cards, Visa, Mastercard, Apple Pay, Google Pay
 *
 * Future Implementation Notes:
 * - Payze API for payment processing
 * - Simplified integration for Georgian market
 * - Real-time settlement options
 * - Recurring billing support
 * - Plugin support (WooCommerce, PrestaShop, etc.)
 */

import {
  PaymentProvider,
  PaymentIntent,
  RefundRequest,
  RefundResult,
} from '../PaymentProvider';

export class PayzePaymentProvider implements PaymentProvider {
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
    // TODO: Implement Payze API call
    throw new Error('Payze integration not yet implemented');
  }

  async getPaymentStatus(_paymentId: string): Promise<PaymentIntent> {
    // TODO: Implement Payze status check
    throw new Error('Payze integration not yet implemented');
  }

  verifyWebhookSignature(_payload: string | Buffer, _signature: string, _secret: string): boolean {
    // TODO: Implement Payze signature verification
    throw new Error('Payze integration not yet implemented');
  }

  async processWebhookEvent(_eventType: string, _eventPayload: Record<string, unknown>): Promise<void> {
    // TODO: Process Payze webhook events
    throw new Error('Payze integration not yet implemented');
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    // TODO: Implement Payze refund
    throw new Error('Payze integration not yet implemented');
  }

  getProviderName(): string {
    return 'Payze';
  }
}
