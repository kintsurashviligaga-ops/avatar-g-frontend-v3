'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertTriangle, DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

interface Dispute {
  id: string;
  order_id: string;
  stripe_dispute_id: string;
  amount_cents: number;
  status: string;
  reason: string;
  reason_description?: string;
  payout_hold_applied: boolean;
  created_at: string;
  orders?: {
    order_number: string;
  };
}

export default function DisputesPage() {
  const t = useTranslations();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    try {
      const response = await fetch('/api/disputes?view=admin');
      const data = await response.json();
      setDisputes(data.disputes || []);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status.includes('won')) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else if (status.includes('lost')) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    } else if (status.includes('needs_response')) {
      return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    } else {
      return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    if (status.includes('won')) {
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    } else if (status.includes('lost')) {
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    } else if (status.includes('needs_response')) {
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    } else {
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
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
            href="/admin"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('common.back')}
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">
            {t('disputes.title')}
          </h1>
          <p className="text-gray-400">{t('disputes.subtitle')}</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border border-orange-500/20 rounded-2xl p-6"
          >
            <AlertTriangle className="w-8 h-8 text-orange-500 mb-3" />
            <p className="text-sm text-gray-400 mb-1">{t('disputes.activeDisputes')}</p>
            <p className="text-3xl font-bold text-white">
              {disputes.filter((d) => !d.status.includes('won') && !d.status.includes('lost')).length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-2xl p-6"
          >
            <CheckCircle className="w-8 h-8 text-green-500 mb-3" />
            <p className="text-sm text-gray-400 mb-1">{t('disputes.won')}</p>
            <p className="text-3xl font-bold text-white">
              {disputes.filter((d) => d.status.includes('won')).length}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-2xl p-6"
          >
            <XCircle className="w-8 h-8 text-red-500 mb-3" />
            <p className="text-sm text-gray-400 mb-1">{t('disputes.lost')}</p>
            <p className="text-3xl font-bold text-white">
              {disputes.filter((d) => d.status.includes('lost')).length}
            </p>
          </motion.div>
        </div>

        {/* Disputes List */}
        {disputes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center"
          >
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {t('disputes.noDisputes')}
            </h3>
            <p className="text-gray-400">{t('disputes.noDisputesDescription')}</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute, index) => (
              <motion.div
                key={dispute.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(dispute.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {t('disputes.orderNumber')}: {dispute.orders?.order_number || dispute.order_id}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {new Date(dispute.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                      dispute.status
                    )}`}
                  >
                    {dispute.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('disputes.amount')}</p>
                    <p className="text-white font-semibold flex items-center gap-1">
                      <DollarSign className="w-4 h-4" />
                      {(dispute.amount_cents / 100).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('disputes.reason')}</p>
                    <p className="text-white">{dispute.reason}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('disputes.payoutHold')}</p>
                    <p className={dispute.payout_hold_applied ? 'text-orange-500' : 'text-green-500'}>
                      {dispute.payout_hold_applied ? t('disputes.yes') : t('disputes.no')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400 mb-1">{t('disputes.stripeId')}</p>
                    <p className="text-white text-xs font-mono">{dispute.stripe_dispute_id}</p>
                  </div>
                </div>

                {dispute.reason_description && (
                  <div className="p-3 bg-white/5 rounded-lg">
                    <p className="text-sm text-gray-400 mb-1">{t('disputes.description')}</p>
                    <p className="text-white text-sm">{dispute.reason_description}</p>
                  </div>
                )}

                {dispute.status.includes('needs_response') && (
                  <div className="mt-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      <p className="text-orange-500 font-medium">
                        {t('disputes.actionRequired')}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400 mt-2">
                      {t('disputes.respondInStripe')}
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
