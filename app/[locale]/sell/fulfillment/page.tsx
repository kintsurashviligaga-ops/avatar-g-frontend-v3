'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Order {
  id: string;
  order_number: string;
  buyer_name: string;
  total_amount: number;
  fulfillment_status: string;
  created_at: string;
  shipments: Array<{
    id: string;
    status: string;
    carrier: string;
    tracking_number: string;
  }>;
}

export default function FulfillmentDashboard() {
  const t = useTranslations();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all'); // all, unfulfilled, shipped, delivered

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        let query = supabase
          .from('orders')
          .select(
            `
            id,
            order_number:id,
            buyer_name,
            total_amount,
            fulfillment_status,
            created_at,
            shipments!inner (
              id,
              status,
              carrier,
              tracking_number
            )
          `
          )
          .eq('shipments.seller_user_id', user.id);

        if (filter !== 'all') {
          query = query.eq('fulfillment_status', filter);
        }

        const { data, error } = await query.order('created_at', {
          ascending: false,
        });

        if (error) throw error;
        setOrders(data || []);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [filter, supabase]);

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      unfulfilled: 'bg-gray-100 text-gray-800',
      processing: 'bg-yellow-100 text-yellow-800',
      shipped: 'bg-blue-100 text-blue-800',
      delivered: 'bg-green-100 text-green-800',
      returned: 'bg-red-100 text-red-800',
      canceled: 'bg-gray-500 text-white',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const statusLabels: Record<string, string> = {
    unfulfilled: t('shipping.fulfillment.status_unfulfilled'),
    processing: t('shipping.fulfillment.status_processing'),
    shipped: t('shipping.fulfillment.status_shipped'),
    delivered: t('shipping.fulfillment.status_delivered'),
    returned: t('shipping.fulfillment.status_returned'),
    canceled: t('shipping.fulfillment.status_canceled'),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {t('shipping.fulfillment.title')}
          </h1>
          <p className="text-gray-600">
            {t('shipping.fulfillment.description')}
          </p>
        </motion.div>

        {/* Filter Buttons */}
        <div className="mb-8 flex flex-wrap gap-2">
          {['all', 'unfulfilled', 'processing', 'shipped', 'delivered'].map(
            (status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300'
                }`}
              >
                {t(`shipping.fulfillment.filter_${status}`)}
              </button>
            )
          )}
        </div>

        {/* Orders Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white rounded-xl shadow-sm overflow-hidden"
        >
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full" />
              </div>
              <p className="mt-4 text-gray-600">{t('common.loading')}</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600">
                {t('shipping.fulfillment.no_orders')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      {t('shipping.fulfillment.order_number')}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      {t('shipping.fulfillment.buyer_name')}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      {t('shipping.fulfillment.amount')}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      {t('shipping.fulfillment.status')}
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      {t('shipping.fulfillment.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {order.order_number.substring(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {order.buyer_name}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        ${order.total_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                            order.fulfillment_status
                          )}`}
                        >
                          {statusLabels[order.fulfillment_status] ||
                            order.fulfillment_status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/sell/fulfillment/${order.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('shipping.fulfillment.manage')}
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
