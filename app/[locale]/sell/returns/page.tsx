'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, CheckCircle, XCircle, Clock, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ReturnRequest {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  comments?: string;
  refund_amount_cents?: number;
  created_at: string;
  orders?: {
    order_number: string;
    total_amount: number;
  };
}

const STATUS_FILTERS = ['all', 'requested', 'approved', 'in_transit', 'received', 'rejected'];

export default function SellerReturnsPage() {
  const t = useTranslations();
  const _router = useRouter();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchReturns();
  }, []);

  useEffect(() => {
    if (statusFilter === 'all') {
      setFilteredReturns(returns);
    } else {
      setFilteredReturns(returns.filter((r) => r.status === statusFilter));
    }
  }, [statusFilter, returns]);

  const fetchReturns = async () => {
    try {
      const response = await fetch('/api/returns?view=seller');
      const data = await response.json();
      setReturns(data.returns || []);
      setFilteredReturns(data.returns || []);
    } catch (error) {
      console.error('Error fetching returns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (returnId: string, action: string, refundAmount?: number) => {
    try {
      const response = await fetch(`/api/returns/${returnId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, refundAmount }),
      });

      if (response.ok) {
        fetchReturns();
      }
    } catch (error) {
      console.error('Error updating return:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'requested':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'in_transit':
        return <Truck className="w-5 h-5 text-blue-500" />;
      case 'received':
      case 'refunded':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      default:
        return <Package className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#05070A] via-[#0A0F1C] to-[#05070A] py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/sell"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">
            {t('returns.returnRequests')}
          </h1>
          <p className="text-gray-400">{t('returns.manageCustomerReturns')}</p>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {t(`returns.filter.${status}`)}
              {status === 'all' && ` (${returns.length})`}
            </button>
          ))}
        </div>

        {/* Returns List */}
        {filteredReturns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center"
          >
            <Package className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {t('returns.noReturnsFound')}
            </h3>
            <p className="text-gray-400">{t('returns.noReturnsFoundDescription')}</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {filteredReturns.map((returnRequest, index) => (
              <motion.div
                key={returnRequest.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(returnRequest.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {t('returns.orderNumber')}: {returnRequest.orders?.order_number}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {new Date(returnRequest.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-medium ${
                      returnRequest.status === 'requested'
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : returnRequest.status === 'approved'
                        ? 'bg-green-500/10 text-green-500'
                        : returnRequest.status === 'rejected'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-gray-500/10 text-gray-500'
                    }`}
                  >
                    {t(`returns.status.${returnRequest.status}`)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('returns.reason')}</p>
                    <p className="text-white">{returnRequest.reason}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('returns.orderTotal')}</p>
                    <p className="text-white font-semibold">
                      ${((returnRequest.orders?.total_amount || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>

                {returnRequest.comments && (
                  <div className="mb-4 p-3 bg-white/5 rounded-lg">
                    <p className="text-sm text-gray-400 mb-1">{t('returns.buyerComments')}</p>
                    <p className="text-white text-sm">{returnRequest.comments}</p>
                  </div>
                )}

                {/* Action Buttons */}
                {returnRequest.status === 'requested' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() =>
                        handleAction(
                          returnRequest.id,
                          'approve',
                          returnRequest.orders?.total_amount
                        )
                      }
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      {t('returns.approve')}
                    </button>
                    <button
                      onClick={() => handleAction(returnRequest.id, 'reject')}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                      {t('returns.reject')}
                    </button>
                  </div>
                )}

                {returnRequest.status === 'approved' && (
                  <button
                    onClick={() => handleAction(returnRequest.id, 'mark_in_transit')}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    {t('returns.markInTransit')}
                  </button>
                )}

                {returnRequest.status === 'in_transit' && (
                  <button
                    onClick={() => handleAction(returnRequest.id, 'mark_received')}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    {t('returns.markReceived')}
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
