'use client';

import { useEffect, useState } from 'react';
import { ShippingTracking } from '@/lib/commerce/types';

interface TrackingPageProps {
  params: {
    orderId: string;
  };
}

export default function TrackingPage({ params }: TrackingPageProps) {
  const [tracking, setTracking] = useState<ShippingTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTracking() {
      try {
        const response = await fetch(`/api/shipping/track?orderId=${params.orderId}`);
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error?.message || 'Failed to fetch tracking');
        }
        
        const data = await response.json();
        setTracking(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchTracking();
  }, [params.orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading tracking information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!tracking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Tracking information not found</p>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    shipped: 'bg-blue-100 text-blue-800',
    in_transit: 'bg-purple-100 text-purple-800',
    out_for_delivery: 'bg-yellow-100 text-yellow-800',
    delivered: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    returned: 'bg-gray-100 text-gray-800',
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    processing: 'Processing',
    shipped: 'Shipped',
    in_transit: 'In Transit',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    failed: 'Failed',
    returned: 'Returned',
  };

  const isDelivered = tracking.shippingStatus === 'delivered';
  const isFailed = tracking.shippingStatus === 'failed';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Order Tracking</h1>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-600">Order ID</p>
              <p className="text-lg font-mono text-gray-900">{tracking.orderId.substring(0, 8)}...</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Tracking Code</p>
              <p className="text-lg font-mono text-gray-900">
                {tracking.trackingCode || 'Not assigned'}
              </p>
            </div>
          </div>

          {/* Current Status */}
          <div className="border-t pt-6">
            <p className="text-sm text-gray-600 mb-2">Current Status</p>
            <div className="flex items-center justify-between">
              <span className={`px-4 py-2 rounded-full font-semibold ${statusColors[tracking.shippingStatus] || statusColors.pending}`}>
                {statusLabels[tracking.shippingStatus] || tracking.shippingStatus}
              </span>
              <span className="text-sm text-gray-600">
                Last updated: {new Date(tracking.lastUpdated).toLocaleDateString()} at{' '}
                {new Date(tracking.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Estimated Delivery */}
          {!isDelivered && !isFailed && (
            <div className="border-t mt-6 pt-6">
              <p className="text-sm text-gray-600 mb-2">Estimated Delivery</p>
              <p className="text-lg text-gray-900">
                {tracking.estimatedDaysMin} - {tracking.estimatedDaysMax} business days
              </p>
            </div>
          )}

          {/* Current Location */}
          {tracking.currentLocation && (
            <div className="border-t mt-6 pt-6">
              <p className="text-sm text-gray-600 mb-2">Current Location</p>
              <p className="text-lg text-gray-900">{tracking.currentLocation}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Shipment Timeline</h2>
          
          {tracking.events.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No tracking events yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {tracking.events.map((event, index) => (
                <div key={event.id} className="flex gap-4">
                  {/* Timeline indicator */}
                  <div className="flex flex-col items-center">
                    <div className={`w-4 h-4 rounded-full ${
                      index === 0 
                        ? 'bg-blue-500 ring-4 ring-blue-100' 
                        : 'bg-gray-300'
                    }`} />
                    {index < tracking.events.length - 1 && (
                      <div className="w-0.5 h-16 bg-gray-200 my-2" />
                    )}
                  </div>

                  {/* Event details */}
                  <div className="flex-1 pb-6">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {statusLabels[event.status] || event.status}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {new Date(event.created_at).toLocaleDateString()} at{' '}
                          {new Date(event.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded text-xs font-semibold ${
                        statusColors[event.status] || statusColors.pending
                      }`}>
                        {statusLabels[event.status] || event.status}
                      </span>
                    </div>

                    {event.location && (
                      <p className="text-sm text-gray-700 mt-2">
                        <span className="font-semibold">Location:</span> {event.location}
                      </p>
                    )}

                    {event.tracking_code && (
                      <p className="text-sm text-gray-700 mt-1">
                        <span className="font-semibold">Code:</span> {event.tracking_code}
                      </p>
                    )}

                    {event.metadata_json && Object.keys(event.metadata_json).length > 0 && (
                      <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                        <p className="font-semibold mb-1">Details:</p>
                        <pre className="text-xs overflow-auto">
                          {JSON.stringify(event.metadata_json, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <span className="font-semibold">Questions?</span> Contact our support team if you need
            assistance with your order.
          </p>
        </div>
      </div>
    </div>
  );
}
