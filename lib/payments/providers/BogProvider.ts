/**
 * Bank of Georgia (BoG) Payment Provider (Stub - Ready for Implementation)
 *
 * Georgian Bank Integration:
 * - Merchant Code: provided by BoG
 * - Terminal ID: unique identifier
 * - IPEK (Interbank PIN Encryption Key): encryption key
 * - HMAC verification for security
 *
 * Future Implementation Notes:
 * - BoG Payment Switch integration
 * - ISO 8583 message format for transactions
 * - Strong Customer Authentication (SCA) support
 * - Settlement and reconciliation APIs
 */

import {
  PaymentProvider,
  PaymentIntent,
  RefundRequest,
  RefundResult,
} from '../PaymentProvider';

export class BogPaymentProvider implements PaymentProvider {
  private merchantCode: string;
  private terminalId: string;

  constructor(merchantCode: string, terminalId: string) {
    this.merchantCode = merchantCode;
    this.terminalId = terminalId;
  }

  async createPaymentIntent(
    _amountCents: number,
    _currency: 'GEL' | 'USD',
    _metadata?: Record<string, string>,
  ): Promise<PaymentIntent> {
    // TODO: Implement BoG API call
    throw new Error('Bank of Georgia integration not yet implemented');
  }

  async getPaymentStatus(_paymentId: string): Promise<PaymentIntent> {
    // TODO: Implement BoG status check
    throw new Error('Bank of Georgia integration not yet implemented');
  }

  verifyWebhookSignature(_payload: string | Buffer, _signature: string, _secret: string): boolean {
    // TODO: Implement BoG HMAC verification
    throw new Error('Bank of Georgia integration not yet implemented');
  }

  async processWebhookEvent(_eventType: string, _eventPayload: Record<string, unknown>): Promise<void> {
    // TODO: Process BoG webhook events
    throw new Error('Bank of Georgia integration not yet implemented');
  }

  async refund(_request: RefundRequest): Promise<RefundResult> {
    // TODO: Implement BoG refund
    throw new Error('Bank of Georgia integration not yet implemented');
  }

  getProviderName(): string {
    return 'Bank of Georgia';
  }
}
