// Fulfillment Service Orchestrator
// Main service for automated order fulfillment

import { SupabaseClient } from '@supabase/supabase-js';
import { SupplierScoringEngine } from './SupplierScoringEngine';
import { SupplierAdapter } from '../suppliers/SupplierAdapter';
import { ManualSupplierAdapter } from '../suppliers/ManualSupplierAdapter';
import { WarehouseAdapter } from '../suppliers/WarehouseAdapter';
import { MockApiSupplierAdapter } from '../suppliers/MockApiSupplierAdapter';
import { DigitalDeliveryAdapter } from '../suppliers/DigitalDeliveryAdapter';
import type { OrderPayload } from '../suppliers/SupplierAdapter';

export interface FulfillmentJobInput {
  orderId: string;
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface FulfillmentJobResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

type FulfillmentOrderItem = {
  product_id: string;
  supplier_sku?: string | null;
  quantity: number;
  unit_price_cents: number;
};

type FulfillmentOrder = {
  id: string;
  buyer_name?: string | null;
  shipping_address?: Record<string, unknown> | null;
  stripe_risk_level?: 'highest' | 'elevated' | string | null;
  total_amount?: number;
  order_items?: FulfillmentOrderItem[];
};

type FulfillmentJobRow = {
  id: string;
  order_id: string;
  fulfillment_type: 'digital' | 'manual' | 'warehouse' | 'dropship' | string;
  retry_count: number;
  max_retries?: number | null;
};

type ProductRow = {
  id: string;
  fulfillment_type?: string | null;
};

type FraudCheckResult = {
  status: 'approved' | 'flagged' | 'blocked' | string;
};

type ShippingAddress = OrderPayload['shippingAddress'];

export class FulfillmentService {
  private supabase: SupabaseClient;
  private scoringEngine: SupplierScoringEngine;
  private adapters: Map<string, SupplierAdapter>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.scoringEngine = new SupplierScoringEngine(supabase);
    this.adapters = new Map();
  }

  private mapShippingAddress(
    shippingAddress: Record<string, unknown> | null | undefined
  ): ShippingAddress {
    const source = shippingAddress || {};

    const line1 = typeof source.line1 === 'string'
      ? source.line1
      : typeof source.address1 === 'string'
        ? source.address1
        : 'Unknown address';
    const line2 = typeof source.line2 === 'string'
      ? source.line2
      : typeof source.address2 === 'string'
        ? source.address2
        : undefined;
    const city = typeof source.city === 'string' ? source.city : 'Unknown city';
    const state = typeof source.state === 'string' ? source.state : undefined;
    const postalCode = typeof source.postalCode === 'string'
      ? source.postalCode
      : typeof source.zip === 'string'
        ? source.zip
        : '0000';
    const country = typeof source.country === 'string' ? source.country : 'GE';

    return {
      line1,
      line2,
      city,
      state,
      postalCode,
      country,
    };
  }

