/**
 * Avatar G - Compliance API Routes
 * GET/PUT /api/commerce/compliance/consent
 * POST /api/commerce/compliance/export-data
 * POST /api/commerce/compliance/delete-account
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  updateUserConsent,
  requestDataExport,
  deleteUserAccount,
  getUserAuditLogs,
} from '@/lib/commerce';
import { getServerEnv } from '@/lib/env/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Helper: Get authenticated user
async function getAuthUser(request: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
    getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error, supabase };
}

// ============================================
// GET /api/commerce/compliance/consent
// Get user's consent status
// ============================================

export async function GET_CONSENT(request: NextRequest) {
  try {
    const { user, error, supabase } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    // Get consents from database using authenticated client
    const { data: consent, error: fetchError } = await supabase
      .from('user_consents')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    return NextResponse.json({
      success: true,
      data: consent || {
        userId: user.id,
        marketingEmails: false,
        dataProcessing: false,
        termsAccepted: false,
        privacyPolicyAccepted: false,
        georgianTermsAccepted: false,
      },
    });
  } catch (error) {
    console.error('[GET /api/commerce/compliance/consent] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch consent',
      },
    }, { status: 500 });
  }
}

// ============================================
// PUT /api/commerce/compliance/consent
// Update user's consent status
// ============================================

export async function PUT_CONSENT(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const body = await request.json();

    const consent = await updateUserConsent(user.id, {
      marketingEmails: body.marketingEmails,
      dataProcessing: body.dataProcessing,
      termsAccepted: body.termsAccepted,
      privacyPolicyAccepted: body.privacyPolicyAccepted,
      georgianTermsAccepted: body.georgianTermsAccepted,
    });

    return NextResponse.json({
      success: true,
      data: consent,
    });
  } catch (error) {
    console.error('[PUT /api/commerce/compliance/consent] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update consent',
      },
    }, { status: 500 });
  }
}

// ============================================
// POST /api/commerce/compliance/export-data
// Request GDPR data export
// ============================================

export async function POST_EXPORT(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const body = await request.json();
    const format = body.format || 'json';

    if (!['json', 'csv'].includes(format)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_FORMAT',
          message: 'Format must be json or csv',
        },
      }, { status: 400 });
    }

    const result = await requestDataExport(user.id, format);

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 202 }); // 202 Accepted
  } catch (error) {
    console.error('[POST /api/commerce/compliance/export-data] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to request data export',
      },
    }, { status: 500 });
  }
}

// ============================================
// POST /api/commerce/compliance/delete-account
// Request account deletion (30-day grace period)
// ============================================

export async function POST_DELETE(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const body = await request.json();

    // Require explicit confirmation
    if (!body.confirmDelete) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_CONFIRMED',
          message: 'Account deletion must be explicitly confirmed',
        },
      }, { status: 400 });
    }

    const result = await deleteUserAccount(user.id);

    return NextResponse.json({
      success: true,
      data: result,
    }, { status: 202 }); // 202 Accepted
  } catch (error) {
    console.error('[POST /api/commerce/compliance/delete-account] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to request account deletion',
      },
    }, { status: 500 });
  }
}

// ============================================
// GET /api/commerce/compliance/audit-logs
// Get user's audit logs
// ============================================

export async function GET_AUDIT_LOGS(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser(request);

    if (error || !user) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    const logs = await getUserAuditLogs(user.id, limit);

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((log: any) => ({
          id: log.id,
          action: log.action,
          resourceType: log.resource_type,
          description: log.description,
          isCritical: log.is_critical,
          riskFlags: log.risk_flags,
          createdAt: log.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('[GET /api/commerce/compliance/audit-logs] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch audit logs',
      },
    }, { status: 500 });
  }
}
