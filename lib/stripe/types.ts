import { z } from 'zod';

// ========================================
// STRIPE REQUEST/RESPONSE TYPES
// ========================================

export const CreatePaymentIntentInputSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
});

export const PaymentIntentResponseSchema = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string(),
  status: z.string(),
});

export const ConfirmPaymentInputSchema = z.object({
  paymentIntentId: z.string(),
});

export const ConfirmPaymentResponseSchema = z.object({
  status: z.string(),
  orderId: z.string().uuid(),
});

export const WebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  created: z.number(),
  data: z.object({
    object: z.record(z.any()),
  }),
});

// TypeScript types
export type CreatePaymentIntentInput = z.infer<typeof CreatePaymentIntentInputSchema>;
export type PaymentIntentResponse = z.infer<typeof PaymentIntentResponseSchema>;
export type ConfirmPaymentInput = z.infer<typeof ConfirmPaymentInputSchema>;
export type ConfirmPaymentResponse = z.infer<typeof ConfirmPaymentResponseSchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// Stripe payment status values
export type StripePaymentStatus = 'created' | 'requires_action' | 'succeeded' | 'failed' | 'refunded';

// Payment attempt model
export interface PaymentAttemptRecord {
  id: string;
  order_id: string;
  user_id: string;
  store_id: string;
  provider: string;
  payment_intent_id: string | null;
  status: StripePaymentStatus;
  amount_total_cents: number;
  currency: string;
  last_4_digits: string | null;
  card_brand: string | null;
  refund_cents: number;
  created_at: string;
  confirmed_at: string | null;
  failed_at: string | null;
}

// Stripe event record
export interface StripeEventRecord {
  id: string;
  type: string;
  processed_at: string | null;
  payload_json: Record<string, any>;
  created_at: string;
  error_log: string | null;
}
