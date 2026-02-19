/**
 * Marketplace Growth KPIs Dashboard - Client Component
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

interface KPI {
  id: string;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue_cents: number;
}

interface Aggregates {
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenueCents: number;
}

export default function GrowthKPIsClient({ storeId }: { storeId: string }) {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [aggregates, setAggregates] = useState<Aggregates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    try {
      const response = await fetch(`/api/marketplace/kpis?storeId=${storeId}`);
      if (!response.ok) throw new Error('Failed to fetch KPIs');
      const data = await response.json();
      setKpis(data.data.kpis);
      setAggregates(data.data.aggregates);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch KPIs');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void fetchKpis();
  }, [fetchKpis]);

  const formatCents = (cents: number) => {
    return `₾${(cents / 100).toFixed(2)}`;
  };

  const ctr = aggregates && aggregates.totalImpressions > 0
    ? ((aggregates.totalClicks / aggregates.totalImpressions) * 100).toFixed(2)
    : 0;

  const conversionRate = aggregates && aggregates.totalClicks > 0
    ? ((aggregates.totalConversions / aggregates.totalClicks) * 100).toFixed(2)
    : 0;

  return (
    <div className="space-y-8">
      {loading ? (
        <p className="text-gray-400">Loading KPIs...</p>
      ) : error ? (
        <div className="bg-red-900 border border-red-700 rounded p-3 text-red-100">{error}</div>
      ) : !aggregates ? (
        <p className="text-gray-400">No KPI data yet</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">Total Impressions</div>
              <div className="text-3xl font-bold">{aggregates.totalImpressions.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">Total Clicks</div>
              <div className="text-3xl font-bold">{aggregates.totalClicks.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">Total Conversions</div>
              <div className="text-3xl font-bold">{aggregates.totalConversions.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">Total Revenue</div>
              <div className="text-3xl font-bold">{formatCents(aggregates.totalRevenueCents)}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">CTR (Click-Through Rate)</div>
              <div className="text-3xl font-bold">{ctr}%</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-1">Conversion Rate</div>
              <div className="text-3xl font-bold">{conversionRate}%</div>
            </div>
          </div>

          {/* Daily KPI History */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold mb-4">Daily Performance (Last 30 Days)</h3>
            {kpis.length === 0 ? (
              <p className="text-gray-400">No daily data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2 px-2">Date</th>
                      <th className="text-right py-2 px-2">Impressions</th>
                      <th className="text-right py-2 px-2">Clicks</th>
                      <th className="text-right py-2 px-2">Conversions</th>
                      <th className="text-right py-2 px-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((kpi) => (
                      <tr key={kpi.id} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2 px-2">{new Date(kpi.date).toLocaleDateString()}</td>
                        <td className="text-right py-2 px-2">{kpi.impressions.toLocaleString()}</td>
                        <td className="text-right py-2 px-2">{kpi.clicks.toLocaleString()}</td>
                        <td className="text-right py-2 px-2">{kpi.conversions.toLocaleString()}</td>
                        <td className="text-right py-2 px-2">{formatCents(kpi.revenue_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
