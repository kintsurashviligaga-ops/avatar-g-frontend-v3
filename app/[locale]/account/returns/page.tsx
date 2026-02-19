'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ArrowLeft, Package, Clock, CheckCircle, XCircle, Truck } from 'lucide-react';
import Link from 'next/link';

interface ReturnRequest {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  comments?: string;
  refund_amount_cents?: number;
  created_at: string;
  updated_at: string;
  orders?: {
    order_number: string;
    total_amount: number;
  };
}

export default function BuyerReturnsPage() {
  const t = useTranslations();
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReturns();
  }, []);

  const fetchReturns = async () => {
    try {
      const response = await fetch('/api/returns?view=buyer');
      const data = await response.json();
      setReturns(data.returns || []);
    } catch (error) {
      console.error('Error fetching returns:', error);
    } finally {
      setLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'requested':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'approved':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'rejected':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'in_transit':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'received':
      case 'refunded':
        return 'bg-green-600/10 text-green-600 border-green-600/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/account"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">
            {t('returns.myReturns')}
          </h1>
          <p className="text-gray-400">{t('returns.manageYourReturnRequests')}</p>
        </div>

        {/* Returns List */}
        {returns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center"
          >
            <Package className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {t('returns.noReturns')}
            </h3>
            <p className="text-gray-400">{t('returns.noReturnsDescription')}</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {returns.map((returnRequest, index) => (
              <motion.div
                key={returnRequest.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      {getStatusIcon(returnRequest.status)}
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {t('returns.orderNumber')}: {returnRequest.orders?.order_number}
                        </h3>
                        <p className="text-sm text-gray-400">
                          {t('returns.requestedOn')}:{' '}
                          {new Date(returnRequest.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-400 mb-1">{t('returns.reason')}</p>
                        <p className="text-white">{returnRequest.reason}</p>
                      </div>
                      {returnRequest.refund_amount_cents && (
                        <div>
                          <p className="text-sm text-gray-400 mb-1">
                            {t('returns.refundAmount')}
                          </p>
                          <p className="text-white font-semibold">
                            ${(returnRequest.refund_amount_cents / 100).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>

                    {returnRequest.comments && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-400 mb-1">{t('returns.comments')}</p>
                        <p className="text-white text-sm">{returnRequest.comments}</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <span
                      className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                        returnRequest.status
                      )}`}
                    >
                      {t(`returns.status.${returnRequest.status}`)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
