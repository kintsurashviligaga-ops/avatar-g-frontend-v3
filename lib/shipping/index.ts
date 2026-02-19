/**
 * Shipping System Library - Server Side
 * All shipping calculations and status management
 * 
 * All money values are in cents (integers).
 */

'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { getServerEnv } from '@/lib/env/server';
import { ShippingProfile, ShippingTracking, ShippingStatus } from '@/lib/commerce/types';

/**
 * Initialize Supabase client for server operations
 */
function getSupabaseClient() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
    getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );
  return supabase;
}

// ============================================
// SHIPPING COST CALCULATION
// ============================================

export interface ComputeShippingCostInput {
  profileId: string;
  weightGrams?: number;
  destinationCountryCode?: string;
}

export interface ComputeShippingCostResult {
  shippingCostCents: number;
  profileId: string;
  weightGrams: number;
  calculatedAt: string;
}

/**
 * Compute shipping cost based on profile and weight
 * Formula: base_cost + (weight_kg * per_kg_cost)
 * 
 * Server-side only to prevent cost manipulation.
 */
export async function computeShippingCost(
  input: ComputeShippingCostInput
): Promise<ComputeShippingCostResult> {
  const supabase = getSupabaseClient();
  
  const { data: profile, error } = await supabase
    .from('shipping_profiles')
    .select('*')
    .eq('id', input.profileId)
    .single();
    
  if (error || !profile) {
    throw new Error(`Shipping profile not found: ${input.profileId}`);
  }

  const weightGrams = input.weightGrams || 0;
  const weightKg = weightGrams / 1000;
  
  const baseCost = profile.base_cost || 0; // cents
  const perKgCost = profile.per_kg_cost || 0; // cents per kg
  const weightCost = Math.round(perKgCost * weightKg);
  
  const totalCostCents = baseCost + weightCost;
  
  return {
    shippingCostCents: Math.max(0, totalCostCents),
    profileId: input.profileId,
    weightGrams,
    calculatedAt: new Date().toISOString(),
  };
}

// ============================================
// SHIPPING EVENT MANAGEMENT
// ============================================

export interface AddShippingEventInput {
  orderId: string;
  status: ShippingStatus;
  location?: string;
  trackingCode?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Add shipping event and update order status
 * Events are immutable (append-only audit trail)
 * 
 * Server-side verification:
 * - User must be order owner or store owner
 * - Order must exist
 */
export async function addShippingEvent(input: AddShippingEventInput) {
  const supabase = getSupabaseClient();
  
  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // Verify user is order owner or store owner
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, store_id')
    .eq('id', input.orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found');
  }

  const isOrderOwner = order.user_id === user.id;
  const isStoreOwner = order.store_id
    ? await checkStoreOwnership(order.store_id, user.id)
    : false;

  if (!isOrderOwner && !isStoreOwner) {
    throw new Error('Unauthorized: not order owner or store owner');
  }

  // Insert shipping event
  const { data: event, error: insertError } = await supabase
    .from('shipping_events')
    .insert([
      {
        order_id: input.orderId,
        status: input.status,
        location: input.location || null,
        tracking_code: input.trackingCode || null,
        metadata_json: input.metadata || null,
      },
    ])
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to add shipping event: ${insertError.message}`);
  }

  // Update order shipping status and tracking code
  const updateData: Record<string, string> = {
    shipping_status: input.status,
  };

  if (input.trackingCode) {
    updateData.tracking_code = input.trackingCode;
  }

  if (input.status === 'shipped') {
    updateData.shipped_at = new Date().toISOString();
  } else if (input.status === 'delivered') {
    updateData.delivered_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update(updateData)
    .eq('id', input.orderId);

  if (updateError) {
    console.error('Failed to update order shipping status:', updateError);
  }

  return event;
}

// ============================================
// GET TRACKING INFORMATION
// ============================================

/**
 * Get complete tracking info for order
 * Includes shipping profile, current status, and event history
 * 
 * RLS enforced by database:
 * - Order buyer can view
 * - Store owner can view
 */
export async function getTracking(orderId: string): Promise<ShippingTracking> {
  const supabase = getSupabaseClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      shipping_status,
      tracking_code,
      shipping_profile_id,
      weight_grams,
      user_id,
      store_id
    `)
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found or access denied');
  }

  let profile: ShippingProfile | null = null;
  if (order.shipping_profile_id) {
    const { data: profileData } = await supabase
      .from('shipping_profiles')
      .select('*')
      .eq('id', order.shipping_profile_id)
      .single();
    profile = profileData;
  }

  // Get shipping events (ordered by most recent first)
  const { data: events, error: eventsError } = await supabase
    .from('shipping_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });

  if (eventsError) {
    throw new Error('Failed to fetch shipping events');
  }

  const currentEvent = events?.[0];

  return {
    orderId: order.id,
    shippingStatus: order.shipping_status as ShippingStatus,
    trackingCode: order.tracking_code,
    estimatedDaysMin: profile?.estimated_days_min || 1,
    estimatedDaysMax: profile?.estimated_days_max || 7,
    events: events || [],
    currentLocation: currentEvent?.location || null,
    lastUpdated: currentEvent?.created_at || new Date().toISOString(),
  };
}

