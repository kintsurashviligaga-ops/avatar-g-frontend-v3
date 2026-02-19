'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, DollarSign, Users, ShoppingCart, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface FinanceSummary {
  mrr: number;
  arr: number;
  activeSubs: number;
  revenue30d: number;
  gmv30d: number;
  fees30d: number;
  refunds30d: number;
  churn: number;
}

interface TimeseriesData {
  date: string;
  mrr: number;
  revenue: number;
  gmv: number;
  fees: number;
  affiliateCommissions: number;
  payouts: number;
  subscriptionsActive: number;
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
}

const _COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminFinanceDashboard() {
  const _t = useTranslations();
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesData[]>([]);
  const [range, setRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFinanceData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary
      const summaryRes = await fetch(`/api/finance/admin/summary?range=${range}`, {
        method: 'GET',
      });

      if (!summaryRes.ok) {
        throw new Error('Failed to fetch summary');
      }

      const summaryData = await summaryRes.json();
      setSummary(summaryData.summary);

      // Fetch timeseries
      const timeseriesRes = await fetch(`/api/finance/admin/timeseries?range=${range}`, {
        method: 'GET',
      });

      if (!timeseriesRes.ok) {
        throw new Error('Failed to fetch timeseries');
      }

      const timeseriesData = await timeseriesRes.json();
      setTimeseries(timeseriesData.data);
    } catch (err) {
      console.error('Error fetching finance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void fetchFinanceData();
  }, [fetchFinanceData]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const KPICard = ({ label, value, icon: Icon, color = 'blue' }: KpiCardProps) => (
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
          <p className="mt-4 text-gray-600">Loading finance dashboard...</p>
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

  if (!summary) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <p className="text-gray-600">No data available</p>
      </div>
    );
  }

  const _revenueBreakdown = [
    { name: 'Subscription Revenue', value: summary.revenue30d },
    { name: 'GMV (Marketplace)', value: summary.gmv30d },
  ];

  const _feesBreakdown = [
    { name: 'Platform Fees', value: summary.fees30d },
    { name: 'Other', value: Math.max(0, summary.revenue30d - summary.fees30d) },
  ];

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Financial Analytics</h1>
            <p className="text-gray-600 mt-1">Platform-wide financial overview</p>
          </div>
          <div className="flex gap-2">
            {['30d', '90d', '180d'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  range === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {r === '30d' ? 'Last 30 days' : r === '90d' ? 'Last 90 days' : 'Last 180 days'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            label="Monthly Recurring Revenue (MRR)"
            value={formatCurrency(summary.mrr)}
            icon={TrendingUp}
            color="blue"
          />
          <KPICard
            label="Annual Recurring Revenue (ARR)"
            value={formatCurrency(summary.arr)}
            icon={DollarSign}
            color="green"
          />
          <KPICard
            label="Active Subscriptions"
            value={summary.activeSubs.toLocaleString()}
            icon={Users}
            color="purple"
          />
          <KPICard
            label="Gross Margin Value (GMV)"
            value={formatCurrency(summary.gmv30d)}
            icon={ShoppingCart}
            color="amber"
          />
        </div>

        {/* Revenue & Fees Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Summary (30d)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Subscription Revenue</span>
                <span className="font-medium">{formatCurrency(summary.revenue30d)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Refunds</span>
                <span className="font-medium text-red-600">{formatCurrency(summary.refunds30d)}</span>
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-bold">
                  <span>Net Revenue</span>
                  <span>{formatCurrency(summary.revenue30d - summary.refunds30d)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fees & Payouts (30d)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Platform Fees</span>
                <span className="font-medium text-green-600">{formatCurrency(summary.fees30d)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Churn Rate</span>
                <span className="font-medium">{summary.churn.toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section - Tables for now (recharts requires installation) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Revenue Trend */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend (Last 7 Days)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Revenue</th>
                    <th className="text-left py-2 px-3 font-medium">MRR</th>
                  </tr>
                </thead>
                <tbody>
                  {timeseries.slice(0, 7).map((row) => (
                    <tr key={row.date} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{row.date}</td>
                      <td className="py-2 px-3">{formatCurrency(row.revenue)}</td>
                      <td className="py-2 px-3">{formatCurrency(row.mrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* GMV & Fees Trend */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">GMV & Fees Trend (Last 7 Days)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">GMV</th>
                    <th className="text-left py-2 px-3 font-medium">Platform Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {timeseries.slice(0, 7).map((row) => (
                    <tr key={row.date} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{row.date}</td>
                      <td className="py-2 px-3">{formatCurrency(row.gmv)}</td>
                      <td className="py-2 px-3">{formatCurrency(row.fees)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Affiliate & Payouts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Affiliate Commissions (Last 7 Days)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Commissions</th>
                  </tr>
                </thead>
                <tbody>
                  {timeseries.slice(0, 7).map((row) => (
                    <tr key={row.date} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{row.date}</td>
                      <td className="py-2 px-3">{formatCurrency(row.affiliateCommissions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Seller Payouts (Last 7 Days)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Payouts</th>
                  </tr>
                </thead>
                <tbody>
                  {timeseries.slice(0, 7).map((row) => (
                    <tr key={row.date} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{row.date}</td>
                      <td className="py-2 px-3">{formatCurrency(row.payouts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
