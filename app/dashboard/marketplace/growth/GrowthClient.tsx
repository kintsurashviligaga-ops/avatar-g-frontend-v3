'use client';

import { useEffect, useMemo, useState } from 'react';
import { fromCents } from '@/lib/finance/money';

interface StoreOption {
  id: string;
  shop_name: string;
}

interface GrowthClientProps {
  stores: StoreOption[];
}

interface GrowthKpiRow {
  id: string;
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue_amount_cents: number;
}

export default function GrowthClient({ stores }: GrowthClientProps) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [kpis, setKpis] = useState<GrowthKpiRow[]>([]);
  const [referralCode, setReferralCode] = useState('AG-REF');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    async function loadKpis() {
      if (!storeId) return;
      const response = await fetch(`/api/marketplace/kpis?storeId=${storeId}`);
      const data = await response.json();
      setKpis(data.data || []);
    }

    loadKpis();
  }, [storeId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const totals = useMemo(() => {
    return kpis.reduce(
      (acc, row) => {
        acc.impressions += row.impressions || 0;
        acc.clicks += row.clicks || 0;
        acc.conversions += row.conversions || 0;
        acc.revenue += row.revenue_amount_cents || 0;
        return acc;
      },
      { impressions: 0, clicks: 0, conversions: 0, revenue: 0 }
    );
  }, [kpis]);

  const referralLink = storeId && baseUrl ? `${baseUrl}/marketplace?ref=${referralCode}` : '';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketplace Growth Engine</h1>
          <p className="text-gray-400">Network effects, affiliates, and growth KPIs.</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <label className="text-sm text-gray-300">Store</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{store.shop_name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Impressions', value: totals.impressions },
          { label: 'Clicks', value: totals.clicks },
          { label: 'Conversions', value: totals.conversions },
          { label: 'Revenue', value: `${fromCents(totals.revenue).toFixed(2)}` },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Growth Loop</h2>
          <ol className="list-decimal list-inside text-gray-300 space-y-2">
            <li>Acquire affiliates with high-intent content.</li>
            <li>Affiliates drive traffic with referral links.</li>
            <li>Conversions generate commissions and proof.</li>
            <li>Top sellers reinvest into ads and product volume.</li>
            <li>Network effects compound daily.</li>
          </ol>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Affiliate Recruitment Checklist</h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2">
            <li>Create a 60-second pitch video for affiliates.</li>
            <li>Offer 10-20% commission for top partners.</li>
            <li>Publish a public affiliate landing page.</li>
            <li>Give affiliates access to weekly top products.</li>
            <li>Reward top 10 affiliates monthly.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Referral Link Generator</h2>
          <div className="space-y-3">
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2"
            />
            <div className="bg-black/30 rounded p-3 text-sm text-gray-300 break-all">
              {referralLink || 'Select a store to generate a link'}
            </div>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Leaderboard</h2>
          <p className="text-gray-400">Top affiliates and listings will appear here once data is available.</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">KPI Timeline (Last 30 days)</h2>
        {kpis.length === 0 ? (
          <p className="text-gray-400">No KPI data yet.</p>
        ) : (
          <div className="space-y-2">
            {kpis.map((row) => (
              <div key={row.id} className="bg-black/30 rounded p-3 flex justify-between text-sm">
                <span>{row.date}</span>
                <span>Imp: {row.impressions} | Clicks: {row.clicks} | Conv: {row.conversions} | Rev: {fromCents(row.revenue_amount_cents).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
