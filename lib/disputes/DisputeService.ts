// Avatar G Dispute Service
// Handles chargebacks and disputes from Stripe

import { SupabaseClient } from '@supabase/supabase-js';

export interface DisputeData {
  stripeDisputeId: string;
  stripeChargeId: string;
  amountCents: number;
  currency: string;
  status: string; // warning_needs_response|warning_under_review|needs_response|under_review|won|lost
  reason: string;
  reasonDescription?: string;
}

export class DisputeService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Handle Stripe dispute webhook (charge.dispute.created/updated/closed)
   * Step 1: Check if dispute already exists (idempotent via stripe_dispute_id)
   * Step 2: Link dispute to order via stripe_charge_id
   * Step 3: Apply payout hold
   * Step 4: Mark affiliate commissions as pending
   * Step 5: Notify seller
   */
  async handleDisputeWebhook(dispute: DisputeData): Promise<{ success: boolean; orderId?: string; error?: string; details?: string }> {
    try {
      // Check if dispute already exists (idempotency)
      const { data: existingDispute, error: _fetchError } = await this.supabase
        .from('disputes')
        .select('id, order_id')
        .eq('stripe_dispute_id', dispute.stripeDisputeId)
        .single();

      if (existingDispute) {
        // Update existing dispute status
        await this.supabase
          .from('disputes')
          .update({ status: dispute.status })
          .eq('stripe_dispute_id', dispute.stripeDisputeId);

        return {
          success: true,
          orderId: existingDispute.order_id,
          details: 'Dispute already exists, status updated',
        };
      }

      // Find order by stripe charge
      // (Need to join payment_intent -> charge -> orders)
      // For now, use metadata or search by amount + date
      const { data: order, error: _orderError } = await this.supabase
        .from('orders')
        .select('id, user_id, total_amount, stripe_payment_intent_id')
        .eq('stripe_payment_intent_id', dispute.stripeChargeId) // Rough match
        .limit(1);

      let orderId: string | null = null;
      if (order && order.length > 0 && order[0]) {
        orderId = order[0].id;
      }

      // Create dispute record
      const { data: disputeRecord, error: createError } = await this.supabase
        .from('disputes')
        .insert({
          order_id: orderId,
          stripe_dispute_id: dispute.stripeDisputeId,
          stripe_charge_id: dispute.stripeChargeId,
          amount_cents: dispute.amountCents,
          currency: dispute.currency,
          status: dispute.status,
          reason: dispute.reason,
          reason_description: dispute.reasonDescription,
        })
        .select()
        .single();

      if (createError) {
        return { success: false, error: 'Failed to create dispute record' };
      }

      // Apply payout hold (if dispute created/opened)
      if (
        dispute.status.includes('needs_response') ||
        dispute.status.includes('under_review')
      ) {
        const holdSuccess = await this.applyPayoutHold(
          disputeRecord.id,
          orderId,
          dispute.amountCents
        );

        if (!holdSuccess) {
          console.warn('Failed to apply payout hold for dispute:', disputeRecord.id);
        }
      }

      // Mark affiliate commissions as pending (don't pay)
      if (orderId) {
        await this.holdAffiliateCommissions(orderId);
      }

      // Update order status to disputed
      if (orderId) {
        await this.supabase
          .from('orders')
          .update({ status: 'disputed' })
          .eq('id', orderId);
      }

      return {
        success: true,
        orderId: orderId ?? undefined,
      };
    } catch (error) {
      console.error('Error handling dispute webhook:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Apply payout hold when dispute is opened
   * Prevents seller from receiving payout until resolved
   */
  private async applyPayoutHold(
    disputeId: string,
    orderId: string | null,
    holdAmountCents: number
  ): Promise<boolean> {
    try {
      if (!orderId) return false;

      // Get seller for this order
      const { data: shipments } = await this.supabase
        .from('shipments')
        .select('seller_user_id')
        .eq('order_id', orderId)
        .limit(1);

      if (!shipments || shipments.length === 0) return false;

      // Mark payout as held (in a real system, this would use a payout management table)
      // For now, just mark in dispute record
      const { error } = await this.supabase
        .from('disputes')
        .update({
          payout_hold_applied: true,
          payout_hold_amount_cents: holdAmountCents,
        })
        .eq('id', disputeId);

      return !error;
    } catch (error) {
      console.error('Error applying payout hold:', error);
      return false;
    }
  }

  /**
   * Hold affiliate commissions (don't pay until dispute resolved)
   */
  private async holdAffiliateCommissions(orderId: string): Promise<boolean> {
    try {
      // Mark related affiliate conversions as pending (don't include in payout)
      // Stub: In full system, create separate "dispute_hold" records
      const { error } = await this.supabase
        .from('affiliate_conversions')
        .update({ metadata_json: { dispute_hold: true } })
        .eq('order_id', orderId);

      return !error;
    } catch (error) {
      console.error('Error holding affiliate commissions:', error);
      return false;
    }
  }

  /**
   * Handle dispute resolution (won/lost)
   * Step 1: Release payout hold if dispute won
   * Step 2: Release affiliate commissions
   * Step 3: Update order status
   */
  async resolveDispute(
    stripeDisputeId: string,
    outcome: 'won' | 'lost'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get dispute
      const { data: dispute, error: fetchError } = await this.supabase
        .from('disputes')
        .select('*')
        .eq('stripe_dispute_id', stripeDisputeId)
        .single();

      if (fetchError || !dispute) {
        return { success: false, error: 'Dispute not found' };
      }

      // Update dispute status
      const { error: updateError } = await this.supabase
        .from('disputes')
        .update({
          status: outcome,
          payout_hold_applied: false,
        })
        .eq('id', dispute.id);

      if (updateError) {
        return { success: false, error: 'Failed to update dispute' };
      }

      // Update order status
      if (dispute.order_id) {
        const orderStatus = outcome === 'won' ? 'completed' : 'disputed_lost';
        await this.supabase
          .from('orders')
          .update({ status: orderStatus })
          .eq('id', dispute.order_id);

        // Release affiliate hold
        await this.supabase
          .from('affiliate_conversions')
          .update({ metadata_json: { dispute_hold: false } })
          .eq('order_id', dispute.order_id);
      }

      return { success: true };
    } catch (error) {
      console.error('Error resolving dispute:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Get dispute details
   */
  async getDispute(disputeId: string) {
    try {
      const { data, error } = await this.supabase
        .from('disputes')
        .select(
          `
          *,
          orders (
            id,
            user_id,
            total_amount,
            status,
            shipments (seller_user_id)
          )
        `
        )
        .eq('id', disputeId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching dispute:', error);
      return null;
    }
  }

  /**
   * List disputes (admin view)
   */
  async listDisputes(status?: string) {
    try {
      let query = this.supabase
        .from('disputes')
        .select(
          `
          id,
          order_id,
          stripe_dispute_id,
          amount_cents,
          status,
          reason,
          created_at
        `
        );

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing disputes:', error);
      return [];
    }
  }

  /**
   * List disputes for seller
   */
  async listSellerDisputes(sellerUserId: string) {
    try {
      // This requires joining through orders -> shipments
      const { data, error } = await this.supabase
        .from('disputes')
        .select(
          `
          id,
          order_id,
          stripe_dispute_id,
          amount_cents,
          status,
          reason,
          created_at,
          orders (
            id,
            shipments (
              id,
              seller_user_id
            )
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter by seller user ID
      type SellerShipmentRow = { seller_user_id?: string | null };
      type SellerDisputeRow = {
        orders?: {
          shipments?: SellerShipmentRow[];
        };
      };

      const typedDisputes = ((data || []) as SellerDisputeRow[]);
      const sellerDisputes = typedDisputes.filter((d) =>
        Array.isArray(d.orders?.shipments) &&
        d.orders!.shipments!.some((s) => s.seller_user_id === sellerUserId)
      );

      return sellerDisputes;
    } catch (error) {
      console.error('Error listing seller disputes:', error);
      return [];
    }
  }
}
