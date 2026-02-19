import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateSignedPdfUrl } from '@/lib/invoice/pdf';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ========================================
// GET /api/invoices?orderId=...
// ========================================
// Get invoice by order ID

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const orderId = searchParams?.get?.('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Load invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Generate signed URL
    const signedUrl = await generateSignedPdfUrl(invoice.pdf_path, supabase);

    return NextResponse.json(
      {
        invoice,
        pdfUrl: signedUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET /api/invoices error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
