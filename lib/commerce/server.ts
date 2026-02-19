/**
 * Avatar G Commerce - Server Utilities & Business Logic
 * All computations performed server-side only
 */

'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/env/server';
import {
  ComputeOrderSplit,
  ComputeProductMargin,
  CreateOrder,
} from './validation';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';

/**
 * Initialize Supabase client for server operations
 */
function getSupabaseClient() {
  const cookieStore = cookies();
  const env = getServerEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars are not configured');
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Partial<ResponseCookie> }>) {
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
// WALLET OPERATIONS
// ============================================

/**
 * Create shop wallet for user
 */
export async function createShopWallet(userId: string, currency: string = 'USD') {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('shop_wallets')
    .insert({
      user_id: userId,
      currency,
      balance_amount: 0,
    })
    .select()
    .single();

  if (error) {
    console.error('[createShopWallet] Error:', error);
    throw new Error(`Failed to create wallet: ${error.message}`);
  }

  return data;
}

/**
 * Get wallet by user ID
 */
export async function getWalletByUserId(userId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('shop_wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[getWalletByUserId] Error:', error);
    throw new Error(`Failed to fetch wallet: ${error.message}`);
  }

  return data || null;
}

/**
 * Deposit funds into wallet
 * CRITICAL: Triggers AML check if amount > $5000
 */
export async function depositToWallet(
  userId: string,
  amount: number,
  description: string = 'Deposit',
  metadata: Record<string, unknown> = {}
) {
  const supabase = getSupabaseClient();

  // Get wallet
  const wallet = await getWalletByUserId(userId);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // Check for AML flag (deposits > $5000)
  let amlRiskScore = wallet.aml_risk_score || 0;
  let amlFlaggedAt = wallet.aml_flagged_at;

  if (amount > 5000) {
    amlRiskScore = Math.min(100, amlRiskScore + 30);
    amlFlaggedAt = new Date().toISOString();
  }

  // Update wallet
  const newBalance = parseFloat(wallet.balance_amount) + amount;

  const { error: updateError } = await supabase
    .from('shop_wallets')
    .update({
      balance_amount: newBalance,
      lifetime_deposits: parseFloat(wallet.lifetime_deposits) + amount,
      aml_risk_score: amlRiskScore,
      aml_flagged_at: amlFlaggedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', wallet.id);

  if (updateError) {
    console.error('[depositToWallet] Update error:', updateError);
    throw new Error('Failed to update wallet');
  }

  // Record transaction
  const { data: transaction, error: txError } = await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: 'deposit',
      amount,
      balance_after: newBalance,
      description,
      metadata_json: {
        ...metadata,
        aml_risk_score: amlRiskScore,
        lifetime_deposits: parseFloat(wallet.lifetime_deposits) + amount,
      },
    })
    .select()
    .single();

  if (txError) {
    console.error('[depositToWallet] Transaction error:', txError);
    throw new Error('Failed to record transaction');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'deposit_created',
    resource_type: 'wallet',
    resource_id: wallet.id,
    description: `Deposit of $${amount}`,
    is_critical: amount > 5000,
    risk_flags: amount > 5000 ? ['aml'] : [],
    metadata_json: {
      amount,
      aml_flagged: amount > 5000,
    },
  });

  return {
    wallet: { ...wallet, balance_amount: newBalance },
    transaction,
  };
}

/**
 * Deduct from wallet (atomic operation)
 * CRITICAL: Uses server-side function for atomicity
 */
export async function deductFromWallet(
  userId: string,
  amount: number,
  type: string = 'ai_spend',
  description: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = getSupabaseClient();

  const wallet = await getWalletByUserId(userId);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  // Use RPC function for atomic operation
  const { data, error } = await supabase.rpc('deduct_from_wallet', {
    p_wallet_id: wallet.id,
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_metadata: metadata,
  });

  if (error) {
    console.error('[deductFromWallet] Error:', error);
    throw new Error(`Failed to deduct: ${error.message}`);
  }

  return data;
}

// ============================================
// ORDER SPLIT COMPUTATION (CORE BUSINESS LOGIC)
// ============================================

/**
 * Compute order split breakdown
 * Server-side only: Never expose to client
 */
