import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSignedPdfUrl } from '@/lib/invoice/pdf';

// ========================================
// GET /api/invoices/list
// ========================================
// List invoices for current user (buyer or store owner)

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);
    const offset = Number(searchParams.get('offset') || '0');
    const storeId = searchParams.get('storeId'); // Optional: filter by store
    const role = searchParams.get('role') || 'buyer'; // 'buyer' or 'seller'

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let query = supabase
      .from('invoices')
      .select('*', { count: 'exact' })
      .order('issued_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role === 'seller' && storeId) {
      // Seller: Must own the store
      query = query.eq('store_id', storeId);

      // Verify ownership
      const { data: store } = await supabase
        .from('shops')
        .select('id, owner_id')
        .eq('id', storeId)
        .single();

      if (!store || store.owner_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    } else {
      // Buyer: Can only see their own invoices
      query = query.eq('buyer_user_id', user.id);
    }

    const { data: invoices, error: invoicesError, count } = await query;

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError);
      return NextResponse.json(
        { error: 'Failed to fetch invoices' },
        { status: 500 }
      );
    }

    // Generate signed URLs for all invoices
    const invoicesWithUrls = await Promise.all(
      (invoices || []).map(async (invoice) => ({
        ...invoice,
        pdfUrl: await generateSignedPdfUrl(invoice.pdf_path, supabase),
      }))
    );

    return NextResponse.json(
      {
        invoices: invoicesWithUrls,
        total: count || 0,
        limit,
        offset,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/invoices/list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