  /**
   * Create fulfillment job(s) for an order
   * This is called after payment confirmation
   */
  async createFulfillmentJob(input: FulfillmentJobInput): Promise<FulfillmentJobResult> {
    try {
      // Get order details
      const { data: order, error: orderError } = await this.supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', input.orderId)
        .single();

      if (orderError || !order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }

      // Check fraud before processing
      const fraudCheck = await this.performFraudCheck(order as FulfillmentOrder);
      if (fraudCheck.status === 'blocked') {
        return {
          success: false,
          error: 'Order flagged for fraud review',
        };
      }

      // Get product details to determine fulfillment type
      const productIds = input.items.map((item) => item.productId);
      const { data: products } = await this.supabase
        .from('products')
        .select('*')
        .in('id', productIds);

      if (!products || products.length === 0) {
        return {
          success: false,
          error: 'Products not found',
        };
      }

      // Group items by fulfillment type
      const groupedItems = this.groupItemsByFulfillmentType(input.items, products as ProductRow[]);

      // Create fulfillment job for each group
      const jobIds: string[] = [];
      for (const [fulfillmentType, items] of Object.entries(groupedItems)) {
        const jobId = await this.createJobForType(
          input.orderId,
          input.storeId,
          fulfillmentType,
          items
        );
        if (jobId) {
          jobIds.push(jobId);
        }
      }

      if (jobIds.length === 0) {
        return {
          success: false,
          error: 'Failed to create fulfillment jobs',
        };
      }

      return {
        success: true,
        jobId: jobIds[0], // Return first job ID
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal error';
      console.error('Error creating fulfillment job:', error);
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Process a fulfillment job (async worker)
   */
  async processFulfillmentJob(jobId: string): Promise<void> {
    try {
      // Get job details
      const { data: job, error } = await this.supabase
        .from('fulfillment_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      const typedJob = job as FulfillmentJobRow | null;

      if (error || !typedJob) {
        console.error('Job not found:', jobId);
        return;
      }

      // Update status to processing
      await this.supabase
        .from('fulfillment_jobs')
        .update({ status: 'processing', processed_at: new Date().toISOString() })
        .eq('id', jobId);

      // Route to appropriate handler
      switch (typedJob.fulfillment_type) {
        case 'digital':
          await this.handleDigitalFulfillment(typedJob);
          break;
        case 'manual':
          await this.handleManualFulfillment(typedJob);
          break;
        case 'warehouse':
          await this.handleWarehouseFulfillment(typedJob);
          break;
        case 'dropship':
          await this.handleDropshipFulfillment(typedJob);
          break;
        default:
          throw new Error(`Unknown fulfillment type: ${typedJob.fulfillment_type}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error processing fulfillment job:', error);
      await this.handleJobError(jobId, message);
    }
  }

  /**
   * Handle digital product fulfillment (instant delivery)
   */
  private async handleDigitalFulfillment(job: FulfillmentJobRow): Promise<void> {
    const _adapter = new DigitalDeliveryAdapter('digital-001');
    
    // Digital fulfillment is instant
    await this.supabase
      .from('fulfillment_jobs')
      .update({
        status: 'delivered',
        supplier_order_id: `DIGITAL-${Date.now()}`,
      })
      .eq('id', job.id);

    // Update order status
    await this.supabase
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('id', job.order_id);

    // TODO: Send download link to customer via email
  }

  /**
   * Handle manual fulfillment (seller ships)
   */
  private async handleManualFulfillment(job: FulfillmentJobRow): Promise<void> {
    // Manual fulfillment stays in queued/processing
    // Seller will add tracking manually
    
    await this.supabase
      .from('fulfillment_jobs')
      .update({
        status: 'processing',
        supplier_order_id: `MANUAL-${Date.now()}`,
      })
      .eq('id', job.id);

    // TODO: Notify seller to ship order
  }

  /**
   * Handle warehouse fulfillment (internal pick & pack)
   */
  private async handleWarehouseFulfillment(job: FulfillmentJobRow): Promise<void> {
    const adapter = new WarehouseAdapter('warehouse-001');
    
    // Get order details for shipping address
    const { data: order } = await this.supabase
      .from('orders')
      .select('*')
      .eq('id', job.order_id)
      .single();

    const typedOrder = order as FulfillmentOrder | null;

    if (!typedOrder) throw new Error('Order not found');

    // Create warehouse task
    const result = await adapter.createOrder({
      orderReference: job.order_id,
      customerName: typedOrder.buyer_name || 'Customer',
      shippingAddress: this.mapShippingAddress(typedOrder.shipping_address),
      items: [], // TODO: Map order items
    });

    if (result.success) {
      await this.supabase
        .from('fulfillment_jobs')
        .update({
          status: 'processing',
          supplier_order_id: result.supplierOrderId,
        })
        .eq('id', job.id);

      // TODO: Notify warehouse staff
    } else {
      throw new Error(result.error || 'Warehouse order creation failed');
    }
  }

  /**
   * Handle dropship fulfillment (supplier ships)
   */
  private async handleDropshipFulfillment(job: FulfillmentJobRow): Promise<void> {
    // Get order details
    const { data: order } = await this.supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', job.order_id)
      .single();

    const typedOrder = order as FulfillmentOrder | null;

    if (!typedOrder || !typedOrder.order_items) throw new Error('Order not found');

    // Select best supplier using AI
    const productId = typedOrder.order_items[0]?.product_id;
    if (!productId) throw new Error('No products in order');

    const bestSupplier = await this.scoringEngine.selectBestSupplier(productId);
    if (!bestSupplier) throw new Error('No supplier available');

    // Get supplier adapter
    const adapter = await this.getSupplierAdapter(bestSupplier.supplierId);
    if (!adapter) throw new Error('Supplier adapter not found');

    // Create order with supplier
    const result = await adapter.createOrder({
      orderReference: job.order_id,
      customerName: typedOrder.buyer_name || 'Customer',
      shippingAddress: this.mapShippingAddress(typedOrder.shipping_address),
      items: typedOrder.order_items.map((item) => ({
        supplierSku: item.supplier_sku || item.product_id,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
      })),
    });

    if (result.success) {
      // Update job with tracking info
      await this.supabase
        .from('fulfillment_jobs')
        .update({
          status: 'shipped',
          supplier_id: bestSupplier.supplierId,
          supplier_order_id: result.supplierOrderId,
          tracking_number: result.trackingNumber,
          carrier: result.carrier,
          estimated_delivery_date: result.estimatedDeliveryDate,
        })
        .eq('id', job.id);

      // Create shipment record
      if (result.trackingNumber) {
        await this.supabase.from('order_shipments').insert({
          order_id: job.order_id,
          fulfillment_job_id: job.id,
          tracking_number: result.trackingNumber,
          carrier: result.carrier || 'Unknown',
          status: 'in_transit',
          shipped_at: new Date().toISOString(),
          estimated_delivery_at: result.estimatedDeliveryDate,
        });
      }

      // Update order status
      await this.supabase
        .from('orders')
        .update({ status: 'shipped' })
        .eq('id', job.order_id);
    } else {
      throw new Error(result.error || 'Supplier order creation failed');
    }
  }

  /**
   * Handle job error with retry logic
   */
  private async handleJobError(jobId: string, errorMessage: string): Promise<void> {
    const { data: job } = await this.supabase
      .from('fulfillment_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) return;

    const retryCount = job.retry_count + 1;
    const maxRetries = job.max_retries || 3;

    // Log error
    await this.supabase.from('fulfillment_errors').insert({
      fulfillment_job_id: jobId,
      error_type: 'processing_error',
      error_message: errorMessage,
      retry_attempt: retryCount,
    });

    if (retryCount >= maxRetries) {
      // Max retries reached, mark as failed
      await this.supabase
        .from('fulfillment_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: retryCount,
        })
        .eq('id', jobId);

      // TODO: Notify admin + auto-refund option
    } else {
      // Schedule retry with exponential backoff
      const nextRetryMinutes = Math.pow(2, retryCount) * 5; // 5, 10, 20 minutes
      const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);

      await this.supabase
        .from('fulfillment_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          retry_count: retryCount,
          next_retry_at: nextRetryAt.toISOString(),
        })
        .eq('id', jobId);
    }
  }

  /**
   * Perform fraud check before fulfillment
   */
  private async performFraudCheck(order: FulfillmentOrder): Promise<FraudCheckResult> {
    // Check if fraud check already exists
    const { data: existing } = await this.supabase
      .from('fraud_checks')
      .select('*')
      .eq('order_id', order.id)
      .single();

    if (existing) return existing;

    // Simple fraud checks (can be extended)
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Check Stripe risk level
    if (order.stripe_risk_level === 'highest') {
      riskFactors.push('High Stripe risk score');
      riskScore += 50;
    } else if (order.stripe_risk_level === 'elevated') {
      riskFactors.push('Elevated Stripe risk');
      riskScore += 25;
    }

    // Check order value (high value = higher risk)
    if ((order.total_amount ?? 0) > 50000) {
      // $500+
      riskFactors.push('High order value');
      riskScore += 20;
    }

    // Determine status
    let status = 'approved';
    if (riskScore >= 50) {
      status = 'flagged';
    }
    if (riskScore >= 75) {
      status = 'blocked';
    }

    // Create fraud check record
    const { data: fraudCheck } = await this.supabase
      .from('fraud_checks')
      .insert({
        order_id: order.id,
        stripe_risk_level: order.stripe_risk_level,
        stripe_risk_score: riskScore,
        risk_factors: riskFactors,
        status,
        checks_performed: {
          stripe_check: true,
          value_check: true,
        },
      })
      .select()
      .single();

    return (fraudCheck as FraudCheckResult) || { status: 'approved' };
  }

  /**
   * Group items by fulfillment type
   */
  private groupItemsByFulfillmentType(
    items: Array<{ productId: string; quantity: number }>,
    products: ProductRow[]
  ): Record<string, Array<{ productId: string; quantity: number; product: ProductRow }>> {
    const grouped: Record<string, Array<{ productId: string; quantity: number; product: ProductRow }>> = {};

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      const type = product.fulfillment_type || 'manual';
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push({ ...item, product });
    }

    return grouped;
  }

  /**
   * Create job for specific fulfillment type
   */
  private async createJobForType(
    orderId: string,
    storeId: string,
    fulfillmentType: string,
    items: unknown[]
  ): Promise<string | null> {
    const { data: job, error } = await this.supabase
      .from('fulfillment_jobs')
      .insert({
        order_id: orderId,
        store_id: storeId,
        fulfillment_type: fulfillmentType,
        status: 'queued',
        metadata_json: { items },
      })
      .select()
      .single();

    if (error || !job) {
      console.error('Error creating job:', error);
      return null;
    }

    // Process job asynchronously
    setTimeout(() => this.processFulfillmentJob(job.id), 1000);

    return job.id;
  }

  /**
   * Get supplier adapter instance
   */
  private async getSupplierAdapter(supplierId: string): Promise<SupplierAdapter | null> {
    // Check cache
    if (this.adapters.has(supplierId)) {
      return this.adapters.get(supplierId)!;
    }

    // Fetch supplier details
    const { data: supplier } = await this.supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .single();

    if (!supplier) return null;

    let adapter: SupplierAdapter;

    switch (supplier.type) {
      case 'manual':
        adapter = new ManualSupplierAdapter(supplier.id, supplier.name);
        break;
      case 'warehouse':
        adapter = new WarehouseAdapter(supplier.id, supplier.name);
        break;
      case 'api':
        adapter = new MockApiSupplierAdapter({
          supplierId: supplier.id,
          supplierName: supplier.name,
          apiEndpoint: supplier.api_endpoint,
          apiKey: supplier.api_key_encrypted, // TODO: Decrypt
        });
        break;
      default:
        return null;
    }

    this.adapters.set(supplierId, adapter);
    return adapter;
  }
}
