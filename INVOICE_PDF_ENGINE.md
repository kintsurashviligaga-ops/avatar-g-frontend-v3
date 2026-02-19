# Invoice PDF Engine - Technical Reference

## Overview

The Invoice PDF Engine generates professional, legally-compliant invoices for Georgian businesses with multi-language support, VAT calculation, and secure cloud storage.

---

## PDF Generation Architecture

### Library: pdfkit
- **Version**: 0.17.2
- **Authority**: Node.js PDF generation library
- **Deterministic**: Same input always produces identical PDF
- **Secure**: No embedded secrets or random data

### Design Principles
1. **Deterministic** - Reproducible byte-for-byte output
2. **Immutable** - Once generated, never modified
3. **Audit Trail** - Linked to database records
4. **Performance** - Sub-500ms generation

---

## PDF Template Structure

### Document Layout (A4 210mm × 297mm)

```
┌─────────────────────────────────────┐
│       INVOICE HEADER (Georgian)     │  0-80 points
│  ინვოისი
│  Invoice
├─────────────────────────────────────┤
│ Invoice #, Dates                    │  80-120 points
│ AG-000001 | გამოშ. თარიხი: 14/02/24│
├─────────────────────────────────────┤
│ Seller | Buyer (Two Columns)        │  120-250 points
│ გამცემი | მყიდველი
│ Name, Tax ID, Address               │
├─────────────────────────────────────┤
│ ITEMS TABLE                         │  250-450 points
│ სახელი | რაო-ბა | ფასი | ჯამი     │
│ Item descriptions & amounts         │
├─────────────────────────────────────┤
│ TOTALS SECTION (Right-aligned)      │  450-550 points
│ სუბტოტალი: ₾100.00
│ დღგ (18%): ₾18.00
│ ჯამი: ₾118.00
├─────────────────────────────────────┤
│ FOOTER                              │  550-600 points
│ Payment ref, notes, digital sig     │
└─────────────────────────────────────┘
```

### Font Handling
```javascript
// Built-in fonts (no external TTF required)
pdf.font('Helvetica');           // Default
pdf.font('Helvetica-Bold');      // Headers
pdf.font('Helvetica-Oblique');   // Emphasis
```

### Georgian Character Support
- ✅ Full UTF-8 support in text
- ✅ Georgian numerals preserved
- ✅ Currency symbols (₾ GEL, $ USD)
- ⚠️ Note: Ensure UTF-8 encoding throughout

---

## Invoice Data Model

### InvoicePdfData Interface

```typescript
interface InvoicePdfData {
  // Document info
  invoiceNumber: string;              // "AG-000001"
  issueDate: Date;
  dueDate: Date;
  currency: 'GEL' | 'USD';

  // Seller (issuer)
  sellerName: string;
  sellerTaxId: string;
  sellerAddress: string;              // Multi-line address
  sellerEmail: string;
  sellerPhone?: string;

  // Buyer (customer)
  buyerName: string;
  buyerTaxId?: string;
  buyerAddress?: string;
  buyerEmail?: string;

  // Line items
  items: Array<{
    title: string;
    quantity: number;
    unitPriceCents: number;            // Integer, 1/100 unit
    lineTotalCents: number;            // Computed/provided
    description?: string;
  }>;

  // Totals (pre-calculated)
  subtotalCents: number;
  vatRate: number;                     // 18.00
  vatCents: number;                    // 0 if non-VAT payer
  totalCents: number;                  // subtotal + vat

  // Optional
  stripeObjectId?: string;             // "pi_xxxxx"
  notes?: string;
  fxRateGelPerUsd?: number;
}
```

---

## Generated PDF Sections

### Section 1: Header (120 points)

```
┌─ Title ──────────────────────────────┐
│ ინვოისი  (24pt bold, centered)       │
│ Invoice (12pt regular, centered)     │
└──────────────────────────────────────┘
```

**Code:**
```typescript
pdf.fontSize(24).font('Helvetica-Bold').text('ინვოისი', { align: 'center' });
pdf.fontSize(12).font('Helvetica').text('Invoice', { align: 'center' });
```

### Section 2: Metadata (40 points)

```
ინვოისი #: AG-000001              გამოშ. თარიხი: 14 Feb 2024
დღე. თარიხი: 14 Mar 2024
```