export async function computeOrderSplit(input: ComputeOrderSplit) {
  const {
    grossAmount,
    vatRate = 18,
    platformFeePercent = 5,
    affiliateFeePercent = 5,
  } = input;

  // VAT is calculated on gross amount
  const vatAmount = (grossAmount * vatRate) / 100;

  // Subtotal is before VAT
  const subtotalAmount = grossAmount;

  // Platform fee (5% default)
  const platformFeeAmount = (grossAmount * platformFeePercent) / 100;

  // Affiliate fee (5% default, from platform fee)
  const affiliateFeeAmount = (grossAmount * affiliateFeePercent) / 100;

  // Net to seller
  const sellerNet = grossAmount - platformFeeAmount - affiliateFeeAmount;

  // Total including VAT
  const totalAmount = grossAmount + vatAmount;

  return {
    subtotalAmount: parseFloat(subtotalAmount.toFixed(2)),
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    vatRate,
    platformFeeAmount: parseFloat(platformFeeAmount.toFixed(2)),
    affiliateFeeAmount: parseFloat(affiliateFeeAmount.toFixed(2)),
    sellerNet: parseFloat(sellerNet.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2)),
  };
}

/**
 * Compute product margin after all fees
 */
export async function computeProductMargin(input: ComputeProductMargin) {
  const {
    retailPrice,
    costPrice,
    platformFeePercent = 5,
    affiliateFeePercent = 5,
    vatRate = 18,
  } = input;

  // Platform + affiliate fees
  const totalFeesPercent = platformFeePercent + affiliateFeePercent;
  const feesAmount = (retailPrice * totalFeesPercent) / 100;

  // VAT
  const vatAmount = (retailPrice * vatRate) / 100;

  // Net revenue to seller
  const sellerNet = retailPrice - feesAmount - costPrice;

  // Margin percentage
  const marginPercent = ((sellerNet / retailPrice) * 100).toFixed(2);

  return {
    retailPrice: parseFloat(retailPrice.toFixed(2)),
    costPrice: parseFloat(costPrice.toFixed(2)),
    platformFeeAmount: parseFloat(((retailPrice * platformFeePercent) / 100).toFixed(2)),
    affiliateFeeAmount: parseFloat(((retailPrice * affiliateFeePercent) / 100).toFixed(2)),
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    sellerNet: parseFloat(sellerNet.toFixed(2)),
    marginPercent: parseFloat(marginPercent),
    isPositiveMargin: sellerNet > 0,
  };
}

// ============================================
// ORDER OPERATIONS
// ============================================

/**
 * Create order (atomic)
 */
export async function createOrder(userId: string, orderData: Omit<CreateOrder, 'userId'>) {
  const supabase = getSupabaseClient();

  // Compute split if not provided
  const split = await computeOrderSplit({
    grossAmount: orderData.subtotalAmount,
    vatRate: orderData.vatRate || 18,
    platformFeePercent: 5,
    affiliateFeePercent: 5,
  });

  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      subtotal_amount: orderData.subtotalAmount,
      vat_amount: split.vatAmount,
      vat_rate: split.vatRate,
      vat_enabled: orderData.vatEnabled || false,
      platform_fee_amount: split.platformFeeAmount,
      affiliate_fee_amount: split.affiliateFeeAmount,
      total_amount: split.totalAmount,
      buyer_country_code: orderData.buyerCountryCode,
      buyer_email: orderData.buyerEmail,
      buyer_name: orderData.buyerName,
      stripe_payment_intent_id: orderData.stripePaymentIntentId,
      metadata_json: orderData.metadata || {},
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[createOrder] Error:', error);
    throw new Error(`Failed to create order: ${error.message}`);
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'order_created',
    resource_type: 'order',
    resource_id: data.id,
    description: `Order for $${split.totalAmount}`,
    metadata_json: split,
  });

  return data;
}

/**
 * Get order by ID (with authorization check)
 */
export async function getOrderById(userId: string, orderId: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Order not found');
    }
    console.error('[getOrderById] Error:', error);
    throw new Error(`Failed to fetch order: ${error.message}`);
  }

  return data;
}

/**
 * Get orders by user
 */
export async function getUserOrders(userId: string, limit = 50, offset = 0) {
  const supabase = getSupabaseClient();

  const { data, error, count } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[getUserOrders] Error:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }

  return { orders: data || [], total: count || 0 };
}

// ============================================
// AFFILIATE OPERATIONS
// ============================================

/**
 * Create affiliate account
 */
