/**
 * GET /api/finance/me/summary
 * Authenticated user: Personal subscription and billing summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type InvoiceRow = {
  status: string;
  amount_cents: number | null;
};

type PaymentRow = {
  status: string;
  amount_cents: number | null;
};

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user subscription
    const { data: subs, error: subsError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (subsError && subsError.code !== 'PGRST116') {
      throw subsError;
    }

    // Get recent invoices
    const { data: invoices, error: invError } = await supabase
      .from('stripe_invoices')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (invError) {
      throw invError;
    }

    // Get one-time payments
    const { data: payments, error: payError } = await supabase
      .from('stripe_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (payError) {
      throw payError;
    }

    // Calculate totals
    const typedInvoices = (invoices || []) as InvoiceRow[];
    const typedPayments = (payments || []) as PaymentRow[];

    const totalPaidInvoices = typedInvoices
      .filter((invoice) => invoice.status === 'paid')
      .reduce((sum: number, invoice) => sum + (invoice.amount_cents || 0), 0);

    const totalPaidPayments = typedPayments
      .filter((payment) => payment.status === 'succeeded')
      .reduce((sum: number, payment) => sum + (payment.amount_cents || 0), 0);

    return NextResponse.json({
      subscription: subs || null,
      recentInvoices: invoices || [],
      recentPayments: payments || [],
      totals: {
        totalPaid: totalPaidInvoices + totalPaidPayments,
        invoiceCount: invoices?.length || 0,
        paymentCount: payments?.length || 0,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/me/summary]', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}