**Code:**
```typescript
pdf.fontSize(10).text(`ინვოისი #: ${invoiceNumber}`, 50, yPos);
pdf.text(`გამოშ. თარიხი: ${issueDate.toLocaleDateString('ka-GE')}`, 300, yPos);
```

### Section 3: Parties (180 points, two columns)

**Left Column (Seller)**
```
გამცემი (Seller):
Avatar G LLC
დღგ ID: 123456789
მისამართი: Tbilisi, Georgia
ელ. ფოსტა: business@avatar-g.com
ტელ.: +995 32 123 4567
```

**Right Column (Buyer)**
```
მყიდველი (Buyer):
Customer Inc
დღგ ID: 987654321
მისამართი: Batumi, Georgia
ელ. ფოსტა: buyer@example.com
```

### Section 4: Items Table (200 points)

```
┌──────────────────────────────────────────────┐
│ სახელი  │  რაო-ბა  │  ფასი  │   ჯამი     │
│ Item    │   Qty    │ Price  │   Total    │
├──────────────────────────────────────────────┤
│ Product A   │    2     │ ₾50   │  ₾100    │
│ Service B   │    1     │ ₾100  │  ₾100    │
├──────────────────────────────────────────────┤
│ TOTAL                               ₾200.00 │
└──────────────────────────────────────────────┘
```

**Code:**
```typescript
pdf.text('სახელი (Item)', leftX + 5, tableTop + 5);
pdf.text('რაო-ბა (Qty)', leftX + colWidths.item + 5, tableTop + 5);
// ... draw table rows, lines
```

### Section 5: Totals (100 points, right-aligned)

```
თისადაც ჯამი:              ₾100.00
დღგ (18%):                 ₾18.00
════════════════════════════════════
ჯამი:                      ₾118.00

USD ეკვივალენტი: $43.70 (კურსი: 1 USD = 2.7 ₾)
```

**Conditional Logic:**
```typescript
// Always show subtotal
pdf.text('სუბტოტალი:', totalsX, totalsY);
pdf.text(formatPrice(subtotalCents, currency), totalsX + 150, totalsY);

// Only show VAT if > 0
if (vatRate > 0 && vatCents > 0) {
  pdf.text(`დღგ (${vatRate}%):`, totalsX, pdf.y);
  pdf.text(formatPrice(vatCents, currency), totalsX + 150, pdf.y);
}

// Show total (always)
pdf.fontSize(12).font('Helvetica-Bold');
pdf.text('ჯამი:', totalsX, pdf.y);
pdf.text(formatPrice(totalCents, currency), totalsX + 150, pdf.y);
```

### Section 6: Footer (50 points)

```
Payment Reference: pi_1Mm123456789ABC
Note: This is a sample invoice for testing
ეს დოკუმენტი დასტურდება დიჯიტალურად.
This document is digitally certified.
```

---

## PDF Generation Workflow

### Code Flow: `generateInvoicePdf(data)`

```
1. Create PDFDocument buffer
   ↓
2. Write header section
   ├─ Title
   ├─ Invoice metadata
   └─ Move down spacing
   ↓
3. Write seller/buyer info (two columns)
   ├─ Position calculations
   ├─ Text placement
   └─ Move down spacing
   ↓
4. Write items table
   ├─ Draw header row
   ├─ Loop through items
   │  ├─ Format: title, qty, price × qty
   │  ├─ Add line spacing
   │  └─ Increment Y position
   ├─ Draw table borders
   └─ Move down spacing
   ↓
5. Write totals section
   ├─ Subtotal
   ├─ VAT (conditional)
   ├─ Total (bold)
   ├─ USD equivalent (optional)
   └─ Move down spacing
   ↓
6. Write footer
   ├─ Payment reference (if present)
   ├─ Notes (if present)
   └─ Digital signature notice
   ↓
7. End document
   ↓
