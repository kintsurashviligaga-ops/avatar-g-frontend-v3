/**
 * Stripe Connect - Payment Processing
 * 
 * Functions for creating payments with platform fees
 * Supports:
 * - Direct charges with application_fee_amount
 * - Automatic transfers to connected accounts
 * - Commission tracking
 */

import Stripe from 'stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type PlatformCommissionRow = {
  seller_payout_cents: number | null;
  total_amount_cents: number | null;
};
import { getStripe } from '@/lib/billing/stripe';
import { calculateCommission } from './config';
import { canSellerReceivePayments, getAccountIdForSeller } from './connect';

export interface PaymentIntentParams {
  amountCents: number;
  currency?: string;
  sellerId: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
  commissionPercentage?: number;
}

export interface PaymentResult {
  paymentIntent: Stripe.PaymentIntent;
  clientSecret: string;
  applicationFeeCents: number;
  sellerPayoutCents: number;
  effectiveCommissionRate: number;
}

/**
 * Create payment intent with platform fee
 * 
 * Uses "Direct Charges" pattern:
 * - Payment goes to platform's Stripe account
 * - Platform takes application_fee_amount
 * - Remainder automatically transferred to seller
 * 
 * Security:
 * - Validates seller can receive payments
 * - Never exposes seller API keys
 * - Tracks all commissions in database
 */
export async function createPaymentWithFee(
  params: PaymentIntentParams
): Promise<PaymentResult> {
  const {
    amountCents,
    currency = 'usd',
    sellerId,
    customerId,
    orderId,
    description,
    metadata = {},
    commissionPercentage,
  } = params;

  // 1. Validate amount
  if (amountCents < 50) {
    throw new Error('Amount must be at least $0.50');
  }

  // 2. Check seller can receive payments
  const canReceive = await canSellerReceivePayments(sellerId);
  if (!canReceive) {
    throw new Error('Seller is not eligible to receive payments. Please complete onboarding.');
  }

  // 3. Get seller's connected account ID
  const connectedAccountId = await getAccountIdForSeller(sellerId);
  if (!connectedAccountId) {
    throw new Error('Seller Connect account not found');
  }

  // 4. Calculate commission
  const { applicationFeeCents, sellerPayoutCents, effectiveRate } = calculateCommission(
    amountCents,
    commissionPercentage
  );

  // 5. Create payment intent with application fee
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    application_fee_amount: applicationFeeCents,
    transfer_data: {
      destination: connectedAccountId,
    },
    metadata: {
      seller_id: sellerId,
      order_id: orderId ?? '',
      commission_percentage: effectiveRate.toFixed(2),
      ...metadata,
    },
    description: description ?? `Order for seller ${sellerId}`,
    ...(customerId && { customer: customerId }),
  });

  // 6. Record commission in database
  await recordCommission({
    orderId,
    sellerId,
    paymentIntentId: paymentIntent.id,
    connectedAccountId,
    totalAmountCents: amountCents,
    applicationFeeCents,
    sellerPayoutCents,
    commissionPercentage: effectiveRate,
  });

  console.log('[Payment] Created with fee:', {
    paymentIntentId: paymentIntent.id,
    total: amountCents,
    platformFee: applicationFeeCents,
    sellerPayout: sellerPayoutCents,
    rate: `${effectiveRate.toFixed(2)}%`,
  });

  return {
    paymentIntent,
    clientSecret: paymentIntent.client_secret!,
    applicationFeeCents,
    sellerPayoutCents,
    effectiveCommissionRate: effectiveRate,
  };
}

/**
 * Create payment intent WITHOUT platform fee
 * Direct payment to seller (100% goes to seller)
 * 
 * Use case: Platform-subsidized transactions, refunds, etc.
 */
