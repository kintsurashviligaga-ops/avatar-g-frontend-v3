/**
 * Stripe Connect - Account Management
 * 
 * Functions for managing Stripe Connect Standard accounts
 * Security: Platform never has access to seller's Stripe API keys
 */

import Stripe from 'stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/billing/stripe';
import { STRIPE_CONNECT_CONFIG } from './config';

export interface ConnectedAccount {
  id: string;
  seller_id: string;
  stripe_account_id: string;
  status: 'pending' | 'restricted' | 'enabled' | 'rejected';
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountCapabilities {
  card_payments: 'active' | 'inactive' | 'pending';
  transfers: 'active' | 'inactive' | 'pending';
}

function normalizeConnectedAccountStatus(
  status: string | null | undefined
): ConnectedAccount['status'] {
  if (status === 'enabled' || status === 'pending' || status === 'restricted' || status === 'rejected') {
    return status;
  }
  return 'pending';
}

/**
 * Create a new Stripe Connect account for seller
 */
export async function createConnectAccount(
  userId: string,
  email: string,
  businessName?: string
): Promise<{ accountId: string; onboardingUrl: string }> {
  const stripe = getStripe();
  const supabase = createRouteHandlerClient();

  // Check if seller already has an account
  const { data: existing } = await supabase
    .from('seller_profiles')
    .select('stripe_connected_account_id')
    .eq('user_id', userId)
    .single();

  if (existing?.stripe_connected_account_id) {
    // Account exists, generate new onboarding link
    const accountLink = await createAccountLink(existing.stripe_connected_account_id);
    return {
      accountId: existing.stripe_connected_account_id,
      onboardingUrl: accountLink.url,
    };
  }

  // Create new Connect account
  const account = await stripe.accounts.create({
    type: STRIPE_CONNECT_CONFIG.ACCOUNT_TYPE,
    email,
    business_type: 'individual', // Can be updated during onboarding
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      user_id: userId,
      platform: 'avatar-g',
    },
  });

  // Store account in database
  const { error: updateError } = await supabase
    .from('seller_profiles')
    .update({
      stripe_connected_account_id: account.id,
      stripe_account_status: 'pending',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('[Connect] Failed to store account ID:', updateError);
    throw new Error('Failed to save Connect account');
  }

  // Log event
  await logConnectEvent(userId, account.id, 'account_created', 'success', {
    email,
    business_name: businessName,
  });

  // Create onboarding link
  const accountLink = await createAccountLink(account.id);

  return {
    accountId: account.id,
    onboardingUrl: accountLink.url,
  };
}

/**
 * Create account link for onboarding
 */
export async function createAccountLink(accountId: string): Promise<Stripe.AccountLink> {
  const stripe = getStripe();

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: STRIPE_CONNECT_CONFIG.ACCOUNT_LINK_CONFIG.refreshUrl,
    return_url: STRIPE_CONNECT_CONFIG.ACCOUNT_LINK_CONFIG.returnUrl,
    type: STRIPE_CONNECT_CONFIG.ACCOUNT_LINK_CONFIG.type,
  });

  return accountLink;
}

/**
 * Get Connect account status from Stripe
 */
export async function getAccountStatus(
  accountId: string
): Promise<{
  account: Stripe.Account;
  canReceivePayments: boolean;
  requirementsStatus: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    disabled: boolean;
  };
}> {
  const stripe = getStripe();

  const account = await stripe.accounts.retrieve(accountId);

  const canReceivePayments =
    account.charges_enabled === true &&
    account.payouts_enabled === true &&
    account.details_submitted === true;

  const requirementsStatus = {
    currentlyDue: account.requirements?.currently_due ?? [],
    eventuallyDue: account.requirements?.eventually_due ?? [],
    pastDue: account.requirements?.past_due ?? [],
    disabled: account.requirements?.disabled_reason !== null,
  };

  return {
    account,
    canReceivePayments,
    requirementsStatus,
  };
}

/**
 * Update seller's account status in database
 */
export async function updateAccountStatus(
  userId: string,
  accountId: string
): Promise<void> {
  const { account, canReceivePayments } = await getAccountStatus(accountId);
  const supabase = createRouteHandlerClient();

  // Determine status
  let status: 'pending' | 'restricted' | 'enabled' | 'rejected' = 'pending';
  if (account.requirements?.disabled_reason) {
    status = 'rejected';
  } else if (canReceivePayments) {
    status = 'enabled';
  } else if (account.charges_enabled === false || account.payouts_enabled === false) {
    status = 'restricted';
  }

  // Update database
  const { error } = await supabase
    .from('seller_profiles')
    .update({
      stripe_account_status: status,
      stripe_charges_enabled: account.charges_enabled ?? false,
      stripe_payouts_enabled: account.payouts_enabled ?? false,
      stripe_details_submitted: account.details_submitted ?? false,
      stripe_onboarding_completed_at:
        account.details_submitted && !account.requirements?.currently_due?.length
          ? new Date().toISOString()
          : null,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[Connect] Failed to update account status:', error);
    throw new Error('Failed to update account status');
  }

  // Log status change
  await logConnectEvent(userId, accountId, 'account_updated', 'success', {
    status,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
  });
}

/**
 * Get seller's Connect account from database
 */
export async function getSellerAccount(userId: string): Promise<ConnectedAccount | null> {
  const supabase = createRouteHandlerClient();

  const { data, error } = await supabase
    .from('seller_profiles')
    .select(
      `
      user_id,
      stripe_connected_account_id,
      stripe_account_status,
      stripe_charges_enabled,
      stripe_payouts_enabled,
      stripe_details_submitted,
      stripe_onboarding_completed_at,
      created_at,
      updated_at
    `
    )
    .eq('user_id', userId)
    .single();

  if (error || !data?.stripe_connected_account_id) {
    return null;
  }

  return {
    id: data.user_id,
    seller_id: data.user_id,
    stripe_account_id: data.stripe_connected_account_id,
    status: normalizeConnectedAccountStatus(data.stripe_account_status),
    charges_enabled: data.stripe_charges_enabled ?? false,
    payouts_enabled: data.stripe_payouts_enabled ?? false,
    details_submitted: data.stripe_details_submitted ?? false,
    onboarding_completed_at: data.stripe_onboarding_completed_at,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

/**
 * Check if seller can receive payments
 */
export async function canSellerReceivePayments(userId: string): Promise<boolean> {
  const account = await getSellerAccount(userId);

  if (!account) {
    return false;
  }

  return (
    account.status === 'enabled' &&
    account.charges_enabled === true &&
    account.payouts_enabled === true &&
    account.details_submitted === true
  );
}

/**
 * Get account ID by user ID
 */
export async function getAccountIdForSeller(userId: string): Promise<string | null> {
  const account = await getSellerAccount(userId);
  return account?.stripe_account_id ?? null;
}

/**
 * Log Connect event for audit trail
 */
async function logConnectEvent(
  sellerId: string,
  accountId: string,
  eventType: string,
  status: 'success' | 'failed',
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createRouteHandlerClient();

  await supabase.from('stripe_connect_events').insert({
    seller_id: sellerId,
    stripe_account_id: accountId,
    event_type: eventType,
    status,
    metadata_json: metadata ?? {},
  });
}

/**
 * Create login link for seller dashboard
 * Allows seller to access their Stripe Express dashboard
 */
export async function createLoginLink(accountId: string): Promise<string> {
  const stripe = getStripe();

  const loginLink = await stripe.accounts.createLoginLink(accountId);

  return loginLink.url;
}
