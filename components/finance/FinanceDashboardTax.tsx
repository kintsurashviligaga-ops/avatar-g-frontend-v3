'use client';

/**
 * Finance Dashboard Tax Reporting
 * Displays VAT-aware or income-tax-aware reporting based on store tax status
 */

import React from 'react';
import { StoreTaxProfile } from '@/lib/finance/taxProfile';

interface FinanceReportData {
  grossRevenue: number;
  vatCollected?: number;
  netRevenue?: number;
  costs: number;
  fees: number;
  estimatedProfit: number;
  period: {
    start: string;
    end: string;
  };
}

interface FinanceDashboardTaxProps {
  taxProfile: StoreTaxProfile;
  reportData: FinanceReportData;
}

export function FinanceDashboardTax({ taxProfile, reportData }: FinanceDashboardTaxProps) {
  const formatCurrency = (cents: number) => {
    return `${(cents / 100).toFixed(2)}₾`;
  };

  return (
    <div className="space-y-6">
      {/* Header showing tax status */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Tax Status</h3>
            <p className="mt-1 text-sm text-gray-600">
              {taxProfile.tax_status === 'vat_payer'
                ? `VAT Payer (${(taxProfile.vat_rate_bps / 100).toFixed(1)}% rate)`
                : 'Non-VAT Payer (Income-Tax Accounting)'}
            </p>
          </div>
          {taxProfile.vat_registration_no && (
            <div className="text-right">
              <p className="text-xs text-gray-500">VAT Reg. No:</p>
              <p className="font-mono text-sm text-gray-900">{taxProfile.vat_registration_no}</p>
            </div>
          )}
        </div>
      </div>

      {/* VAT Payer View */}
      {taxProfile.vat_enabled && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* Gross Sales */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-600">Gross Sales</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(reportData.grossRevenue)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Total sales including VAT
            </p>
          </div>

          {/* VAT Collected */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-700">VAT Collected</p>
            <p className="mt-2 text-2xl font-semibold text-blue-900">
              {formatCurrency(reportData.vatCollected || 0)}
            </p>
            <p className="mt-1 text-xs text-blue-600">
              To be remitted to tax authority
            </p>
          </div>

          {/* Net Sales (after VAT) */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-600">Net Sales (excl. VAT)</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(reportData.netRevenue || 0)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Gross sales minus VAT
            </p>
          </div>
        </div>
      )}

      {/* Non-VAT Payer View */}
      {!taxProfile.vat_enabled && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Total Revenue */}
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-medium text-gray-600">Total Revenue</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(reportData.grossRevenue)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Net amounts (no VAT)
            </p>
          </div>

          {/* Estimated Profit */}
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-sm font-medium text-green-700">Estimated Profit</p>
            <p className="mt-2 text-2xl font-semibold text-green-900">
              {formatCurrency(reportData.estimatedProfit)}
            </p>
            <p className="mt-1 text-xs text-green-600">
              Revenue - costs - fees
            </p>
          </div>
        </div>
      )}

      {/* Operating Costs Section (shown for both) */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h4 className="font-semibold text-gray-900">Operating Costs</h4>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Product Costs</span>
            <span className="text-gray-900">-{formatCurrency(reportData.costs)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Platform Fees & Commissions</span>
            <span className="text-gray-900">-{formatCurrency(reportData.fees)}</span>
          </div>
          <div className="border-t border-gray-300 pt-2 flex justify-between font-semibold">
            <span className="text-gray-900">Net Result</span>
            <span className={reportData.estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
              {formatCurrency(reportData.estimatedProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Information Box */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-900">
          <strong>ℹ️ Period:</strong> {new Date(reportData.period.start).toLocaleDateString()} -{' '}
          {new Date(reportData.period.end).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