export async function createDirectPayment(
  params: Omit<PaymentIntentParams, 'commissionPercentage'>
): Promise<Stripe.PaymentIntent> {
  const {
    amountCents,
    currency = 'usd',
    sellerId,
    customerId,
    orderId,
    description,
    metadata = {},
  } = params;

  // Get seller's connected account
  const connectedAccountId = await getAccountIdForSeller(sellerId);
  if (!connectedAccountId) {
    throw new Error('Seller Connect account not found');
  }

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    transfer_data: {
      destination: connectedAccountId,
    },
    metadata: {
      seller_id: sellerId,
      order_id: orderId ?? '',
      direct_payment: 'true',
      ...metadata,
    },
    description: description ?? `Direct payment for seller ${sellerId}`,
    ...(customerId && { customer: customerId }),
  });

  console.log('[Payment] Direct payment created:', {
    paymentIntentId: paymentIntent.id,
    amount: amountCents,
    sellerId,
  });

  return paymentIntent;
}

/**
 * Get payment details including split
 */
export async function getPaymentDetails(
  paymentIntentId: string
): Promise<{
  paymentIntent: Stripe.PaymentIntent;
  commission: unknown;
}> {
  const stripe = getStripe();
  const supabase = createRouteHandlerClient();

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  const { data: commission } = await supabase
    .from('platform_commissions')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  return {
    paymentIntent,
    commission,
  };
}

/**
 * Record commission in database for tracking
 */
async function recordCommission(params: {
  orderId?: string;
  sellerId: string;
  paymentIntentId: string;
  connectedAccountId: string;
  totalAmountCents: number;
  applicationFeeCents: number;
  sellerPayoutCents: number;
  commissionPercentage: number;
}): Promise<void> {
  const supabase = createRouteHandlerClient();

  const { error } = await supabase.from('platform_commissions').insert({
    order_id: params.orderId ?? null,
    seller_id: params.sellerId,
    stripe_payment_intent_id: params.paymentIntentId,
    stripe_connected_account_id: params.connectedAccountId,
    total_amount_cents: params.totalAmountCents,
    application_fee_cents: params.applicationFeeCents,
    seller_payout_cents: params.sellerPayoutCents,
    commission_percentage: params.commissionPercentage,
    status: 'pending',
  });

  if (error) {
    console.error('[Payment] Failed to record commission:', error);
    // Don't throw - payment already created, this is just tracking
  }
}

/**
 * Update commission status (called by webhook)
 */
export async function updateCommissionStatus(
  paymentIntentId: string,
  status: 'collected' | 'failed' | 'refunded'
): Promise<void> {
  const supabase = createRouteHandlerClient();

  const updateData: { status: 'collected' | 'failed' | 'refunded'; collected_at?: string; refunded_at?: string } = { status };
  if (status === 'collected') {
    updateData.collected_at = new Date().toISOString();
  } else if (status === 'refunded') {
    updateData.refunded_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('platform_commissions')
    .update(updateData)
    .eq('stripe_payment_intent_id', paymentIntentId);

  if (error) {
    console.error('[Payment] Failed to update commission status:', error);
  }
}

/**
 * Get seller's total commission earnings
 */
export async function getSellerCommissions(
  sellerId: string,
  status?: 'pending' | 'collected' | 'failed' | 'refunded'
): Promise<{
  total: number;
  count: number;
  commissions: unknown[];
}> {
  const supabase = createRouteHandlerClient();

  let query = supabase
    .from('platform_commissions')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Payment] Failed to fetch commissions:', error);
    return { total: 0, count: 0, commissions: [] };
  }

  const commissions = (data ?? []) as PlatformCommissionRow[];
  const total = commissions.reduce(
    (sum: number, commission: PlatformCommissionRow) => sum + (commission.seller_payout_cents ?? 0),
    0
  );

  return {
    total,
    count: data?.length ?? 0,
    commissions: data ?? [],
  };
}

/**
 * Calculate seller's lifetime volume for commission tier
 */
export async function getSellerLifetimeVolume(sellerId: string): Promise<number> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('platform_commissions')
    .select('total_amount_cents')
    .eq('seller_id', sellerId)
    .in('status', ['collected', 'pending']);

  if (error) {
    console.error('[Payment] Failed to fetch lifetime volume:', error);
    return 0;
  }

  const commissions = (data ?? []) as PlatformCommissionRow[];
  const totalCents = commissions.reduce(
    (sum: number, commission: PlatformCommissionRow) => sum + (commission.total_amount_cents ?? 0),
    0
  );
  return totalCents / 100; // Return in USD
}
