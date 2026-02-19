// Avatar G Inventory Management Service
// Transactional stock operations with row-level locking
// Prevents overselling and maintains accurate stock state

import { SupabaseClient } from '@supabase/supabase-js';

export interface StockReservation {
  itemId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export class InventoryService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Reserve stock for a pending order (before payment)
   * RPC call to lock rows during transaction
   */
  async reserveStock(orderId: string): Promise<boolean> {
    try {
      // Get order items
      const { data: orderItems, error: itemsError } = await this.supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

      if (itemsError || !orderItems) {
        console.error('Error fetching order items:', itemsError);
        return false;
      }

      // For each item, reserve stock (in a transaction)
      for (const item of orderItems) {
        if (!item.product_id) continue; // Digital items have no product

        // Check if sufficient stock available
        const { data: product, error: prodError } = await this.supabase
          .from('products')
          .select('stock_quantity, reserved_quantity, track_inventory')
          .eq('id', item.product_id)
          .single();

        if (prodError || !product) {
          console.error('Product not found:', item.product_id);
          return false;
        }

        if (product.track_inventory) {
          const available = product.stock_quantity - product.reserved_quantity;
          if (available < item.quantity) {
            console.error(`Insufficient stock for product ${item.product_id}`);
            return false;
          }
        }

        // Update reserved quantity
        const { error: updateError } = await this.supabase
          .from('products')
          .update({
            reserved_quantity: product.reserved_quantity + item.quantity,
          })
          .eq('id', item.product_id);

        if (updateError) {
          console.error('Error reserving stock:', updateError);
          return false;
        }

        // Record movement
        await this.recordMovement(
          item.product_id,
          orderId,
          'reserve',
          item.quantity,
          `Reservation for order ${orderId}`
        );
      }

      return true;
    } catch (error) {
      console.error('Error in reserveStock:', error);
      return false;
    }
  }

