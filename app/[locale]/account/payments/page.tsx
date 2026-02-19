'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentConfig {
  activeProvider: string;
  stripeEnabled: boolean;
  tbcEnabled: boolean;
  bogEnabled: boolean;
  payzeEnabled: boolean;
}

const PROVIDERS = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payment processing and subscriptions',
    status: 'active',
    available: true,
  },
  {
    id: 'tbc',
    name: 'TBC Bank',
    description: 'Georgian bank payment gateway',
    status: 'coming_soon',
    available: false,
  },
  {
    id: 'bog',
    name: 'Bank of Georgia',
    description: 'Bank of Georgia payment gateway',
    status: 'coming_soon',
    available: false,
  },
  {
    id: 'payze',
    name: 'Payze',
    description: 'Georgian payment solutions',
    status: 'coming_soon',
    available: false,
  },
];

export default function PaymentProvidersPage() {
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [_saving, setSaving] = useState(false);
  const [_config, setConfig] = useState<PaymentConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('stripe');

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/payments/provider');
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
          setSelectedProvider(data.active_provider);
        }
      } catch (error) {
        toast.error(t('common.error'));
        console.error('Error fetching payment config:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [t]);

  const handleSelectProvider = async (providerId: string) => {
    if (!PROVIDERS.find((p) => p.id === providerId && p.available)) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/payments/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProvider: providerId }),
      });

      if (response.ok) {
        setSelectedProvider(providerId);
        toast.success(t('common.saved_successfully'));
      } else {
        toast.error(t('common.error'));
      }
    } catch (error) {
      toast.error(t('common.error'));
      console.error('Error updating provider:', error);
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold mb-2">{t('payments.providers.title')}</h1>
        <p className="text-gray-600 mb-8">{t('payments.providers.description')}</p>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex gap-3">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900 mb-1">
              {t('payments.providers.info_title')}
            </p>
            <p className="text-sm text-blue-800">{t('payments.providers.info_desc')}</p>
          </div>
        </div>

        {/* Provider Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map((provider) => (
            <motion.div
              key={provider.id}
              whileHover={provider.available ? { scale: 1.02 } : {}}
              onClick={() => provider.available && handleSelectProvider(provider.id)}
              className={`rounded-lg border-2 p-6 cursor-pointer transition ${
                selectedProvider === provider.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${!provider.available ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{provider.name}</h3>
                  <p className="text-sm text-gray-600">{provider.description}</p>
                </div>
                {selectedProvider === provider.id && (
                  <div className="bg-blue-600 text-white p-2 rounded-full">
                    <Check size={20} />
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    provider.available
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {provider.status === 'active'
                    ? t('payments.providers.active')
                    : t('payments.providers.coming_soon')}
                </span>
              </div>

              {/* Coming Soon Message */}
              {!provider.available && (
                <p className="text-xs text-gray-500 mt-3">
                  {t('payments.providers.setup_required')}
                </p>
              )}
            </motion.div>
          ))}
        </div>

        {/* Selected Provider Details */}
        {selectedProvider === 'stripe' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 bg-white rounded-lg shadow p-6 border border-gray-200"
          >
            <h2 className="text-xl font-bold mb-4">{t('payments.providers.stripe_details')}</h2>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                {t('payments.providers.stripe_feature_1')}
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                {t('payments.providers.stripe_feature_2')}
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                {t('payments.providers.stripe_feature_3')}
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-green-600" />
                {t('payments.providers.stripe_feature_4')}
              </li>
            </ul>
          </motion.div>
        )}

        {/* Future Providers Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6"
        >
          <h3 className="font-bold text-yellow-900 mb-3">
            {t('payments.providers.future_title')}
          </h3>
          <p className="text-sm text-yellow-800 mb-3">
            {t('payments.providers.future_desc')}
          </p>
          <ul className="space-y-2 text-sm text-yellow-800">
            <li>• {t('payments.providers.future_note_1')}</li>
            <li>• {t('payments.providers.future_note_2')}</li>
            <li>• {t('payments.providers.future_note_3')}</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
