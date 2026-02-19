import { InvoiceSnapshot, formatPrice } from './generator';
import type { SupabaseClient } from '@supabase/supabase-js';

// ========================================
// PDF INVOICE GENERATION
// ========================================

/**
 * Generate invoice HTML (can be converted to PDF server-side)
 * This is the core invoice layout - in production, use a proper PDF library
 */
export function generateInvoiceHtml(snapshot: InvoiceSnapshot): string {
  const rowsHtml = snapshot.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #e0e0e0;">${item.title}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatPrice(item.unitPriceCents, snapshot.currency)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: bold;">${formatPrice(item.lineTotalCents, snapshot.currency)}</td>
    </tr>
  `
    )
    .join('');

  const issueDate = new Date(snapshot.issuedAt);
  const issueDateStr = issueDate.toLocaleDateString('ka-GE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const vatLabel =
    snapshot.taxStatus === 'vat_payer'
      ? `დღგ (${(snapshot.vatRateBps / 100).toFixed(1)}%)`
      : 'არ არის დღგ გადამხდელი';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ინვოისი ${snapshot.invoiceNumber}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: #333;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 20px;
    }
    .company-info h1 {
      margin: 0;
      font-size: 24px;
      color: #000;
    }
    .company-info p {
      margin: 4px 0;
      color: #666;
      font-size: 14px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-meta h2 {
      margin: 0;
      font-size: 36px;
      color: #e74c3c;
      font-weight: bold;
    }
    .invoice-meta p {
      margin: 4px 0;
      color: #666;
      font-size: 14px;
    }
    .addresses {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }
    .address-section {
      flex: 1;
    }
    .address-section h3 {
      font-size: 12px;
      color: #999;
      margin: 0 0 8px 0;
      text-transform: uppercase;
      font-weight: 600;
    }
    .address-section p {
      margin: 4px 0;
      font-size: 14px;
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background: #f9f9f9;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #333;
      border-bottom: 2px solid #e0e0e0;
    }
    .totals {
      margin-bottom: 40px;
    }
    .total-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .total-row-label {
      width: 200px;
      text-align: right;
      padding-right: 20px;
      color: #666;
    }
    .total-row-value {
      width: 120px;
      text-align: right;
      font-weight: 600;
    }
    .final-total {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
      font-size: 18px;
    }
    .final-total .total-row-label {
      color: #000;
      font-weight: bold;
    }
    .final-total .total-row-value {
      font-size: 20px;
      color: #e74c3c;
    }
    .vat-status {
      background: #f0f8ff;
      border-left: 4px solid #2196F3;
      padding: 12px;
      margin: 20px 0;
      font-size: 13px;
      color: #1976D2;
    }
    .vat-status.non-vat {
      background: #e8f5e9;
      border-left-color: #4caf50;
      color: #2e7d32;
    }
    .footer {
      border-top: 1px solid #e0e0e0;
      padding-top: 20px;
      margin-top: 40px;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <!-- Avatar G Logo -->
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4.5 16.5c-1.5 1.25-2 5-2 5s3.75-.5 5-2c.625-.625 1-1.5 1-2.5v-2.5l-4 4z"></path>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
            </svg>
          </div>
          <div>
            <h1 style="font-size: 24px; margin: 0; font-weight: 700;">Avatar G</h1>
            <p style="margin: 0; font-size: 12px; color: #666;">AI კომერციის პლატფორმა</p>
          </div>
        </div>
        <h2 style="font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">${snapshot.storeName}</h2>
        <p>${snapshot.storeEmail}</p>
        ${snapshot.storeAddress ? `<p>${snapshot.storeAddress}</p>` : ''}
        ${snapshot.storeVatRegNo ? `<p><strong>დღგ რეგ. №:</strong> ${snapshot.storeVatRegNo}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <h2>#${snapshot.invoiceNumber}</h2>
        <p><strong>ინვოისის თარიღი:</strong> ${issueDateStr}</p>
        <p><strong>შეკვეთის ID:</strong> ${snapshot.orderId.substring(0, 8)}</p>
      </div>
    </div>

    <!-- Addresses -->
    <div class="addresses">
      <div class="address-section">
        <h3>მიმღები</h3>
        <p><strong>${snapshot.buyerName}</strong></p>
        <p>${snapshot.buyerEmail}</p>
      </div>
      <div class="address-section">
        <h3>გამომგზავნი</h3>
        <p><strong>${snapshot.storeName}</strong></p>
        <p>${snapshot.storeEmail}</p>
      </div>
    </div>

    <!-- Items Table -->
    <table>
      <thead>
        <tr>
          <th>აღწერა</th>
          <th style="text-align: center; width: 80px;">რაოდენობა</th>
          <th style="text-align: right; width: 100px;">ერთეულის ფასი</th>
          <th style="text-align: right; width: 100px;">თანხა</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals">
      <div class="total-row">
        <div class="total-row-label">შუალედური ჯამი</div>
        <div class="total-row-value">${formatPrice(snapshot.subtotalCents, snapshot.currency)}</div>
      </div>
      <div class="total-row">
        <div class="total-row-label">${vatLabel}</div>
        <div class="total-row-value">${formatPrice(snapshot.vatAmountCents, snapshot.currency)}</div>
      </div>
      <div class="final-total">
        <div class="total-row-label">სულ</div>
        <div class="total-row-value">${formatPrice(snapshot.totalCents, snapshot.currency)}</div>
      </div>
    </div>

    <!-- Tax Status -->
    <div class="vat-status ${snapshot.taxStatus === 'non_vat_payer' ? 'non-vat' : ''}">
      <strong>საგადასახადო სტატუსი:</strong>
      ${snapshot.taxStatus === 'vat_payer'
        ? `დღგ გადამხდელი - დღგ შედის ჯამში (${(snapshot.vatRateBps / 100).toFixed(1)}%)`
        : 'არ არის დღგ გადამხდელი - დღგ არ არის გათვალისწინებული'}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>ეს ინვოისი გენერირებულია ავტომატურად. ხელმოწერა არ არის საჭირო.</p>
      <p>გენერაციის თარიღი: ${new Date().toLocaleDateString('ka-GE')} | Avatar G</p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Convert HTML to PDF (requires external service or library)
 * For production, use Puppeteer, wkhtmltopdf, or a service like Vercel /pdf-generator
 * For now, returning a placeholder that can be implemented
 */
export async function convertHtmlToPdf(html: string): Promise<Buffer> {
  // In production, use one of:
  // 1. Puppeteer (requires Chrome/Chromium)
  // 2. pdfkit (simple Node PDF generation)
  // 3. External service (e.g., Vercel's /pdf-generator)
  // 4. wkhtmltopdf (system binary)

  // For development, we'll create a simple wrapper
  // This is a placeholder - in production, implement one of the above

  try {
    // Try dynamic import of pdfkit if available
    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
    });

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve());
      doc.on('error', reject);

      // Write HTML-inspired content to PDF
      doc.fontSize(20).text('ინვოისი გენერირებულია', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text('HTML-დან PDF-ში კონვერტაციისთვის საჭიროა PDF ბიბლიოთეკა.');
      doc.text(`HTML სიგრძე: ${html.length} სიმბოლო`);
      doc.end();
    });

    return Buffer.concat(chunks);
  } catch {
    // Fallback: return HTML as string in buffer (for testing)
    console.warn('PDF library not available, returning HTML buffer');
    return Buffer.from(html, 'utf-8');
  }
}

/**
 * Store PDF to Supabase Storage
 */
export async function storePdfToSupabase(
  invoiceId: string,
  pdfBuffer: Buffer,
  supabaseClient: SupabaseClient
): Promise<string | null> {
  try {
    const fileName = `invoice-${invoiceId}.pdf`;
    const path = `invoices/${fileName}`;

    const { error } = await supabaseClient.storage
      .from('private-invoices')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error('Error storing PDF:', error);
      return null;
    }

    return path;
  } catch (error) {
    console.error('Error storing PDF to Supabase:', error);
    return null;
  }
}

/**
 * Generate signed URL for PDF download
 */
export async function generateSignedPdfUrl(
  pdfPath: string,
  supabaseClient: SupabaseClient,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  try {
    const { data, error } = await supabaseClient.storage
      .from('private-invoices')
      .createSignedUrl(pdfPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.error('Error generating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }
}
