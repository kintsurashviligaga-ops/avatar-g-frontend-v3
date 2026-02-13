'use client';

/**
 * Tax Status Selector
 * Allows stores to choose between VAT payer and non-VAT payer status
 */

import React, { useState } from 'react';
import { StoreTaxProfile } from '@/lib/finance/taxProfile';

interface TaxStatusSelectorProps {
  currentProfileValue?: StoreTaxProfile;
  onSelect?: (status: 'vat_payer' | 'non_vat_payer') => void;
  onVatNumberChange?: (vatNumber: string) => void;
  disabled?: boolean;
}

export function TaxStatusSelector({
  currentProfileValue,
  onSelect,
  onVatNumberChange,
  disabled = false,
}: TaxStatusSelectorProps) {
  const [selectedStatus, setSelectedStatus] = useState<'vat_payer' | 'non_vat_payer'>(
    currentProfileValue?.tax_status || 'non_vat_payer'
  );
  const [vatRegistrationNo, setVatRegistrationNo] = useState(
    currentProfileValue?.vat_registration_no || ''
  );

  const handleStatusChange = (status: 'vat_payer' | 'non_vat_payer') => {
    setSelectedStatus(status);
    onSelect?.(status);
  };

  const handleVatNumberChange = (value: string) => {
    setVatRegistrationNo(value);
    onVatNumberChange?.(value);
  };

  return (
    <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Tax Status</h3>
        <p className="mt-1 text-sm text-gray-600">
          Choose how your store handles VAT. This affects pricing, invoices, and tax reporting.
        </p>
      </div>

      {/* VAT Payer Option */}
      <div
        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
          selectedStatus === 'vat_payer'
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && handleStatusChange('vat_payer')}
      >
        <div className="flex items-start">
          <input
            type="radio"
            name="tax_status"
            value="vat_payer"
            checked={selectedStatus === 'vat_payer'}
            onChange={() => handleStatusChange('vat_payer')}
            disabled={disabled}
            className="mt-1 h-4 w-4"
          />
          <div className="ml-3 flex-1">
            <label className="block font-semibold text-gray-900">VAT Payer (18% VAT)</label>
            <p className="mt-1 text-sm text-gray-600">
              I register for VAT and charge 18% VAT on sales to Georgian customers.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>✓ Collect and remit VAT to Georgian tax authority</li>
              <li>✓ Issue VAT invoices to customers</li>
              <li>✓ Demonstrate turnover for compliance</li>
              <li>✓ Required: Valid VAT registration number</li>
            </ul>
          </div>
        </div>

        {/* VAT Registration Number Input */}
        {selectedStatus === 'vat_payer' && (
          <div className="mt-4 ml-7 space-y-2">
            <label htmlFor="vat_reg_number" className="block text-sm font-medium text-gray-700">
              VAT Registration Number (optional)
            </label>
            <input
              id="vat_reg_number"
              type="text"
              placeholder="e.g., GE123456789"
              value={vatRegistrationNo}
              onChange={(e) => handleVatNumberChange(e.target.value)}
              disabled={disabled}
              className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            />
            <p className="text-xs text-gray-500">
              You can update this later in store settings.
            </p>
          </div>
        )}
      </div>

      {/* Non-VAT Payer Option */}
      <div
        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
          selectedStatus === 'non_vat_payer'
            ? 'border-green-500 bg-green-50'
            : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && handleStatusChange('non_vat_payer')}
      >
        <div className="flex items-start">
          <input
            type="radio"
            name="tax_status"
            value="non_vat_payer"
            checked={selectedStatus === 'non_vat_payer'}
            onChange={() => handleStatusChange('non_vat_payer')}
            disabled={disabled}
            className="mt-1 h-4 w-4"
          />
          <div className="ml-3 flex-1">
            <label className="block font-semibold text-gray-900">Not VAT Payer</label>
            <p className="mt-1 text-sm text-gray-600">
              I do not collect VAT. Prices shown are net amounts (income-tax accounting mode).
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>✓ No VAT collection responsibility</li>
              <li>✓ Prices shown are final amounts (no VAT added)</li>
              <li>✓ Income-based tax accounting</li>
              <li>✓ Simpler invoicing</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Information Box */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
        <p className="text-sm font-medium text-amber-900">
          ⚠️ Important: Tax status changes apply to future orders only. Existing orders retain
          their original tax calculations.
        </p>
      </div>
    </div>
  );
}
