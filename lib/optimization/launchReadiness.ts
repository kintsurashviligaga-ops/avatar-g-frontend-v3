import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// ========================================
// LAUNCH READINESS CHECKLIST
// ========================================

export interface LaunchReadinessItem {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  importance: 'critical' | 'high' | 'medium';
  action?: string;
  actionUrl?: string;
}

export interface LaunchReadiness {
  storeId: string;
  items: LaunchReadinessItem[];
  completedPercentage: number;
  isReadyToLaunch: boolean;
  blockingIssues: string[];
}

/**
 * Get launch readiness checklist
 */
export async function getLaunchReadinessChecklist(
  storeId: string,
  supabaseClient?: SupabaseClient
): Promise<LaunchReadiness | null> {
  const client = supabaseClient || createSupabaseServerClient();

  try {
    // Load store data
    const { data: store } = await client
      .from('shops')
      .select('*')
      .eq('id', storeId)
      .single();

    if (!store) {
      return null;
    }

    // Load checklist
    const { data: checklist } = await client
      .from('launch_readiness_checklist')
      .select('*')
      .eq('store_id', storeId)
      .single();

    const items: LaunchReadinessItem[] = [
      {
        key: 'tax_status',
        label: '✅ Tax Status Selected',
        description: 'Choose between VAT payer or Non-VAT payer mode',
        completed: checklist?.tax_status_selected || store.tax_status ? true : false,
        importance: 'critical',
        action: 'Select Tax Status',
        actionUrl: '/dashboard/shop/settings/tax',
      },
      {
        key: 'payout_account',
        label: '💳 Payout Account Added',
        description: 'Connect your bank account for payments',
        completed: checklist?.payout_account_added || store.payout_account_added ? true : false,
        importance: 'critical',
        action: 'Add Payout Account',
        actionUrl: '/dashboard/shop/settings/payout',
      },
      {
        key: 'invoice_test',
        label: '📄 Test Invoice Generated',
        description: 'Generate and verify a test invoice',
        completed: checklist?.invoice_test_generated || false,
        importance: 'high',
        action: 'Generate Test Invoice',
        actionUrl: '/dashboard/shop/invoices',
      },
      {
        key: 'payment_test',
        label: '💰 Test Payment Completed',
        description: 'Process a test transaction',
        completed: checklist?.payment_test_completed || false,
        importance: 'high',
        action: 'Process Test Payment',
        actionUrl: '/dashboard/shop/payments',
      },
      {
        key: 'products_added',
        label: '🛍️ Products Added',
        description: 'Add at least one product to your store',
        completed: store.product_count > 0 ? true : false,
        importance: 'critical',
        action: 'Add Products',
        actionUrl: '/dashboard/shop/products',
      },
      {
        key: 'brand_setup',
        label: '🎨 Brand Setup Complete',
        description: 'Configure store name, logo, and branding',
        completed: store.name && store.logo_url ? true : false,
        importance: 'high',
        action: 'Setup Branding',
        actionUrl: '/dashboard/shop/settings/branding',
      },
      {
        key: 'policies',
        label: '📋 Policies Defined',
        description: 'Set refund and return policies',
        completed: store.refund_policy ? true : false,
        importance: 'high',
        action: 'Add Policies',
        actionUrl: '/dashboard/shop/settings/policies',
      },
    ];

    const completed = items.filter((i) => i.completed).length;
    const completedPercentage = Math.round((completed / items.length) * 100);

    const blockingIssues = items
      .filter((i) => i.importance === 'critical' && !i.completed)
      .map((i) => i.label);

    return {
      storeId,
      items,
      completedPercentage,
      isReadyToLaunch: blockingIssues.length === 0 && completedPercentage >= 80,
      blockingIssues,
    };
  } catch (error) {
    console.error('Error getting launch readiness:', error);
    return null;
  }
}

/**
 * Mark checklist item as completed
 */
export async function completeChecklistItem(
  storeId: string,
  itemKey: string,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const client = supabaseClient || createSupabaseServerClient();

  const updateFields: Record<string, unknown> = {};
  updateFields[`${itemKey}_completed`] = true;

  // Map item keys to database fields
  const fieldMap: Record<string, string> = {
    tax_status: 'tax_status_selected',
    payout_account: 'payout_account_added',
    invoice_test: 'invoice_test_generated',
    payment_test: 'payment_test_completed',
  };

  const dbField = fieldMap[itemKey];
  if (!dbField) {
    return false;
  }

  try {
    const { error } = await client
      .from('launch_readiness_checklist')
      .update({ [dbField]: true })
      .eq('store_id', storeId);

    if (error) {
      console.error('Error updating checklist:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating checklist:', error);
    return false;
  }
}

/**
 * Initialize checklist for new store
 */
export async function initializeLaunchChecklist(
  storeId: string,
  supabaseClient?: SupabaseClient
): Promise<boolean> {
  const client = supabaseClient || createSupabaseServerClient();

  try {
    const { error } = await client
      .from('launch_readiness_checklist')
      .insert([{ store_id: storeId }]);

    if (error && error.code !== '23505') {
      console.error('Error initializing launch checklist:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error initializing launch checklist:', error);
    return false;
  }
}
