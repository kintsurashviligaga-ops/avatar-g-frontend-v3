'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

interface MarginResult {
  recommendedPriceCents: number;
  recommendedPriceUsd?: number;
  grossMarginPct: number;
  netProfitCents: number;
  breakdown: {
    revenue: number;
    vat: number;
    cost: number;
    shipping: number;
    paymentFee: number;
    platformFee: number;
    affiliateFee: number;
    netProfit: number;
  };
  breakdownUsd?: {
    revenue: number;
    vat: number;
    cost: number;
    shipping: number;
    paymentFee: number;
    platformFee: number;
    affiliateFee: number;
    netProfit: number;
  };
}

export default function MarginCalculatorPage() {
  const t = useTranslations();
  const [currency, setCurrency] = useState<'GEL' | 'USD'>('GEL');
  const [isVatPayer, setIsVatPayer] = useState(true);
  const [costCents, setCostCents] = useState(10000);
  const [shippingCents, setShippingCents] = useState(0);
  const [paymentFeePct, setPaymentFeePct] = useState(2.9);
  const [platformFeePct, setPlatformFeePct] = useState(30);
  const [affiliateFeePct, setAffiliateFeePct] = useState(0);
  const [desiredProfitPct, setDesiredProfitPct] = useState(30);
  const [fxRate, setFxRate] = useState(2.7);
  const [result, setResult] = useState<MarginResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tools/margin-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          costCents,
          shippingCents,
          paymentFeePct,
          platformFeePct,
          affiliateFeePct,
          isVatPayer,
          vatRate: isVatPayer ? 18 : 0,
          desiredProfitPct,
          currency,
          fxRateGelPerUsd: fxRate,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      } else {
        toast.error(t('common.error'));
      }
    } catch (error) {
      toast.error(t('common.error'));
      console.error('Error calculating margin:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number, cur: string) => {
    const amount = (cents / 100).toFixed(2);
    return cur === 'GEL' ? `₾${amount}` : `$${amount}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold mb-2">{t('tools.margin_calculator.title')}</h1>
        <p className="text-gray-600 mb-8">{t('tools.margin_calculator.description')}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Form */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-6">{t('tools.margin_calculator.inputs')}</h2>

            <div className="space-y-4">
              {/* Currency Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('tools.margin_calculator.currency')}
                </label>
                <div className="flex gap-2">
                  {(['GEL', 'USD'] as const).map((cur) => (
                    <button
                      key={cur}
                      onClick={() => setCurrency(cur)}
                      className={`px-4 py-2 rounded-lg font-medium transition ${
                        currency === cur
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              {/* VAT Payer Toggle */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVatPayer}
                    onChange={(e) => setIsVatPayer(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600"
                  />
                  <span className="ml-3 font-medium text-gray-900">
                    {t('tools.margin_calculator.vat_payer')}
                  </span>
                </label>
              </div>

              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tools.margin_calculator.cost')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{currency === 'GEL' ? '₾' : '$'}</span>
                  <input
                    type="number"
                    value={costCents / 100}
                    onChange={(e) => setCostCents(Math.round(parseFloat(e.target.value) * 100))}
                    step="0.01"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Shipping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tools.margin_calculator.shipping')}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{currency === 'GEL' ? '₾' : '$'}</span>
                  <input
                    type="number"
                    value={shippingCents / 100}
                    onChange={(e) => setShippingCents(Math.round(parseFloat(e.target.value) * 100))}
                    step="0.01"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Fees */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('tools.margin_calculator.payment_fee')} %
                  </label>
                  <input
                    type="number"
                    value={paymentFeePct}
                    onChange={(e) => setPaymentFeePct(parseFloat(e.target.value))}
                    step="0.1"
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('tools.margin_calculator.platform_fee')} %
                  </label>
                  <input
                    type="number"
                    value={platformFeePct}
                    onChange={(e) => setPlatformFeePct(parseFloat(e.target.value))}
                    step="0.1"
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('tools.margin_calculator.affiliate_fee')} %
                  </label>
                  <input
                    type="number"
                    value={affiliateFeePct}
                    onChange={(e) => setAffiliateFeePct(parseFloat(e.target.value))}
                    step="0.1"
                    className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Desired Profit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('tools.margin_calculator.desired_profit')} %
                </label>
                <input
                  type="number"
                  value={desiredProfitPct}
                  onChange={(e) => setDesiredProfitPct(parseFloat(e.target.value))}
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* FX Rate */}
              {currency === 'GEL' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('tools.margin_calculator.fx_rate')}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">1 USD =</span>
                    <input
                      type="number"
                      value={fxRate}
                      onChange={(e) => setFxRate(parseFloat(e.target.value))}
                      step="0.01"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">₾</span>
                  </div>
                </div>
              )}

              {/* Calculate Button */}
              <motion.button
                type="button"
                onClick={handleCalculate}
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <DollarSign size={18} />
                {loading ? t('common.calculating') : t('tools.margin_calculator.calculate')}
              </motion.button>
            </div>
          </div>

          {/* Results */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-6">{t('tools.margin_calculator.results')}</h2>

            {result ? (
              <div className="space-y-4">
                {/* Recommended Price */}
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">
                    {t('tools.margin_calculator.recommended_price')}
                  </p>
                  <p className="text-4xl font-bold text-green-700">
                    {formatPrice(result.recommendedPriceCents, currency)}
                  </p>
                  {result.recommendedPriceUsd && currency === 'GEL' && (
                    <p className="text-sm text-gray-600 mt-2">
                      ≈ {formatPrice(result.recommendedPriceUsd, 'USD')}
                    </p>
                  )}
                </div>

                {/* Margin & Profit */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">
                      {t('tools.margin_calculator.gross_margin')}
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {result.grossMarginPct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">
                      {t('tools.margin_calculator.net_profit')}
                    </p>
                    <p className="text-2xl font-bold text-purple-700">
                      {formatPrice(result.netProfitCents, currency)}
                    </p>
                  </div>
                </div>

                {/* Breakdown Table */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">
                    {t('tools.margin_calculator.breakdown')}
                  </h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'tools.margin_calculator.revenue', value: result.breakdown.revenue },
                      { label: 'tools.margin_calculator.vat', value: result.breakdown.vat },
                      { label: 'tools.margin_calculator.cost', value: result.breakdown.cost },
                      { label: 'tools.margin_calculator.shipping', value: result.breakdown.shipping },
                      {
                        label: 'tools.margin_calculator.payment_fee',
                        value: result.breakdown.paymentFee,
                      },
                      {
                        label: 'tools.margin_calculator.platform_fee',
                        value: result.breakdown.platformFee,
                      },
                      {
                        label: 'tools.margin_calculator.affiliate_fee',
                        value: result.breakdown.affiliateFee,
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between py-1 border-b border-gray-200">
                        <span className="text-gray-600">{t(item.label)}</span>
                        <span className="font-medium text-gray-900">
                          {formatPrice(item.value, currency)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 mt-2 border-t-2 border-gray-300">
                      <span className="font-bold text-gray-900">
                        {t('tools.margin_calculator.net_profit')}
                      </span>
                      <span className="font-bold text-green-700">
                        {formatPrice(result.breakdown.netProfit, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <DollarSign size={40} className="mx-auto mb-4 opacity-30" />
                <p>{t('tools.margin_calculator.enter_values')}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
