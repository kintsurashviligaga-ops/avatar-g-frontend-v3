/**
 * Payment Provider Interface
 * Abstract interface for payment processing providers
 * Currently: Stripe (implemented)
 * Future: TBC, BoG, Payze (stubs)
 */

export interface PaymentIntent {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'requires_action' | 'failed';
  amountCents: number;
  currency: 'GEL' | 'USD';
  clientSecret?: string;
  paymentUrl?: string;
  createdAt: Date;
  metadata?: Record<string, string>;
}

export interface RefundRequest {
  paymentId: string;
  amountCents?: number; // undefined = full refund
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  status: 'pending' | 'succeeded' | 'failed';
  amountCents: number;
  createdAt: Date;
}

export interface PaymentProvider {
  /**
   * Create a new payment intent
   */
  createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>,
  ): Promise<PaymentIntent>;

  /**
   * Retrieve payment status
   */
  getPaymentStatus(paymentId: string): Promise<PaymentIntent>;

  /**
   * Verify webhook callback payload
   * Returns true if signature is valid
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): boolean;

  /**
   * Process webhook event
   */
  processWebhookEvent(
    eventType: string,
    eventPayload: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Refund a payment (full or partial)
   */
  refund(request: RefundRequest): Promise<RefundResult>;

  /**
   * Get provider name
   */
  getProviderName(): string;
}
