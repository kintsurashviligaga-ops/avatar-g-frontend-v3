/**
 * Invoice PDF Generator
 * Generates deterministic, secure PDFs for Georgian invoices
 * Uses pdfkit for reliable PDF generation
 *
 * Georgian invoice format (ka) with optional USD equivalent
 */

import PDFDocument from 'pdfkit';
import { SupabaseClient } from '@supabase/supabase-js';

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  currency: 'GEL' | 'USD';
  // Seller (issuer)
  sellerName: string;
  sellerTaxId: string;
  sellerAddress: string;
  sellerEmail: string;
  sellerPhone?: string;
  // Buyer
  buyerName: string;
  buyerTaxId?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  // Items
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    description?: string;
  }>;
  // Totals
  subtotalCents: number;
  vatRate: number;
  vatCents: number;
  totalCents: number;
  // Optional
  stripeObjectId?: string;
  notes?: string;
  fxRateGelPerUsd?: number;
}

/**
 * Format currency for display
 */
function formatPrice(cents: number, currency: 'GEL' | 'USD'): string {
  const amount = (cents / 100).toFixed(2);
  return currency === 'GEL' ? `₾${amount}` : `$${amount}`;
}

/**
 * Generate invoice PDF
 * Returns PDF buffer
 */
export function generateInvoicePdf(data: InvoicePdfData): Buffer {
  const buffers: Buffer[] = [];
  const pdf = new PDFDocument({
    bufferPages: true,
  });

  // Collect PDF data
  pdf.on('data', (chunk: Buffer) => buffers.push(chunk));

  // --- Header ---
  pdf.fontSize(24).font('Helvetica-Bold').text('ინვოისი', { align: 'center' });
  pdf.fontSize(12).font('Helvetica').text('Invoice', { align: 'center' });
  pdf.moveDown(0.5);

  // Invoice number and dates
  pdf.fontSize(10);
  pdf.text(`ინვოისი #: ${data.invoiceNumber}`, 50, pdf.y);
  pdf.text(`გამოშ. თარიხი: ${data.issueDate.toLocaleDateString('ka-GE')}`, 300, pdf.y - 15);
  pdf.text(`დღე. თარიხი: ${data.dueDate.toLocaleDateString('ka-GE')}`, 300, pdf.y);

  pdf.moveDown(1);

  // --- Seller and Buyer Info ---
  const leftX = 50;
  const rightX = 300;

  pdf.fontSize(11).font('Helvetica-Bold');
  pdf.text('გამცემი (Seller):', leftX, pdf.y);
  pdf.text('მყიდველი (Buyer):', rightX, pdf.y - 13);

  pdf.fontSize(9).font('Helvetica');
  const sellerY = pdf.y;
  pdf.text(data.sellerName, leftX, sellerY + 5);
  pdf.text(`დღგ ID: ${data.sellerTaxId}`, leftX, pdf.y);
  pdf.text(`მისამართი: ${data.sellerAddress}`, leftX, pdf.y);
  pdf.text(`ელ. ფოსტა: ${data.sellerEmail}`, leftX, pdf.y);
  if (data.sellerPhone) {
    pdf.text(`ტელ.: ${data.sellerPhone}`, leftX, pdf.y);
  }

  const buyerY = sellerY;
  pdf.text(data.buyerName, rightX, buyerY + 5);
  if (data.buyerTaxId) {
    pdf.text(`დღგ ID: ${data.buyerTaxId}`, rightX, pdf.y);
  }
  if (data.buyerAddress) {
    pdf.text(`მისამართი: ${data.buyerAddress}`, rightX, pdf.y);
  }
  if (data.buyerEmail) {
    pdf.text(`ელ. ფოსტა: ${data.buyerEmail}`, rightX, pdf.y);
  }

  pdf.moveDown(2);

  // --- Items Table ---
  pdf.fontSize(10).font('Helvetica-Bold');

  const tableTop = pdf.y;
  const colWidths = {
    item: 200,
    qty: 60,
    unitPrice: 80,
    total: 80,
  };

  // Headers
  pdf.rect(leftX, tableTop, 420, 20).stroke();
  pdf.text('სახელი (Item)', leftX + 5, tableTop + 5);
  pdf.text('რაო-ბა (Qty)', leftX + colWidths.item + 5, tableTop + 5);
  pdf.text('ფასი (Price)', leftX + colWidths.item + colWidths.qty + 5, tableTop + 5);
  pdf.text('ჯამი (Total)', leftX + colWidths.item + colWidths.qty + colWidths.unitPrice + 5, tableTop + 5);

  // Items
  let currentY = tableTop + 25;
  pdf.fontSize(9).font('Helvetica');

  for (const item of data.items) {
    pdf.text(item.title, leftX + 5, currentY);
    pdf.text(item.quantity.toString(), leftX + colWidths.item + 5, currentY);
    pdf.text(formatPrice(item.unitPriceCents, data.currency), leftX + colWidths.item + colWidths.qty + 5, currentY);
    pdf.text(formatPrice(item.lineTotalCents, data.currency), leftX + colWidths.item + colWidths.qty + colWidths.unitPrice + 5, currentY, {
      align: 'right',
      width: 70,
    });
    currentY += 20;
  }

  // Item table border
  pdf.rect(leftX, tableTop, 420, currentY - tableTop).stroke();

  pdf.moveDown(1);

  // --- Totals ---
  const totalsX = 300;
  const totalsY = pdf.y;

  pdf.fontSize(10).font('Helvetica');
  pdf.text('სუბტოტალი:', totalsX, totalsY);
  pdf.text(formatPrice(data.subtotalCents, data.currency), totalsX + 150, totalsY, { align: 'right', width: 100 });

  if (data.vatRate > 0 && data.vatCents > 0) {
    pdf.text(`დღგ (${data.vatRate}%):`, totalsX, pdf.y);
    pdf.text(formatPrice(data.vatCents, data.currency), totalsX + 150, pdf.y, { align: 'right', width: 100 });
  }

  pdf.fontSize(12).font('Helvetica-Bold');
  pdf.text('ჯამი:', totalsX, pdf.y);
  pdf.text(formatPrice(data.totalCents, data.currency), totalsX + 150, pdf.y, { align: 'right', width: 100 });

  // Optional USD equivalent
  if (data.currency === 'GEL' && data.fxRateGelPerUsd && data.fxRateGelPerUsd > 0) {
    const totalUsd = Math.ceil(data.totalCents / data.fxRateGelPerUsd);
    pdf.fontSize(9).font('Helvetica');
    pdf.moveDown(0.5);
    pdf.text(`USD ეკვივალენტი: ${formatPrice(totalUsd, 'USD')} (კურსი: 1 USD = ${data.fxRateGelPerUsd} ₾)`, totalsX, pdf.y);
  }

  // --- Footer ---
  pdf.moveDown(2);
  pdf.fontSize(8).font('Helvetica');

  if (data.stripeObjectId) {
    pdf.text(`Payment Reference: ${data.stripeObjectId}`, 50, pdf.y);
  }

  if (data.notes) {
    pdf.text(`შენიშვნা: ${data.notes}`, 50, pdf.y);
  }

  pdf.text('ეს დოკუმენტი დასტურდება დიჯიტალურად.', 50, pdf.y + 20);
  pdf.text('This document is digitally certified.', 50, pdf.y);

  // End PDF
  pdf.end();

  // Wait for PDF to be generated and return buffer
  return Buffer.concat(buffers);
}

