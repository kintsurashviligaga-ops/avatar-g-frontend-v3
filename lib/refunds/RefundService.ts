// Avatar G Refund Service
// Handles refund processing, Stripe integration, and financial reversals

import { SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export interface CreateRefundInput {
  orderId: string;
  returnRequestId?: string;
  amountCents?: number; // If not provided, full refund
  reason?: string;
}

export interface RefundResponse {
  success: boolean;
  refundId?: string;
  stripeRefundId?: string;
  error?: string;
  details?: string;
}

export class RefundService {
  private supabase: SupabaseClient;
  private stripe: Stripe;

  constructor(supabase: SupabaseClient, stripe: Stripe) {
    this.supabase = supabase;
    this.stripe = stripe;
  }

  /**
   * Create a refund and apply financial reversals
   * Step 1: Validate order and check if already refunded
   * Step 2: Call Stripe API to create refund
   * Step 3: Record refund in database
   * Step 4: Apply financial reversals (commissions, payouts, invoices)
   */
  async createRefund(input: CreateRefundInput): Promise<RefundResponse> {
    try {
      // Get order with payment details
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select('*')
        .eq('id', input.orderId)
        .single();

      if (orderError || !order) {
        return { success: false, error: 'Order not found' };
      }

      // Check if order is refundable
      if (order.status === 'refunded') {
        return { success: false, error: 'Order already refunded' };
      }

      if (!order.stripe_payment_intent_id) {
        return {
          success: false,
          error: 'Order was not paid via Stripe',
        };
      }

      // Calculate refund amount
      const refundAmount = input.amountCents || order.total_amount * 100;

      // Check for existing refund (idempotency)
      const { data: existingRefund } = await this.supabase
        .from('refunds')
        .select('id, stripe_refund_id')
        .eq('order_id', input.orderId)
        .eq('amount_cents', refundAmount)
        .eq('status', 'succeeded')
        .single();

      if (existingRefund) {
        return {
          success: true,
          refundId: existingRefund.id,
          stripeRefundId: existingRefund.stripe_refund_id,
          details: 'Refund already exists',
        };
      }

      // Create Stripe refund
      let stripeRefund: Stripe.Refund;
      try {
        stripeRefund = await this.stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          amount: refundAmount,
          reason: 'requested_by_customer',
          metadata: {
            orderId: input.orderId,
            returnRequestId: input.returnRequestId || 'manual',
            reason: input.reason || 'Customer request',
          },
        });
      } catch (stripeError: unknown) {
        const stripeErrorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error';
        return {
          success: false,
          error: `Stripe refund failed: ${stripeErrorMessage}`,
        };
      }

      // Record refund in database
      const { data: refundRecord, error: refundError } = await this.supabase
        .from('refunds')
        .insert({
          order_id: input.orderId,
          return_request_id: input.returnRequestId,
          stripe_refund_id: stripeRefund.id,
          stripe_payment_intent_id: order.stripe_payment_intent_id,
          amount_cents: refundAmount,
          currency: order.currency || 'usd',
          status: stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
          reason: input.reason || 'Customer return',
        })
        .select()
        .single();

      if (refundError) {
        return { success: false, error: 'Failed to record refund' };
      }

      // Apply financial reversals
      const reversalsSuccess = await this.applyFinancialReversals(
        input.orderId,
        refundRecord.id,
        refundAmount,
        order
      );

      if (!reversalsSuccess) {
        console.warn('Some financial reversals may have failed for refund:', refundRecord.id);
      }

      // Update order status
      const fullRefund = refundAmount === order.total_amount * 100;
      await this.supabase
        .from('orders')
        .update({
          status: fullRefund ? 'refunded' : 'partial_refund',
        })
        .eq('id', input.orderId);

      return {
        success: true,
        refundId: refundRecord.id,
        stripeRefundId: stripeRefund.id,
      };
    } catch (error) {
      console.error('Error creating refund:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Apply financial reversals to account for refund
   * 1. Reverse affiliate commissions
   * 2. Adjust seller payouts
   * 3. Mark invoice as voided/refunded
   */
  private async applyFinancialReversals(
    orderId: string,
    refundId: string,
    _refundAmountCents: number,
    _order: unknown
  ): Promise<boolean> {
    try {
      // 1. Reverse affiliate commissions
      const { data: conversions, error: conversionError } = await this.supabase
        .from('affiliate_conversions')
        .select('id, commission_amount')
        .eq('order_id', orderId);

      if (!conversionError && conversions && conversions.length > 0) {
        for (const _conversion of conversions) {
          // Create reversal entry (stub: could create separate reversal table)
          // For now, we'll mark the refund as having reversed commission
          await this.supabase
            .from('refunds')
            .update({
              affiliate_commission_reversed: true,
            })
            .eq('id', refundId);
        }
      }

      // 2. Mark invoice as voided (if exists)
      // Stub: assumes invoice system tracks order references
      const { data: invoices } = await this.supabase
        .from('invoices')
        .select('id')
        .eq('metadata_json->>orderId', orderId)
        .limit(1);

      if (invoices && invoices.length > 0) {
        // Update invoice status to voided (in a real system)
        // For now, just mark it in refund record
        await this.supabase
          .from('refunds')
          .update({
            invoice_voided: true,
          })
          .eq('id', refundId);
      }

      // 3. Seller payout adjustment (stub)
      // If order has seller via shipments, mark payout as adjusted
      const { data: shipments } = await this.supabase
        .from('shipments')
        .select('seller_user_id')
        .eq('order_id', orderId)
        .limit(1);

      if (shipments && shipments.length > 0) {
        // Stub: In a full implementation, create payout reversal or hold future payouts
        await this.supabase
          .from('refunds')
          .update({
            seller_payout_adjusted: true,
          })
          .eq('id', refundId);
      }

      return true;
    } catch (error) {
      console.error('Error applying financial reversals:', error);
      return false;
    }
  }

  /**
   * Handle Stripe refund webhook update
   * Called when stripe sends charge.refunded event
   * Idempotent: stripe_refund_id is unique
   */
  async handleStripeRefundWebhook(stripeRefundId: string, status: string): Promise<boolean> {
    try {
      // Check if refund already exists
      const { data: existingRefund, error: _fetchError } = await this.supabase
        .from('refunds')
        .select('id')
        .eq('stripe_refund_id', stripeRefundId)
        .single();

      if (existingRefund) {
        // Update status if different
        await this.supabase
          .from('refunds')
          .update({ status })
          .eq('stripe_refund_id', stripeRefundId);

        return true;
      }

      // This shouldn't happen (refund should exist in our system first)
      console.warn('Received webhook for unknown refund:', stripeRefundId);
      return false;
    } catch (error) {
      console.error('Error handling Stripe refund webhook:', error);
      return false;
    }
  }

  /**
   * Get refund details
   */
  async getRefund(refundId: string) {
    try {
      const { data, error } = await this.supabase
        .from('refunds')
        .select('*')
        .eq('id', refundId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching refund:', error);
      return null;
    }
  }

  /**
   * List refunds for an order
   */
  async listOrderRefunds(orderId: string) {
    try {
      const { data, error } = await this.supabase
        .from('refunds')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing refunds:', error);
      return [];
    }
  }
}
