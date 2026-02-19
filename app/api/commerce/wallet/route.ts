/**
 * Avatar G - Wallet API Routes
 * POST /api/commerce/wallet/deposit
 * GET /api/commerce/wallet/balance
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import {
  depositToWallet,
  getWalletByUserId,
} from '@/lib/commerce';
import { getServerEnv } from '@/lib/env/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// ============================================
// GET /api/commerce/wallet/balance
// ============================================

export async function GET(_request: NextRequest) {
  try {
    // Get authenticated user
    const cookieStore = cookies();
    const supabase = createServerClient(
      getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
      getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      }, { status: 401 });
    }

    // Get wallet
    const wallet = await getWalletByUserId(user.id);

    if (!wallet) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Wallet not found. Please initialize wallet first.',
        },
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: wallet.id,
        balance: wallet.balance_amount,
        currency: wallet.currency,
        lifetimeDeposits: wallet.lifetime_deposits,
        amlRiskScore: wallet.aml_risk_score,
        updatedAt: wallet.updated_at,
      },
    });
  } catch (error) {
    console.error('[GET /api/commerce/wallet/balance] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch wallet balance',
        details: error instanceof Error ? error.message : undefined,
      },
    }, { status: 500 });
  }
}

// ============================================
// POST /api/commerce/wallet/deposit
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const cookieStore = cookies();
    const supabase = createServerClient(
      getServerEnv().NEXT_PUBLIC_SUPABASE_URL || '',
      getServerEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        },
      }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();

    // Note: We don't validate walletId in the schema - we'll use user's wallet
    const validated = {
      amount: body.amount,
      description: body.description,
      metadata: body.metadata,
    };

    // Validate
    if (!validated.amount || validated.amount <= 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Amount must be a positive number',
        },
      }, { status: 400 });
    }

    if (validated.amount > 1000000) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Amount exceeds maximum limit ($1,000,000)',
        },
      }, { status: 400 });
    }

    // Get wallet (auto-create if doesn't exist)
    let wallet = await getWalletByUserId(user.id);

    if (!wallet) {
      // Create wallet
      const { data, error } = await supabase
        .from('shop_wallets')
        .insert({
          user_id: user.id,
          currency: 'USD',
          balance_amount: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('[POST /api/commerce/wallet/deposit] Create wallet error:', error);
        return NextResponse.json({
          success: false,
          error: {
            code: 'WALLET_CREATE_FAILED',
            message: 'Failed to create wallet',
          },
        }, { status: 500 });
      }

      wallet = data;
    }

    // Deposit to wallet
    const depositResult = await depositToWallet(
      user.id,
      validated.amount,
      validated.description || 'Wallet deposit',
      {
        ...validated.metadata,
        source: 'web_api',
        timestamp: new Date().toISOString(),
      }
    );

    // In production: would integrate with Stripe to actually charge card
    // For now, we allow the deposit (Stripe integration in Phase 2)

    return NextResponse.json({
      success: true,
      data: {
        transaction: {
          id: depositResult.transaction.id,
          amount: depositResult.transaction.amount,
          balanceAfter: depositResult.transaction.balance_after,
          type: depositResult.transaction.type,
          createdAt: depositResult.transaction.created_at,
        },
        wallet: {
          id: depositResult.wallet.id,
          balance: depositResult.wallet.balance_amount,
          currency: depositResult.wallet.currency,
          amlFlagged: depositResult.wallet.aml_risk_score > 50,
        },
      },
    });
  } catch (error) {
    console.error('[POST /api/commerce/wallet/deposit] Error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process deposit',
        details: error instanceof Error ? error.message : undefined,
      },
    }, { status: 500 });
  }
}
