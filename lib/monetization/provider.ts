import Stripe from 'stripe';
import { getServerEnv } from '@/lib/env/server';

export class BillingProviderUnavailableError extends Error {
  public readonly code = 'BILLING_PROVIDER_UNAVAILABLE';

  constructor(message = 'Billing provider is not configured') {
    super(message);
    this.name = 'BillingProviderUnavailableError';
  }
}

type CheckoutParams = {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
};

type PortalParams = {
  customerId: string;
  returnUrl: string;
};

export interface BillingProvider {
  kind: 'stripe' | 'none';
  createCheckoutSession(input: CheckoutParams): Promise<string>;
  createPortalSession(input: PortalParams): Promise<string>;
  verifyWebhook(payload: string | Buffer, signature: string): Stripe.Event;
}

class NullBillingProvider implements BillingProvider {
  readonly kind = 'none' as const;

  async createCheckoutSession(): Promise<string> {
    throw new BillingProviderUnavailableError('Stripe is not configured (missing STRIPE_SECRET_KEY)');
  }

  async createPortalSession(): Promise<string> {
    throw new BillingProviderUnavailableError('Stripe is not configured (missing STRIPE_SECRET_KEY)');
  }

  verifyWebhook(): Stripe.Event {
    throw new BillingProviderUnavailableError('Stripe webhook is unavailable (missing STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET)');
  }
}

class StripeBillingProvider implements BillingProvider {
  readonly kind = 'stripe' as const;
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    this.webhookSecret = webhookSecret;
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }

  async createCheckoutSession(input: CheckoutParams): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      customer: input.customerId,
      payment_method_types: ['card'],
      line_items: [{ price: input.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    if (!session.url) {
      throw new Error('Stripe checkout session URL was not returned');
    }
    return session.url;
  }

  async createPortalSession(input: PortalParams): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });

    return session.url;
  }

  verifyWebhook(payload: string | Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }
}

let providerSingleton: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (providerSingleton) {
    return providerSingleton;
  }

  const env = getServerEnv();
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    providerSingleton = new NullBillingProvider();
    return providerSingleton;
  }

  providerSingleton = new StripeBillingProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  return providerSingleton;
}

export function resetBillingProviderForTests() {
  providerSingleton = null;
}
