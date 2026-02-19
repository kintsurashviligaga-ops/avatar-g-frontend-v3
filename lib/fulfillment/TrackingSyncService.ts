// Tracking Sync Service
// Periodically syncs tracking info from suppliers

import { SupabaseClient } from '@supabase/supabase-js';
import { SupplierAdapter } from '../suppliers/SupplierAdapter';
import { MockApiSupplierAdapter } from '../suppliers/MockApiSupplierAdapter';
import { ManualSupplierAdapter } from '../suppliers/ManualSupplierAdapter';
import { WarehouseAdapter } from '../suppliers/WarehouseAdapter';

type SupplierRow = {
  id: string;
  type: 'manual' | 'warehouse' | 'api' | string;
  name: string;
  api_endpoint?: string | null;
  api_key_encrypted?: string | null;
};

type FulfillmentJobRow = {
  id: string;
  order_id: string;
  supplier_id?: string | null;
  supplier_order_id?: string | null;
  tracking_number?: string | null;
  suppliers?: SupplierRow | null;
};

type TrackingData = {
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  events?: unknown[];
};

export class TrackingSyncService {
  private supabase: SupabaseClient;
  private adapters: Map<string, SupplierAdapter>;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.adapters = new Map();
  }

  /**
   * Sync tracking for all shipped orders
   * Run this as a cron job (e.g., every 6 hours)
   */
  async syncAllTracking(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    try {
      // Get all jobs with status 'shipped' that have supplier_order_id
      const { data: jobs } = await this.supabase
        .from('fulfillment_jobs')
        .select('*, suppliers(*)')
        .eq('status', 'shipped')
        .not('supplier_order_id', 'is', null);

      if (!jobs || jobs.length === 0) {
        console.log('No jobs to sync');
        return { synced, errors };
      }

      console.log(`Syncing tracking for ${jobs.length} jobs`);

      for (const job of jobs) {
        try {
          const updated = await this.syncJobTracking(job);
          if (updated) synced++;
        } catch (error) {
          console.error(`Error syncing job ${job.id}:`, error);
          errors++;
        }
      }

      return { synced, errors };
    } catch (error) {
      console.error('Error in syncAllTracking:', error);
      return { synced, errors };
    }
  }

  /**
   * Sync tracking for a specific job
   */
  async syncJobTracking(job: FulfillmentJobRow): Promise<boolean> {
    if (!job.supplier_id || !job.supplier_order_id) {
      return false;
    }

    const adapter = await this.getSupplierAdapter(job.supplier_id, job.suppliers);
    if (!adapter || !adapter.supportsFeature('auto_tracking')) {
      return false;
    }

    try {
      const tracking = await adapter.getTracking(job.supplier_order_id);
      if (!tracking) return false;

      // Update job if tracking number changed
      if (tracking.trackingNumber && tracking.trackingNumber !== job.tracking_number) {
        await this.supabase
          .from('fulfillment_jobs')
          .update({
            tracking_number: tracking.trackingNumber,
            carrier: tracking.carrier,
          })
          .eq('id', job.id);
      }

      // Update shipment record
      if (tracking.trackingNumber) {
        await this.updateShipmentTracking(job.order_id, tracking);
      }

      // Check if delivered
      if (tracking.status === 'delivered') {
        await this.handleDelivery(job);
      }

      return true;
    } catch (error) {
      console.error(`Error syncing tracking for job ${job.id}:`, error);
      return false;
    }
  }

  /**
   * Update shipment record with tracking events
   */
  private async updateShipmentTracking(orderId: string, tracking: TrackingData): Promise<void> {
    const { data: shipment } = await this.supabase
      .from('order_shipments')
      .select('*')
      .eq('order_id', orderId)
      .eq('tracking_number', tracking.trackingNumber)
      .single();

    if (!shipment) {
      // Create shipment if doesn't exist
      await this.supabase.from('order_shipments').insert({
        order_id: orderId,
        tracking_number: tracking.trackingNumber,
        carrier: tracking.carrier,
        status: tracking.status,
        tracking_events: tracking.events,
      });
    } else {
      // Update existing shipment
      await this.supabase
        .from('order_shipments')
        .update({
          status: tracking.status,
          tracking_events: tracking.events,
          delivered_at:
            tracking.status === 'delivered' && !shipment.delivered_at
              ? new Date().toISOString()
              : shipment.delivered_at,
        })
        .eq('id', shipment.id);
    }
  }

  /**
   * Handle delivery (mark order as delivered)
   */
  private async handleDelivery(job: FulfillmentJobRow): Promise<void> {
    // Update job status
    await this.supabase
      .from('fulfillment_jobs')
      .update({ status: 'delivered' })
      .eq('id', job.id);

    // Check if all jobs for order are delivered
    const { data: allJobs } = await this.supabase
      .from('fulfillment_jobs')
      .select('status')
      .eq('order_id', job.order_id);

    const allDelivered = allJobs?.every((j) => j.status === 'delivered');

    if (allDelivered) {
      // Mark order as delivered
      await this.supabase
        .from('orders')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
        .eq('id', job.order_id);

      // TODO: Send delivery confirmation email to customer
    }
  }

  /**
   * Get supplier adapter instance
   */
  private async getSupplierAdapter(
    supplierId: string,
    supplierData?: SupplierRow | null
  ): Promise<SupplierAdapter | null> {
    if (this.adapters.has(supplierId)) {
      return this.adapters.get(supplierId)!;
    }

    let supplier: SupplierRow | null | undefined = supplierData;
    if (!supplier) {
      const { data } = await this.supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single();
      supplier = data;
    }

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
          apiEndpoint: supplier.api_endpoint || '',
          apiKey: supplier.api_key_encrypted || '',
        });
        break;
      default:
        return null;
    }

    this.adapters.set(supplierId, adapter);
    return adapter;
  }
}