export async function createAffiliateAccount(userId: string) {
  const supabase = getSupabaseClient();

  // Generate unique referral code
  const referralCode = `aff_${userId.substring(0, 8)}_${Date.now().toString(36)}`;
  const sessionId = `sess_${userId}_${Date.now()}`;

  const { data, error } = await supabase
    .from('affiliate_tracking')
    .insert({
      user_id: userId,
      referral_code: referralCode,
      session_id: sessionId,
      status: 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('[createAffiliateAccount] Error:', error);
    throw new Error(`Failed to create affiliate account: ${error.message}`);
  }

  return data;
}

/**
 * Track affiliate click
 */
export async function trackAffiliateClick(
  affiliateId: string,
  referralCode: string,
  visitorIp?: string,
  visitorCountry?: string,
  referrerUrl?: string
) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('affiliate_clicks')
    .insert({
      affiliate_id: affiliateId,
      referral_code: referralCode,
      visitor_ip: visitorIp,
      visitor_country: visitorCountry,
      referrer_url: referrerUrl,
    })
    .select()
    .single();

  if (error) {
    console.error('[trackAffiliateClick] Error:', error);
    throw new Error(`Failed to track click: ${error.message}`);
  }

  return data;
}

/**
 * Record affiliate conversion
 */
export async function recordAffiliateConversion(
  affiliateId: string,
  orderId: string,
  conversionAmount: number,
  commissionRate: number = 5,
  referralCode: string
) {
  const supabase = getSupabaseClient();

  const commissionAmount = (conversionAmount * commissionRate) / 100;

  const { data, error } = await supabase
    .from('affiliate_conversions')
    .insert({
      affiliate_id: affiliateId,
      order_id: orderId,
      referral_code: referralCode,
      conversion_amount: conversionAmount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[recordAffiliateConversion] Error:', error);
    throw new Error(`Failed to record conversion: ${error.message}`);
  }

  // Update pending earnings
  await supabase
    .from('affiliate_tracking')
    .update({
      pending_earnings: supabase.rpc('add_value', {
        table_name: 'affiliate_tracking',
        column_name: 'pending_earnings',
        value: commissionAmount,
      }),
    })
    .eq('id', affiliateId);

  return data;
}

// ============================================
// COMPLIANCE OPERATIONS
// ============================================

/**
 * Create or update user consent record
 */
export async function updateUserConsent(
  userId: string,
  consents: {
    marketingEmails?: boolean;
    dataProcessing?: boolean;
    termsAccepted?: boolean;
    privacyPolicyAccepted?: boolean;
    georgianTermsAccepted?: boolean;
  }
) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('user_consents')
    .upsert(
      {
        user_id: userId,
        ...consents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[updateUserConsent] Error:', error);
    throw new Error(`Failed to update consent: ${error.message}`);
  }

  return data;
}

/**
 * Request data export (GDPR)
 */
export async function requestDataExport(userId: string, format: 'json' | 'csv' = 'json') {
  const supabase = getSupabaseClient();

  // Log request
  const exportId = `exp_${Date.now()}`;

  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'data_export_requested',
    resource_type: 'compliance',
    resource_id: null,
    description: `Data export requested in ${format} format`,
    is_critical: true,
    risk_flags: ['gdpr_request'],
    metadata_json: { format, export_id: exportId },
  });

  // In production, would trigger background job to prepare export
  // For now, return metadata
  return {
    exportId,
    status: 'pending',
    format,
    estimatedTime: '24 hours',
    message: 'Export request received. Check your email for download link within 24 hours.',
  };
}

/**
 * Delete account (GDPR right to be forgotten)
 * WARNING: Irreversible operation
 */
export async function deleteUserAccount(userId: string) {
  const supabase = getSupabaseClient();

  // Log deletion request
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action: 'account_deletion_requested',
    resource_type: 'account',
    resource_id: null,
    description: 'User requested account deletion',
    is_critical: true,
    risk_flags: ['gdpr_deletion'],
    metadata_json: {
      deletion_timestamp: new Date().toISOString(),
    },
  });

  // In production, would schedule deletion after grace period
  // For now, just mark in audit
  return {
    status: 'pending_deletion',
    graceperiodDays: 30,
    message: 'Your account will be deleted in 30 days. You can cancel this request anytime.',
  };
}

/**
 * Get user's audit logs
 */
export async function getUserAuditLogs(userId: string, limit = 100) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getUserAuditLogs] Error:', error);
    throw new Error(`Failed to fetch audit logs: ${error.message}`);
  }

  return data || [];
}
