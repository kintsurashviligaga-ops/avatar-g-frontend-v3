'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DollarSign, ShoppingCart, TrendingUp, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface SellerOrderItem {
  id: string;
  created_at: string;
  status?: string;
  gross_amount_cents?: number;
  platform_fee_cents?: number;
}

interface SellerPayoutItem {
  id: string;
  created_at: string;
  amount_cents?: number;
  status: string;
}

interface SellerSummaryByDate {
  date: string;
  revenue: number;
  fees: number;
  net: number;
}

interface SellerPayoutByDate {
  date: string;
  payouts: number;
}

interface SummaryCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
}

interface SellerFinanceSummary {
  seller: {
    id: string;
    displayName: string;
    stripeAccountId: string;
  };
  orders: SellerOrderItem[];
  payouts: SellerPayoutItem[];
  summary: {
    totalGmv: number;
    totalFees: number;
    totalNet: number;
    totalPaidOut: number;
    pendingPayout: number;
    orderCount: number;
    payoutCount: number;
  };
}

export default function SellerFinanceDashboard() {
  const _t = useTranslations();
  const [data, setData] = useState<SellerFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSellerFinance();
  }, []);

  const fetchSellerFinance = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/finance/seller/summary', {
        method: 'GET',
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError('You are not registered as a seller');
        } else {
          throw new Error('Failed to fetch seller finance data');
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setData(data);
    } catch (err) {
      console.error('Error fetching seller finance:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seller finance data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const SummaryCard = ({ label, value, icon: Icon, color = 'blue' }: SummaryCardProps) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg shadow-md p-6 border-l-4 border-${color}-500`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <Icon className={`w-8 h-8 text-${color}-500`} />
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full"></div>
          <p className="mt-4 text-gray-600">Loading seller dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <p className="text-gray-600">No data available</p>
      </div>
    );
  }

  // Group orders by date for chart
  const ordersByDate = data.orders.reduce<Record<string, SellerSummaryByDate>>((acc, order) => {
    const date = new Date(order.created_at).toISOString().slice(0, 10);
    if (!acc[date]) {
      acc[date] = { date, revenue: 0, fees: 0, net: 0 };
    }
    acc[date].revenue += order.gross_amount_cents || 0;
    acc[date].fees += order.platform_fee_cents || 0;
    acc[date].net += (order.gross_amount_cents || 0) - (order.platform_fee_cents || 0);
    return acc;
  }, {});

  const orderChartData = Object.values(ordersByDate).slice(-30);

  // Group payouts by date
  const payoutsByDate = data.payouts.reduce<Record<string, SellerPayoutByDate>>((acc, payout) => {
    const date = new Date(payout.created_at).toISOString().slice(0, 10);
    if (!acc[date]) {
      acc[date] = { date, payouts: 0 };
    }
    if (payout.status === 'paid') {
      acc[date].payouts += payout.amount_cents || 0;
    }
    return acc;
  }, {});

  const _payoutChartData = Object.values(payoutsByDate).slice(-30);

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Seller Dashboard</h1>
          <p className="text-gray-600 mt-1">
            {data.seller.displayName || 'Your Store'} • {data.seller.stripeAccountId}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <SummaryCard
            label="Total GMV"
            value={formatCurrency(data.summary.totalGmv)}
            icon={ShoppingCart}
            color="blue"
          />
          <SummaryCard
            label="Total Fees"
            value={formatCurrency(data.summary.totalFees)}
            icon={DollarSign}
            color="red"
          />
          <SummaryCard
            label="Net Amount"
            value={formatCurrency(data.summary.totalNet)}
            icon={TrendingUp}
            color="green"
          />
          <SummaryCard
            label="Pending Payout"
            value={formatCurrency(data.summary.pendingPayout)}
            icon={AlertCircle}
            color="amber"
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Gross Revenue</span>
                <span className="font-medium">{formatCurrency(data.summary.totalGmv)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Platform Fees (30%)</span>
                <span className="font-medium text-red-600">{formatCurrency(data.summary.totalFees)}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between font-bold">
                  <span>Your Net Earnings</span>
                  <span className="text-green-600">{formatCurrency(data.summary.totalNet)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Already Paid Out</span>
                <span className="font-medium">{formatCurrency(data.summary.totalPaidOut)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pending Payout</span>
                <span className="font-medium text-amber-600">{formatCurrency(data.summary.pendingPayout)}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <span>Total Orders</span>
                  <span className="font-medium">{data.summary.orderCount}</span>
                </div>
                <div className="flex justify-between mt-2">
                  <span>Total Payouts</span>
                  <span className="font-medium">{data.summary.payoutCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts - Tables for now (recharts requires installation) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue & Fees Trend */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue & Fees Trend (Last 7 Days)</h3>
            {orderChartData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-left py-2 px-3 font-medium">Revenue</th>
                      <th className="text-left py-2 px-3 font-medium">Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderChartData.slice(0, 7).map((row) => (
                      <tr key={row.date} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{row.date}</td>
                        <td className="py-2 px-3">{formatCurrency(row.revenue)}</td>
                        <td className="py-2 px-3 text-red-600">{formatCurrency(row.fees)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-8">No sales data yet</p>
            )}
          </div>

          {/* Net Revenue Trend */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Net Revenue Trend (Last 7 Days)</h3>
            {orderChartData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-left py-2 px-3 font-medium">Net Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderChartData.slice(0, 7).map((row) => (
                      <tr key={row.date} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{row.date}</td>
                        <td className="py-2 px-3 font-semibold text-green-600">{formatCurrency(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-8">No sales data yet</p>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h3>
          {data.orders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Order ID</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Gross Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Fees (30%)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Net Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.slice(0, 10).map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-sm">{order.id.slice(0, 8)}</td>
                      <td className="py-3 px-4">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">{formatCurrency(order.gross_amount_cents || 0)}</td>
                      <td className="py-3 px-4 text-red-600">{formatCurrency(order.platform_fee_cents || 0)}</td>
                      <td className="py-3 px-4 font-semibold">{formatCurrency((order.gross_amount_cents || 0) - (order.platform_fee_cents || 0))}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          order.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No orders yet</p>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Payment Processing</h3>
          <p className="text-blue-800 text-sm">
            Your pending earnings will be automatically transferred to your connected Stripe account. Transfers typically occur within 2-3 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
