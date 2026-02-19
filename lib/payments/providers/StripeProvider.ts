/**
 * Stripe Payment Provider Implementation
 */

import Stripe from 'stripe';
import {
  PaymentProvider,
  PaymentIntent,
  RefundRequest,
  RefundResult,
} from '../PaymentProvider';

export class StripePaymentProvider implements PaymentProvider {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey);
  }

  async createPaymentIntent(
    amountCents: number,
    currency: 'GEL' | 'USD',
    metadata?: Record<string, string>,
  ): Promise<PaymentIntent> {
    // Map GEL to GEL currency code (Stripe supports GEL)
    const stripeCurrency = currency === 'GEL' ? 'gel' : 'usd';

    const intent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: stripeCurrency,
      metadata: metadata || {},
    });

    return this.mapStripePaymentIntentToPaymentIntent(intent);
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentIntent> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentId);
    return this.mapStripePaymentIntentToPaymentIntent(intent);
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): boolean {
    try {
      this.stripe.webhooks.constructEvent(payload, signature, secret);
      return true;
    } catch {
      return false;
    }
  }

  async processWebhookEvent(eventType: string, _eventPayload: Record<string, unknown>): Promise<void> {
    // Webhook events are processed in the main route handler
    // This is a placeholder for provider-specific logic
    switch (eventType) {
      case 'payment_intent.succeeded':
        // Payment succeeded
        break;
      case 'payment_intent.payment_failed':
        // Payment failed
        break;
      default:
        // Unknown event
        break;
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    const stripeReason =
      request.reason === 'duplicate' ||
      request.reason === 'fraudulent' ||
      request.reason === 'requested_by_customer'
        ? request.reason
        : undefined;

    const refund = await this.stripe.refunds.create({
      payment_intent: request.paymentId,
      amount: request.amountCents,
      reason: stripeReason,
    });

    return {
      refundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : 'failed',
      amountCents: refund.amount,
      createdAt: new Date(refund.created * 1000),
    };
  }

  getProviderName(): string {
    return 'Stripe';
  }

  private mapStripePaymentIntentToPaymentIntent(
    intent: Stripe.PaymentIntent,
  ): PaymentIntent {
    const statusMap: Record<Stripe.PaymentIntent.Status, PaymentIntent['status']> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'requires_action',
      processing: 'processing',
      requires_capture: 'pending',
      succeeded: 'succeeded',
      canceled: 'failed',
    };

    return {
      id: intent.id,
      status: statusMap[intent.status],
      amountCents: intent.amount,
      currency: (intent.currency.toUpperCase() === 'GEL' ? 'GEL' : 'USD') as 'GEL' | 'USD',
      clientSecret: intent.client_secret || undefined,
      createdAt: new Date(intent.created * 1000),
      metadata: intent.metadata || undefined,
    };
  }
}
