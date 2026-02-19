'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Download, Eye, FileText } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Invoice {
  id: string;
  invoice_number: string;
  buyer_name: string;
  total_cents: number;
  currency: string;
  status: 'issued' | 'paid' | 'void';
  created_at: string;
  paid_at?: string;
  pdf_url?: string;
}

export default function InvoicesPage() {
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'paid' | 'void'>('all');

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const query = new URLSearchParams({
          limit: '50',
          offset: '0',
          ...(statusFilter !== 'all' && { status: statusFilter }),
        });

        const response = await fetch(`/api/invoices/list?${query}`);
        if (response.ok) {
          const data = await response.json();
          setInvoices(data.invoices || []);
        }
      } catch (error) {
        toast.error(t('common.error'));
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [statusFilter, t]);

  const formatPrice = (cents: number, currency: string) => {
    const amount = (cents / 100).toFixed(2);
    return currency === 'GEL' ? `₾${amount}` : `$${amount}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ka-GE');
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      issued: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      void: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{t('invoices.title')}</h1>
            <p className="text-gray-600 mt-2">{t('invoices.description')}</p>
          </div>
          <Link
            href="/account/invoices/create"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
          >
            <FileText size={18} />
            {t('invoices.create_new')}
          </Link>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'issued', 'paid', 'void'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`invoices.filter_${status}`)}
            </button>
          ))}
        </div>

        {/* Invoices Table */}
        {invoices.length > 0 ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('invoices.invoice_number')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('invoices.buyer')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('invoices.amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('invoices.date')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('invoices.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {invoice.buyer_name}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatPrice(invoice.total_cents, invoice.currency)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(invoice.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                            invoice.status,
                          )}`}
                        >
                          {t(`invoices.status_${invoice.status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/account/invoices/${invoice.id}`}
                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <Eye size={16} />
                            {t('common.view')}
                          </Link>
                          {invoice.pdf_url && (
                            <a
                              href={invoice.pdf_url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 inline-flex items-center gap-1"
                            >
                              <Download size={16} />
                              {t('common.download')}
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <FileText size={40} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">{t('invoices.no_invoices')}</p>
            <Link
              href="/account/invoices/create"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {t('invoices.create_first_invoice')}
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
