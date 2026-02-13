'use server';

/**
 * Tax Status Management Server Actions
 * Handle database updates for store tax status
 */

import { createSupabaseServerClient } from '@/lib/auth/server';
import { StoreTaxProfile, validateTaxStatusConsistency } from '@/lib/finance/taxProfile';

interface UpdateTaxStatusInput {
  store_id: string;
  tax_status: 'vat_payer' | 'non_vat_payer';
  vat_registration_no?: string | null;
  legal_entity_type?: 'individual' | 'llc' | null;
}

/**
 * Update store tax status
 * Validates consistency and updates database
 */
export async function updateStoreTaxStatus(
  input: UpdateTaxStatusInput
): Promise<{ success: boolean; error?: string; data?: StoreTaxProfile }> {
  try {
    // Create Supabase client
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Verify store ownership
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, user_id, tax_status, vat_enabled')
      .eq('id', input.store_id)
      .single();

    if (storeError || !store) {
      return { success: false, error: 'Store not found' };
    }

    if (store.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Build update payload
    const updatePayload = {
      tax_status: input.tax_status,
      vat_enabled: input.tax_status === 'vat_payer',
      vat_registration_no: input.vat_registration_no || null,
      legal_entity_type: input.legal_entity_type || null,
      updated_at: new Date().toISOString(),
    };

    // Validate consistency
    const profile: StoreTaxProfile = {
      store_id: input.store_id,
      tax_status: input.tax_status,
      vat_enabled: input.tax_status === 'vat_payer',
      vat_rate_bps: 1800, // Default Georgian rate
      vat_registration_no: input.vat_registration_no || null,
      prices_include_vat: true,
      tax_residency_country: 'GE',
      legal_entity_type: input.legal_entity_type || null,
    };

    const validation = validateTaxStatusConsistency(profile);
    if (!validation.valid) {
      return { success: false, error: `Validation error: ${validation.errors.join(', ')}` };
    }

    // Update database
    const { error: updateError } = await supabase
      .from('stores')
      .update(updatePayload)
      .eq('id', input.store_id);

    if (updateError) {
      return { success: false, error: `Database error: ${updateError.message}` };
    }

    return {
      success: true,
      data: profile,
    };
  } catch (error) {
    console.error('Error updating tax status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get store tax profile
 */
export async function getStoreTaxProfile(storeId: string): Promise<{
  success: boolean;
  error?: string;
  data?: StoreTaxProfile;
}> {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get store
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select(
        'id, user_id, tax_status, vat_enabled, vat_rate_bps, vat_registration_no, prices_include_vat, tax_residency_country, legal_entity_type'
      )
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return { success: false, error: 'Store not found' };
    }

    if (store.user_id !== user.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const profile: StoreTaxProfile = {
      store_id: store.id,
      tax_status: store.tax_status || 'non_vat_payer',
      vat_enabled: store.vat_enabled || false,
      vat_rate_bps: store.vat_rate_bps || 1800,
      vat_registration_no: store.vat_registration_no || null,
      prices_include_vat: store.prices_include_vat !== false,
      tax_residency_country: store.tax_residency_country || 'GE',
      legal_entity_type: store.legal_entity_type || null,
    };

    return { success: true, data: profile };
  } catch (error) {
    console.error('Error getting tax profile:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
