'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface BusinessProfile {
  legalName: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  isVatPayer: boolean;
  invoicePrefix: string;
  fxRateGelPerUsd: number;
}

export default function BusinessProfilePage() {
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile>({
    legalName: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    isVatPayer: false,
    invoicePrefix: 'AG',
    fxRateGelPerUsd: 2.7,
  });

  // Fetch business profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/business/profile');
        if (response.ok) {
          const data = await response.json();
          setProfile({
            legalName: data.legalName || '',
            taxId: data.taxId || '',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            isVatPayer: data.isVatPayer,
            invoicePrefix: data.invoicePrefix,
            fxRateGelPerUsd: data.fxRateGelPerUsd,
          });
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.currentTarget;
    const fieldName = name as keyof BusinessProfile;
    setProfile((prev) => ({
      ...prev,
      [fieldName]: type === 'checkbox' ? (e.currentTarget as HTMLInputElement).checked : value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/business/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (response.ok) {
        toast.success(t('common.saved_successfully'));
      } else {
        const error = await response.json();
        toast.error(error.error || t('common.error'));
      }
    } catch (error) {
      toast.error(t('common.error'));
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow-lg p-8"
      >
        <h1 className="text-3xl font-bold mb-2">{t('business.profile.title')}</h1>
        <p className="text-gray-600 mb-6">{t('business.profile.description')}</p>

        <form className="space-y-6">
          {/* Legal Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.legal_name')}
            </label>
            <input
              type="text"
              name="legalName"
              value={profile.legalName}
              onChange={handleChange}
              placeholder={t('business.profile.legal_name_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Tax ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.tax_id')}
            </label>
            <input
              type="text"
              name="taxId"
              value={profile.taxId}
              onChange={handleChange}
              placeholder={t('business.profile.tax_id_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.address')}
            </label>
            <textarea
              name="address"
              value={profile.address}
              onChange={handleChange}
              placeholder={t('business.profile.address_placeholder')}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.email')}
            </label>
            <input
              type="email"
              name="email"
              value={profile.email}
              onChange={handleChange}
              placeholder={t('business.profile.email_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.phone')}
            </label>
            <input
              type="tel"
              name="phone"
              value={profile.phone}
              onChange={handleChange}
              placeholder={t('business.profile.phone_placeholder')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* VAT Payer Toggle */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="isVatPayer"
                checked={profile.isVatPayer}
                onChange={handleChange}
                className="w-6 h-6 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="ml-3 font-medium text-gray-900">
                {t('business.profile.vat_payer')}
              </span>
            </label>
            <p className="text-sm text-gray-600 mt-2">
              {profile.isVatPayer
                ? t('business.profile.vat_payer_desc')
                : t('business.profile.non_vat_payer_desc')}
            </p>
          </div>

          {/* FX Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('business.profile.fx_rate')}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">1 USD =</span>
              <input
                type="number"
                name="fxRateGelPerUsd"
                value={profile.fxRateGelPerUsd}
                onChange={handleChange}
                step="0.01"
                min="0.01"
                className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-600">₾</span>
            </div>
          </div>

          {/* Save Button */}
          <motion.button
            type="button"
            onClick={handleSave}
            disabled={saving}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Check size={18} />
                {t('common.save')}
              </>
            )}
          </motion.button>

          {/* Info Box */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
            <AlertCircle size={20} className="text-yellow-600 flex-shrink-0" />
            <p className="text-sm text-yellow-800">
              {t('business.profile.info_box')}
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
