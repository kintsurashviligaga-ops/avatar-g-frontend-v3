/**
 * Finance Simulator Dashboard - Client Component
 */
'use client';

import { useState } from 'react';

interface SimulationResult {
  netPerOrderCents: number;
  marginBps: number;
  dailyProfitCents: number;
  monthlyProfitCents: number;
  breakEvenOrdersPerDay: number | null;
  warnings: string[];
}

export default function FinanceSimulatorClient() {
  const [inputs, setInputs] = useState({
    retailPriceCents: 10000,
    supplierCostCents: 2000,
    shippingCostCents: 500,
    vatEnabled: true,
    platformFeeBps: 500,
    affiliateBps: 0,
    refundReserveBps: 200,
    expectedOrdersPerDay: 10,
    adSpendPerDayCents: 1000,
  });

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (key: string, value: unknown) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSimulate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/finance/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCents = (cents: number) => {
    return `₾${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-6">Scenario Builder</h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Retail Price (₾)</label>
            <input
              type="number"
              value={inputs.retailPriceCents / 100}
              onChange={(e) => handleInputChange('retailPriceCents', parseInt(e.target.value) * 100)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Supplier Cost (₾)</label>
            <input
              type="number"
              value={inputs.supplierCostCents / 100}
              onChange={(e) => handleInputChange('supplierCostCents', parseInt(e.target.value) * 100)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Shipping Cost (₾)</label>
            <input
              type="number"
              value={inputs.shippingCostCents / 100}
              onChange={(e) => handleInputChange('shippingCostCents', parseInt(e.target.value) * 100)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Orders/Day</label>
            <input
              type="number"
              value={inputs.expectedOrdersPerDay}
              onChange={(e) => handleInputChange('expectedOrdersPerDay', parseInt(e.target.value))}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ad Spend/Day (₾)</label>
            <input
              type="number"
              value={inputs.adSpendPerDayCents / 100}
              onChange={(e) => handleInputChange('adSpendPerDayCents', parseInt(e.target.value) * 100)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Platform Fee (%)</label>
            <input
              type="number"
              value={inputs.platformFeeBps / 100}
              onChange={(e) => handleInputChange('platformFeeBps', parseInt(e.target.value) * 100)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-6 py-2 rounded font-medium"
          >
            {loading ? 'Simulating...' : 'Simulate'}
          </button>
        </div>

        {error && <div className="mt-4 bg-red-900 border border-red-700 rounded p-3 text-red-100">{error}</div>}
      </div>

      {result && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-6">Results</h2>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-700 rounded p-4">
              <div className="text-sm text-gray-300 mb-1">Net Per Order</div>
              <div className="text-2xl font-bold">{formatCents(result.netPerOrderCents)}</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-sm text-gray-300 mb-1">Margin %</div>
              <div className="text-2xl font-bold">{(result.marginBps / 100).toFixed(2)}%</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-sm text-gray-300 mb-1">Daily Profit</div>
              <div className="text-2xl font-bold">{formatCents(result.dailyProfitCents)}</div>
            </div>
            <div className="bg-gray-700 rounded p-4">
              <div className="text-sm text-gray-300 mb-1">Monthly Profit</div>
              <div className="text-2xl font-bold">{formatCents(result.monthlyProfitCents)}</div>
            </div>
            {result.breakEvenOrdersPerDay !== null && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-sm text-gray-300 mb-1">Break-even Orders</div>
                <div className="text-2xl font-bold">{result.breakEvenOrdersPerDay}</div>
              </div>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-yellow-900 border border-yellow-700 rounded p-4">
              <div className="font-medium mb-2">Warnings</div>
              <ul className="list-disc list-inside space-y-1 text-yellow-100">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