// ============================================
// SELECT SHIPPING PROFILE FOR ORDER
// ============================================

export interface SelectShippingProfileInput {
  orderId: string;
  shippingProfileId: string;
  weightGrams?: number;
}

/**
 * Select shipping profile for order
 * Recomputes order total with new shipping cost if needed
 * 
 * Only store owner allowed.
 */
export async function selectShippingProfile(input: SelectShippingProfileInput) {
  const supabase = getSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // Verify user owns the order's store
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, store_id, total_amount')
    .eq('id', input.orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found');
  }

  const isStoreOwner = order.store_id
    ? await checkStoreOwnership(order.store_id, user.id)
    : false;

  if (!isStoreOwner) {
    throw new Error('Unauthorized: not store owner');
  }

  // Verify profile exists and belongs to same store
  const { data: profile, error: profileError } = await supabase
    .from('shipping_profiles')
    .select('id, store_id, base_cost, per_kg_cost')
    .eq('id', input.shippingProfileId)
    .single();

  if (profileError || !profile) {
    throw new Error('Shipping profile not found');
  }

  if (profile.store_id !== order.store_id) {
    throw new Error('Shipping profile does not belong to this store');
  }

  // Compute new shipping cost
  const costResult = await computeShippingCost({
    profileId: input.shippingProfileId,
    weightGrams: input.weightGrams || 0,
  });

  // Get old shipping cost for adjustment
  const { data: oldData } = await supabase
    .from('orders')
    .select('shipping_cost')
    .eq('id', input.orderId)
    .single();

  const oldShippingCost = oldData?.shipping_cost || 0;
  const shippingCostDifference = costResult.shippingCostCents - oldShippingCost;

  // Update order with new shipping profile and cost
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      shipping_profile_id: input.shippingProfileId,
      shipping_cost: costResult.shippingCostCents,
      weight_grams: input.weightGrams || null,
      total_amount: order.total_amount + shippingCostDifference,
    })
    .eq('id', input.orderId);

  if (updateError) {
    throw new Error(`Failed to update order: ${updateError.message}`);
  }

  return {
    orderId: input.orderId,
    shippingProfileId: input.shippingProfileId,
    shippingCostCents: costResult.shippingCostCents,
    newTotal: order.total_amount + shippingCostDifference,
  };
}

// ============================================
// CREATE SHIPPING PROFILE (Store Owner)
// ============================================

export interface CreateShippingProfileInput {
  storeId: string;
  name: string;
  baseCost: number;
  perKgCost: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  description?: string;
}

/**
 * Create new shipping profile for store
 * Only store owner allowed.
 */
export async function createShippingProfile(input: CreateShippingProfileInput) {
  const supabase = getSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // Verify user owns the store
  const isOwner = await checkStoreOwnership(input.storeId, user.id);
  if (!isOwner) {
    throw new Error('Unauthorized: not store owner');
  }

  const { data, error } = await supabase
    .from('shipping_profiles')
    .insert([
      {
        store_id: input.storeId,
        name: input.name,
        base_cost: input.baseCost,
        per_kg_cost: input.perKgCost,
        estimated_days_min: input.estimatedDaysMin,
        estimated_days_max: input.estimatedDaysMax,
        description: input.description || null,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create shipping profile: ${error.message}`);
  }

  return data;
}

// ============================================
// HELPER: Check Store Ownership
// ============================================

async function checkStoreOwnership(storeId: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('shop_stores')
    .select('user_id')
    .eq('id', storeId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.user_id === userId;
}
