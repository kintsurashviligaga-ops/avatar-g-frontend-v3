import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  generateInvoiceNumber,
  createInvoiceSnapshot,
  validateInvoiceSnapshot,
  InvoiceGenerationInput,
} from '@/lib/invoice/generator';
import {
  generateInvoiceHtml,
  convertHtmlToPdf,
  storePdfToSupabase,
  generateSignedPdfUrl,
} from '@/lib/invoice/pdf';

// ========================================
// POST /api/invoices/generate
// ========================================
// Generate invoice for an order (called after payment success)

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json().catch(() => ({}));
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // 1. Load order with auth check
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. Check invoice doesn't already exist
    const { data: existingInvoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', orderId)
      .single();

    if (existingInvoice) {
      return NextResponse.json(
        { invoiceId: existingInvoice.id, message: 'Invoice already exists' },
        { status: 200 }
      );
    }

    // 3. Load store
    const { data: store, error: storeError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', order.store_id)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // 4. Load buyer
    const { data: buyer, error: buyerError } = await supabase
      .from('auth.users')
      .select('id, email, user_metadata')
      .eq('id', order.buyer_id)
      .single();

    if (buyerError || !buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 });
    }

    // 5. Load order items
    const { data: lineItems, error: itemsError } = await supabase
      .from('order_line_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError || !lineItems) {
      return NextResponse.json({ error: 'Order items not found' }, { status: 404 });
    }

    // 6. Generate invoice number
    const invoiceNumber = await generateInvoiceNumber(store.id, supabase);

    // 7. Create invoice snapshot
    const snapshotInput: InvoiceGenerationInput = {
      orderId,
      storeId: store.id,
      buyerId: order.buyer_id,
      buyerEmail: buyer.email || order.buyer_email,
      buyerName: buyer.user_metadata?.name || order.buyer_name || 'Customer',
      currency: order.currency || 'GEL',
      taxStatus: order.tax_status || 'non_vat_payer',
      vatRateBps: order.vat_rate_bps || 1800,
      vatAmountCents: order.vat_amount_cents || 0,
      subtotalCents: order.subtotal_cents || 0,
      totalCents: order.total_cents || 0,
      items: lineItems.map((item) => ({
        title: item.product_title || item.title,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
      })),
      storeName: store.name,
      storeEmail: store.contact_email || store.email,
      storeAddress: store.address,
      vatRegistrationNo: store.vat_registration_no,
    };

    const snapshot = createInvoiceSnapshot(snapshotInput, invoiceNumber);

    // 8. Validate snapshot
    if (!validateInvoiceSnapshot(snapshot)) {
      return NextResponse.json(
        { error: 'Invoice snapshot validation failed' },
        { status: 400 }
      );
    }

    // 9. Generate HTML
    const html = generateInvoiceHtml(snapshot);

    // 10. Convert to PDF
    const pdfBuffer = await convertHtmlToPdf(html);

    // 11. Store PDF to Supabase
    const pdfPath = await storePdfToSupabase(snapshot.invoiceId, pdfBuffer, supabase);

    if (!pdfPath) {
      return NextResponse.json(
        { error: 'Failed to store PDF' },
        { status: 500 }
      );
    }

    // 12. Save invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([
        {
          id: snapshot.invoiceId,
          order_id: orderId,
          store_id: store.id,
          buyer_user_id: order.buyer_id,
          invoice_number: invoiceNumber,
          tax_status: snapshot.taxStatus,
          vat_rate_bps: snapshot.vatRateBps,
          vat_amount_cents: snapshot.vatAmountCents,
          subtotal_cents: snapshot.subtotalCents,
          total_cents: snapshot.totalCents,
          currency: snapshot.currency,
          pdf_path: pdfPath,
          pdf_size_bytes: pdfBuffer.length,
          snapshot_json: snapshot,
          issued_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error('Error saving invoice:', invoiceError);
      return NextResponse.json(
        { error: 'Failed to save invoice' },
        { status: 500 }
      );
    }

    // 13. Generate signed URL
    const signedUrl = await generateSignedPdfUrl(pdfPath, supabase);

    // 14. Log audit event
    await supabase
      .from('audit_logs')
      .insert([
        {
          event_type: 'invoice',
          resource_type: 'invoice',
          resource_id: invoice.id,
          action: 'generated',
          store_id: store.id,
          user_id: store.owner_id,
        },
      ])
      .catch((err) => console.error('Error logging audit:', err));

    return NextResponse.json(
      {
        invoiceId: invoice.id,
        invoiceNumber,
        pdfUrl: signedUrl,
        invoiceData: invoice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/invoices/generate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
