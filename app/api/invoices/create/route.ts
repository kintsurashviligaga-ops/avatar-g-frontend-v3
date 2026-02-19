/**
 * POST /api/invoices/create
 * Create a new invoice with PDF generation
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  calculateTax,
  getBusinessProfile,
  recordTaxAccounting,
} from '@/lib/tax/georgia';
import { generateAndSaveInvoicePdf } from '@/lib/invoices/pdfGenerator';

interface CreateInvoiceRequest {
  buyerName: string;
  buyerTaxId?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  currency: 'GEL' | 'USD';
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
    description?: string;
  }>;
  notes?: string;
  stripeObjectId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body: CreateInvoiceRequest = await req.json();

    const { buyerName, buyerTaxId, buyerAddress, buyerEmail, currency, items, notes, stripeObjectId } =
      body;

    // Validate required fields
    if (!buyerName || !currency || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: buyerName, currency, items' },
        { status: 400 },
      );
    }

    // Get user business profile
    const profile = await getBusinessProfile(supabase, user.id);

    if (!profile) {
      return NextResponse.json(
        {
          error: 'Business profile not found. Please complete your business profile first.',
        },
        { status: 400 },
      );
    }

    // Calculate subtotal
    let _subtotalCents = 0;
    const invoiceItems: Array<{
      title: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
      description?: string;
    }> = [];

    for (const item of items) {
      const lineTotalCents = Math.round(item.unitPriceCents * item.quantity);
      _subtotalCents += lineTotalCents;
      invoiceItems.push({
        title: item.title,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents,
        description: item.description,
      });
    }

    // Calculate tax
    const taxCalc = calculateTax({
      isVatPayer: profile.isVatPayer,
      vatRate: profile.vatRate,
      lineItems: items,
      currency,
    });

    // Generate invoice number (atomically increment from profile)
    const { data: updatedProfile, error: updateError } = await supabase
      .from('business_profiles')
      .update({ next_invoice_number: profile.nextInvoiceNumber + 1 })
      .eq('user_id', user.id)
      .select('next_invoice_number')
      .single();

    if (updateError || !updatedProfile) {
      return NextResponse.json(
        { error: 'Failed to generate invoice number' },
        { status: 500 },
      );
    }

    const invoiceNumber = `${profile.invoicePrefix}-${String(profile.nextInvoiceNumber).padStart(6, '0')}`;

    // Create invoice record
    const invoiceId = uuidv4();
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms

    const { error: invoiceError, data: invoiceData } = await supabase
      .from('invoices')
      .insert([
        {
          id: invoiceId,
          user_id: user.id,
          buyer_name: buyerName,
          buyer_tax_id: buyerTaxId || null,
          buyer_address: buyerAddress || null,
          buyer_email: buyerEmail || null,
          invoice_number: invoiceNumber,
          currency,
          fx_rate_gel_per_usd: profile.fxRateGelPerUsd,
          subtotal_cents: taxCalc.subtotalCents,
          vat_rate: taxCalc.vatRatePct,
          vat_cents: taxCalc.vatCents,
          total_cents: taxCalc.totalCents,
          status: 'issued',
          stripe_object_id: stripeObjectId || null,
          notes: notes || null,
          created_at: now.toISOString(),
        },
      ])
      .select()
      .single();

    if (invoiceError || !invoiceData) {
      return NextResponse.json(
        { error: 'Failed to create invoice' },
        { status: 500 },
      );
    }

    // Insert invoice items
    const itemsForDb = invoiceItems.map((item) => ({
      invoice_id: invoiceId,
      title: item.title,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      description: item.description || null,
    }));

    const { error: itemsError } = await supabase.from('invoice_items').insert(itemsForDb);

    if (itemsError) {
      console.error('Failed to insert invoice items:', itemsError);
    }

    // Record tax accounting entry
    try {
      await recordTaxAccounting(supabase, user.id, {
        invoiceId,
        recordType: 'invoice',
        incomeGrossCents: taxCalc.incomeGrosseCents,
        vatCollectedCents: taxCalc.vatCollectedCents,
        vatRate: taxCalc.vatRatePct,
        netIncomeCents: taxCalc.netIncomeCents,
        currency,
        notes: `Invoice ${invoiceNumber}`,
      });
    } catch (taxError) {
      console.error('Failed to record tax accounting:', taxError);
    }

    // Generate and upload PDF
    let pdfUrl: string | null = null;
    try {
      pdfUrl = await generateAndSaveInvoicePdf(
        supabase,
        user.id,
        invoiceId,
        {
          invoiceNumber,
          issueDate: now,
          dueDate,
          currency,
          sellerName: profile.legalName || 'Avatar G',
          sellerTaxId: profile.taxId || '',
          sellerAddress: profile.address || '',
          sellerEmail: profile.email || '',
          buyerName,
          buyerTaxId,
          buyerAddress,
          buyerEmail,
          items: invoiceItems,
          subtotalCents: taxCalc.subtotalCents,
          vatRate: taxCalc.vatRatePct,
          vatCents: taxCalc.vatCents,
          totalCents: taxCalc.totalCents,
          stripeObjectId,
          notes,
          fxRateGelPerUsd: profile.fxRateGelPerUsd,
        },
      );
    } catch (pdfError) {
      console.error('Failed to generate PDF:', pdfError);
    }

    // Return invoice details
    return NextResponse.json(
      {
        id: invoiceId,
        invoiceNumber,
        status: 'issued',
        totalCents: taxCalc.totalCents,
        currency,
        pdfUrl,
        createdAt: now.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create invoice',
      },
      { status: 500 },
    );
  }
}
