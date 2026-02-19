'use client';

import { useEffect, useMemo, useState } from 'react';
import { toCents, fromCents } from '@/lib/finance/money';
import type { SimulationOutputs } from '@/lib/finance/types';

interface StoreOption {
  id: string;
  shop_name: string;
  shop_type?: string;
}

interface FinanceClientProps {
  stores: StoreOption[];
}

interface ScenarioItem {
  id: string;
  name: string;
  created_at: string;
  currency: 'GEL' | 'USD';
  outputs_json?: {
    net_profit_per_day_cents?: number;
  };
}

export default function FinanceClient({ stores }: FinanceClientProps) {
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [scenarioName, setScenarioName] = useState('Baseline Scenario');
  const [currency, setCurrency] = useState<'GEL' | 'USD'>('GEL');
  const [productType, setProductType] = useState<'physical' | 'digital' | 'dropshipping' | 'service'>('physical');
  const [targetMarginBps, setTargetMarginBps] = useState(1500);

  const [retailPrice, setRetailPrice] = useState(120);
  const [supplierCost, setSupplierCost] = useState(40);
  const [shippingCost, setShippingCost] = useState(8);

  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatRateBps, setVatRateBps] = useState(1800);
  const [platformFeeBps, setPlatformFeeBps] = useState(500);
  const [affiliateBps, setAffiliateBps] = useState(1000);
  const [refundReserveBps, setRefundReserveBps] = useState(200);

  const [expectedOrdersPerDay, setExpectedOrdersPerDay] = useState(10);
  const [expectedConversionRate, setExpectedConversionRate] = useState(0.03);
  const [adSpendPerDay, setAdSpendPerDay] = useState(20);

  const [fxRate, setFxRate] = useState(2.7);
  const [fxBaseCurrency, setFxBaseCurrency] = useState<'GEL' | 'USD'>('USD');
  const [fxQuoteCurrency, setFxQuoteCurrency] = useState<'GEL' | 'USD'>('GEL');

  const [outputs, setOutputs] = useState<SimulationOutputs | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadScenarios() {
      if (!storeId) return;
      const response = await fetch(`/api/finance/scenarios?storeId=${storeId}`);
      const data = await response.json();
      setScenarios(data.data || []);
    }

    loadScenarios();
  }, [storeId]);

  const payload = useMemo(() => ({
    retail_price_amount_cents: toCents(retailPrice),
    supplier_cost_amount_cents: toCents(supplierCost),
    shipping_cost_amount_cents: toCents(shippingCost),
    vat_enabled: vatEnabled,
    vat_rate_bps: vatRateBps,
    platform_fee_bps: platformFeeBps,
    affiliate_bps: affiliateBps,
    refund_reserve_bps: refundReserveBps,
    product_type: productType,
    target_margin_bps: targetMarginBps,
    expected_orders_per_day: expectedOrdersPerDay,
    expected_conversion_rate: expectedConversionRate,
    ad_spend_per_day_cents: toCents(adSpendPerDay),
    currency,
    fx_rate: fxRate,
    fx_base_currency: fxBaseCurrency,
    fx_quote_currency: fxQuoteCurrency,
  }), [
    retailPrice,
    supplierCost,
    shippingCost,
    vatEnabled,
    vatRateBps,
    platformFeeBps,
    affiliateBps,
    refundReserveBps,
    productType,
    targetMarginBps,
    expectedOrdersPerDay,
    expectedConversionRate,
    adSpendPerDay,
    currency,
    fxRate,
    fxBaseCurrency,
    fxQuoteCurrency,
  ]);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/finance/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Simulation failed');
      }

      setOutputs(data.data.outputs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate');
    } finally {
      setLoading(false);
    }
  }

  async function saveScenario() {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/finance/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          name: scenarioName,
          inputs: payload,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save scenario');
      }

      setScenarios([data.data, ...scenarios]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scenario');
    } finally {
      setLoading(false);
    }
  }

  const chartMax = Math.max(
    outputs?.net_profit_per_day_cents || 1,
    outputs?.net_profit_per_week_cents || 1,
    outputs?.net_profit_per_month_cents || 1
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Business & Finance Simulator</h1>
          <p className="text-gray-400">Simulate profit, margins, and growth impact.</p>
        </div>
        <button
          onClick={runSimulation}
          className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded"
        >
          {loading ? 'Running...' : 'Run Simulation'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-200 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Scenario Builder</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
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
              <div>
                <label className="text-sm text-gray-300">Scenario Name</label>
                <input
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Product Type</label>
                <select
                  value={productType}
                  onChange={(e) => setProductType(e.target.value as 'physical' | 'digital' | 'dropshipping' | 'service')}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                >
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                  <option value="dropshipping">Dropshipping</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">Target Margin (bps)</label>
                <input
                  type="number"
                  value={targetMarginBps}
                  onChange={(e) => setTargetMarginBps(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Retail Price ({currency})</label>
                <input
                  type="number"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Supplier Cost ({currency})</label>
                <input
                  type="number"
                  value={supplierCost}
                  onChange={(e) => setSupplierCost(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Shipping Cost ({currency})</label>
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'GEL' | 'USD')}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                >
                  <option value="GEL">GEL</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                />
                <label className="text-sm text-gray-300">VAT Enabled</label>
              </div>
              <div>
                <label className="text-sm text-gray-300">VAT Rate (bps)</label>
                <input
                  type="number"
                  value={vatRateBps}
                  onChange={(e) => setVatRateBps(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Platform Fee (bps)</label>
                <input
                  type="number"
                  value={platformFeeBps}
                  onChange={(e) => setPlatformFeeBps(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Affiliate Fee (bps)</label>
                <input
                  type="number"
                  value={affiliateBps}
                  onChange={(e) => setAffiliateBps(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Refund Reserve (bps)</label>
                <input
                  type="number"
                  value={refundReserveBps}
                  onChange={(e) => setRefundReserveBps(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Expected Orders / Day</label>
                <input
                  type="number"
                  value={expectedOrdersPerDay}
                  onChange={(e) => setExpectedOrdersPerDay(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Conversion Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={expectedConversionRate}
                  onChange={(e) => setExpectedConversionRate(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">Ad Spend / Day ({currency})</label>
                <input
                  type="number"
                  value={adSpendPerDay}
                  onChange={(e) => setAdSpendPerDay(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-300">FX Rate</label>
                <input
                  type="number"
                  step="0.01"
                  value={fxRate}
                  onChange={(e) => setFxRate(Number(e.target.value))}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">FX Base</label>
                <select
                  value={fxBaseCurrency}
                  onChange={(e) => setFxBaseCurrency(e.target.value as 'GEL' | 'USD')}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                >
                  <option value="USD">USD</option>
                  <option value="GEL">GEL</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">FX Quote</label>
                <select
                  value={fxQuoteCurrency}
                  onChange={(e) => setFxQuoteCurrency(e.target.value as 'GEL' | 'USD')}
                  className="w-full mt-1 bg-black/40 border border-white/10 rounded px-3 py-2"
                >
                  <option value="GEL">GEL</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={runSimulation}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded"
              >
                Run Simulation
              </button>
              <button
                onClick={saveScenario}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded"
              >
                Save Scenario
              </button>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Profit Projections</h2>
            {!outputs && <p className="text-gray-400">Run a simulation to see results.</p>}
            {outputs && (
              <div className="space-y-4">
                <div>
                  <p className="text-gray-300">Net Profit / Order</p>
                  <p className="text-2xl font-semibold">{fromCents(outputs.net_profit_per_order_cents).toFixed(2)} {outputs.currency}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Per Day', value: outputs.net_profit_per_day_cents },
                    { label: 'Per Week', value: outputs.net_profit_per_week_cents },
                    { label: 'Per Month', value: outputs.net_profit_per_month_cents },
                  ].map((item) => (
                    <div key={item.label} className="bg-black/30 rounded p-4">
                      <p className="text-gray-400 text-sm">{item.label}</p>
                      <p className="text-xl font-semibold">{fromCents(item.value).toFixed(2)} {outputs.currency}</p>
                      <div className="h-2 bg-white/10 rounded mt-2">
                        <div
                          className="h-2 bg-cyan-400 rounded"
                          style={{ width: `${Math.min(100, (item.value / chartMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {outputs.converted && (
                  <div className="bg-black/30 rounded p-4">
                    <p className="text-gray-400 text-sm">Converted to {outputs.converted.currency} (Rate: {outputs.converted.fx_rate})</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      <div>
                        <p className="text-sm text-gray-400">Per Day</p>
                        <p className="text-lg font-semibold">{fromCents(outputs.converted.net_profit_per_day_cents).toFixed(2)} {outputs.converted.currency}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Per Week</p>
                        <p className="text-lg font-semibold">{fromCents(outputs.converted.net_profit_per_week_cents).toFixed(2)} {outputs.converted.currency}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Per Month</p>
                        <p className="text-lg font-semibold">{fromCents(outputs.converted.net_profit_per_month_cents).toFixed(2)} {outputs.converted.currency}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-black/30 rounded p-4">
                  <p className="text-gray-400 text-sm">Break-even Orders / Day</p>
                  <p className="text-xl font-semibold">
                    {outputs.break_even_orders_per_day !== null ? outputs.break_even_orders_per_day : 'N/A'}
                  </p>
                </div>

                <div className="bg-black/30 rounded p-4">
                  <p className="text-gray-400 text-sm">Recommended Price</p>
                  <p className="text-xl font-semibold">
                    {outputs.recommended_price_cents ? `${fromCents(outputs.recommended_price_cents).toFixed(2)} ${outputs.currency}` : 'N/A'}
                  </p>
                </div>

                {outputs.warnings.length > 0 && (
                  <div className="bg-yellow-900/40 border border-yellow-500 text-yellow-200 px-4 py-3 rounded">
                    <p className="font-semibold">Warnings</p>
                    <ul className="list-disc list-inside text-sm mt-2">
                      {outputs.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Scenario History</h2>
            {scenarios.length === 0 && <p className="text-gray-400">No saved scenarios yet.</p>}
            <div className="space-y-3">
              {scenarios.map((scenario) => (
                <div key={scenario.id} className="bg-black/30 rounded p-3">
                  <p className="font-semibold">{scenario.name}</p>
                  <p className="text-sm text-gray-400">{new Date(scenario.created_at).toLocaleDateString()}</p>
                  <p className="text-sm text-gray-300 mt-1">
                    Net/Day: {fromCents(scenario.outputs_json?.net_profit_per_day_cents || 0).toFixed(2)} {scenario.currency}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4">Fees Breakdown</h2>
            {outputs ? (
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex justify-between"><span>VAT</span><span>{fromCents(outputs.fees.vat_amount_cents).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Platform Fee</span><span>{fromCents(outputs.fees.platform_fee_cents).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Affiliate Fee</span><span>{fromCents(outputs.fees.affiliate_fee_cents).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Refund Reserve</span><span>{fromCents(outputs.fees.refund_reserve_cents).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Ad Cost / Order</span><span>{fromCents(outputs.fees.ad_cost_per_order_cents).toFixed(2)}</span></div>
              </div>
            ) : (
              <p className="text-gray-400">Run a simulation to see breakdown.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