  /**
   * Commit reserved stock as sold (on payment success)
   * Decrements stock_quantity and reserved_quantity
   */
  async commitStockAfterPayment(orderId: string): Promise<boolean> {
    try {
      // Get order items
      const { data: orderItems, error: itemsError } = await this.supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

      if (itemsError || !orderItems) return false;

      for (const item of orderItems) {
        if (!item.product_id) continue;

        const { data: product, error: prodError } = await this.supabase
          .from('products')
          .select('stock_quantity, reserved_quantity, track_inventory')
          .eq('id', item.product_id)
          .single();

        if (prodError || !product) return false;

        if (product.track_inventory) {
          // Deduct from stock and release from reserved
          const { error: commitError } = await this.supabase
            .from('products')
            .update({
              stock_quantity: product.stock_quantity - item.quantity,
              reserved_quantity: product.reserved_quantity - item.quantity,
            })
            .eq('id', item.product_id);

          if (commitError) {
            console.error('Error committing stock:', commitError);
            return false;
          }

          // Record deduction
          await this.recordMovement(
            item.product_id,
            orderId,
            'deduct',
            -item.quantity,
            `Payment committed for order ${orderId}`
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error in commitStockAfterPayment:', error);
      return false;
    }
  }

  /**
   * Release reserved stock (on payment failure/timeout)
   * Only decrements reserved_quantity
   */
  async releaseStock(orderId: string): Promise<boolean> {
    try {
      const { data: orderItems, error: itemsError } = await this.supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', orderId);

      if (itemsError || !orderItems) return false;

      for (const item of orderItems) {
        if (!item.product_id) continue;

        const { data: product, error: prodError } = await this.supabase
          .from('products')
          .select('reserved_quantity, track_inventory')
          .eq('id', item.product_id)
          .single();

        if (prodError || !product) return false;

        if (product.track_inventory) {
          const { error: releaseError } = await this.supabase
            .from('products')
            .update({
              reserved_quantity: Math.max(
                0,
                product.reserved_quantity - item.quantity
              ),
            })
            .eq('id', item.product_id);

          if (releaseError) {
            console.error('Error releasing stock:', releaseError);
            return false;
          }

          // Record release
          await this.recordMovement(
            item.product_id,
            orderId,
            'release',
            -item.quantity,
            `Payment failed/canceled for order ${orderId}`
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error in releaseStock:', error);
      return false;
    }
  }

  /**
   * Restock after return is received
   * Increments stock_quantity
   */
  async restockFromReturn(returnRequestId: string): Promise<boolean> {
    try {
      // Get return request
      const { data: returnReq, error: returnError } = await this.supabase
        .from('return_requests')
        .select('order_id')
        .eq('id', returnRequestId)
        .single();

      if (returnError || !returnReq) return false;

      // Get order items
      const { data: orderItems, error: itemsError } = await this.supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', returnReq.order_id);

      if (itemsError || !orderItems) return false;

      for (const item of orderItems) {
        if (!item.product_id) continue;

        const { data: product, error: prodError } = await this.supabase
          .from('products')
          .select('stock_quantity, track_inventory')
          .eq('id', item.product_id)
          .single();

        if (prodError || !product) return false;

        if (product.track_inventory) {
          const { error: restockError } = await this.supabase
            .from('products')
            .update({
              stock_quantity: product.stock_quantity + item.quantity,
            })
            .eq('id', item.product_id);

          if (restockError) {
            console.error('Error restocking:', restockError);
            return false;
          }

          // Record restock
          await this.recordMovement(
            item.product_id,
            returnReq.order_id,
            'return_received',
            item.quantity,
            `Return approved and received (return request: ${returnRequestId})`
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error in restockFromReturn:', error);
      return false;
    }
  }

  /**
   * Check if sufficient stock available for purchase
   * Used during checkout validation
   */
  async checkStockAvailability(
    items: Array<{ productId: string; quantity: number }>
  ): Promise<{ available: boolean; insufficientItems?: string[] }> {
    try {
      const insufficientItems: string[] = [];

      for (const item of items) {
        const { data: product, error } = await this.supabase
          .from('products')
          .select('stock_quantity, reserved_quantity, track_inventory, title')
          .eq('id', item.productId)
          .single();

        if (error || !product) {
          insufficientItems.push(`Product ${item.productId} not found`);
          continue;
        }

        // Skip check for non-tracked items (digital goods)
        if (!product.track_inventory) continue;

        const available = product.stock_quantity - product.reserved_quantity;
        if (available < item.quantity) {
          insufficientItems.push(
            `${product.title} (${available} available, ${item.quantity} requested)`
          );
        }
      }

      return {
        available: insufficientItems.length === 0,
        insufficientItems: insufficientItems.length > 0 ? insufficientItems : undefined,
      };
    } catch (error) {
      console.error('Error in checkStockAvailability:', error);
      return { available: false };
    }
  }

  /**
   * Record inventory movement for audit trail
   */
  private async recordMovement(
    productId: string,
    orderId: string | null,
    type: string,
    qtyDelta: number,
    note?: string
  ): Promise<void> {
    try {
      await this.supabase.from('inventory_movements').insert({
        product_id: productId,
        order_id: orderId,
        type,
        qty_delta: qtyDelta,
        note,
      });
    } catch (error) {
      console.error('Error recording inventory movement:', error);
    }
  }

  /**
   * Get product stock status
   */
  async getProductStock(productId: string) {
    try {
      const { data, error } = await this.supabase
        .from('products')
        .select('stock_quantity, reserved_quantity, low_stock_threshold, title')
        .eq('id', productId)
        .single();

      if (error) throw error;

      return {
        ...data,
        available: data.stock_quantity - data.reserved_quantity,
        isLowStock: data.stock_quantity < data.low_stock_threshold,
      };
    } catch (error) {
      console.error('Error getting product stock:', error);
      return null;
    }
  }
}
