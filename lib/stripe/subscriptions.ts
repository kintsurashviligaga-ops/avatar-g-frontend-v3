/**
 * Database Subscription Management
 * 
 * Idempotent operations for managing subscriptions table
 */

import { createRouteHandlerClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | 'unpaid';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get user's active subscription
 */
export async function getUserSubscription(userId: string): Promise<Subscription | null> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('[DB] Error fetching subscription:', error);
    throw new Error('Failed to fetch subscription');
  }

  return data;
}

/**
 * Get subscription by Stripe subscription ID
 */
export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string
): Promise<Subscription | null> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[DB] Error fetching subscription by Stripe ID:', error);
    throw new Error('Failed to fetch subscription');
  }

  return data;
}

/**
 * Create or update subscription (idempotent)
 */
export async function upsertSubscription(
  subscription: Stripe.Subscription,
  userId: string
): Promise<void> {
  const supabase = createRouteHandlerClient();
  const currentItem = subscription.items.data[0];
  const currentPeriodStart =
    typeof currentItem?.current_period_start === 'number'
      ? currentItem.current_period_start
      : Math.floor(Date.now() / 1000);
  const currentPeriodEnd =
    typeof currentItem?.current_period_end === 'number'
      ? currentItem.current_period_end
      : Math.floor(Date.now() / 1000);

  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items.data[0]?.price.id || '',
    status: subscription.status as Subscription['status'],
    current_period_start: new Date(currentPeriodStart * 1000).toISOString(),
    current_period_end: new Date(currentPeriodEnd * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'stripe_subscription_id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error('[DB] Error upserting subscription:', error);
    throw new Error('Failed to upsert subscription');
  }

  console.log('[DB] Subscription upserted:', {
    userId,
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: Subscription['status'],
  cancelAtPeriodEnd?: boolean
): Promise<void> {
  const supabase = createRouteHandlerClient();

  const updates: Partial<Subscription> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (cancelAtPeriodEnd !== undefined) {
    updates.cancel_at_period_end = cancelAtPeriodEnd;
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('stripe_subscription_id', stripeSubscriptionId);

  if (error) {
    console.error('[DB] Error updating subscription status:', error);
    throw new Error('Failed to update subscription status');
  }

  console.log('[DB] Subscription status updated:', {
    subscriptionId: stripeSubscriptionId,
    status,
  });
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  await updateSubscriptionStatus(stripeSubscriptionId, 'canceled');
}

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  return subscription !== null && ['active', 'trialing'].includes(subscription.status);
}

/**
 * Get user ID from Stripe customer ID
 */
export async function getUserIdFromCustomerId(customerId: string): Promise<string | null> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[DB] Error fetching user ID from customer ID:', error);
    return null;
  }

  return data.user_id;
}

/**
 * Store Stripe customer ID for user
 */
export async function storeCustomerMapping(
  userId: string,
  stripeCustomerId: string
): Promise<void> {
  const supabase = createRouteHandlerClient();

  // Store in user_metadata or separate table
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: userId,
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    console.error('[DB] Error storing customer mapping:', error);
    // Non-critical error, continue
  }
}

/**
 * Get Stripe customer ID for user
 */
export async function getCustomerIdForUser(userId: string): Promise<string | null> {
  const supabase = createRouteHandlerClient();

  // Try from subscriptions table first
  const { data: subData } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (subData?.stripe_customer_id) {
    return subData.stripe_customer_id;
  }

  // Try from user_profiles
  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single();

  return profileData?.stripe_customer_id || null;
}