/**
 * Upload invoice PDF to Supabase Storage
 * Returns signed URL for download
 */
export async function uploadInvoicePdfToStorage(
  supabase: SupabaseClient,
  userId: string,
  invoiceNumber: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const bucketName = 'invoices-private';
  const filePath = `${userId}/${invoiceNumber}-${Date.now()}.pdf`;

  // Upload to private bucket
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(filePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (uploadError) {
    throw new Error(`Failed to upload PDF: ${uploadError.message}`);
  }

  // Generate signed URL (valid for 7 days)
  const { data, error: signError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, 7 * 24 * 60 * 60);

  if (signError) {
    throw new Error(`Failed to generate signed URL: ${signError.message}`);
  }

  return data.signedUrl;
}

/**
 * Generate, upload, and save invoice PDF URL to database
 */
export async function generateAndSaveInvoicePdf(
  supabase: SupabaseClient,
  userId: string,
  invoiceId: string,
  pdfData: InvoicePdfData,
): Promise<string> {
  // Generate PDF
  const pdfBuffer = generateInvoicePdf(pdfData);

  // Upload to storage
  const pdfUrl = await uploadInvoicePdfToStorage(supabase, userId, pdfData.invoiceNumber, pdfBuffer);

  // Update invoice record with PDF URL
  const { error: updateError } = await supabase.from('invoices').update({ pdf_url: pdfUrl }).eq('id', invoiceId);

  if (updateError) {
    console.error('Failed to update invoice PDF URL:', updateError);
  }

  return pdfUrl;
}