8. Return collected buffer chunks
```

---

## Storage Integration

### Supabase Storage Bucket

**Bucket Configuration:**
- **Name**: `invoices-private`
- **Visibility**: Private (auth required)
- **Path Pattern**: `{user_id}/{invoice_number}-{timestamp}.pdf`

**Permissions (RLS):**
```sql
-- Only users can read their own invoices
CREATE POLICY "users_read_own_invoices" ON storage.objects
  FOR SELECT USING (bucket_id = 'invoices-private' 
                    AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Upload Process

```typescript
await supabase.storage
  .from('invoices-private')
  .upload(`${userId}/${invoiceNumber}-${Date.now()}.pdf`, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true  // Overwrite if exists
  });
```

### Download: Signed URL

```typescript
const { data } = await supabase.storage
  .from('invoices-private')
  .createSignedUrl(`${userId}/${fileName}.pdf`, 604800);  // 7 days

return data.signedUrl;  // e.g., https://...?token=...
```

**URL Expiration:** 7 days (604800 seconds)

---

## Error Handling

### Common Errors & Solutions

#### ❌ "Cannot find pdfkit"
```
Error: Cannot find module 'pdfkit'
Solution: npm install pdfkit
Version: ^0.17.2
```

#### ❌ "Storage bucket not found"
```
Error: Bucket 'invoices-private' not found
Solution: Create bucket in Supabase → Storage → New Bucket
         Set to Private
         Enable JWT auth
```

#### ❌ "PDF upload failed"
```
Error: Bucket 'invoices-private' not found
Solution: Check bucket permissions, CORS settings
         Verify user authentication
```

#### ❌ "Georgian text shows as ??????"
```
Error: Mojibake characters in PDF
Solution: Ensure file saved as UTF-8
         Verify pdfkit version >= 0.17.0
         Check terminal displays UTF-8
```

#### ❌ "Rounding errors on totals"
```
Error: 100 GEL × 18% = 18.0000...
       Stored as 1800005 instead of 1800
Solution: Use banker's rounding
         Round to nearest even: Math.round()
         Test with known amounts
```

---

## Testing Checklist

### PDF Generation
- [ ] PDF generates without hanging (< 500ms)
- [ ] PDF file size reasonable (20-100 KB)
- [ ] Georgian text readable in PDF viewer
- [ ] Numbers formatted correctly (2 decimals)
- [ ] Currency symbols display (₾, $)
- [ ] Dates localized to Georgian

### Storage Upload
- [ ] File uploaded to correct bucket
- [ ] File path follows pattern: `{user_id}/{invoice_number}-{timestamp}.pdf`
- [ ] Signed URL generated successfully
- [ ] Signed URL contains token parameter
- [ ] Signed URL valid for 7 days
- [ ] After 7 days, signed URL expires (403)

### Database Integration
- [ ] Invoice record created in `invoices` table
- [ ] PDF URL stored in `invoices.pdf_url`
- [ ] Invoice items created in `invoice_items`
- [ ] Tax record created in `tax_accounting_records`
- [ ] Invoice number incremented atomically

### VAT Handling
- [ ] VAT payer: PDF shows "დღგ (18%): ₾18.00"
- [ ] Non-VAT payer: PDF shows "დღგ (18%): ₾0.00" or omits line
- [ ] VAT amount calculated correctly
- [ ] Total includes VAT

### Multi-Currency
- [ ] GEL currency shows as "₾"
- [ ] USD currency shows as "$"
- [ ] Decimal separator correct (. for en-US)
- [ ] FX rate displayed (if provided)
- [ ] USD equivalent calculation correct

---

## Performance Optimization

### Caching Strategy
```
Client browser: Signed URL cached ~7 days
Database: Invoice record permanent
Storage: PDF stored in tiered storage
```

### Batch PDF Generation
```typescript
// For bulk operations (rare)
const invoices = [...];
const pdfs = await Promise.all(
  invoices.map(inv => generateInvoicePdf(inv))
);
```

### Streaming Options (Future)
```typescript
// Instead of buffer return
pdf.pipe(res);  // Stream to HTTP response
// Better for large PDFs, doesn't buffer in memory
```

---

## Deployment Checklist

- [ ] pdfkit@^0.17.2 in package.json
- [ ] npm install executed
- [ ] Supabase storage bucket created (`invoices-private`)
- [ ] RLS policies configured on storage
- [ ] Test PDF generated locally
- [ ] Signed URL generation tested
- [ ] Error handling logs enabled
- [ ] Production environment tested

---

## File Locations

| File | Purpose |
|------|---------|
| `lib/invoices/pdfGenerator.ts` | PDF generation functions |
| `supabase/migrations/013_georgia_tax_invoicing.sql` | Database schema |
| `app/api/invoices/create/route.ts` | Invoice creation API |
| `app/[locale]/account/invoices/page.tsx` | Invoice UI pages |

---

## API Methods

### `generateInvoicePdf(data: InvoicePdfData): Buffer`

Generates PDF from invoice data.

**Args:**
- `data`: Complete invoice information

**Returns:**
- PDF as Buffer (byte array)

**Throws:**
- Error if pdfkit fails

### `uploadInvoicePdfToStorage(supabase, userId, invoiceNumber, pdfBuffer): Promise<string>`

Uploads PDF to Supabase storage.

**Args:**
- `supabase`: Supabase client
- `userId`: User UUID
- `invoiceNumber`: Invoice reference
- `pdfBuffer`: PDF bytes from generator

**Returns:**
- Signed URL (7-day expiry)

**Throws:**
- Error if storage upload fails

### `generateAndSaveInvoicePdf(supabase, userId, invoiceId, pdfData): Promise<string>`

Complete flow: generate → upload → save URL to DB.

**Args:**
- All required fields for both functions

**Returns:**
- Final signed URL for download

**Side Effects:**
- Updates `invoices.pdf_url` in database

---

End of Invoice PDF Engine Reference
