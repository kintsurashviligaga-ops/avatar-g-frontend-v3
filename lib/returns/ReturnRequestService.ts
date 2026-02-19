// Avatar G Return Request Management Service
// Handles RMA (Return Merchandise Authorization) workflows

import { SupabaseClient } from '@supabase/supabase-js';

export const RETURN_WINDOW_DAYS = 30; // Return window: 30 days after delivery

export interface CreateReturnInput {
  orderId: string;
  reason: string; // damage|defect|wrong_item|not_as_described|changed_mind|other
  notes?: string;
  evidenceUrls?: string[];
}

export interface ReturnRequestStatus {
  id: string;
  orderId: string;
  status: string;
  reason: string;
  createdAt: string;
  approvedAt?: string;
  receivedAt?: string;
  refundAmountCents?: number;
}

export class ReturnRequestService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Create a new return request
   * Validates: order belongs to buyer, order delivered, within return window
   */
  async createReturnRequest(
    buyerUserId: string,
    input: CreateReturnInput
  ): Promise<{ success: boolean; returnId?: string; error?: string }> {
    try {
      // Get order
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select(
          `
          id,
          user_id,
          created_at,
          fulfillment_status,
          total_amount,
          shipments (
            id,
            seller_user_id,
            delivered_at,
            status
          )
        `
        )
        .eq('id', input.orderId)
        .single();

      if (orderError || !order) {
        return { success: false, error: 'Order not found' };
      }

      // Verify buyer owns order
      if (order.user_id !== buyerUserId) {
        return { success: false, error: 'Unauthorized: not your order' };
      }

      // Verify order is delivered
      if (order.fulfillment_status !== 'delivered') {
        return {
          success: false,
          error: 'Order must be delivered before requesting return',
        };
      }

      // Get shipment delivery date
      const shipment = order.shipments?.[0];
      if (!shipment?.delivered_at) {
        return {
          success: false,
          error: 'Order not yet delivered',
        };
      }

      // Check return window (30 days after delivery)
      const deliveredAt = new Date(shipment.delivered_at);
      const now = new Date();
      const daysSinceDelivery = Math.floor(
        (now.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceDelivery > RETURN_WINDOW_DAYS) {
        return {
          success: false,
          error: `Return window expired. Returns must be requested within ${RETURN_WINDOW_DAYS} days of delivery.`,
        };
      }

      // Create return request
      const { data: returnRequest, error: createError } = await this.supabase
        .from('return_requests')
        .insert({
          order_id: input.orderId,
          buyer_user_id: buyerUserId,
          seller_user_id: shipment.seller_user_id,
          status: 'requested',
          reason: input.reason,
          notes: input.notes,
          evidence_urls: input.evidenceUrls || [],
          refund_amount_cents: order.total_amount * 100, // Will be updated on approval
        })
        .select()
        .single();

      if (createError) {
        return { success: false, error: 'Failed to create return request' };
      }

      return { success: true, returnId: returnRequest.id };
    } catch (error) {
      console.error('Error creating return request:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Seller approves return request
   * Status: requested -> approved
   */
  async approveReturn(
    sellerUserId: string,
    returnId: string,
    refundAmountCents?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get return request
      const { data: returnReq, error: fetchError } = await this.supabase
        .from('return_requests')
        .select('*')
        .eq('id', returnId)
        .single();

      if (fetchError || !returnReq) {
        return { success: false, error: 'Return request not found' };
      }

      // Verify seller owns this return
      if (returnReq.seller_user_id !== sellerUserId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Verify status is requestable
      if (returnReq.status !== 'requested') {
        return {
          success: false,
          error: `Cannot approve return with status: ${returnReq.status}`,
        };
      }

      // Update return status
      const { error: updateError } = await this.supabase
        .from('return_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          refund_amount_cents: refundAmountCents || returnReq.refund_amount_cents,
        })
        .eq('id', returnId);

      if (updateError) {
        return { success: false, error: 'Failed to approve return' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error approving return:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Seller rejects return request
   * Status: requested -> rejected
   */
  async rejectReturn(
    sellerUserId: string,
    returnId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: returnReq, error: fetchError } = await this.supabase
        .from('return_requests')
        .select('*')
        .eq('id', returnId)
        .single();

      if (fetchError || !returnReq) {
        return { success: false, error: 'Return request not found' };
      }

      if (returnReq.seller_user_id !== sellerUserId) {
        return { success: false, error: 'Unauthorized' };
      }

      const { error: updateError } = await this.supabase
        .from('return_requests')
        .update({
          status: 'rejected',
          notes: reason ? `${returnReq.notes || ''}\nRejection reason: ${reason}` : returnReq.notes,
        })
        .eq('id', returnId);

      if (updateError) {
        return { success: false, error: 'Failed to reject return' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error rejecting return:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Mark return as in transit (after buyer ships back)
   */
  async markInTransit(
    sellerUserId: string,
    returnId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: returnReq, error: fetchError } = await this.supabase
        .from('return_requests')
        .select('*')
        .eq('id', returnId)
        .single();

      if (fetchError || !returnReq) {
        return { success: false, error: 'Return request not found' };
      }

      if (returnReq.seller_user_id !== sellerUserId) {
        return { success: false, error: 'Unauthorized' };
      }

      const { error: updateError } = await this.supabase
        .from('return_requests')
        .update({ status: 'in_transit' })
        .eq('id', returnId);

      if (updateError) {
        return { success: false, error: 'Failed to update return status' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating return status:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Mark return as received (seller received item back)
   * Triggers restock and refund
   */
  async markReceived(
    sellerUserId: string,
    returnId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: returnReq, error: fetchError } = await this.supabase
        .from('return_requests')
        .select('*')
        .eq('id', returnId)
        .single();

      if (fetchError || !returnReq) {
        return { success: false, error: 'Return request not found' };
      }

      if (returnReq.seller_user_id !== sellerUserId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Update return status
      const { error: updateError } = await this.supabase
        .from('return_requests')
        .update({
          status: 'received',
          received_at: new Date().toISOString(),
        })
        .eq('id', returnId);

      if (updateError) {
        return { success: false, error: 'Failed to mark return as received' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error marking return as received:', error);
      return { success: false, error: 'Internal server error' };
    }
  }

  /**
   * Get return request details
   */
  async getReturnRequest(returnId: string) {
    try {
      const { data, error } = await this.supabase
        .from('return_requests')
        .select(
          `
          *,
          orders (
            id,
            total_amount,
            order_items (
              product_id,
              title,
              quantity,
              unit_price_cents
            )
          )
        `
        )
        .eq('id', returnId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching return request:', error);
      return null;
    }
  }

  /**
   * List return requests for buyer
   */
  async listBuyerReturns(buyerUserId: string) {
    try {
      const { data, error } = await this.supabase
        .from('return_requests')
        .select(
          `
          id,
          order_id,
          status,
          reason,
          refund_amount_cents,
          created_at,
          approved_at,
          received_at,
          orders (total_amount)
        `
        )
        .eq('buyer_user_id', buyerUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing buyer returns:', error);
      return [];
    }
  }

  /**
   * List return requests for seller
   */
  async listSellerReturns(sellerUserId: string, status?: string) {
    try {
      let query = this.supabase
        .from('return_requests')
        .select(
          `
          id,
          order_id,
          buyer_user_id,
          status,
          reason,
          refund_amount_cents,
          created_at,
          approved_at
        `
        )
        .eq('seller_user_id', sellerUserId);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query.order('created_at', {
        ascending: false,
      });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing seller returns:', error);
      return [];
    }
  }
}
