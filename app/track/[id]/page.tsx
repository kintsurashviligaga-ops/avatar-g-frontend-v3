'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface TrackingData {
  status: string;
  carrier: string;
  events: Array<{
    status: string;
    location?: string;
    message?: string;
    occurredAt: string;
  }>;
  currentLocation?: string;
  trackingNumberMasked?: string;
  eta?: {
    minDays: number;
    maxDays: number;
  };
  shippedAt?: string;
  deliveredAt?: string;
  trackingUrl?: string;
}

const statusColors: Record<string, { bg: string; text: string; icon: string }> = {
  created: { bg: 'bg-gray-100', text: 'text-gray-800', icon: '📦' },
  label_created: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '🏷️' },
  in_transit: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '🚚' },
  out_for_delivery: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '📍',
  },
  delivered: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' },
  exception: { bg: 'bg-red-100', text: 'text-red-800', icon: '⚠️' },
  canceled: { bg: 'bg-gray-500', text: 'text-white', icon: '❌' },
  returned: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '↩️' },
};

const defaultStatusInfo = { bg: 'bg-gray-100', text: 'text-gray-800', icon: '📦' };

export default function TrackingPage({
  params,
}: {
  params: { id: string };
}) {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTracking = async () => {
      try {
        const response = await fetch(`/api/tracking/${params.id}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Tracking information not found. Link may have expired.');
          } else {
            setError('Failed to retrieve tracking information.');
          }
          setLoading(false);
          return;
        }

        const data = await response.json();
        setTracking(data);
      } catch (err) {
        console.error('Error fetching tracking:', err);
        setError('Failed to load tracking information.');
      } finally {
        setLoading(false);
      }
    };

    fetchTracking();
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
          <div className="inline-block animate-spin">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full" />
          </div>
          <p className="mt-4 text-gray-700 font-medium">Loading your shipment...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center"
        >
          <div className="text-4xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to Track</h1>
          <p className="text-gray-600 mb-6">{error || 'Shipment not found'}</p>
          <a
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Return Home
          </a>
        </motion.div>
      </div>
    );
  }

  const statusInfo = statusColors[tracking.status] ?? defaultStatusInfo;
  const timeline =
    tracking.events?.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            📦 Track Your Package
          </h1>
          <p className="text-gray-600">Real-time shipment tracking</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${statusInfo.bg} ${statusInfo.text} rounded-2xl shadow-lg p-8 mb-8 text-center`}
        >
          <div className="text-5xl mb-4">{statusInfo.icon}</div>
          <h2 className="text-3xl font-bold mb-2 capitalize">{tracking.status}</h2>
          {tracking.currentLocation && (
            <p className="text-lg opacity-90">📍 {tracking.currentLocation}</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg p-8 mb-8"
        >
          <h3 className="text-xl font-bold text-gray-900 mb-6">Shipment Details</h3>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Carrier</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {tracking.carrier}
              </p>
            </div>

            {tracking.trackingNumberMasked && (
              <div>
                <p className="text-sm text-gray-600 mb-1">Tracking Number</p>
                <p className="text-lg font-semibold text-gray-900">
                  {tracking.trackingNumberMasked}
                </p>
              </div>
            )}
          </div>

          {tracking.eta && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">Estimated Delivery</p>
              <p className="text-xl font-bold text-blue-900">
                {tracking.eta.minDays} - {tracking.eta.maxDays} business days
              </p>
            </div>
          )}

          {tracking.trackingUrl && (
            <a
              href={tracking.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-blue-600 hover:text-blue-800 font-medium underline"
            >
              View on Carrier Website →
            </a>
          )}
        </motion.div>

        {timeline.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl shadow-lg p-8"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-8">Tracking Timeline</h3>

            <div className="space-y-8">
              {timeline.map((event, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.05 }}
                  className="flex gap-4"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        index === 0 ? 'bg-blue-600' : 'bg-blue-300'
                      } ring-4 ring-blue-100`}
                    />
                    {index < timeline.length - 1 && (
                      <div className="w-1 h-12 bg-blue-200 my-2" />
                    )}
                  </div>

                  <div className="pb-4">
                    <h4 className="font-bold text-gray-900 capitalize">
                      {event.status}
                    </h4>
                    {event.location && (
                      <p className="text-sm text-gray-600 mt-1">📍 {event.location}</p>
                    )}
                    {event.message && (
                      <p className="text-sm text-gray-600 mt-1">{event.message}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(event.occurredAt).toLocaleString()}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
