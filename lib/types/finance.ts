export interface FinanceInvoiceRow {
  id: string;
  created_at: string;
  stripe_invoice_id?: string | null;
  amount_cents?: number | null;
  status?: string | null;
}

export interface FinancePaymentRow {
  id: string;
  created_at: string;
  description?: string | null;
  amount_cents?: number | null;
  status?: string | null;
}

export interface FinanceSummaryResponse {
  totals?: {
    totalPaid?: number;
    invoiceCount?: number;
    paymentCount?: number;
  };
  recentInvoices?: FinanceInvoiceRow[];
  recentPayments?: FinancePaymentRow[];
}
