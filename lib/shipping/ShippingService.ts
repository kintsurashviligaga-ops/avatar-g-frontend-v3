// Avatar G Shipping Service
// Core business logic for shipping management

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ShippingProvider,
} from './ShippingProvider';
import { ManualProvider } from './providers/ManualProvider';
import { GeorgianPostProvider } from './providers/GeorgianPostProvider';
import { DHLProvider } from './providers/DHLProvider';
import { UPSProvider } from './providers/UPSProvider';

export interface ShippingQuote {
  rateId: string;
  name: string;
  minDays: number;
  maxDays: number;
  priceCents: number;
  currency: string;
}

export class ShippingService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Get shipping quotes for a given address and items
   * Looks up seller shipping zones and rates
   */
  async getShippingQuotes(
    sellerUserId: string,
    countryCode: string,
    _city: string
  ): Promise<ShippingQuote[]> {
    try {
      // Find shipping zone that matches country
      const { data: zones, error: zoneError } = await this.supabase
        .from('shipping_zones')
        .select('id')
        .eq('seller_user_id', sellerUserId)
        .contains('countries', [countryCode]);

      if (zoneError) throw zoneError;
      if (!zones || zones.length === 0) {
        // Fallback: No specific zone, return empty (buyer should be notified)
        return [];
      }

      // Get rates for matching zones
      const { data: rates, error: rateError } = await this.supabase
        .from('shipping_rates')
        .select('id, name, min_days, max_days, price_cents, currency')
        .in('zone_id', zones.map((z) => z.id))
        .eq('is_active', true);

      if (rateError) throw rateError;

      return (
        rates?.map((rate) => ({
          rateId: rate.id,
          name: rate.name,
          minDays: rate.min_days,
          maxDays: rate.max_days,
          priceCents: rate.price_cents,
          currency: rate.currency,
        })) || []
      );
    } catch (error) {
      console.error('Error fetching shipping quotes:', error);
      throw error;
    }
  }

  /**
   * Create a shipment record in database
   * Called after order is confirmed
   */
  async createShipmentRecord(
    orderId: string,
    sellerUserId: string,
    carrier: string = 'manual',
    serviceLevel: string = 'standard'
  ): Promise<{ shipmentId: string; trackingToken: string }> {
    try {
      const { data, error } = await this.supabase
        .from('shipments')
        .insert({
          order_id: orderId,
          seller_user_id: sellerUserId,
          carrier,
          service_level: serviceLevel,
          status: 'created',
        })
        .select('id, tracking_public_token')
        .single();

      if (error) throw error;

      return {
        shipmentId: data.id,
        trackingToken: data.tracking_public_token,
      };
    } catch (error) {
      console.error('Error creating shipment record:', error);
      throw error;
    }
  }

  /**
   * Get provider instance by name
   */
  getProvider(providerName: string): ShippingProvider {
    switch (providerName) {
      case 'manual':
        return new ManualProvider();
      case 'georgian_post':
        return new GeorgianPostProvider();
      case 'dhl':
        return new DHLProvider();
      case 'ups':
        return new UPSProvider();
      default:
        return new ManualProvider(); // Fallback to manual
    }
  }

  /**
   * Update shipment with tracking information
   */
  async updateShipmentTracking(
    shipmentId: string,
    trackingNumber: string,
    trackingUrl?: string
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('shipments')
        .update({
          tracking_number: trackingNumber,
          tracking_url: trackingUrl,
          status: 'label_created',
          shipped_at: new Date().toISOString(),
        })
        .eq('id', shipmentId);

      if (error) throw error;

      // Record event
      await this.addShipmentEvent(shipmentId, 'label_created', null, 'Label created', 'seller');
    } catch (error) {
      console.error('Error updating shipment tracking:', error);
      throw error;
    }
  }

  /**
   * Add an event to shipment event log (audit trail)
   */
  async addShipmentEvent(
    shipmentId: string,
    status: string,
    location: string | null,
    message: string,
    source: 'system' | 'carrier' | 'seller' | 'admin' = 'system'
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('shipment_events')
        .insert({
          shipment_id: shipmentId,
          status,
          location,
          message,
          source,
          occurred_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error adding shipment event:', error);
      throw error;
    }
  }

  /**
   * Update shipment status and order fulfillment status
   */
  async updateShipmentStatus(
    shipmentId: string,
    newStatus: string,
    location?: string,
    message?: string
  ): Promise<void> {
    try {
      // Update shipment status
      const updateData: {
        status: string;
        delivered_at?: string;
        shipped_at?: string;
      } = { status: newStatus };

      if (newStatus === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      } else if (newStatus === 'in_transit' && !updateData.shipped_at) {
        updateData.shipped_at = new Date().toISOString();
      }

      const { error: shipmentError } = await this.supabase
        .from('shipments')
        .update(updateData)
        .eq('id', shipmentId);

      if (shipmentError) throw shipmentError;

      // Add event
      await this.addShipmentEvent(
        shipmentId,
        newStatus,
        location || null,
        message || `Status updated to ${newStatus}`,
        'system'
      );

      // Update order fulfillment status if needed
      if (newStatus === 'delivered' || newStatus === 'canceled' || newStatus === 'returned') {
        const mappedStatus = newStatus === 'delivered' ? 'delivered' : newStatus;
        const { data: shipment } = await this.supabase
          .from('shipments')
          .select('order_id')
          .eq('id', shipmentId)
          .single();

        if (shipment) {
          await this.supabase
            .from('orders')
            .update({ fulfillment_status: mappedStatus })
            .eq('id', shipment.order_id);
        }
      }
    } catch (error) {
      console.error('Error updating shipment status:', error);
      throw error;
    }
  }

  /**
   * Get shipment for buyer (public via token)
   */
  async getShipmentForTracking(token: string) {
    try {
      // Validate token exists
      const { data: tokenData, error: tokenError } = await this.supabase
        .from('tracking_tokens')
        .select('shipment_id, expires_at')
        .eq('token', token)
        .single();

      if (tokenError || !tokenData) return null;

      // Check expiration
      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        return null; // Token expired
      }

      // Get shipment with events (exclude sensitive data)
      const { data: shipment, error: shipmentError } = await this.supabase
        .from('shipments')
        .select(
          `
          id,
          status,
          carrier,
          tracking_number,
          tracking_url,
          shipped_at,
          delivered_at,
          created_at,
          shipment_events (
            id,
            status,
            location,
            message,
            occurred_at
          )
        `
        )
        .eq('id', tokenData.shipment_id)
        .single();

      if (shipmentError) throw shipmentError;

      return shipment;
    } catch (error) {
      console.error('Error fetching shipment for tracking:', error);
      return null;
    }
  }
}
