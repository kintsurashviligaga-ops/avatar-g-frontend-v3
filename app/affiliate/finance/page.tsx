'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, DollarSign, Copy, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface CommissionItem {
  id: string;
  created_at: string;
  status: 'pending' | 'available' | 'paid' | 'reversed' | string;
  gross_amount_cents?: number;
  commission_cents?: number;
  commission_amount_cents?: number;
  available_at?: string | null;
}

interface PayoutItem {
  id: string;
  created_at: string;
  amount_cents?: number;
  status: string;
}

interface CommissionByDate {
  date: string;
  pending: number;
  available: number;
  paid: number;
}

interface BalanceCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
}

interface AffiliateFinanceSummary {
  affiliate: {
    id: string;
    status: string;
    referralCode: string;
  };
  commissions: CommissionItem[];
  payouts: PayoutItem[];
  balances: {
    pending: number;
    available: number;
    paid: number;
    reversed: number;
    total: number;
  };
  summary: {
    totalEarned: number;
    totalPaidOut: number;
    commissionCount: number;
    payoutCount: number;
  };
}

const _COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export default function AffiliateFinanceDashboard() {
  const _t = useTranslations();
  const [data, setData] = useState<AffiliateFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchAffiliateFinance();
  }, []);

  const fetchAffiliateFinance = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/finance/affiliate/summary', {
        method: 'GET',
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError('You are not registered as an affiliate');
        } else {
          throw new Error('Failed to fetch affiliate finance data');
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setData(data);
    } catch (err) {
      console.error('Error fetching affiliate finance:', err);
      setError(err instanceof Error ? err.message : 'Failed to load affiliate finance data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const BalanceCard = ({ label, value, icon: Icon, color = 'blue' }: BalanceCardProps) => (
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
          <p className="mt-4 text-gray-600">Loading affiliate dashboard...</p>
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

  // Prepare commission data by date
  const commissionsByDate = data.commissions.reduce<Record<string, CommissionByDate>>((acc, comm) => {
    const date = new Date(comm.created_at).toISOString().slice(0, 10);
    if (!acc[date]) {
      acc[date] = { date, pending: 0, available: 0, paid: 0 };
    }
    if (comm.status === 'pending') acc[date].pending += comm.commission_cents || 0;
    if (comm.status === 'available') acc[date].available += comm.commission_cents || 0;
    if (comm.status === 'paid') acc[date].paid += comm.commission_cents || 0;
    return acc;
  }, {});

  const commissionChartData = Object.values(commissionsByDate).slice(-30);

  // Prepare balance breakdown for pie chart
  const _balanceData = [
    { name: 'Pending', value: data.balances.pending },
    { name: 'Available', value: data.balances.available },
    { name: 'Paid', value: data.balances.paid },
  ].filter((item) => item.value > 0);

  return (
    <div className="bg-gray-50 min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Affiliate Earnings</h1>
          <p className="text-gray-600 mt-1">Referral code: {data.affiliate.referralCode}</p>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <BalanceCard
            label="Pending Earnings"
            value={formatCurrency(data.balances.pending)}
            icon={AlertCircle}
            color="amber"
          />
          <BalanceCard
            label="Available to Withdraw"
            value={formatCurrency(data.balances.available)}
            icon={TrendingUp}
            color="green"
          />
          <BalanceCard
            label="Already Paid"
            value={formatCurrency(data.balances.paid)}
            icon={DollarSign}
            color="blue"
          />
          <BalanceCard
            label="Total Earned"
            value={formatCurrency(data.summary.totalEarned)}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Referral Code Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Referral Link</h3>
          <div className="flex items-center gap-2 bg-gray-100 rounded p-3 mb-2">
            <code className="flex-1 font-mono text-sm">{data.affiliate.referralCode}</code>
            <button
              onClick={() => copyToClipboard(data.affiliate.referralCode)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-gray-600">Share this code with friends to earn commissions on their purchases</p>
        </div>

        {/* Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Commission Balance */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Commission Balance</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Pending (7-day hold)</span>
                <span className="font-medium text-amber-600">{formatCurrency(data.balances.pending)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Ready to Withdraw</span>
                <span className="font-medium text-green-600">{formatCurrency(data.balances.available)}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between font-bold">
                  <span>Total Available</span>
                  <span>{formatCurrency(data.balances.pending + data.balances.available)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Commission Events</span>
                <span className="font-medium">{data.summary.commissionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Payouts Received</span>
                <span className="font-medium">{data.summary.payoutCount}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between">
                  <span>Affiliate Status</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    data.affiliate.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {data.affiliate.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts - Tables for now (recharts requires installation) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Commission Trend */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Commissions by Status (Last 7 Days)</h3>
            {commissionChartData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-left py-2 px-3 font-medium">Pending</th>
                      <th className="text-left py-2 px-3 font-medium">Available</th>
                      <th className="text-left py-2 px-3 font-medium">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionChartData.slice(0, 7).map((row) => (
                      <tr key={row.date} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{row.date}</td>
                        <td className="py-2 px-3 text-amber-600">{formatCurrency(row.pending)}</td>
                        <td className="py-2 px-3 text-green-600">{formatCurrency(row.available)}</td>
                        <td className="py-2 px-3 text-blue-600">{formatCurrency(row.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600 text-center py-8">No commission data yet</p>
            )}
          </div>

          {/* Balance Summary */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Balance Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded">
                <span className="text-gray-700">Pending (7-day hold)</span>
                <span className="font-semibold text-amber-700">{formatCurrency(data.balances.pending)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded">
                <span className="text-gray-700">Ready to Withdraw</span>
                <span className="font-semibold text-green-700">{formatCurrency(data.balances.available)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
                <span className="text-gray-700">Already Paid</span>
                <span className="font-semibold text-blue-700">{formatCurrency(data.balances.paid)}</span>
              </div>
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center font-bold">
                  <span>Total Available</span>
                  <span>{formatCurrency(data.balances.pending + data.balances.available)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Commissions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Commission Events</h3>
          {data.commissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Gross Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Commission (10%)</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Available On</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.slice(0, 10).map((comm) => (
                    <tr key={comm.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{new Date(comm.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">{formatCurrency(comm.gross_amount_cents || 0)}</td>
                      <td className="py-3 px-4 font-semibold text-green-600">{formatCurrency(comm.commission_amount_cents || 0)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          comm.status === 'pending' ? 'bg-amber-100 text-amber-800' : 
                          comm.status === 'available' ? 'bg-green-100 text-green-800' :
                          comm.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {comm.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {comm.available_at ? new Date(comm.available_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No commissions yet. Start referring friends!</p>
          )}
        </div>
      </div>
    </div>
  );
}
